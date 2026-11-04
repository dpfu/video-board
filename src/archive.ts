import JSZip from 'jszip';
import { assetKeys } from './store';
import type { Board } from './model';

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

function validateBoard(value: unknown): asserts value is Board {
  const b = value as Board;
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const bounded = (v: unknown, lo: number, hi: number) => finite(v) && v >= lo && v <= hi;
  const id = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v);
  const card = (v: { id: string; x: number; y: number; z: number; width: number }) => v && id(v.id) && bounded(v.x, -1e6, 1e6) && bounded(v.y, -1e6, 1e6) && bounded(v.width, 140, 1400) && bounded(v.z, 0, 1e9);
  if (!b || b.version !== 1 || typeof b.name !== 'string' || b.name.length > 200 ||
    !Array.isArray(b.videos) || !Array.isArray(b.stills) || b.videos.length > 500 || b.stills.length > 10000 ||
    !b.camera || !bounded(b.camera.scale, .15, 3) || !finite(b.camera.x) || !finite(b.camera.y)) throw new Error('This is not a Video Board project.');
  const ids = new Set<string>();
  for (const v of b.videos) {
    if (!card(v) || ids.has(v.id) || typeof v.name !== 'string' || !bounded(v.duration, .001, 86400) || !finite(v.start) ||
      !bounded(v.sourceWidth, 1, 32768) || !bounded(v.sourceHeight, 1, 32768) || !bounded(v.time, 0, v.duration) ||
      !Array.isArray(v.thumbnails) || v.thumbnails.length > 100 || !v.thumbnails.every(id) ||
      !Array.isArray(v.peaks) || v.peaks.length > 10000 || !v.peaks.every(p => bounded(p, 0, 1)) ||
      !Array.isArray(v.frameTimes) || v.frameTimes.length > 3e6 || !v.frameTimes.every(t => bounded(t, 0, v.duration)) ||
      typeof v.showFilmstrip !== 'boolean' || typeof v.showWaveform !== 'boolean' ||
      !['pending', 'ready', 'partial'].includes(v.analysis)) throw new Error('Invalid video in project backup.');
    ids.add(v.id);
    for (const key of v.thumbnails) { if (ids.has(key)) throw new Error('Duplicate media identifier.'); ids.add(key); }
  }
  for (const s of b.stills) {
    const source = b.videos.find(v => v.id === s.videoId);
    if (!card(s) || ids.has(s.id) || !source || !bounded(s.time, 0, source.duration) || !bounded(s.duration, 0, source.duration)) throw new Error('Invalid linked still in project backup.');
    ids.add(s.id);
  }
}

export async function restoreArchive(file: File) {
  const zip = await JSZip.loadAsync(file);
  const manifest = zip.file('board.json');
  if (!manifest) throw new Error('No Video Board project was found in this file.');
  const board: unknown = JSON.parse(await manifest.async('string'));
  validateBoard(board);
  const assets = new Map<string, Blob>();
  for (const key of assetKeys(board)) {
    const entry = zip.file(`assets/${key}`);
    if (!entry) throw new Error('The project backup is missing a media file.');
    assets.set(key, await entry.async('blob'));
  }
  return { board, assets };
}
