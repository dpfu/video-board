import { useSyncExternalStore } from 'react';

// Playback is shared across modules without writing every video frame to IndexedDB.
const times = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();
export function publishTime(id: string, time: number) {
  if (times.get(id) === time) return;
  times.set(id, time); listeners.get(id)?.forEach(listener => listener());
}
export function usePlayhead(id: string, initial: number) {
  return useSyncExternalStore(listener => {
    const set = listeners.get(id) || new Set(); set.add(listener); listeners.set(id, set);
    return () => { set.delete(listener); if (!set.size) listeners.delete(id); };
  }, () => times.get(id) ?? initial);
}
