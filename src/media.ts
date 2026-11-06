import type { VideoCard } from './model';
import type { SceneAnalysis } from './scenes';

export type Probe = Pick<VideoCard, 'duration' | 'start' | 'sourceWidth' | 'sourceHeight'>;
export type Analysis = {
  thumbnails: Blob[];
  peaks: number[];
  frameTimes: number[];
  scenes: SceneAnalysis;
  note?: string;
};
export type CapturedFrame = { blob: Blob; time: number; duration: number };
export type MediaResults = {
  probe: Probe;
  analyze: Analysis;
  capture: CapturedFrame;
  scenes: SceneAnalysis;
};
type MediaTask = keyof MediaResults;
export type MediaRequest =
  | { task: 'probe' | 'analyze' | 'scenes'; blob: Blob }
  | { task: 'capture'; blob: Blob; time: number; width?: number };
export type MediaResponse =
  | { type: 'progress'; label: string }
  | { type: 'error'; message: string }
  | { [Task in MediaTask]: { type: 'result'; task: Task; result: MediaResults[Task] } }[MediaTask];

// Each request owns its decoder. Every exit releases the worker and listener.
function run<Task extends MediaTask>(
  request: MediaRequest & { task: Task },
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
): Promise<MediaResults[Task]> {
  return new Promise((resolve, reject) => {
    let worker: Worker | undefined,
      settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', abort);
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.onmessageerror = null;
        worker.terminate();
      }
    };
    const fail = (cause: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(cause);
    };
    const abort = () => fail(signal?.reason ?? new DOMException('Cancelled', 'AbortError'));
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker = new Worker(new URL('./media.worker.ts', import.meta.url), { type: 'module' });
      signal?.addEventListener('abort', abort, { once: true });
      worker.onmessage = ({ data }: MessageEvent<MediaResponse>) => {
        if (settled) return;
        try {
          if (data.type === 'progress') {
            onProgress?.(data.label);
            return;
          }
          if (data.type === 'error') {
            fail(new Error(data.message));
            return;
          }
          if (data.type !== 'result' || data.task !== request.task) {
            fail(new Error('Unexpected media worker response.'));
            return;
          }
          // One task per worker; the matching task tag binds this result type.
          settled = true;
          cleanup();
          resolve(data.result as MediaResults[Task]);
        } catch (error) {
          fail(error);
        }
      };
      worker.onerror = (event) => {
        event.preventDefault();
        fail(new Error(event.message || 'Media processing failed.'));
      };
      worker.onmessageerror = () => fail(new Error('Media worker response could not be read.'));
      worker.postMessage(request);
    } catch (error) {
      fail(error);
    }
  });
}

export const probeVideo = (blob: Blob, signal?: AbortSignal) =>
  run<'probe'>({ task: 'probe', blob }, undefined, signal);
export const analyzeVideo = (
  blob: Blob,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
) => run<'analyze'>({ task: 'analyze', blob }, onProgress, signal);
export const captureFrame = (
  blob: Blob,
  time: number,
  options?: { width?: number; signal?: AbortSignal },
) =>
  run<'capture'>(
    { task: 'capture', blob, time, width: options?.width },
    undefined,
    options?.signal,
  );
export const detectScenes = (
  blob: Blob,
  onProgress?: (label: string) => void,
  signal?: AbortSignal,
) => run<'scenes'>({ task: 'scenes', blob }, onProgress, signal);
