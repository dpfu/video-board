import type { VideoCard } from './model';
import type { SceneAnalysis } from './scenes';

export type Probe = Pick<VideoCard, 'duration' | 'start' | 'sourceWidth' | 'sourceHeight'>;
export type Analysis = { thumbnails: Blob[]; peaks: number[]; frameTimes: number[]; scenes: SceneAnalysis; note?: string };
export type CapturedFrame = { blob: Blob; time: number; duration: number };
export type MediaRequest = { task: 'probe' | 'analyze' | 'capture' | 'scenes'; blob: Blob; time?: number; width?: number };

// Each request owns its decoder and can be cancelled without touching playback.
function run<T>(request: MediaRequest, onProgress?: (label: string) => void, signal?: AbortSignal) {
  const worker = new Worker(new URL('./media.worker.ts', import.meta.url), { type: 'module' });
  const promise = new Promise<T>((resolve, reject) => {
    const abort = () => { worker.terminate(); reject(new DOMException('Cancelled', 'AbortError')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.progress) { onProgress?.(data.progress); return; }
      worker.terminate();
      signal?.removeEventListener('abort', abort);
      if (data.error) reject(new Error(data.error));
      else resolve(data.result as T);
    };
    worker.onerror = event => { worker.terminate(); signal?.removeEventListener('abort', abort); reject(new Error(event.message || 'Media processing failed.')); };
    worker.postMessage(request);
  });
  return promise;
}

export const probeVideo = (blob: Blob) => run<Probe>({ task: 'probe', blob });
export const analyzeVideo = (blob: Blob, onProgress?: (label: string) => void) => run<Analysis>({ task: 'analyze', blob }, onProgress);
export const captureFrame = (blob: Blob, time: number, options?: { width?: number; signal?: AbortSignal }) => run<CapturedFrame>({ task: 'capture', blob, time, width: options?.width }, undefined, options?.signal);
export const detectScenes = (blob: Blob, onProgress?: (label: string) => void) => run<SceneAnalysis>({ task: 'scenes', blob }, onProgress);
