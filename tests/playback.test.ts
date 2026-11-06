import { afterEach, describe, expect, it, vi } from 'vitest';
import { Playback, type PlaybackOptions, type PlaybackState } from '../src/playback';

class Video extends EventTarget {
  readyState = 0;
  seeking = false;
  paused = true;
  currentTime = 0;
  playbackRate = 1;
  frames: (() => void)[] = [];
  canceled: number[] = [];
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  });
  pause = vi.fn(() => {
    if (!this.paused) {
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
  });
  requestVideoFrameCallback(callback: () => void) {
    this.frames.push(callback);
    return this.frames.length;
  }
  cancelVideoFrameCallback(id: number) {
    this.canceled.push(id);
  }
  metadata() {
    this.readyState = 1;
    this.dispatchEvent(new Event('loadedmetadata'));
  }
  frame() {
    this.frames.at(-1)!();
  }
}
function fixture(overrides: Partial<PlaybackOptions> = {}) {
  const video = new Video(),
    states: PlaybackState[] = [];
  const options: PlaybackOptions = {
    start: 0,
    end: 10,
    initial: 2,
    rate: 1,
    bounded: false,
    autoplay: false,
    coalesce: false,
    changed: (state) => states.push(state),
    time: vi.fn(),
    persist: vi.fn(),
    error: vi.fn(),
    ...overrides,
  };
  const playback = new Playback(video as unknown as HTMLVideoElement, options);
  return { video, options, states, playback };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('native playback ownership', () => {
  it('defers the latest explicit seek until metadata and does not autoplay it', () => {
    const { video, playback, states, options } = fixture({
      bounded: true,
      autoplay: true,
      start: 2,
      end: 4,
    });
    playback.seek(3);
    playback.seek(3.5);
    expect(states.at(-1)?.time).toBe(3.5);
    expect(video.currentTime).toBe(0);
    video.metadata();
    expect(video.currentTime).toBe(3.5);
    expect(video.play).not.toHaveBeenCalled();
    expect(options.persist).toHaveBeenLastCalledWith(3.5);
    video.dispatchEvent(new Event('seeked'));
    expect(states.at(-1)).toMatchObject({ phase: 'paused', time: 3.5, ready: true });
    playback.dispose();
  });

  it('coalesces scrubbing and does not let stale decoded frames overwrite a requested time', () => {
    const frames: FrameRequestCallback[] = [],
      cancel = vi.fn();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { video, playback, states, options } = fixture({ coalesce: true });
    video.metadata();
    playback.seek(4);
    playback.seek(6);
    expect(frames).toHaveLength(1);
    video.frame();
    expect(states.at(-1)?.time).toBe(6);
    expect(video.currentTime).toBe(2);
    frames[0](0);
    expect(video.currentTime).toBe(6);
    expect(options.persist).toHaveBeenLastCalledWith(6);
    playback.seek(7);
    playback.dispose();
    expect(cancel).toHaveBeenCalledWith(2);
    frames[1](0);
    expect(video.currentTime).toBe(6);
  });

  it('loops bounded previews, follows edited boundaries and rate, and never writes a source clock', async () => {
    const { video, playback, states, options } = fixture({
      bounded: true,
      autoplay: true,
      start: 2,
      end: 4,
    });
    video.metadata();
    await Promise.resolve();
    expect(video.currentTime).toBe(2);
    expect(video.play).toHaveBeenCalledOnce();
    video.currentTime = 4.1;
    video.frame();
    expect(video.currentTime).toBe(2);
    playback.updateRange(5, 7, 0.5);
    expect(video.currentTime).toBe(5);
    expect(video.playbackRate).toBe(0.5);
    expect(states.at(-1)?.time).toBe(5);
    video.dispatchEvent(new Event('ended'));
    await Promise.resolve();
    expect(video.play).toHaveBeenCalledTimes(2);
    expect(options.persist).not.toHaveBeenCalled();
    playback.dispose();
  });

  it('persists a full source ending and does not restart it', () => {
    const { video, playback, states, options } = fixture();
    video.metadata();
    video.currentTime = 10;
    video.dispatchEvent(new Event('ended'));
    expect(states.at(-1)).toMatchObject({ phase: 'ended', time: 10 });
    expect(options.persist).toHaveBeenLastCalledWith(10);
    expect(video.play).not.toHaveBeenCalled();
    playback.dispose();
  });

  it('ignores a rejected obsolete play request after an explicit pause', async () => {
    let reject!: (cause: Error) => void;
    const { video, playback, options, states } = fixture();
    video.metadata();
    video.play.mockImplementation(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const playing = playback.play();
    expect(states.at(-1)?.phase).toBe('starting');
    playback.pause();
    reject(new Error('Interrupted'));
    await playing;
    expect(states.at(-1)?.phase).toBe('paused');
    expect(options.error).not.toHaveBeenCalled();
    playback.dispose();
  });

  it('reports a current play rejection and a native media failure', async () => {
    const { video, playback, options, states } = fixture();
    video.metadata();
    video.play.mockRejectedValue(new Error('Codec unavailable'));
    await playback.play();
    expect(options.error).toHaveBeenCalledWith('play');
    expect(states.at(-1)?.phase).toBe('paused');
    video.dispatchEvent(new Event('error'));
    expect(options.error).toHaveBeenLastCalledWith('media');
    expect(states.at(-1)?.phase).toBe('error');
    playback.dispose();
  });

  it('disposal removes native listeners, stops frame work and suppresses late promises', async () => {
    let resolve!: () => void;
    const { video, playback, states, options } = fixture();
    video.metadata();
    video.play.mockImplementation(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const playing = playback.play(),
      lateFrame = video.frames.at(-1)!;
    playback.dispose();
    const count = states.length;
    video.dispatchEvent(new Event('error'));
    video.dispatchEvent(new Event('loadedmetadata'));
    lateFrame();
    resolve();
    await playing;
    expect(states).toHaveLength(count);
    expect(options.error).not.toHaveBeenCalled();
    expect(video.canceled).toEqual([1]);
    expect(video.frames).toHaveLength(1);
    expect(video.pause).toHaveBeenCalledTimes(1);
  });
});

it('retains an in-flight seek or native playback intent for effect replay', async () => {
  const { video, playback } = fixture({ autoplay: true, bounded: true });
  expect(playback.resumePosition()).toEqual({ time: 2, playing: true });
  playback.seek(4);
  expect(playback.resumePosition()).toEqual({ time: 4, playing: false });
  video.metadata();
  await playback.play();
  video.currentTime = 4.25;
  expect(playback.resumePosition()).toEqual({ time: 4.25, playing: true });
  playback.dispose();
});
