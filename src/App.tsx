import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Check, CircleAlert, Download, Film, FolderOpen, Hand, ImageDown, LoaderCircle, Minus, MousePointer2, Plus, Scan, Undo2, X } from 'lucide-react';
import { IconButton } from './Icons';
import { VideoPlayer, type PlayerHandle } from './VideoPlayer';
import { Still } from './Still';
import { Track } from './Track';
import { applySnap, detachModule, findSnap, groupIds, reflow, rootId, translate, type Snap } from './docking';
import { analyzeVideo, captureFrame, detectScenes, probeVideo } from './media';
import { backupBoard, restoreArchive } from './archive';
import { exportBoard } from './export';
import { download, safeFilename } from './download';
import { loadBoard, replaceBoard, saveAssets, saveBoard } from './store';
import { allCards, boardBoxes, clamp, DOCK_GAP, emptyBoard, mapCards, topZ, type Board, type Camera, type Dock, type ModuleCard, type Point, type StillCard, type TrackCard, type TrackKind, type VideoCard } from './model';

type Gesture = { pointer: number; x: number; y: number; kind: 'move' | 'resize' | 'pan'; id?: string; origin: Point & { width?: number; height?: number }; scale: number; originals?: Map<string, ModuleCard>; moving?: Set<string>; root?: string };
type Removed = { videos: VideoCard[]; stills: StillCard[]; tracks: TrackCard[]; docks: Map<string, Dock> };

export function App() {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const current = useRef(board);
  const [loaded, setLoaded] = useState(false);
  const [fatal, setFatal] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const objectUrls = useRef<Record<string, string>>({});
  const assets = useRef(new Map<string, Blob>());
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<'saving' | 'saved' | 'error'>('saved');
  const [working, setWorking] = useState('');
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [hand, setHand] = useState(false);
  const [space, setSpace] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [removed, setRemoved] = useState<Removed | null>(null);
  const [operation, setOperation] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [sceneBusy, setSceneBusy] = useState(new Set<string>());
  const sceneJobs = useRef(new Set<string>());
  const snapRef = useRef<Snap | null>(null);
  const [moving, setMoving] = useState(new Set<string>());
  const stage = useRef<HTMLDivElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const archiveInput = useRef<HTMLInputElement>(null);
  const players = useRef(new Map<string, PlayerHandle>());
  const gesture = useRef<Gesture | null>(null);
  const saveQueue = useRef(Promise.resolve());
  const analysisQueue = useRef(Promise.resolve());
  const epoch = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const initialised = useRef(false);
  const editingLocked = operation || !loaded;

  function change(update: (board: Board) => Board) {
    const next = update(current.current);
    current.current = next; setBoard(next);
  }
  function patchVideo(id: string, patch: Partial<VideoCard>) {
    change(b => ({ ...b, videos: b.videos.map(v => v.id === id ? { ...v, ...patch } : v) }));
  }
  function installAssets(additions: Map<string, Blob>) {
    const next = { ...objectUrls.current };
    for (const [key, blob] of additions) {
      assets.current.set(key, blob);
      const old = next[key]; if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      next[key] = URL.createObjectURL(blob);
    }
    objectUrls.current = next; setUrls(next);
  }
  function markBusy(id: string, active: boolean) {
    setBusy(previous => { const next = new Set(previous); if (active) next.add(id); else next.delete(id); return next; });
  }
  function processVideo(id: string, blob: Blob) {
    const generation = epoch.current;
    analysisQueue.current = analysisQueue.current.then(async () => {
      if (generation !== epoch.current || !current.current.videos.some(v => v.id === id)) return;
      try {
        const result = await analyzeVideo(blob, label => { if (generation === epoch.current) setWorking(label); });
        if (generation !== epoch.current || !current.current.videos.some(v => v.id === id)) return;
        const additions = new Map(result.thumbnails.map((thumb, index) => [`${id}-thumb-${index}`, thumb]));
        await saveAssets(additions);
        if (generation !== epoch.current) return;
        installAssets(additions);
        patchVideo(id, { thumbnails: [...additions.keys()], peaks: result.peaks, frameTimes: result.frameTimes, scenes: result.scenes, analysis: result.note && result.note !== 'No audio track' ? 'partial' : 'ready', analysisNote: result.note });
      } catch (error) {
        if (generation === epoch.current) patchVideo(id, { analysis: 'partial', analysisNote: error instanceof Error ? error.message : 'Media analysis failed' });
      } finally { if (generation === epoch.current) setWorking(''); }
    });
  }

  function scanScenes(id: string) {
    const video = current.current.videos.find(v => v.id === id), blob = assets.current.get(id);
    if (!video || !blob || video.scenes || video.analysis === 'pending' || sceneJobs.current.has(id)) return;
    sceneJobs.current.add(id); setSceneBusy(new Set(sceneJobs.current));
    const generation = epoch.current;
    analysisQueue.current = analysisQueue.current.then(async () => {
      try {
        if (generation !== epoch.current || !current.current.videos.some(v => v.id === id)) return;
        const scenes = await detectScenes(blob, label => { if (generation === epoch.current) setWorking(label); });
        if (generation === epoch.current) patchVideo(id, { scenes });
      } catch (error) {
        if (generation === epoch.current) setNotice(error instanceof Error ? error.message : 'Cut detection failed.');
      } finally {
        sceneJobs.current.delete(id); setSceneBusy(new Set(sceneJobs.current));
        if (generation === epoch.current) setWorking('');
      }
    });
  }

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadBoard().then(({ board: saved, assets: stored }) => {
      installAssets(stored);
      if (saved) { current.current = saved; setBoard(saved); }
      setLoaded(true);
      for (const video of saved?.videos || []) if (video.analysis === 'pending') {
        const blob = stored.get(video.id); if (blob) processVideo(video.id, blob);
      }
    }).catch(error => setFatal(`The local board could not be opened: ${error.message}`));
    // These URLs live for the page lifetime; replacing an asset revokes its old
    // URL. Revoking on effect cleanup would break live video seeking during HMR.
  }, []);

  useEffect(() => {
    if (!loaded || operation) return;
    setSaving('saving');
    const snapshot = board;
    saveTimer.current = setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveBoard(snapshot));
      void saveQueue.current.then(() => { if (current.current === snapshot) setSaving('saved'); }).catch(error => {
        setSaving('error'); setNotice(`Could not save locally: ${error.message}. Download a project backup to keep this board.`);
      });
    }, 220);
    return () => clearTimeout(saveTimer.current);
  }, [board, loaded, operation]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointer !== event.pointerId) return;
      const dx = (event.clientX - g.x) / g.scale, dy = (event.clientY - g.y) / g.scale;
      if (g.kind === 'pan') change(b => ({ ...b, camera: { ...b.camera, x: g.origin.x + dx, y: g.origin.y + dy } }));
      else if (g.kind === 'move') change(b => {
        const next = translate(b, g.originals!, { x: dx, y: dy });
        const candidate = event.shiftKey ? null : findSnap(next, g.moving!, g.root!);
        snapRef.current = candidate; setSnap(candidate); return next;
      });
      else change(b => reflow(mapCards(b, card => {
        if (card.id !== g.id) return card;
        const track = b.tracks.find(t => t.id === card.id), video = b.videos.some(v => v.id === card.id);
        return { ...card, width: clamp((g.origin.width || 300) + dx, track ? 240 : video ? 320 : 260, 1600), height: clamp((g.origin.height || 100) + dy, track ? track.kind === 'cuts' ? 96 : 72 : video ? 190 : 110, track ? 600 : 1200) };
      })));
    };
    const finish = (commit: boolean) => {
      if (commit && gesture.current?.kind === 'move' && snapRef.current) change(b => applySnap(b, snapRef.current!));
      gesture.current = null; snapRef.current = null; setSnap(null); setMoving(new Set()); document.body.classList.remove('is-dragging');
    };
    const pointerUp = (event: PointerEvent) => finish(!event.shiftKey), pointerCancel = () => finish(false);
    const down = (event: KeyboardEvent) => {
      if ((event.target as Element)?.closest('input, select, textarea, button, a')) return;
      if (event.code === 'Space') { event.preventDefault(); setSpace(true); }
      if (event.key === 'Escape') { setSelected(null); setHand(false); }
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setSpace(false); };
    const blur = () => { setSpace(false); finish(false); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', pointerUp); window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', pointerUp); window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const viewport = stage.current;
    if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest('select, input')) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const box = viewport.getBoundingClientRect();
        zoom(Math.exp(-event.deltaY * .008), { x: event.clientX - box.left, y: event.clientY - box.top });
      } else change(b => ({ ...b, camera: { ...b.camera, x: b.camera.x - event.deltaX, y: b.camera.y - event.deltaY } }));
    };
    viewport.addEventListener('wheel', wheel, { passive: false });
    return () => viewport.removeEventListener('wheel', wheel);
  }, []);

  function zoom(factor: number, anchor?: Point) {
    const box = stage.current?.getBoundingClientRect(); if (!box) return;
    const at = anchor || { x: box.width / 2, y: box.height / 2 };
    change(b => {
      const c = b.camera, scale = clamp(c.scale * factor, .15, 3);
      return { ...b, camera: { scale, x: at.x - (at.x - c.x) / c.scale * scale, y: at.y - (at.y - c.y) / c.scale * scale } };
    });
  }
  function fit() {
    const boxes = boardBoxes(current.current), viewport = stage.current?.getBoundingClientRect();
    if (!boxes.length || !viewport) { change(b => ({ ...b, camera: { x: 0, y: 0, scale: 1 } })); return; }
    const minX = Math.min(...boxes.map(c => c.x)), minY = Math.min(...boxes.map(c => c.y));
    const w = Math.max(...boxes.map(c => c.x + c.width)) - minX, h = Math.max(...boxes.map(c => c.y + c.height)) - minY;
    const scale = clamp(Math.min((viewport.width - 140) / w, (viewport.height - 140) / h, 1), .15, 3);
    const camera: Camera = { scale, x: (viewport.width - w * scale) / 2 - minX * scale, y: (viewport.height - h * scale) / 2 - minY * scale };
    change(b => ({ ...b, camera }));
  }
  function begin(event: ReactPointerEvent, kind: 'move' | 'resize', id: string, independent = false) {
    if (editingLocked || event.button !== 0 || (kind === 'move' && !independent && (event.target as Element).closest('button, input, select'))) return;
    event.preventDefault(); event.stopPropagation();
    const base = kind === 'move' && (independent || event.altKey) ? detachModule(current.current, id) : current.current;
    const card = boardBoxes(base).find(c => c.id === id); if (!card) return;
    const ids = kind === 'move' ? groupIds(base, id) : new Set([id]);
    const originals = new Map(allCards(base).filter(c => ids.has(c.id)).map(c => [c.id, c]));
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, kind, id, origin: { x: card.x, y: card.y, width: card.width, height: card.height }, scale: base.camera.scale, originals, moving: ids, root: rootId(base, id) };
    event.currentTarget.setPointerCapture(event.pointerId); document.body.classList.add('is-dragging'); setSelected(id);
    const z = topZ(base); setMoving(ids);
    change(() => mapCards(base, c => ids.has(c.id) ? { ...c, z: z + [...ids].indexOf(c.id) } : c));
  }
  function undock(id: string) {
    if (editingLocked) return;
    change(b => mapCards(detachModule(b, id), c => c.id === id ? { ...c, x: c.x + 22, y: c.y + 12, z: topZ(b) } : c));
    setSelected(id);
  }
  function controlsFor(id: string) {
    return { docked: groupIds(board, id).size > 1, onPeel: (event: ReactPointerEvent) => begin(event, 'move', id, true), onDetach: () => undock(id) };
  }
  function pan(event: ReactPointerEvent) {
    if (editingLocked || ![0, 1].includes(event.button)) return;
    if ((event.target as Element).closest('.board-tools, .zoom-tools, .empty-board')) return;
    if (!hand && !space && event.button !== 1 && (event.target as Element).closest('.board-card')) return;
    event.preventDefault(); event.stopPropagation();
    const camera = current.current.camera;
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, kind: 'pan', origin: { x: camera.x, y: camera.y }, scale: 1 };
    event.currentTarget.setPointerCapture(event.pointerId); document.body.classList.add('is-dragging'); if (!hand && !space) setSelected(null);
  }

  async function importVideos(files: File[], point?: Point) {
    if (editingLocked || importing) return;
    setImporting(true); setNotice('');
    void navigator.storage?.persist?.().catch(() => {});
    let failures = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name)) { failures++; continue; }
      try {
        const metadata = await probeVideo(file);
        const id = crypto.randomUUID();
        const additions = new Map([[id, file as Blob]]); await saveAssets(additions); installAssets(additions);
        const camera = current.current.camera;
        const offset = current.current.videos.length % 8 * 40;
        const origin = point || { x: (90 - camera.x) / camera.scale + offset, y: (70 - camera.y) / camera.scale + offset };
        const video: VideoCard = { ...metadata, id, name: file.name, width: 440, x: origin.x + i * 35, y: origin.y + i * 35, z: topZ(current.current), time: 0, thumbnails: [], peaks: [], frameTimes: [], analysis: 'pending', showFilmstrip: true, showWaveform: true };
        change(b => ({ ...b, videos: [...b.videos, video] })); addTrack(id, 'filmstrip'); addTrack(id, 'waveform'); setSelected(id); processVideo(id, file);
      } catch (error) { failures++; setNotice(error instanceof Error ? error.message : 'The video could not be imported.'); }
    }
    if (failures) setNotice(previous => previous || `${failures} file${failures === 1 ? '' : 's'} could not be imported. Add a playable video file.`);
    setImporting(false);
  }
  function addTrack(videoId: string, kind: TrackKind, duplicate?: TrackCard) {
    change(b => {
      const video = b.videos.find(v => v.id === videoId); if (!video) return b;
      const group = groupIds(b, videoId);
      const parent = boardBoxes(b).filter(c => group.has(c.id)).sort((a, c) => c.y + c.height - a.y - a.height)[0];
      const track: TrackCard = duplicate
        ? { ...duplicate, id: crypto.randomUUID(), x: duplicate.x + 28, y: duplicate.y + 28, dock: undefined, z: topZ(b) }
        : { id: crypto.randomUUID(), videoId, kind, x: parent.x, y: parent.y + parent.height + DOCK_GAP, width: video.width, height: kind === 'filmstrip' ? 104 : kind === 'cuts' ? 116 : 88, z: topZ(b), dock: { to: parent.id, side: 'bottom', offset: 0 } };
      setSelected(track.id); return { ...b, tracks: [...b.tracks, track] };
    });
    if (kind === 'cuts') scanScenes(videoId);
  }
  async function makeStill(videoId: string, requested: number, existingId?: string) {
    const video = current.current.videos.find(v => v.id === videoId), blob = assets.current.get(videoId);
    if (!video || !blob) return;
    const id = existingId || crypto.randomUUID(), generation = epoch.current;
    markBusy(existingId || videoId, true);
    try {
      const frame = await captureFrame(blob, requested);
      if (generation !== epoch.current || !current.current.videos.some(v => v.id === videoId) || (existingId && !current.current.stills.some(s => s.id === existingId))) return;
      const additions = new Map([[id, frame.blob]]); await saveAssets(additions); installAssets(additions);
      change(b => {
        if (existingId) return { ...b, stills: b.stills.map(s => s.id === id ? { ...s, time: frame.time, duration: frame.duration } : s) };
        const source = b.videos.find(v => v.id === videoId)!;
        const count = b.stills.filter(s => s.videoId === videoId).length;
        const width = 280, height = width * source.sourceHeight / source.sourceWidth + 100;
        const still: StillCard = { id, videoId, time: frame.time, duration: frame.duration, width, x: source.x + source.width + 64 + Math.floor(count / 3) * 320, y: source.y + (count % 3) * height, z: topZ(b) };
        return { ...b, stills: [...b.stills, still] };
      }); setSelected(id);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'The still could not be created.'); }
    finally { markBusy(existingId || videoId, false); }
  }
  function remove(id: string) {
    const b = current.current;
    const videos = b.videos.filter(v => v.id === id), stills = b.stills.filter(s => s.id === id || s.videoId === id), tracks = b.tracks.filter(t => t.id === id || t.videoId === id);
    const ids = new Set([...videos, ...stills, ...tracks].map(c => c.id));
    const docks = new Map(allCards(b).filter(c => !ids.has(c.id) && c.dock && ids.has(c.dock.to)).map(c => [c.id, c.dock!]));
    setRemoved({ videos, stills, tracks, docks });
    change(b => mapCards({ ...b, videos: b.videos.filter(v => !ids.has(v.id)), stills: b.stills.filter(s => !ids.has(s.id)), tracks: b.tracks.filter(t => !ids.has(t.id)) }, c => c.dock && ids.has(c.dock.to) ? { ...c, dock: undefined } : c)); setSelected(null);
  }
  function jump(still: StillCard) {
    players.current.get(still.videoId)?.seek(still.time); setSelected(still.videoId);
    const video = current.current.videos.find(v => v.id === still.videoId), box = stage.current?.getBoundingClientRect();
    if (video && box) {
      const c = current.current.camera;
      const x = video.x * c.scale + c.x, y = video.y * c.scale + c.y;
      if (x < 0 || x + video.width * c.scale > box.width || y < 0 || y + 300 * c.scale > box.height) {
        change(b => ({ ...b, camera: { ...c, x: box.width / 2 - (video.x + video.width / 2) * c.scale, y: 70 - video.y * c.scale } }));
      }
    }
  }
  async function exportImage() {
    setOperation(true); setNotice('');
    try {
      const elements = new Map<string, HTMLVideoElement>();
      for (const [id, handle] of players.current) { const el = handle.element(); if (el) { el.pause(); elements.set(id, el); } }
      const snapshot = current.current;
      download(await exportBoard(snapshot, assets.current, elements), `${safeFilename(snapshot.name)}.png`);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Image export failed.'); }
    finally { setOperation(false); }
  }
  async function exportProject() {
    setOperation(true);
    try { download(await backupBoard(current.current, assets.current), `${safeFilename(current.current.name)}.videoboard.zip`); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Project backup failed.'); }
    finally { setOperation(false); }
  }
  async function openProject(file: File) {
    setOperation(true); setNotice('');
    try {
      const restored = await restoreArchive(file);
      // Keep the previous board reviewable and recoverable before replacing it.
      if (current.current.videos.length) {
        const backup = await backupBoard(current.current, assets.current);
        download(backup, `${safeFilename(current.current.name)}-before-open.videoboard.zip`);
      }
      clearTimeout(saveTimer.current); await saveQueue.current.catch(() => {});
      epoch.current++; await analysisQueue.current;
      await replaceBoard(restored.board, restored.assets);
      assets.current = new Map();
      for (const url of Object.values(objectUrls.current)) URL.revokeObjectURL(url);
      objectUrls.current = {}; installAssets(restored.assets);
      current.current = restored.board; setBoard(restored.board); setSelected(null); setRemoved(null); setWorking(''); setFatal(''); setLoaded(true);
      for (const video of restored.board.videos) if (video.analysis === 'pending') processVideo(video.id, restored.assets.get(video.id)!);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Project backup could not be opened.'); }
    finally { setOperation(false); }
  }

  const selectedGroup = selected ? groupIds(board, selected) : new Set<string>();
  const dockTarget = snap?.dock.to;
  const moduleClass = (id: string) => `${selected === id ? 'is-selected' : ''} ${selectedGroup.size > 1 && selectedGroup.has(id) ? 'is-grouped' : ''} ${moving.has(id) ? 'is-moving' : ''} ${dockTarget === id ? `is-dock-target dock-${snap!.dock.side}` : ''}`;
  return <div className="app">
    <header className="toolbar">
      <div className="brand"><span className="brand-icon"><Film size={21} /></span><strong>Video Board</strong><span className="prototype">prototype</span></div>
      <span className="toolbar-divider" />
      <input className="board-name" aria-label="Board name" maxLength={100} value={board.name} onChange={event => change(b => ({ ...b, name: event.target.value }))} disabled={editingLocked} />
      <div className="toolbar-actions">
        <span className={`save-state ${saving === 'error' ? 'save-state--error' : ''}`} title={working || (saving === 'saved' ? 'Saved in this browser' : saving === 'error' ? 'Local save failed' : 'Saving in this browser')}>
          {saving === 'error' ? <CircleAlert size={13} /> : working || importing || saving === 'saving' ? <LoaderCircle size={13} className="spin" /> : <Check size={13} />}<span>{working ? 'Processing locally' : saving === 'saved' ? 'Saved locally' : saving === 'error' ? 'Save failed' : 'Saving…'}</span>
        </span>
        <IconButton icon={FolderOpen} label="Open project backup" disabled={operation || importing || busy.size > 0} onClick={() => archiveInput.current?.click()} />
        <IconButton icon={Download} label="Download project backup" disabled={editingLocked || !board.videos.length || busy.size > 0} onClick={() => void exportProject()} />
        <IconButton icon={ImageDown} label="Export board as PNG" disabled={editingLocked || !board.videos.length || busy.size > 0} onClick={() => void exportImage()} />
        <span className="toolbar-divider" />
        <IconButton className="add-video" icon={Plus} label="Add videos" disabled={editingLocked || importing} onClick={() => videoInput.current?.click()}><span>Add video</span></IconButton>
      </div>
    </header>
    <input ref={videoInput} className="file-input" type="file" multiple accept="video/*,.mp4,.m4v,.mov,.webm,.mkv" onChange={event => { void importVideos(Array.from(event.target.files || [])); event.target.value = ''; }} />
    <input ref={archiveInput} className="file-input" type="file" accept=".zip" onChange={event => { if (event.target.files?.[0]) void openProject(event.target.files[0]); event.target.value = ''; }} />
    <div ref={stage} className={`board ${hand || space ? 'board--hand' : ''} ${dragOver ? 'board--drop' : ''}`} aria-label="Video board workspace"
      style={{ backgroundPosition: `${board.camera.x}px ${board.camera.y}px`, backgroundSize: `${24 * board.camera.scale}px ${24 * board.camera.scale}px` }}
      onPointerDownCapture={pan}
      onDragOver={event => { event.preventDefault(); if (event.dataTransfer.types.includes('Files')) setDragOver(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }}
      onDrop={event => {
        event.preventDefault(); setDragOver(false);
        const box = event.currentTarget.getBoundingClientRect(), c = current.current.camera;
        void importVideos(Array.from(event.dataTransfer.files), { x: (event.clientX - box.left - c.x) / c.scale, y: (event.clientY - box.top - c.y) / c.scale });
      }}>
      <div className="board-world" style={{ transform: `translate(${board.camera.x}px, ${board.camera.y}px) scale(${board.camera.scale})` }}>
        <svg className="board-links" aria-hidden="true">{board.stills.map(still => {
          const source = board.videos.find(v => v.id === still.videoId); if (!source) return null;
          const x1 = source.x + source.width / 2, x2 = still.x + still.width / 2;
          return <path key={still.id} className={selected === source.id || selected === still.id ? 'is-active' : ''} d={`M ${x1} ${source.y + 14} C ${x1} ${source.y - 40}, ${x2} ${still.y - 40}, ${x2} ${still.y + 14}`} />;
        })}</svg>
        {snap && <div className="dock-preview" style={{ left: snap.x, top: snap.y, width: snap.width, height: snap.height }}><span>Dock {snap.dock.side === 'bottom' ? 'below' : snap.dock.side === 'top' ? 'above' : snap.dock.side}</span></div>}
        {board.videos.map(video => <article key={video.id} className={`board-card video-card ${moduleClass(video.id)}`} data-module-id={video.id} data-video-id={video.id} data-docked-to={video.dock?.to} style={{ left: video.x, top: video.y, width: video.width, zIndex: video.z }}
          onPointerDown={() => setSelected(video.id)}>
          <VideoPlayer ref={handle => { if (handle) players.current.set(video.id, handle); else players.current.delete(video.id); }} video={video} url={urls[video.id]} urls={urls} stillTimes={board.stills.filter(s => s.videoId === video.id).map(s => s.time)} busy={busy.has(video.id) || editingLocked}
            dockControls={controlsFor(video.id)} onAddTrack={kind => addTrack(video.id, kind)} onPatch={patch => patchVideo(video.id, patch)} onCapture={time => void makeStill(video.id, time)} onDelete={() => remove(video.id)} onError={setNotice} onDrag={event => begin(event, 'move', video.id)} />
          <button type="button" className="resize-handle" aria-label="Resize video card" onPointerDown={event => begin(event, 'resize', video.id)} />
        </article>)}
        {board.stills.map(still => {
          const video = board.videos.find(v => v.id === still.videoId); if (!video) return null;
          return <article key={still.id} className={`board-card still-card ${moduleClass(still.id)}`} data-module-id={still.id} data-still-id={still.id} data-docked-to={still.dock?.to} style={{ left: still.x, top: still.y, width: still.width, zIndex: still.z }} onPointerDown={() => setSelected(still.id)}>
            <Still still={still} video={video} url={urls[still.id]} dockControls={controlsFor(still.id)} busy={busy.has(still.id) || editingLocked} onDrag={event => begin(event, 'move', still.id)} onTime={time => void makeStill(video.id, time, still.id)} onJump={() => jump(still)} onDelete={() => remove(still.id)} />
            <button type="button" className="resize-handle" aria-label="Resize still card" onPointerDown={event => begin(event, 'resize', still.id)} />
          </article>;
        })}
        {board.tracks.map(track => {
          const video = board.videos.find(v => v.id === track.videoId); if (!video) return null;
          return <article key={track.id} className={`board-card track-card ${moduleClass(track.id)}`} data-module-id={track.id} data-track-kind={track.kind} data-video-id={video.id} data-docked-to={track.dock?.to} style={{ left: track.x, top: track.y, width: track.width, height: track.height, zIndex: track.z }} onPointerDown={() => setSelected(track.id)}>
            <Track track={track} video={video} urls={urls} stillTimes={board.stills.filter(s => s.videoId === video.id).map(s => s.time)} dockControls={controlsFor(track.id)} busy={busy.has(video.id) || editingLocked} sceneBusy={sceneBusy.has(video.id) || video.analysis === 'pending'} onRetryScenes={() => scanScenes(video.id)} onThreshold={threshold => { if (video.scenes) patchVideo(video.id, { scenes: { ...video.scenes, threshold } }); }} onDrag={event => begin(event, 'move', track.id)} onSeek={time => players.current.get(video.id)?.seek(time)} onCapture={time => void makeStill(video.id, time)} onDuplicate={() => addTrack(video.id, track.kind, track)} onDelete={() => remove(track.id)} onJump={() => jump({ videoId: video.id, time: players.current.get(video.id)?.time() ?? video.time } as StillCard)} />
            <button type="button" className="resize-handle" aria-label={`Resize ${track.kind === 'filmstrip' ? 'frames' : track.kind === 'cuts' ? 'cuts' : 'audio'} scrubber`} onPointerDown={event => begin(event, 'resize', track.id)} />
          </article>;
        })}
      </div>
      {!board.videos.length && <div className="empty-board">
        <div className="empty-board__icon"><Film size={34} strokeWidth={1.2} /><span><Plus size={13} /></span></div>
        <h1>{loaded ? 'Drop a video here' : fatal ? 'Local storage unavailable' : 'Opening your board…'}</h1>
        <p>{fatal || 'Watch, capture a moment, give it some space.'}</p>
        {loaded && <button type="button" className="empty-add" onClick={() => videoInput.current?.click()} disabled={importing}>or choose a file</button>}
        <span className="empty-board__local">Videos stay on your device.</span>
      </div>}
      {dragOver && <div className="drop-overlay"><Plus size={28} /><span>Drop to add videos</span></div>}
      <div className="board-tools" onPointerDown={event => event.stopPropagation()}>
        <div className="tool-group"><IconButton icon={MousePointer2} label="Select and move" aria-pressed={!hand} onClick={() => setHand(false)} /><IconButton icon={Hand} label="Pan board" aria-pressed={hand} onClick={() => setHand(!hand)} /></div>
        {removed && <div className="tool-group"><IconButton icon={Undo2} label="Undo removal" onClick={() => { change(b => reflow(mapCards({ ...b, videos: [...b.videos, ...removed.videos], stills: [...b.stills, ...removed.stills], tracks: [...b.tracks, ...removed.tracks] }, c => removed.docks.has(c.id) ? { ...c, dock: removed.docks.get(c.id) } : c))); setRemoved(null); }} /></div>}
        <span className="board-hint">Header: move group <span>·</span> Grip: pull module free</span>
      </div>
      <div className="zoom-tools tool-group" onPointerDown={event => event.stopPropagation()}><IconButton icon={Minus} label="Zoom out" onClick={() => zoom(1 / 1.2)} /><button className="zoom-value" title="Reset zoom to 100%" onClick={() => zoom(1 / board.camera.scale)}>{Math.round(board.camera.scale * 100)}%</button><IconButton icon={Plus} label="Zoom in" onClick={() => zoom(1.2)} /><span className="toolbar-divider" /><IconButton icon={Scan} label="Fit board" onClick={fit} /></div>
    </div>
    {(notice || working || importing || operation) && <div className={`notice ${notice ? 'notice--error' : ''}`} role={notice ? 'alert' : 'status'}>
      {notice ? <CircleAlert size={16} /> : <LoaderCircle size={16} className="spin" />}<span>{notice || (operation ? 'Preparing file…' : importing ? 'Adding video…' : working)}</span>{notice && <IconButton icon={X} label="Dismiss message" onClick={() => setNotice('')} />}
    </div>}
  </div>;
}
