import { useRef } from 'react';
import type { PlayerHandle } from '../VideoPlayer';
import { useActions } from '../useActions';

export function usePlayers() {
  const sources = useRef(new Map<string, PlayerHandle>());
  const clips = useRef(new Map<string, HTMLVideoElement>());
  const actions = useActions({
    source(id: string, handle: PlayerHandle | null) {
      if (handle) sources.current.set(id, handle);
      else sources.current.delete(id);
    },
    clip(id: string, player: HTMLVideoElement | null) {
      if (player) clips.current.set(id, player);
      else clips.current.delete(id);
    },
    pausedElements() {
      const elements = new Map<string, HTMLVideoElement>();
      for (const [id, handle] of sources.current) {
        const element = handle.element();
        if (element) elements.set(id, element);
      }
      for (const [id, element] of clips.current) elements.set(id, element);
      for (const element of elements.values()) element.pause();
      return elements;
    },
    seek(id: string, time: number) {
      sources.current.get(id)?.seek(time);
    },
    time(id: string, fallback: number) {
      return sources.current.get(id)?.time() ?? fallback;
    },
  });
  return { sources, clips, actions };
}
export type Players = ReturnType<typeof usePlayers>;
