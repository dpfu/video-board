import { afterEach, expect, it, vi } from 'vitest';
import { observeVideoFrames } from '../src/transport';

afterEach(() => vi.unstubAllGlobals());

it.each([true, false])(
  'disposes the playback clock, including late callbacks (native = %s)',
  (native) => {
    const callbacks: (() => void)[] = [],
      canceled: number[] = [];
    const schedule = (callback: () => void) => {
      callbacks.push(callback);
      return callbacks.length;
    };
    const cancel = (id: number) => canceled.push(id);
    vi.stubGlobal('requestAnimationFrame', schedule);
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const video = (native
      ? { requestVideoFrameCallback: schedule, cancelVideoFrameCallback: cancel }
      : {}) as unknown as HTMLVideoElement;
    const sync = vi.fn(),
      stop = observeVideoFrames(video, sync);
    expect(callbacks).toHaveLength(1);
    callbacks[0]();
    expect(sync).toHaveBeenCalledOnce();
    expect(callbacks).toHaveLength(2);
    stop();
    expect(canceled).toEqual([2]);
    callbacks[1]();
    expect(sync).toHaveBeenCalledOnce();
    expect(callbacks).toHaveLength(2);
  },
);
