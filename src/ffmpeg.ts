import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import workerURL from './ffmpeg.worker.js?worker&url';
import { clipExportArgs, validateExcerpt, type ClipExcerpt } from './clipExport';

export const FFMPEG_CORE_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';
const CACHE = 'video-board-ffmpeg-0.12.10';
const runtime = [
  {
    url: `${FFMPEG_CORE_URL}ffmpeg-core.js`,
    type: 'text/javascript',
    hash: '67a48f11645f85439f3fde4f2119042c16b374b910206b7a7a24f342e28dcae3',
  },
  {
    url: `${FFMPEG_CORE_URL}ffmpeg-core.wasm`,
    type: 'application/wasm',
    hash: '9f57947a5bd530d8f00c5b3f2cb2a3492faa7e5d823315342d6a8656d0a6b7b7',
  },
  { url: workerURL, type: 'text/javascript', hash: '' },
];

async function loadAsset(asset: (typeof runtime)[number], signal: AbortSignal, cache?: Cache) {
  const url = new URL(asset.url, location.href).href;
  let response = await cache?.match(url).catch(() => undefined);
  const cached = !!response;
  response ||= await fetch(url, { signal });
  if (!response.ok)
    throw new Error('Clip export tools could not be loaded. Try again when online.');
  const bytes = await response.clone().arrayBuffer();
  signal.throwIfAborted();
  if (asset.hash) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
    if (actual !== asset.hash) {
      await cache?.delete(url).catch(() => {});
      throw new Error('Clip export tools failed their integrity check. Please retry the download.');
    }
  }
  signal.throwIfAborted();
  if (!cached) await cache?.put(url, response).catch(() => {});
  signal.throwIfAborted();
  return URL.createObjectURL(new Blob([bytes], { type: asset.type }));
}

/** One cancellable worker per explicit export. Original media is mounted read-only. */
export async function exportClipMp4(
  blob: Blob,
  excerpt: ClipExcerpt,
  signal: AbortSignal,
  status: (label: string) => void,
) {
  validateExcerpt(blob, excerpt);
  signal.throwIfAborted();
  const ffmpeg = new FFmpeg(),
    controller = new AbortController(),
    urls: string[] = [];
  const abort = () => {
    controller.abort(signal.reason);
    ffmpeg.terminate();
  };
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new Error('Clip export took too long. Try a shorter clip.'));
    ffmpeg.terminate();
  }, 180_000);
  const active = controller.signal;
  let detail = '';
  ffmpeg.on('log', ({ message }) => {
    detail = message;
  });
  try {
    status('Loading clip export tools · first download about 31 MB');
    const cache = await globalThis.caches?.open(CACHE).catch(() => undefined);
    for (const asset of runtime) {
      active.throwIfAborted();
      urls.push(await loadAsset(asset, active, cache));
    }
    await ffmpeg.load(
      { coreURL: urls[0], wasmURL: urls[1], classWorkerURL: urls[2] },
      { signal: active },
    );
    active.throwIfAborted();
    await ffmpeg.createDir('/input');
    const mounted = await ffmpeg.mount(
      FFFSType.WORKERFS,
      { blobs: [{ name: 'source', data: blob }] },
      '/input',
    );
    if (!mounted) throw new Error('Clip export could not open the original video.');
    status('Exporting clip · MP4, up to 720p');
    const exit = await ffmpeg.exec(clipExportArgs(excerpt), 120_000, { signal: active });
    active.throwIfAborted();
    if (exit !== 0)
      throw new Error(detail || 'This clip could not be exported. Try a shorter range.');
    const data = await ffmpeg.readFile('/clip.mp4');
    active.throwIfAborted();
    if (typeof data === 'string' || !data.byteLength)
      throw new Error('Clip export did not produce a video.');
    return new Blob([data as Uint8Array<ArrayBuffer>], { type: 'video/mp4' });
  } catch (error) {
    if (active.aborted) throw active.reason;
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
    ffmpeg.terminate();
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}
