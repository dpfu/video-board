import { useCallback, useSyncExternalStore } from 'react';
import type { VideoCard } from './model';

// Playback is shared across modules without writing every video frame to IndexedDB.
const times = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
export function publishTime(id: string, time: number) {
  if (times.get(id) === time) return;
  times.set(id, time);
  listeners.get(id)?.forEach((listener) => listener());
}
export function resetPlayheads(videos: ReadonlyArray<Pick<VideoCard, 'id' | 'time'>>) {
  times.clear();
  for (const video of videos) times.set(video.id, video.time);
  for (const callbacks of listeners.values()) for (const callback of callbacks) callback();
}

/** Share the frame-clock fallback and prevent late callbacks after disposal. */
export function observeVideoFrames(video: HTMLVideoElement, onFrame: () => void) {
  const native = typeof video.requestVideoFrameCallback === 'function';
  let stopped = false;
  const schedule = () =>
    native ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  const tick = () => {
    if (stopped) return;
    onFrame();
    if (!stopped) frame = schedule();
  };
  let frame = schedule();
  return () => {
    stopped = true;
    if (native) video.cancelVideoFrameCallback(frame);
    else cancelAnimationFrame(frame);
  };
}

export function usePlayhead(id: string, initial: number) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listeners.get(id) || new Set();
      set.add(listener);
      listeners.set(id, set);
      return () => {
        set.delete(listener);
        if (!set.size) listeners.delete(id);
      };
    },
    [id],
  );
  return useSyncExternalStore(subscribe, () => times.get(id) ?? initial);
}
