import { useEffect, useRef, useState } from 'react';
import { clamp } from './model';
import { Playback, type PlaybackState } from './playback';
import { useActions } from './useActions';

type Options = {
  active?: boolean;
  url?: string;
  start?: number;
  end: number;
  initial: number;
  rate?: number;
  bounded?: boolean;
  autoplay?: boolean;
  coalesce?: boolean;
  onActivate?: () => void;
  onTime?: (time: number) => void;
  onPersist?: (time: number) => void;
  onError?: (kind: 'play' | 'media') => void;
};

export function usePlayback(options: Options) {
  const {
    active = true,
    url,
    start = 0,
    end,
    initial,
    rate = 1,
    bounded = false,
    autoplay = false,
    coalesce = false,
  } = options;
  const latest = useRef(options);
  latest.current = options;
  const element = useRef<HTMLVideoElement | null>(null);
  const session = useRef<Playback | null>(null);
  const pending = useRef<number | null>(null);
  const retained = useRef<{
    url?: string;
    player: HTMLVideoElement;
    time: number;
    playing: boolean;
  } | null>(null);
  const time = useRef(initial);
  const [state, setState] = useState<PlaybackState>({
    phase: 'loading',
    time: initial,
    ready: false,
  });
  const actions = useActions({
    seek(value: number) {
      const current = latest.current;
      const next = clamp(
        value,
        current.start ?? 0,
        Math.max(current.start ?? 0, current.end - 0.000001),
      );
      if (session.current) session.current.seek(next);
      else {
        pending.current = next;
        time.current = next;
        setState((previous) => ({ ...previous, time: next }));
      }
      current.onActivate?.();
    },
    toggle() {
      if (session.current) session.current.toggle();
      else latest.current.onActivate?.();
    },
    pause() {
      session.current?.pause();
    },
  });
  useEffect(() => {
    const player = element.current;
    const previous = retained.current;
    retained.current = null;
    if (!active || !player) {
      time.current = initial;
      setState({ phase: 'paused', time: initial, ready: false });
      return;
    }
    const requested = pending.current;
    pending.current = null;
    const resume = previous && previous.url === url && previous.player === player ? previous : null;
    const owned = new Playback(player, {
      start,
      end,
      initial: requested ?? resume?.time ?? initial,
      rate,
      bounded,
      autoplay: requested === null && (resume?.playing ?? autoplay),
      coalesce,
      changed: setState,
      time: (value) => {
        time.current = value;
        latest.current.onTime?.(value);
      },
      persist: (value) => latest.current.onPersist?.(value),
      error: (kind) => latest.current.onError?.(kind),
    });
    session.current = owned;
    return () => {
      retained.current = { url, player, ...owned.resumePosition() };
      session.current = null;
      owned.dispose();
    };
  }, [active, url]);
  useEffect(() => {
    session.current?.updateRange(start, end, rate);
    if (!active) {
      time.current = initial;
      setState({ phase: 'paused', time: initial, ready: false });
    }
  }, [start, end, rate, active]);
  return { element, time, state, actions };
}
