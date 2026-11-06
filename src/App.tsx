import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  BookOpen,
  Check,
  CircleAlert,
  Download,
  FileDown,
  Film,
  FolderOpen,
  Hand,
  FolderPlus,
  ImageDown,
  LoaderCircle,
  Minus,
  MousePointer2,
  Plus,
  Scan,
  Undo2,
  X,
} from 'lucide-react';
import { IconButton } from './Icons';
import { VideoPlayer, type PlayerHandle } from './VideoPlayer';
import { Still } from './Still';
import { Track } from './Track';
import { Clip } from './Clip';
import { Coding, type RangeDraft } from './Coding';
import { CodePopover } from './CodePopover';
import { EvidenceSpace } from './EvidenceSpace';
import {
  addEvidence,
  CODE_DRAG,
  freeSpacePosition,
  moveEvidence,
  promoteGroup,
  readEvidenceDrag,
  reconcileSpaces,
  removeEvidence,
  type EvidenceDrag,
} from './spaces';
import { csvExport, editQuotation, quotation } from './analysis';
import { shotAt, shotRanges } from './scenes';
import { useBoardMotion } from './motion';
import { posterKey, useClipPosters } from './posters';
import { visibleModuleIds } from './viewport';
import {
  applySnap,
  detachModule,
  dockIndex,
  findSnap,
  groupIds,
  reflow,
  rootId,
  translate,
  type Snap,
} from './docking';
import { analyzeVideo, captureFrame, detectScenes, probeVideo } from './media';
import { backupBoard, restoreArchive } from './archive';
import { exportBoard } from './export';
import { download, safeFilename } from './download';
import { loadBoard, replaceBoard, saveAssets, saveBoard } from './store';
import { resetPlayheads } from './transport';
import {
  allCards,
  boardBoxes,
  clamp,
  DOCK_GAP,
  emptyBoard,
  mapCards,
  sourceQuotationId,
  stillAssetId,
  topZ,
  type Board,
  type Camera,
  type Code,
  type ClipCard,
  type ModuleCard,
  type Point,
  type Quotation,
  type Rect,
  type StillCard,
  type SpaceCard,
  type TrackCard,
  type TrackKind,
  type VideoCard,
} from './model';

type PointerOrigin = {
  pointer: number;
  x: number;
  y: number;
  scale: number;
};
type Gesture = PointerOrigin &
  (
    | { kind: 'pan'; origin: Point }
    | { kind: 'resize'; id: string; origin: Point & { width: number; height: number } }
    | {
        kind: 'move';
        id: string;
        origin: Point;
        originals: Map<string, ModuleCard>;
        moving: Set<string>;
        root: string;
      }
  );

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
  const [removed, setRemoved] = useState(false);
  const history = useRef<Board[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [activeQuotation, setActiveQuotation] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<string | null>(null);
  const [draft, setDraft] = useState<RangeDraft | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<{ id: string; pinned: boolean; moduleId?: string } | null>(
    null,
  );
  const [spaceEvidence, setSpaceEvidence] = useState<Record<string, string[]>>({});
  const [viewport, setViewport] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();
  const clipElements = useRef(new Map<string, HTMLVideoElement>());
  const [operation, updateOperation] = useState(false);
  const operationActive = useRef(false);
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
  function setOperation(active: boolean) {
    operationActive.current = active;
    updateOperation(active);
  }
  const docks = useMemo(
    () => dockIndex(board),
    [board.videos, board.stills, board.tracks, board.clips, board.panels, board.spaces],
  );
  const sourceById = useMemo(() => new Map(board.videos.map((v) => [v.id, v])), [board.videos]);
  const quoteById = useMemo(
    () => new Map(board.quotations.map((q) => [q.id, q])),
    [board.quotations],
  );
  const viewCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of [...board.stills, ...board.clips])
      if (view.quotationId) counts.set(view.quotationId, (counts.get(view.quotationId) || 0) + 1);
    return counts;
  }, [board.stills, board.clips]);
  const motion = useBoardMotion(board, stage, loaded, () => !!gesture.current);
  const evidenceIds = useMemo(
    () => [...new Set(Object.values(spaceEvidence).flat())],
    [spaceEvidence],
  );
  const posters = useClipPosters(board, assets.current, viewport, epoch.current, evidenceIds);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    if (!preview?.moduleId) return;
    const space = board.spaces.find((space) => space.id === preview.moduleId);
    if (!space?.items.some((item) => `${space.id}/${item.quotationId}` === preview.id))
      setPreview(null);
  }, [board.spaces, preview]);
  useEffect(() => {
    if (stage.current) stage.current.inert = editingLocked;
  }, [editingLocked]);

  function change(update: (board: Board) => Board) {
    let next = update(current.current);
    if (next === current.current) return;
    if (next.quotations !== current.current.quotations || next.codes !== current.current.codes)
      next = reconcileSpaces(next);
    current.current = next;
    setSaving('saving');
    setBoard(next);
  }
  function checkpoint() {
    history.current = [...history.current.slice(-29), current.current];
    setUndoCount(history.current.length);
    setRemoved(false);
  }
  function undo() {
    if (operationActive.current) return;
    const previous = history.current.pop();
    if (!previous) return;
    // Retain completed analysis when undoing an earlier metadata/layout edit.
    const videos = previous.videos.map((v) => {
      const live = current.current.videos.find((c) => c.id === v.id);
      return live
        ? {
            ...live,
            x: v.x,
            y: v.y,
            z: v.z,
            width: v.width,
            height: v.height,
            dock: v.dock,
            hidden: v.hidden,
            time: v.time,
          }
        : v;
    });
    change(() => ({ ...previous, videos, camera: current.current.camera }));
    setUndoCount(history.current.length);
    setRemoved(false);
    setDraft(null);
    setDrawing(null);
    setPreview(null);
  }
  function openCodes(revealExisting = false) {
    const existing = current.current.panels[0];
    if (existing) {
      if (revealExisting) exposeModule(existing.id);
      return;
    }
    const c = current.current.camera,
      width = stage.current?.clientWidth || 1200;
    change((b) => ({
      ...b,
      panels: [
        {
          id: crypto.randomUUID(),
          kind: 'codes',
          x: (width - 352 - c.x) / c.scale,
          y: (22 - c.y) / c.scale,
          width: 326,
          height: 610,
          z: topZ(b),
        },
      ],
    }));
  }
  function showCoding(id: string) {
    setDraft(null);
    setActiveQuotation(id);
    const rect = document.activeElement?.getBoundingClientRect();
    setPopover({
      x: clamp((rect?.right || 300) - 260, 12, Math.max(12, window.innerWidth - 272)),
      y: clamp(rect?.bottom || 80, 60, Math.max(60, window.innerHeight - 370)),
    });
  }
  function selectModule(id: string) {
    setSelected(id);
    const b = current.current;
    const trackSource = b.tracks.find((t) => t.id === id)?.videoId;
    const q =
      b.stills.find((s) => s.id === id)?.quotationId ||
      b.clips.find((c) => c.id === id)?.quotationId ||
      (b.videos.some((v) => v.id === id)
        ? sourceQuotationId(id)
        : trackSource
          ? sourceQuotationId(trackSource)
          : undefined);
    if (q) setActiveQuotation(q);
  }
  function selectCard(event: ReactPointerEvent, id: string) {
    // Operating a view is separate from choosing evidence to code. In
    // particular, playback and frame controls must retain a selected child.
    if (
      (event.target as Element).closest(
        'button, input, select, textarea, [role="slider"], .video-image, .clip-media',
      )
    )
      setSelected(id);
    else selectModule(id);
  }
  function patchQuotation(id: string, patch: Partial<Quotation>) {
    change((b) => editQuotation(b, id, patch));
  }
  function createSpace(codeId?: string, point?: Point, evidence?: EvidenceDrag) {
    if (editingLocked) return;
    const b = current.current;
    if (codeId && !b.codes.some((code) => code.id === codeId)) return;
    const existing = codeId && b.spaces.find((space) => space.codeId === codeId);
    if (existing) {
      setSelected(existing.id);
      exposeModule(existing.id, 1);
      return;
    }
    checkpoint();
    const width = 700,
      height = 540;
    const space: SpaceCard = {
      id: crypto.randomUUID(),
      kind: 'space',
      name: '',
      memo: '',
      codeId,
      items: [],
      width,
      height,
      ...freeSpacePosition(
        boardBoxes(b),
        point || {
          x: (80 - b.camera.x) / b.camera.scale,
          y: (50 - b.camera.y) / b.camera.scale,
        },
        width,
        height,
      ),
      z: topZ(b),
    };
    change((before) => {
      const next = { ...before, spaces: [...before.spaces, space] };
      return evidence
        ? addEvidence(next, space.id, evidence.quotationId, undefined, evidence.spaceId)
        : reconcileSpaces(next);
    });
    setSelected(space.id);
    setPopover(null);
    exposeModule(space.id, 1);
  }
  function patchSpace(id: string, patch: Partial<Pick<SpaceCard, 'name' | 'memo'>>) {
    change((b) => {
      const space = b.spaces.find((space) => space.id === id);
      if (space?.codeId && patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) return b;
        return {
          ...b,
          codes: b.codes.map((code) =>
            code.id === space.codeId ? { ...code, name: patch.name! } : code,
          ),
        };
      }
      return {
        ...b,
        spaces: b.spaces.map((space) => (space.id === id ? { ...space, ...patch } : space)),
      };
    });
  }
  function reportEvidence(spaceId: string, ids: string[]) {
    setSpaceEvidence((previous) => {
      if ((previous[spaceId] || []).join('|') === ids.join('|')) return previous;
      const next = { ...previous };
      if (ids.length) next[spaceId] = ids;
      else delete next[spaceId];
      return next;
    });
  }
  function addCode(name: string) {
    const trimmed = name.trim();
    if (!trimmed || draft) return;
    const existing = current.current.codes.find(
      (c) => c.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    const target = current.current.quotations.find((q) => q.id === activeQuotation);
    if (existing && (!target || target.codeIds.includes(existing.id))) return;
    checkpoint();
    const colors = ['#b7cde5', '#d9b5c8', '#b8ceb0', '#e1c496', '#c3b8de'];
    const code: Code = existing || {
      id: crypto.randomUUID(),
      name: trimmed,
      color: colors[current.current.codes.length % colors.length],
      definition: '',
    };
    change((b) => {
      const added = existing ? b : { ...b, codes: [...b.codes, code] };
      return target
        ? editQuotation(added, target.id, { codeIds: [...target.codeIds, code.id] })
        : added;
    });
  }
  function assignCode(codeId: string) {
    if (draft) return;
    const q = current.current.quotations.find((q) => q.id === activeQuotation);
    if (!q) return;
    checkpoint();
    patchQuotation(q.id, {
      codeIds: q.codeIds.includes(codeId)
        ? q.codeIds.filter((id) => id !== codeId)
        : [...q.codeIds, codeId],
    });
  }
  function requestHover(id: string, hover: boolean, moduleId?: string) {
    clearTimeout(hoverTimer.current);
    if (!hover) {
      setPreview((p) => (p?.id === id && !p.pinned ? null : p));
      return;
    }
    if (gesture.current || operation) return;
    hoverTimer.current = setTimeout(() => {
      if (!gesture.current) setPreview((p) => (p?.pinned ? p : { id, pinned: false, moduleId }));
    }, 120);
  }
  function stopHover() {
    clearTimeout(hoverTimer.current);
    setPreview((p) => (p?.pinned ? p : null));
  }
  function patchVideo(id: string, patch: Partial<VideoCard>) {
    change((b) => ({ ...b, videos: b.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  }
  function installAssets(additions: Map<string, Blob>) {
    const next = { ...objectUrls.current };
    for (const [key, blob] of additions) {
      assets.current.set(key, blob);
      const old = next[key];
      if (old) setTimeout(() => URL.revokeObjectURL(old), 1000);
      next[key] = URL.createObjectURL(blob);
    }
    objectUrls.current = next;
    setUrls(next);
  }
  function markBusy(id: string, active: boolean) {
    setBusy((previous) => {
      const next = new Set(previous);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function processVideo(id: string, blob: Blob) {
    const generation = epoch.current;
    analysisQueue.current = analysisQueue.current.then(async () => {
      if (generation !== epoch.current || !current.current.videos.some((v) => v.id === id)) return;
      try {
        const result = await analyzeVideo(blob, (label) => {
          if (generation === epoch.current) setWorking(label);
        });
        if (generation !== epoch.current || !current.current.videos.some((v) => v.id === id))
          return;
        const additions = new Map(
          result.thumbnails.map((thumb, index) => [`${id}-thumb-${index}`, thumb]),
        );
        await saveAssets(additions);
        if (generation !== epoch.current) return;
        installAssets(additions);
        patchVideo(id, {
          thumbnails: [...additions.keys()],
          peaks: result.peaks,
          frameTimes: result.frameTimes,
          scenes: result.scenes,
          analysis: result.note && result.note !== 'No audio track' ? 'partial' : 'ready',
          analysisNote: result.note,
        });
      } catch (error) {
        if (generation === epoch.current)
          patchVideo(id, {
            analysis: 'partial',
            analysisNote: error instanceof Error ? error.message : 'Media analysis failed',
          });
      } finally {
        if (generation === epoch.current) setWorking('');
      }
    });
  }

  function scanScenes(id: string) {
    const video = current.current.videos.find((v) => v.id === id),
      blob = assets.current.get(id);
    if (
      !video ||
      !blob ||
      video.scenes ||
      video.analysis === 'pending' ||
      sceneJobs.current.has(id)
    )
      return;
    sceneJobs.current.add(id);
    setSceneBusy(new Set(sceneJobs.current));
    const generation = epoch.current;
    analysisQueue.current = analysisQueue.current.then(async () => {
      try {
        if (generation !== epoch.current || !current.current.videos.some((v) => v.id === id))
          return;
        const scenes = await detectScenes(blob, (label) => {
          if (generation === epoch.current) setWorking(label);
        });
        if (generation === epoch.current) patchVideo(id, { scenes });
      } catch (error) {
        if (generation === epoch.current)
          setNotice(error instanceof Error ? error.message : 'Cut detection failed.');
      } finally {
        sceneJobs.current.delete(id);
        setSceneBusy(new Set(sceneJobs.current));
        if (generation === epoch.current) setWorking('');
      }
    });
  }

  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    void loadBoard()
      .then(({ board: saved, assets: stored }) => {
        installAssets(stored);
        resetPlayheads(saved?.videos || []);
        if (saved) {
          current.current = saved;
          setBoard(saved);
        }
        setLoaded(true);
        for (const video of saved?.videos || [])
          if (video.analysis === 'pending') {
            const blob = stored.get(video.id);
            if (blob) processVideo(video.id, blob);
          }
      })
      .catch((error) => setFatal(`The local board could not be opened: ${error.message}`));
    // These URLs live for the page lifetime; replacing an asset revokes its old
    // URL. Revoking on effect cleanup would break live video seeking during HMR.
  }, []);

  useEffect(() => {
    if (!loaded || operation) return;
    setSaving('saving');
    const snapshot = board;
    saveTimer.current = setTimeout(() => {
      saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveBoard(snapshot));
      void saveQueue.current
        .then(() => {
          if (current.current === snapshot) setSaving('saved');
        })
        .catch((error) => {
          if (current.current !== snapshot) return;
          setSaving('error');
          setNotice(
            `Could not save locally: ${error.message}. Download a project backup to keep this board.`,
          );
        });
    }, 220);
    return () => clearTimeout(saveTimer.current);
  }, [board, loaded, operation]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointer !== event.pointerId || operationActive.current) return;
      const dx = (event.clientX - g.x) / g.scale,
        dy = (event.clientY - g.y) / g.scale;
      if (g.kind === 'pan')
        change((b) => ({ ...b, camera: { ...b.camera, x: g.origin.x + dx, y: g.origin.y + dy } }));
      else if (g.kind === 'move')
        change((b) => {
          const next = translate(b, g.originals, { x: dx, y: dy });
          const candidate = event.shiftKey ? null : findSnap(next, g.moving, g.root);
          snapRef.current = candidate;
          setSnap(candidate);
          return next;
        });
      else
        change((b) =>
          reflow(
            mapCards(b, (card) => {
              if (card.id !== g.id) return card;
              const track = b.tracks.find((t) => t.id === card.id),
                video = b.videos.some((v) => v.id === card.id),
                panel = b.panels.some((p) => p.id === card.id),
                evidenceSpace = b.spaces.some((s) => s.id === card.id),
                clip = b.clips.some((c) => c.id === card.id);
              return {
                ...card,
                width: clamp(
                  (g.origin.width || 300) + dx,
                  evidenceSpace ? 400 : track ? 240 : panel || video || clip ? 320 : 280,
                  1600,
                ),
                height: clamp(
                  (g.origin.height || 100) + dy,
                  evidenceSpace
                    ? 320
                    : track
                      ? track.kind === 'cuts'
                        ? 96
                        : 72
                      : panel
                        ? 280
                        : clip
                          ? 230
                          : video
                            ? 190
                            : 110,
                  track ? 600 : 1200,
                ),
              };
            }),
          ),
        );
    };
    const finish = (commit: boolean) => {
      if (commit && gesture.current?.kind === 'move' && snapRef.current)
        change((b) => applySnap(b, snapRef.current!));
      gesture.current = null;
      snapRef.current = null;
      setSnap(null);
      setMoving(new Set());
      document.body.classList.remove('is-dragging');
    };
    const pointerUp = (event: PointerEvent) => {
      if (gesture.current?.pointer === event.pointerId) finish(!event.shiftKey);
    };
    const pointerCancel = (event: PointerEvent) => {
      if (gesture.current?.pointer === event.pointerId) finish(false);
    };
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || operationActive.current) return;
      if (event.key === 'Escape') {
        finish(false);
        setSelected(null);
        setHand(false);
        setDrawing(null);
        setDraft(null);
        setPreview(null);
        setPopover(null);
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z' &&
        !(event.target as Element)?.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        event.preventDefault();
        undo();
        return;
      }
      if ((event.target as Element)?.closest('input, select, textarea, button, a')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpace(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpace(false);
    };
    const blur = () => {
      setSpace(false);
      finish(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const viewport = stage.current;
    if (!viewport) return;
    const wheel = (event: WheelEvent) => {
      if (operationActive.current) return;
      if ((event.target as Element).closest('select, input')) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const box = viewport.getBoundingClientRect();
        zoom(Math.exp(-event.deltaY * 0.008), {
          x: event.clientX - box.left,
          y: event.clientY - box.top,
        });
      } else
        change((b) => ({
          ...b,
          camera: { ...b.camera, x: b.camera.x - event.deltaX, y: b.camera.y - event.deltaY },
        }));
    };
    viewport.addEventListener('wheel', wheel, { passive: false });
    return () => viewport.removeEventListener('wheel', wheel);
  }, []);

  function zoom(factor: number, anchor?: Point) {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const at = anchor || { x: box.width / 2, y: box.height / 2 };
    change((b) => {
      const c = b.camera,
        scale = clamp(c.scale * factor, 0.15, 3);
      return {
        ...b,
        camera: {
          scale,
          x: at.x - ((at.x - c.x) / c.scale) * scale,
          y: at.y - ((at.y - c.y) / c.scale) * scale,
        },
      };
    });
  }
  function fit() {
    const boxes = boardBoxes(current.current),
      viewport = stage.current?.getBoundingClientRect();
    if (!boxes.length || !viewport) {
      change((b) => ({ ...b, camera: { x: 0, y: 0, scale: 1 } }));
      return;
    }
    const minX = Math.min(...boxes.map((c) => c.x)),
      minY = Math.min(...boxes.map((c) => c.y));
    const w = Math.max(...boxes.map((c) => c.x + c.width)) - minX,
      h = Math.max(...boxes.map((c) => c.y + c.height)) - minY;
    const scale = clamp(
      Math.min((viewport.width - 140) / w, (viewport.height - 140) / h, 1),
      0.15,
      3,
    );
    const camera: Camera = {
      scale,
      x: (viewport.width - w * scale) / 2 - minX * scale,
      y: (viewport.height - h * scale) / 2 - minY * scale,
    };
    change((b) => ({ ...b, camera }));
  }
  function exposeModule(id: string, preferredScale?: number) {
    const b = current.current,
      box = boardBoxes(b).find((c) => c.id === id),
      viewport = stage.current?.getBoundingClientRect();
    if (!box || !viewport) return;
    const c = b.camera,
      margin = 24;
    // Source reveal keeps the current scale. Explicitly opening a space starts
    // at a readable scale, reduced only when its frame cannot fit.
    const scale = clamp(
      Math.min(
        preferredScale ?? c.scale,
        (viewport.width - margin * 2) / box.width,
        (viewport.height - margin * 2) / box.height,
      ),
      0.15,
      3,
    );
    const x = clamp(
      box.x * scale + c.x,
      margin,
      Math.max(margin, viewport.width - margin - box.width * scale),
    );
    const y = clamp(
      box.y * scale + c.y,
      margin,
      Math.max(margin, viewport.height - margin - box.height * scale),
    );
    change((b) =>
      mapCards({ ...b, camera: { scale, x: x - box.x * scale, y: y - box.y * scale } }, (card) =>
        card.id === id ? { ...card, z: topZ(b) } : card,
      ),
    );
  }
  function begin(
    event: ReactPointerEvent,
    kind: 'move' | 'resize',
    id: string,
    independent = false,
  ) {
    if (
      editingLocked ||
      event.button !== 0 ||
      (kind === 'move' &&
        !independent &&
        (event.target as Element).closest('button, input, select'))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    checkpoint();
    stopHover();
    let base =
      kind === 'move' && (independent || event.altKey)
        ? detachModule(current.current, id)
        : current.current;
    const ids = kind === 'move' ? groupIds(base, id) : new Set([id]);
    const offsets = motion.interrupt(ids);
    base = mapCards(base, (card) => {
      const offset = offsets.get(card.id);
      return offset ? { ...card, x: card.x + offset.x, y: card.y + offset.y } : card;
    });
    const card = boardBoxes(base).find((c) => c.id === id);
    if (!card) return;
    const originals = new Map(
      allCards(base)
        .filter((c) => ids.has(c.id))
        .map((c) => [c.id, c]),
    );
    const origin = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      id,
      origin: { x: card.x, y: card.y, width: card.width, height: card.height },
      scale: base.camera.scale,
    };
    gesture.current =
      kind === 'move'
        ? { ...origin, kind, originals, moving: ids, root: rootId(base, id) }
        : { ...origin, kind };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add('is-dragging');
    if (kind === 'move') selectModule(id);
    else setSelected(id);
    const z = topZ(base);
    setMoving(ids);
    change(() =>
      mapCards(base, (c) => (ids.has(c.id) ? { ...c, z: z + [...ids].indexOf(c.id) } : c)),
    );
  }
  function undock(id: string) {
    if (editingLocked) return;
    checkpoint();
    stopHover();
    change((b) =>
      mapCards(detachModule(b, id), (c) =>
        c.id === id ? { ...c, x: c.x + 22, y: c.y + 12, z: topZ(b) } : c,
      ),
    );
    setSelected(id);
  }
  function controlsFor(id: string) {
    return {
      docked: (docks.groups.get(id)?.size || 0) > 1,
      onPeel: (event: ReactPointerEvent) => begin(event, 'move', id, true),
      onDetach: () => undock(id),
    };
  }
  function pan(event: ReactPointerEvent) {
    if (editingLocked || ![0, 1].includes(event.button)) return;
    if ((event.target as Element).closest('.board-tools, .zoom-tools, .empty-board')) return;
    if (!hand && !space && event.button !== 1 && (event.target as Element).closest('.board-card'))
      return;
    event.preventDefault();
    event.stopPropagation();
    stopHover();
    const camera = current.current.camera;
    gesture.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      kind: 'pan',
      origin: { x: camera.x, y: camera.y },
      scale: 1,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add('is-dragging');
    if (!hand && !space) setSelected(null);
  }

  async function importVideos(files: File[], point?: Point) {
    if (editingLocked || importing) return;
    setImporting(true);
    setNotice('');
    void navigator.storage?.persist?.().catch(() => {});
    let failures = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name)) {
        failures++;
        continue;
      }
      try {
        const metadata = await probeVideo(file);
        const id = crypto.randomUUID();
        const additions = new Map([[id, file as Blob]]);
        await saveAssets(additions);
        installAssets(additions);
        const camera = current.current.camera;
        const offset = (current.current.videos.length % 8) * 40;
        const origin = point || {
          x: (90 - camera.x) / camera.scale + offset,
          y: (70 - camera.y) / camera.scale + offset,
        };
        const video: VideoCard = {
          ...metadata,
          id,
          name: file.name,
          width: 440,
          x: origin.x + i * 35,
          y: origin.y + i * 35,
          z: topZ(current.current),
          time: 0,
          thumbnails: [],
          peaks: [],
          frameTimes: [],
          analysis: 'pending',
          showFilmstrip: true,
          showWaveform: true,
        };
        checkpoint();
        const q = {
          ...quotation(id, 'video', 0, video.duration),
          id: sourceQuotationId(id),
          title: file.name,
        };
        change((b) => ({ ...b, videos: [...b.videos, video], quotations: [...b.quotations, q] }));
        addTrack(id, 'filmstrip');
        addTrack(id, 'waveform');
        selectModule(id);
        processVideo(id, file);
      } catch (error) {
        failures++;
        setNotice(error instanceof Error ? error.message : 'The video could not be imported.');
      }
    }
    if (failures)
      setNotice(
        (previous) =>
          previous ||
          `${failures} file${failures === 1 ? '' : 's'} could not be imported. Add a playable video file.`,
      );
    setImporting(false);
  }
  function addTrack(videoId: string, kind: TrackKind, duplicate?: TrackCard) {
    change((b) => {
      const video = b.videos.find((v) => v.id === videoId);
      if (!video) return b;
      const group = groupIds(b, videoId);
      const parent = boardBoxes(b)
        .filter((c) => group.has(c.id))
        .sort((a, c) => c.y + c.height - a.y - a.height)[0];
      const track: TrackCard = duplicate
        ? {
            ...duplicate,
            id: crypto.randomUUID(),
            x: duplicate.x + 28,
            y: duplicate.y + 28,
            dock: undefined,
            z: topZ(b),
          }
        : {
            id: crypto.randomUUID(),
            videoId,
            kind,
            x: parent.x,
            y: parent.y + parent.height + DOCK_GAP,
            width: video.width,
            height: kind === 'filmstrip' ? 104 : kind === 'cuts' ? 116 : 88,
            z: topZ(b),
            dock: { to: parent.id, side: 'bottom', offset: 0 },
          };
      setSelected(track.id);
      return { ...b, tracks: [...b.tracks, track] };
    });
    if (kind === 'cuts') scanScenes(videoId);
  }
  function placeClip(q: Quotation, record = true) {
    const b = current.current,
      source = b.videos.find((v) => v.id === q.sourceId);
    if (!source || q.kind !== 'range') return;
    if (record) checkpoint();
    const count =
      b.clips.filter((c) => c.videoId === source.id).length +
      b.stills.filter((s) => s.videoId === source.id).length;
    const clip: ClipCard = {
      id: crypto.randomUUID(),
      videoId: source.id,
      quotationId: q.id,
      time: q.start,
      x: source.x + source.width + 64 + (count % 3) * 368,
      y: source.y + Math.floor(count / 3) * 360,
      width: 340,
      z: topZ(b),
    };
    change((b) => ({
      ...b,
      clips: [...b.clips, clip],
      quotations: b.quotations.some((old) => old.id === q.id) ? b.quotations : [...b.quotations, q],
    }));
    setSelected(clip.id);
    setActiveQuotation(q.id);
  }
  function createClip(sourceId: string, time: number) {
    const source = current.current.videos.find((v) => v.id === sourceId);
    if (!source) return;
    const shots = shotRanges(source.scenes, source.duration, source.start),
      shot = source.scenes ? shots[shotAt(shots, time)] : null;
    const start = shot?.start ?? clamp(time, 0, Math.max(0, source.duration - 0.001)),
      end = shot?.end ?? Math.min(source.duration, start + 3);
    placeClip(quotation(sourceId, 'range', start, end, sourceQuotationId(sourceId)));
  }
  function allShots(sourceId: string) {
    const source = current.current.videos.find((v) => v.id === sourceId);
    if (!source?.scenes) return;
    checkpoint();
    for (const shot of shotRanges(source.scenes, source.duration, source.start))
      placeClip(
        quotation(sourceId, 'range', shot.start, shot.end, sourceQuotationId(sourceId)),
        false,
      );
  }
  function segment(sourceId: string, parentId: string, time: number) {
    const q = current.current.quotations.find((q) => q.id === parentId);
    if (!q) return;
    const start = clamp(time, q.start, Math.max(q.start, q.end - 0.001));
    setPopover(null);
    setDraft({
      sourceId,
      parentId,
      min: q.start,
      max: q.end,
      start,
      end: Math.min(q.end, start + 1),
    });
    openCodes(true);
  }
  function saveSegment() {
    if (!draft) return;
    checkpoint();
    const q = quotation(draft.sourceId, 'range', draft.start, draft.end, draft.parentId);
    change((b) => ({ ...b, quotations: [...b.quotations, q] }));
    setActiveQuotation(q.id);
    setDraft(null);
  }
  function createRegion(still: StillCard, rect: Rect) {
    checkpoint();
    const duration = current.current.videos.find((v) => v.id === still.videoId)!.duration;
    const q = {
      ...quotation(
        still.videoId,
        'region',
        still.time,
        Math.min(duration, still.time + still.duration),
        still.quotationId,
      ),
      rect,
    };
    change((b) => ({ ...b, quotations: [...b.quotations, q] }));
    setActiveQuotation(q.id);
    openCodes();
  }
  function deleteQuotation(q: Quotation) {
    if (q.kind === 'video') return;
    checkpoint();
    const ids = new Set([
      q.id,
      ...current.current.quotations
        .filter((child) => child.kind === 'region' && child.parentId === q.id)
        .map((child) => child.id),
    ]);
    const removedViews = new Set(
      [...current.current.clips, ...current.current.stills]
        .filter((c) => c.quotationId && ids.has(c.quotationId))
        .map((c) => c.id),
    );
    change((b) =>
      mapCards(
        {
          ...b,
          quotations: b.quotations
            .filter((q) => !ids.has(q.id))
            .map((q) => (q.parentId && ids.has(q.parentId) ? { ...q, parentId: undefined } : q)),
          clips: b.clips.filter((c) => !removedViews.has(c.id)),
          stills: b.stills.filter((s) => !removedViews.has(s.id)),
        },
        (c) => (c.dock && removedViews.has(c.dock.to) ? { ...c, dock: undefined } : c),
      ),
    );
    setActiveQuotation(null);
    setDrawing(null);
    setPopover(null);
    setPreview((p) => (p && removedViews.has(p.id) ? null : p));
    setRemoved(true);
  }
  function reveal(q: Quotation) {
    setDraft(null);
    setActiveQuotation(q.id);
    if (q.kind === 'frame' || q.kind === 'region') {
      const frameId = q.kind === 'frame' ? q.id : q.parentId,
        still = current.current.stills.find((s) => s.quotationId === frameId);
      if (still) {
        motion.highlight(still.id);
        motion.highlight(q.sourceId);
        setSelected(still.id);
        exposeModule(still.id);
      } else void makeStill(q.sourceId, q.start, undefined, frameId);
    } else jump({ videoId: q.sourceId, time: q.start });
  }
  function duplicateStill(still: StillCard) {
    checkpoint();
    const copy = {
      ...still,
      id: crypto.randomUUID(),
      assetId: stillAssetId(still),
      x: still.x + 32,
      y: still.y + 32,
      dock: undefined,
      z: topZ(current.current),
    };
    change((b) => ({ ...b, stills: [...b.stills, copy] }));
    setSelected(copy.id);
    setActiveQuotation(still.quotationId || null);
  }
  async function makeStill(
    videoId: string,
    requested: number,
    existingId?: string,
    frameQuotationId?: string,
  ) {
    const video = current.current.videos.find((v) => v.id === videoId),
      blob = assets.current.get(videoId);
    if (!video || !blob) return;
    const id = existingId || crypto.randomUUID(),
      generation = epoch.current;
    const existing = current.current.stills.find((s) => s.id === existingId);
    const qid = existing?.quotationId || frameQuotationId || `frame-${id}`,
      busyKey = existing ? qid : videoId;
    markBusy(busyKey, true);
    try {
      const frame = await captureFrame(blob, requested);
      if (
        generation !== epoch.current ||
        !current.current.videos.some((v) => v.id === videoId) ||
        (existingId && !current.current.stills.some((s) => s.id === existingId))
      )
        return;
      const assetId = existingId ? crypto.randomUUID() : id;
      const additions = new Map([[assetId, frame.blob]]);
      await saveAssets(additions);
      if (
        generation !== epoch.current ||
        !current.current.videos.some((v) => v.id === videoId) ||
        (existingId && !current.current.stills.some((s) => s.id === existingId))
      )
        return;
      installAssets(additions);
      checkpoint();
      change((b) => {
        const end = Math.min(video.duration, frame.time + frame.duration);
        if (existingId)
          return editQuotation(
            {
              ...b,
              stills: b.stills.map((s) =>
                s.quotationId === qid
                  ? { ...s, assetId, time: frame.time, duration: frame.duration }
                  : s,
              ),
            },
            qid,
            { start: frame.time, end },
          );
        const source = b.videos.find((v) => v.id === videoId)!;
        const count =
          b.stills.filter((s) => s.videoId === videoId).length +
          b.clips.filter((c) => c.videoId === videoId).length;
        const width = 280,
          height = (width * source.sourceHeight) / source.sourceWidth + 100;
        const still: StillCard = {
          id,
          videoId,
          quotationId: qid,
          assetId,
          time: frame.time,
          duration: frame.duration,
          width,
          x: source.x + source.width + 64 + Math.floor(count / 3) * 320,
          y: source.y + (count % 3) * height,
          z: topZ(b),
        };
        return {
          ...b,
          stills: [...b.stills, still],
          quotations: b.quotations.some((q) => q.id === qid)
            ? b.quotations
            : [...b.quotations, { ...quotation(videoId, 'frame', frame.time, end), id: qid }],
        };
      });
      setSelected(id);
      if (!existingId && !frameQuotationId) setActiveQuotation(qid);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The still could not be created.');
    } finally {
      markBusy(busyKey, false);
    }
  }
  function remove(id: string) {
    checkpoint();
    stopHover();
    change((b) =>
      mapCards(
        {
          ...b,
          videos: b.videos.map((v) => (v.id === id ? { ...v, hidden: true, dock: undefined } : v)),
          stills: b.stills.filter((s) => s.id !== id),
          tracks: b.tracks.filter((t) => t.id !== id),
          clips: b.clips.filter((c) => c.id !== id),
          panels: b.panels.filter((p) => p.id !== id),
          spaces: b.spaces.filter((s) => s.id !== id),
        },
        (c) => (c.dock?.to === id ? { ...c, dock: undefined } : c),
      ),
    );
    setSelected(null);
    setDrawing(null);
    setPopover(null);
    setPreview((p) => (p?.id === id || p?.moduleId === id ? null : p));
    setRemoved(true);
  }
  function jump(still: Pick<StillCard, 'videoId' | 'time'>) {
    if (current.current.videos.find((v) => v.id === still.videoId)?.hidden)
      patchVideo(still.videoId, { hidden: false, time: still.time });
    players.current.get(still.videoId)?.seek(still.time);
    setSelected(still.videoId);
    motion.highlight(still.videoId);
    exposeModule(still.videoId);
  }
  async function exportImage() {
    if (operationActive.current || importing) return;
    setOperation(true);
    setNotice('');
    try {
      const elements = new Map<string, HTMLVideoElement>();
      for (const [id, handle] of players.current) {
        const el = handle.element();
        if (el) {
          el.pause();
          elements.set(id, el);
        }
      }
      for (const [id, el] of clipElements.current) {
        el.pause();
        elements.set(id, el);
      }
      const snapshot = current.current;
      download(
        await exportBoard(snapshot, assets.current, elements),
        `${safeFilename(snapshot.name)}.png`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Image export failed.');
    } finally {
      setOperation(false);
    }
  }
  async function exportProject() {
    if (operationActive.current || importing) return;
    setOperation(true);
    try {
      download(
        await backupBoard(current.current, assets.current),
        `${safeFilename(current.current.name)}.videoboard.zip`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Project backup failed.');
    } finally {
      setOperation(false);
    }
  }
  async function openProject(file: File) {
    if (operationActive.current || importing || busy.size > 0) return;
    setOperation(true);
    setNotice('');
    try {
      const restored = await restoreArchive(file);
      // Keep the previous board reviewable and recoverable before replacing it.
      if (current.current.videos.length) {
        const backup = await backupBoard(current.current, assets.current);
        download(backup, `${safeFilename(current.current.name)}-before-open.videoboard.zip`);
      }
      clearTimeout(saveTimer.current);
      await saveQueue.current.catch(() => {});
      epoch.current++;
      await analysisQueue.current;
      await replaceBoard(restored.board, restored.assets);
      assets.current = new Map();
      for (const url of Object.values(objectUrls.current)) URL.revokeObjectURL(url);
      objectUrls.current = {};
      installAssets(restored.assets);
      current.current = restored.board;
      setBoard(restored.board);
      resetPlayheads(restored.board.videos);
      setSelected(null);
      setRemoved(false);
      setWorking('');
      setFatal('');
      setLoaded(true);
      history.current = [];
      setUndoCount(0);
      setActiveQuotation(null);
      setDrawing(null);
      setDraft(null);
      setPreview(null);
      setPopover(null);
      clearTimeout(hoverTimer.current);
      for (const video of restored.board.videos)
        if (video.analysis === 'pending') processVideo(video.id, restored.assets.get(video.id)!);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Project backup could not be opened.');
    } finally {
      setOperation(false);
    }
  }

  const selectedGroup = useMemo(
    () => (selected && docks.groups.get(selected)) || new Set<string>(),
    [selected, docks],
  );
  const focusedModule = document.activeElement
    ?.closest('[data-module-id]')
    ?.getAttribute('data-module-id');
  const visible = useMemo(() => {
    const keep = new Set(moving);
    if (selected) keep.add(selected);
    if (preview) keep.add(preview.id);
    if (preview?.moduleId) keep.add(preview.moduleId);
    if (focusedModule) keep.add(focusedModule);
    return visibleModuleIds(board, viewport, keep);
  }, [
    board.videos,
    board.stills,
    board.tracks,
    board.clips,
    board.panels,
    board.spaces,
    board.camera,
    viewport,
    selected,
    moving,
    preview?.id,
    preview?.moduleId,
    focusedModule,
  ]);
  const visibleKey = [...visible].sort().join('|');
  const dockTarget = snap?.dock.to;
  const moduleClass = (id: string) =>
    `${selected === id ? 'is-selected' : ''} ${selectedGroup.size > 1 && selectedGroup.has(id) ? 'is-grouped' : ''} ${moving.has(id) ? 'is-moving' : ''} ${dockTarget === id ? `is-dock-target dock-${snap!.dock.side}` : ''}`;
  // Camera/saving updates reuse the same module elements. Their handlers read
  // the current board ref, so panning does not rerender every player and editor.
  const modules = useMemo(
    () => (
      <>
        <svg className="board-links" aria-hidden="true">
          {[...board.stills, ...board.clips]
            .filter((view) => visible.has(view.id))
            .map((still) => {
              const source = sourceById.get(still.videoId);
              if (!source || source.hidden) return null;
              const x1 = source.x + source.width / 2,
                x2 = still.x + still.width / 2;
              return (
                <path
                  key={still.id}
                  className={selected === source.id || selected === still.id ? 'is-active' : ''}
                  d={`M ${x1} ${source.y + 14} C ${x1} ${source.y - 40}, ${x2} ${still.y - 40}, ${x2} ${still.y + 14}`}
                />
              );
            })}
        </svg>
        {snap && (
          <div
            className="dock-preview"
            key={`${snap.dock.to}-${snap.dock.side}`}
            data-side={snap.dock.side}
            style={{ left: snap.x, top: snap.y, width: snap.width, height: snap.height }}
          >
            <span>
              Dock{' '}
              {snap.dock.side === 'bottom'
                ? 'below'
                : snap.dock.side === 'top'
                  ? 'above'
                  : snap.dock.side}
            </span>
          </div>
        )}
        {board.videos
          .filter((v) => !v.hidden)
          .map((video) => (
            <article
              key={video.id}
              className={`board-card video-card ${moduleClass(video.id)}`}
              data-module-id={video.id}
              data-video-id={video.id}
              data-docked-to={video.dock?.to}
              style={{ left: video.x, top: video.y, width: video.width, zIndex: video.z }}
              onPointerDown={(event) => selectCard(event, video.id)}
            >
              <VideoPlayer
                ref={(handle) => {
                  if (handle) players.current.set(video.id, handle);
                  else players.current.delete(video.id);
                }}
                video={video}
                url={urls[video.id]}
                urls={urls}
                stillTimes={board.stills.filter((s) => s.videoId === video.id).map((s) => s.time)}
                busy={busy.has(video.id) || editingLocked}
                dockControls={controlsFor(video.id)}
                onAddTrack={(kind) => addTrack(video.id, kind)}
                onPatch={(patch) => patchVideo(video.id, patch)}
                onCapture={(time) => void makeStill(video.id, time)}
                onDelete={() => remove(video.id)}
                onError={setNotice}
                onDrag={(event) => begin(event, 'move', video.id)}
                quotation={quoteById.get(sourceQuotationId(video.id))}
                codes={board.codes}
                onClip={(time) => createClip(video.id, time)}
                onAllShots={() => allShots(video.id)}
                onSegment={(time) => segment(video.id, sourceQuotationId(video.id), time)}
                onCode={() => showCoding(sourceQuotationId(video.id))}
              />
              <button
                type="button"
                className="resize-handle"
                aria-label="Resize video card"
                onPointerDown={(event) => begin(event, 'resize', video.id)}
              />
            </article>
          ))}
        {board.stills
          .filter((still) => visible.has(still.id))
          .map((still) => {
            const video = sourceById.get(still.videoId);
            if (!video) return null;
            return (
              <article
                key={still.id}
                className={`board-card still-card ${moduleClass(still.id)}`}
                data-module-id={still.id}
                data-still-id={still.id}
                data-docked-to={still.dock?.to}
                style={{ left: still.x, top: still.y, width: still.width, zIndex: still.z }}
                onPointerDown={(event) => selectCard(event, still.id)}
              >
                <Still
                  still={still}
                  video={video}
                  url={urls[stillAssetId(still)]}
                  dockControls={controlsFor(still.id)}
                  busy={busy.has(still.quotationId || still.id) || editingLocked}
                  onDrag={(event) => begin(event, 'move', still.id)}
                  onTime={(time) => void makeStill(video.id, time, still.id)}
                  onJump={() => jump(still)}
                  onDelete={() => remove(still.id)}
                  quotation={quoteById.get(still.quotationId || '')}
                  sharedViews={viewCounts.get(still.quotationId || '') || 1}
                  codes={board.codes}
                  regions={board.quotations.filter(
                    (q) => q.kind === 'region' && q.parentId === still.quotationId,
                  )}
                  selectedRegion={activeQuotation}
                  drawing={drawing === still.id}
                  onDraw={() => {
                    setDrawing(drawing === still.id ? null : still.id);
                    setActiveQuotation(still.quotationId || null);
                  }}
                  onSelectRegion={(id) => {
                    setActiveQuotation(id);
                    setSelected(still.id);
                    openCodes();
                  }}
                  onCreateRegion={(rect) => createRegion(still, rect)}
                  onChangeRegion={(id, rect) => patchQuotation(id, { rect })}
                  onEditStart={checkpoint}
                  onDeleteRegion={(id) => {
                    const q = board.quotations.find((q) => q.id === id);
                    if (q) deleteQuotation(q);
                  }}
                  onCode={() => showCoding(still.quotationId!)}
                  onDuplicate={() => duplicateStill(still)}
                />
                <button
                  type="button"
                  className="resize-handle"
                  aria-label="Resize still card"
                  onPointerDown={(event) => begin(event, 'resize', still.id)}
                />
              </article>
            );
          })}
        {board.tracks
          .filter((track) => visible.has(track.id))
          .map((track) => {
            const video = sourceById.get(track.videoId);
            if (!video) return null;
            return (
              <article
                key={track.id}
                className={`board-card track-card ${moduleClass(track.id)}`}
                data-module-id={track.id}
                data-track-kind={track.kind}
                data-video-id={video.id}
                data-docked-to={track.dock?.to}
                style={{
                  left: track.x,
                  top: track.y,
                  width: track.width,
                  height: track.height,
                  zIndex: track.z,
                }}
                onPointerDown={() => setSelected(track.id)}
              >
                <Track
                  track={track}
                  video={video}
                  urls={urls}
                  stillTimes={board.stills.filter((s) => s.videoId === video.id).map((s) => s.time)}
                  dockControls={controlsFor(track.id)}
                  busy={busy.has(video.id) || editingLocked}
                  sceneBusy={sceneBusy.has(video.id) || video.analysis === 'pending'}
                  onRetryScenes={() => scanScenes(video.id)}
                  onThreshold={(threshold) => {
                    if (video.scenes)
                      patchVideo(video.id, { scenes: { ...video.scenes, threshold } });
                  }}
                  onDrag={(event) => begin(event, 'move', track.id)}
                  onSeek={(time) => players.current.get(video.id)?.seek(time)}
                  onCapture={(time) => void makeStill(video.id, time)}
                  onDuplicate={() => addTrack(video.id, track.kind, track)}
                  onDelete={() => remove(track.id)}
                  onJump={() =>
                    jump({
                      videoId: video.id,
                      time: players.current.get(video.id)?.time() ?? video.time,
                    })
                  }
                />
                <button
                  type="button"
                  className="resize-handle"
                  aria-label={`Resize ${track.kind === 'filmstrip' ? 'frames' : track.kind === 'cuts' ? 'cuts' : 'audio'} scrubber`}
                  onPointerDown={(event) => begin(event, 'resize', track.id)}
                />
              </article>
            );
          })}
        {board.clips
          .filter((clip) => visible.has(clip.id))
          .map((clip) => {
            const video = sourceById.get(clip.videoId),
              q = quoteById.get(clip.quotationId);
            if (!video || !q) return null;
            return (
              <article
                key={clip.id}
                className={`board-card clip-card ${moduleClass(clip.id)}`}
                data-module-id={clip.id}
                data-clip-id={clip.id}
                data-quotation-id={q.id}
                data-docked-to={clip.dock?.to}
                style={{ left: clip.x, top: clip.y, width: clip.width, zIndex: clip.z }}
                onPointerDown={(event) => selectCard(event, clip.id)}
              >
                <Clip
                  clip={clip}
                  video={video}
                  quotation={q}
                  codes={board.codes}
                  sharedViews={viewCounts.get(q.id) || 1}
                  url={urls[video.id]}
                  urls={urls}
                  poster={posters[posterKey(video.id, q.start)]}
                  active={preview?.id === clip.id}
                  pinned={preview?.id === clip.id && preview.pinned}
                  busy={busy.has(video.id) || editingLocked}
                  dockControls={controlsFor(clip.id)}
                  onHover={(hover) => requestHover(clip.id, hover)}
                  onPin={() => {
                    clearTimeout(hoverTimer.current);
                    setPreview({ id: clip.id, pinned: true });
                  }}
                  onDrag={(e) => begin(e, 'move', clip.id)}
                  onRange={(start, end) => patchQuotation(q.id, { start, end })}
                  onEditStart={() => {
                    checkpoint();
                    stopHover();
                    setActiveQuotation(q.id);
                  }}
                  onCapture={(time) => void makeStill(video.id, time)}
                  onSegment={(time) => segment(video.id, q.id, time)}
                  onJump={(time) => jump({ videoId: video.id, time })}
                  onDuplicate={() => placeClip(q)}
                  onDelete={() => remove(clip.id)}
                  onPlayer={(el) => {
                    if (el) clipElements.current.set(clip.id, el);
                    else clipElements.current.delete(clip.id);
                  }}
                  onCode={() => showCoding(q.id)}
                  onStop={() => setPreview(null)}
                  onRate={(rate) =>
                    change((b) => ({
                      ...b,
                      clips: b.clips.map((c) => (c.id === clip.id ? { ...c, rate } : c)),
                    }))
                  }
                />
                <button
                  type="button"
                  className="resize-handle"
                  aria-label="Resize clip card"
                  onPointerDown={(e) => begin(e, 'resize', clip.id)}
                />
              </article>
            );
          })}
        {board.panels.map((panel) => (
          <article
            key={panel.id}
            className={`board-card codes-card ${moduleClass(panel.id)}`}
            data-module-id={panel.id}
            data-docked-to={panel.dock?.to}
            style={{
              left: panel.x,
              top: panel.y,
              width: panel.width,
              height: panel.height,
              zIndex: panel.z,
            }}
          >
            <Coding
              board={board}
              target={board.quotations.find((q) => q.id === activeQuotation)}
              draft={draft}
              dockControls={controlsFor(panel.id)}
              onDrag={(e) => begin(e, 'move', panel.id)}
              onClose={() => remove(panel.id)}
              onEditStart={checkpoint}
              onEditQuotation={patchQuotation}
              onAddCode={addCode}
              onEditCode={(id, patch) =>
                change((b) => ({
                  ...b,
                  codes: b.codes.map((c) => (c.id === id ? { ...c, ...patch } : c)),
                }))
              }
              onAssign={assignCode}
              onReveal={reveal}
              onPlace={placeClip}
              onCollection={(codeId) => createSpace(codeId)}
              onDeleteQuotation={deleteQuotation}
              onDraft={setDraft}
              onSaveDraft={saveSegment}
              onCancelDraft={() => setDraft(null)}
              onSource={(id) => {
                const q = board.quotations.find((q) => q.id === sourceQuotationId(id));
                if (q) reveal(q);
              }}
            />
            <button
              type="button"
              className="resize-handle"
              aria-label="Resize codes module"
              onPointerDown={(e) => begin(e, 'resize', panel.id)}
            />
          </article>
        ))}
        {board.spaces
          .filter((space) => visible.has(space.id))
          .map((space) => (
            <article
              key={space.id}
              className={`board-card space-card ${moduleClass(space.id)}`}
              data-module-id={space.id}
              data-space-id={space.id}
              data-space-code={space.codeId}
              data-docked-to={space.dock?.to}
              style={{
                left: space.x,
                top: space.y,
                width: space.width,
                height: space.height,
                zIndex: space.z,
              }}
              onPointerDown={() => setSelected(space.id)}
            >
              <EvidenceSpace
                space={space}
                board={board}
                urls={urls}
                posters={posters}
                activeQuotation={activeQuotation}
                preview={preview}
                dockControls={controlsFor(space.id)}
                onDrag={(event) => begin(event, 'move', space.id)}
                onClose={() => remove(space.id)}
                onEditStart={checkpoint}
                onPatch={(patch) => patchSpace(space.id, patch)}
                onPromote={() => {
                  checkpoint();
                  stopHover();
                  change((b) => promoteGroup(b, space.id));
                  motion.highlight(space.id);
                }}
                onAdd={(id, point, from) => {
                  if (!current.current.quotations.some((q) => q.id === id)) return;
                  checkpoint();
                  stopHover();
                  change((b) => addEvidence(b, space.id, id, point, from));
                  setSelected(space.id);
                }}
                onRemove={(id) => {
                  checkpoint();
                  setPreview(null);
                  change((b) => removeEvidence(b, space.id, id));
                }}
                onMove={(id, point) => change((b) => moveEvidence(b, space.id, id, point))}
                onSelect={(id) => {
                  setSelected(space.id);
                  setActiveQuotation(id);
                }}
                onCode={showCoding}
                onReveal={(id) => {
                  const q = current.current.quotations.find((q) => q.id === id);
                  if (q) reveal(q);
                }}
                onPreview={(id, hover, pin) => {
                  const key = `${space.id}/${id}`;
                  if (pin) {
                    clearTimeout(hoverTimer.current);
                    setPreview({ id: key, pinned: true, moduleId: space.id });
                  } else requestHover(key, hover, space.id);
                }}
                onStop={() => {
                  clearTimeout(hoverTimer.current);
                  setPreview(null);
                }}
                onVisible={(ids) => reportEvidence(space.id, ids)}
              />
              <button
                type="button"
                className="resize-handle"
                aria-label="Resize evidence space"
                onPointerDown={(event) => begin(event, 'resize', space.id)}
              />
            </article>
          ))}
      </>
    ),
    [
      board.videos,
      board.stills,
      board.tracks,
      board.clips,
      board.panels,
      board.spaces,
      board.quotations,
      board.codes,
      urls,
      posters,
      selected,
      selectedGroup,
      moving,
      snap,
      sceneBusy,
      busy,
      editingLocked,
      preview,
      activeQuotation,
      drawing,
      draft,
      visibleKey,
    ],
  );
  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="brand-icon">
            <Film size={21} />
          </span>
          <strong>Video Board</strong>
          <span className="prototype">prototype</span>
        </div>
        <span className="toolbar-divider" />
        <input
          className="board-name"
          aria-label="Board name"
          maxLength={100}
          value={board.name}
          onChange={(event) => change((b) => ({ ...b, name: event.target.value }))}
          disabled={editingLocked}
        />
        <div className="toolbar-actions">
          <span
            className={`save-state ${saving === 'error' ? 'save-state--error' : ''}`}
            title={
              working ||
              (saving === 'saved'
                ? 'Saved in this browser'
                : saving === 'error'
                  ? 'Local save failed'
                  : 'Saving in this browser')
            }
          >
            {saving === 'error' ? (
              <CircleAlert size={13} />
            ) : working || importing || saving === 'saving' ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <Check size={13} />
            )}
            <span>
              {working
                ? 'Processing locally'
                : saving === 'saved'
                  ? 'Saved locally'
                  : saving === 'error'
                    ? 'Save failed'
                    : 'Saving…'}
            </span>
          </span>
          <IconButton
            icon={FolderOpen}
            label="Open project backup"
            disabled={operation || importing || busy.size > 0}
            onClick={() => archiveInput.current?.click()}
          />
          <IconButton
            icon={Download}
            label="Download project backup"
            disabled={editingLocked || !board.videos.length || busy.size > 0}
            onClick={() => void exportProject()}
          />
          <IconButton
            icon={ImageDown}
            label="Export board as PNG"
            disabled={editingLocked || !board.videos.length || busy.size > 0}
            onClick={() => void exportImage()}
          />
          <IconButton
            icon={FileDown}
            label="Export quotations as CSV"
            disabled={editingLocked || !board.quotations.length}
            onClick={() =>
              download(
                new Blob([csvExport(current.current)], { type: 'text/csv;charset=utf-8' }),
                `${safeFilename(current.current.name)}-quotations.csv`,
              )
            }
          />
          <IconButton
            icon={BookOpen}
            label="Open codes and quotations"
            disabled={editingLocked}
            onClick={() => openCodes(true)}
          />
          <IconButton
            icon={FolderPlus}
            label="New evidence group"
            disabled={editingLocked}
            onClick={() => createSpace()}
          />
          <span className="toolbar-divider" />
          <IconButton
            className="add-video"
            icon={Plus}
            label="Add videos"
            disabled={editingLocked || importing}
            onClick={() => videoInput.current?.click()}
          >
            <span>Add video</span>
          </IconButton>
        </div>
      </header>
      <input
        ref={videoInput}
        className="file-input"
        type="file"
        multiple
        accept="video/*,.mp4,.m4v,.mov,.webm,.mkv"
        onChange={(event) => {
          void importVideos(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
      <input
        ref={archiveInput}
        className="file-input"
        type="file"
        accept=".zip"
        onChange={(event) => {
          if (event.target.files?.[0]) void openProject(event.target.files[0]);
          event.target.value = '';
        }}
      />
      <div
        ref={stage}
        className={`board ${hand || space ? 'board--hand' : ''} ${dragOver ? 'board--drop' : ''}`}
        aria-label="Video board workspace"
        style={{
          backgroundPosition: `${board.camera.x}px ${board.camera.y}px`,
          backgroundSize: `${24 * board.camera.scale}px ${24 * board.camera.scale}px`,
        }}
        onPointerDownCapture={pan}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes('Files')) setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const box = event.currentTarget.getBoundingClientRect(),
            c = current.current.camera;
          const point = {
            x: (event.clientX - box.left - c.x) / c.scale,
            y: (event.clientY - box.top - c.y) / c.scale,
          };
          const codeId = event.dataTransfer.getData(CODE_DRAG);
          if (codeId) createSpace(codeId, point);
          else {
            const evidence = readEvidenceDrag(event.dataTransfer);
            if (evidence && current.current.quotations.some((q) => q.id === evidence.quotationId))
              createSpace(undefined, point, evidence);
            else if (event.dataTransfer.files.length)
              void importVideos(Array.from(event.dataTransfer.files), point);
          }
        }}
      >
        <div
          className="board-world"
          style={{
            transform: `translate(${board.camera.x}px, ${board.camera.y}px) scale(${board.camera.scale})`,
          }}
        >
          {modules}
        </div>
        {!board.videos.length && !board.spaces.length && (
          <div className="empty-board">
            <div className="empty-board__icon">
              <Film size={34} strokeWidth={1.2} />
              <span>
                <Plus size={13} />
              </span>
            </div>
            <h1>
              {loaded
                ? 'Drop a video here'
                : fatal
                  ? 'Local storage unavailable'
                  : 'Opening your board…'}
            </h1>
            <p>{fatal || 'Watch, capture a moment, give it some space.'}</p>
            {loaded && (
              <button
                type="button"
                className="empty-add"
                onClick={() => videoInput.current?.click()}
                disabled={importing}
              >
                or choose a file
              </button>
            )}
            <span className="empty-board__local">Videos stay on your device.</span>
          </div>
        )}
        {dragOver && (
          <div className="drop-overlay">
            <Plus size={28} />
            <span>Drop to add videos</span>
          </div>
        )}
        <div className="board-tools" onPointerDown={(event) => event.stopPropagation()}>
          <div className="tool-group">
            <IconButton
              icon={MousePointer2}
              label="Select and move"
              aria-pressed={!hand}
              onClick={() => setHand(false)}
            />
            <IconButton
              icon={Hand}
              label="Pan board"
              aria-pressed={hand}
              onClick={() => setHand(!hand)}
            />
          </div>
          {undoCount > 0 && (
            <div className="tool-group">
              <IconButton
                icon={Undo2}
                label={removed ? 'Undo removal' : 'Undo last edit'}
                onClick={undo}
              />
            </div>
          )}
          <span className="board-hint">
            Header: move group <span>·</span> Grip: pull module free
          </span>
        </div>
        <div className="zoom-tools tool-group" onPointerDown={(event) => event.stopPropagation()}>
          <IconButton icon={Minus} label="Zoom out" onClick={() => zoom(1 / 1.2)} />
          <button
            className="zoom-value"
            title="Reset zoom to 100%"
            onClick={() => zoom(1 / board.camera.scale)}
          >
            {Math.round(board.camera.scale * 100)}%
          </button>
          <IconButton icon={Plus} label="Zoom in" onClick={() => zoom(1.2)} />
          <span className="toolbar-divider" />
          <IconButton icon={Scan} label="Fit board" onClick={fit} />
        </div>
      </div>
      {!editingLocked && popover && board.quotations.find((q) => q.id === activeQuotation) && (
        <CodePopover
          key={activeQuotation}
          target={board.quotations.find((q) => q.id === activeQuotation)!}
          codes={board.codes}
          {...popover}
          onClose={() => setPopover(null)}
          onAssign={assignCode}
          onCreate={addCode}
          onMemo={(memo) => patchQuotation(activeQuotation!, { memo })}
          onEditStart={checkpoint}
          onOpen={() => {
            openCodes(true);
            setPopover(null);
          }}
        />
      )}
      {(notice || working || importing || operation) && (
        <div
          className={`notice ${notice ? 'notice--error' : ''}`}
          role={notice ? 'alert' : 'status'}
        >
          {notice ? <CircleAlert size={16} /> : <LoaderCircle size={16} className="spin" />}
          <span>
            {notice || (operation ? 'Preparing file…' : importing ? 'Adding video…' : working)}
          </span>
          {notice && <IconButton icon={X} label="Dismiss message" onClick={() => setNotice('')} />}
        </div>
      )}
    </div>
  );
}
