import JSZip from 'jszip';
import { assetKeys } from './store';
import { migrateBoard, sourceQuotationId, type Board, type LegacyBoard, type V2Board } from './model';

export async function backupBoard(board: Board, assets: Map<string, Blob>) {
  const zip = new JSZip();
  zip.file('board.json', JSON.stringify(board, null, 2));
  for (const key of assetKeys(board)) {
    const blob = assets.get(key);
    if (!blob) throw new Error('A media file is missing. The backup has not been created.');
    zip.file(`assets/${key}`, blob);
  }
  return zip.generateAsync({ type: 'blob' });
}

function validateBoard(value: unknown): asserts value is Board | V2Board | LegacyBoard {
  const b = value as Omit<Board, 'version'> & { version: number };
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const bounded = (v: unknown, lo: number, hi: number) => finite(v) && v >= lo && v <= hi;
  const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
  const card = (v: { id: string; x: number; y: number; z: number; width: number; height?: number }) => v && id(v.id) && bounded(v.x, -1e6, 1e6) && bounded(v.y, -1e6, 1e6) && bounded(v.width, 140, 2000) && bounded(v.z, 0, 1e9) && (v.height === undefined || bounded(v.height, 60, 1400));
  if (!b || ![1, 2, 3].includes(b.version) || typeof b.name !== 'string' || b.name.length > 200 ||
    !Array.isArray(b.videos) || !Array.isArray(b.stills) || b.videos.length > 500 || b.stills.length > 10000 ||
    !b.camera || !bounded(b.camera.scale, .15, 3) || !finite(b.camera.x) || !finite(b.camera.y) ||
    (b.version >= 2 && (!Array.isArray(b.tracks) || b.tracks.length > 10000))) throw new Error('This is not a Video Board project.');
  if (b.version === 3 && (!Array.isArray(b.clips) || b.clips.length > 10000 || !Array.isArray(b.panels) || b.panels.length > 100 || !Array.isArray(b.quotations) || b.quotations.length > 100000 || !Array.isArray(b.codes) || b.codes.length > 10000)) throw new Error('Invalid analysis data in project backup.');
  const ids = new Set<string>();
  for (const v of b.videos) {
    if (!card(v) || ids.has(v.id) || typeof v.name !== 'string' || !bounded(v.duration, .001, 86400) || !finite(v.start) ||
      !bounded(v.sourceWidth, 1, 32768) || !bounded(v.sourceHeight, 1, 32768) || !bounded(v.time, 0, v.duration) ||
      !Array.isArray(v.thumbnails) || v.thumbnails.length > 100 || !v.thumbnails.every(id) ||
      !Array.isArray(v.peaks) || v.peaks.length > 10000 || !v.peaks.every(p => bounded(p, 0, 1)) ||
      !Array.isArray(v.frameTimes) || v.frameTimes.length > 3e6 || !v.frameTimes.every(t => bounded(t, 0, v.duration)) ||
      typeof v.showFilmstrip !== 'boolean' || typeof v.showWaveform !== 'boolean' ||
      !['pending', 'ready', 'partial'].includes(v.analysis) || (v.analysisNote !== undefined && typeof v.analysisNote !== 'string')) throw new Error('Invalid video in project backup.');
    ids.add(v.id);
    const scenes = v.scenes;
    if (scenes !== undefined && (!scenes || scenes.algorithm !== 'ffmpeg-scdet-v1' || !bounded(scenes.width, 1, 32768) || !bounded(scenes.height, 1, 32768) || !bounded(scenes.threshold, 0, 100) ||
      !Array.isArray(scenes.times) || scenes.times.length < 1 || scenes.times.length > 3e6 || !Array.isArray(scenes.scores) || scenes.scores.length !== scenes.times.length ||
      !scenes.times.every((t, i) => bounded(t, 0, v.duration) && (i === 0 || t >= scenes.times[i - 1])) || !scenes.scores.every(s => bounded(s, 0, 100)))) throw new Error('Invalid scene detection data in project backup.');
    for (const key of v.thumbnails) { if (ids.has(key)) throw new Error('Duplicate media identifier.'); ids.add(key); }
  }
  for (const s of b.stills) {
    const source = b.videos.find(v => v.id === s.videoId);
    if (!card(s) || ids.has(s.id) || !source || !bounded(s.time, 0, source.duration) || !bounded(s.duration, 0, source.duration)) throw new Error('Invalid linked still in project backup.');
    ids.add(s.id);
  }
  if (b.version === 3) {
    const quoteIds = new Set<string>(), codeIds = new Set<string>();
    const text = (v: unknown, max = 100000) => typeof v === 'string' && v.length <= max;
    for (const code of b.codes) {
      if (!code || !id(code.id) || codeIds.has(code.id) || !text(code.name, 200) || !code.name.trim() || !text(code.definition) || !/^#[\da-fA-F]{6}$/.test(code.color)) throw new Error('Invalid code in project backup.');
      codeIds.add(code.id);
    }
    for (const q of b.quotations) {
      const source = b.videos.find(v => v.id === q.sourceId);
      if (!q || !id(q.id) || quoteIds.has(q.id) || !source || !['video', 'range', 'frame', 'region'].includes(q.kind) || !bounded(q.start, 0, source.duration) || !bounded(q.end, q.start, source.duration) ||
        (q.kind === 'range' && q.end <= q.start) || !text(q.title, 10000) || !text(q.memo) || !Array.isArray(q.codeIds) || q.codeIds.length > 10000 || new Set(q.codeIds).size !== q.codeIds.length || !q.codeIds.every(id => codeIds.has(id)) ||
        !text(q.createdAt, 100) || !Number.isFinite(Date.parse(q.createdAt)) || !text(q.updatedAt, 100) || !Number.isFinite(Date.parse(q.updatedAt))) throw new Error('Invalid quotation in project backup.');
      if (q.kind === 'region' && (!q.rect || !bounded(q.rect.x, 0, 1) || !bounded(q.rect.y, 0, 1) || !bounded(q.rect.width, .001, 1) || !bounded(q.rect.height, .001, 1) || q.rect.x + q.rect.width > 1.000001 || q.rect.y + q.rect.height > 1.000001)) throw new Error('Invalid region geometry in project backup.');
      quoteIds.add(q.id);
    }
    for (const q of b.quotations) {
      const parent = b.quotations.find(p => p.id === q.parentId);
      if ((q.parentId && (!parent || parent.sourceId !== q.sourceId)) || (q.kind === 'region' && (!parent || parent.kind !== 'frame' || Math.abs(parent.start - q.start) > .00001))) throw new Error('Invalid quotation source context.');
      const visited = new Set([q.id]); let node = parent;
      while (node) { if (visited.has(node.id)) throw new Error('Cyclic quotation context.'); visited.add(node.id); node = b.quotations.find(p => p.id === node!.parentId); }
    }
    for (const source of b.videos) if (!b.quotations.some(q => q.id === sourceQuotationId(source.id) && q.sourceId === source.id && q.kind === 'video' && q.start === 0 && q.end === source.duration)) throw new Error('Missing whole-video quotation.');
    for (const s of b.stills) {
      const q = b.quotations.find(q => q.id === s.quotationId);
      if (!q || q.kind !== 'frame' || q.sourceId !== s.videoId || Math.abs(q.start - s.time) > .00001 || (s.assetId !== undefined && !id(s.assetId))) throw new Error('Invalid still quotation.');
    }
    for (const clip of b.clips) {
      const q = b.quotations.find(q => q.id === clip.quotationId), source = b.videos.find(v => v.id === clip.videoId);
      if (!card(clip) || ids.has(clip.id) || !q || q.kind !== 'range' || !source || q.sourceId !== clip.videoId || !bounded(clip.time, 0, source.duration)) throw new Error('Invalid linked clip view.');
      ids.add(clip.id);
    }
    for (const panel of b.panels) { if (!card(panel) || ids.has(panel.id) || panel.kind !== 'codes' || !bounded(panel.height, 280, 1200)) throw new Error('Invalid codes module.'); ids.add(panel.id); }
  }
  if (b.version >= 2) {
    for (const t of b.tracks) {
      if (!card(t) || ids.has(t.id) || !b.videos.some(v => v.id === t.videoId) || !['filmstrip', 'waveform', 'cuts'].includes(t.kind) || !bounded(t.height, t.kind === 'cuts' ? 96 : 72, 600)) throw new Error('Invalid scrubber module.');
      ids.add(t.id);
    }
    const modules = new Map([...b.videos.filter(v => !v.hidden), ...b.stills, ...b.tracks, ...(b.version === 3 ? [...b.clips, ...b.panels] : [])].map(c => [c.id, c]));
    for (const c of modules.values()) {
      if (c.dock && (!modules.has(c.dock.to) || c.dock.to === c.id || !['top', 'right', 'bottom', 'left'].includes(c.dock.side) || !bounded(c.dock.offset, -10000, 10000))) throw new Error('Invalid module docking.');
      const visited = new Set<string>();
      let node = c;
      while (node.dock) {
        if (visited.has(node.id)) throw new Error('Cyclic module docking.');
        visited.add(node.id); node = modules.get(node.dock.to)!;
      }
    }
  }
}

export async function restoreArchive(file: File) {
  const zip = await JSZip.loadAsync(file);
  const manifest = zip.file('board.json');
  if (!manifest) throw new Error('No Video Board project was found in this file.');
  const board: unknown = JSON.parse(await manifest.async('string'));
  validateBoard(board);
  const migrated = migrateBoard(board);
  const assets = new Map<string, Blob>();
  for (const key of assetKeys(migrated)) {
    const entry = zip.file(`assets/${key}`);
    if (!entry) throw new Error('The project backup is missing a media file.');
    assets.set(key, await entry.async('blob'));
  }
  return { board: migrated, assets };
}
