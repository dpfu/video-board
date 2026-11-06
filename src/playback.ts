import { clamp } from './model';
import { observeVideoFrames } from './transport';

export type PlaybackState = {
  phase: 'loading' | 'paused' | 'starting' | 'playing' | 'ended' | 'error';
  time: number;
  ready: boolean;
};
export type PlaybackOptions = {
  start: number;
  end: number;
  initial: number;
  rate: number;
  bounded: boolean;
  autoplay: boolean;
  coalesce: boolean;
  changed: (state: PlaybackState) => void;
  time: (time: number) => void;
  persist: (time: number) => void;
  error: (kind: 'play' | 'media') => void;
};

/** Owns one native player's listeners, frame observer, seeks and play requests. */
export class Playback {
  private state: PlaybackState;
  private disposed = false;
  private pending: number | null = null;
  private seekFrame: number | null = null;
  private stopFrames: () => void;
  private wantsPlay = false;
  private playRequest = 0;
  private listeners: [string, EventListener][] = [];

  constructor(
    private readonly video: HTMLVideoElement,
    private options: PlaybackOptions,
  ) {
    this.state = { phase: 'loading', time: this.limit(options.initial), ready: false };
    this.listen('loadedmetadata', () => this.metadata());
    this.listen('loadeddata', () => {
      if (!video.seeking) this.update({ ready: true });
    });
    this.listen('play', () => {
      this.wantsPlay = true;
      this.update({ phase: 'playing' });
    });
    this.listen('pause', () => {
      this.wantsPlay = false;
      this.update({ phase: 'paused' });
      this.options.persist(video.currentTime);
    });
    this.listen('seeked', () => {
      if (this.pending === null) this.sync();
      this.update({ ready: true });
    });
    this.listen('timeupdate', () => this.sync());
    this.listen('ended', () => {
      if (this.options.bounded) {
        video.currentTime = this.options.start;
        void this.play();
      } else {
        this.sync();
        this.update({ phase: 'ended' });
        this.options.persist(video.currentTime);
      }
    });
    this.listen('error', () => {
      this.wantsPlay = false;
      this.update({ phase: 'error' });
      this.options.error('media');
    });
    video.playbackRate = options.rate;
    this.stopFrames = observeVideoFrames(video, () => this.sync());
    options.changed(this.state);
    if (video.readyState >= 1) this.metadata();
  }

  private listen(name: string, handler: () => void) {
    const owned = () => {
      if (!this.disposed) handler();
    };
    this.listeners.push([name, owned]);
    this.video.addEventListener(name, owned);
  }

  private limit(time: number) {
    return clamp(
      time,
      this.options.start,
      Math.max(this.options.start, this.options.end - 0.000001),
    );
  }

  private update(patch: Partial<PlaybackState>) {
    if (this.disposed) return;
    const next = { ...this.state, ...patch };
    if (
      next.phase === this.state.phase &&
      next.time === this.state.time &&
      next.ready === this.state.ready
    )
      return;
    this.state = next;
    this.options.changed(next);
  }

  private publish(time: number) {
    this.update({ time });
    this.options.time(time);
  }

  private metadata() {
    const requested = this.pending;
    this.pending = null;
    this.video.currentTime = this.limit(requested ?? this.state.time);
    this.publish(this.video.currentTime);
    this.update({ phase: 'paused', ready: this.video.readyState >= 2 && !this.video.seeking });
    if (requested !== null) this.options.persist(this.video.currentTime);
    else if (this.options.autoplay) void this.play();
  }

  private sync() {
    if (this.disposed || this.video.seeking || this.pending !== null) return;
    const { start, end, bounded } = this.options;
    if (bounded && (this.video.currentTime >= end || this.video.currentTime < start - 0.001))
      this.video.currentTime = start;
    this.publish(clamp(this.video.currentTime, start, end));
  }

  updateRange(start: number, end: number, rate: number) {
    this.options = { ...this.options, start, end, rate };
    this.video.playbackRate = rate;
    if (this.pending !== null) this.pending = this.limit(this.pending);
    if (this.options.bounded && this.video.readyState >= 1) this.sync();
  }

  seek(value: number) {
    if (this.disposed) return;
    this.pause();
    this.pending = this.limit(value);
    this.publish(this.pending);
    if (this.video.readyState < 1) return;
    if (this.options.coalesce) {
      if (this.seekFrame === null)
        this.seekFrame = requestAnimationFrame(() => {
          this.seekFrame = null;
          this.applySeek();
        });
    } else this.applySeek();
  }

  private applySeek() {
    if (this.disposed || this.pending === null) return;
    const time = this.pending;
    this.video.currentTime = time;
    this.pending = null;
    this.options.persist(time);
  }

  pause() {
    this.wantsPlay = false;
    this.playRequest++;
    this.video.pause();
    this.update({ phase: this.video.readyState >= 1 ? 'paused' : 'loading' });
  }

  async play() {
    if (this.disposed) return;
    const request = ++this.playRequest;
    this.wantsPlay = true;
    this.update({ phase: 'starting' });
    try {
      await this.video.play();
      if (this.disposed) return;
      if (!this.wantsPlay && request !== this.playRequest) this.video.pause();
    } catch {
      if (this.disposed || request !== this.playRequest) return;
      this.wantsPlay = false;
      this.update({ phase: 'paused' });
      this.options.error('play');
    }
  }

  toggle() {
    if (this.wantsPlay || !this.video.paused) this.pause();
    else void this.play();
  }

  /** Save native position and playback intent before an effect is replaced. */
  resumePosition() {
    return {
      time:
        this.pending ??
        (this.video.readyState >= 1 && !this.video.seeking
          ? this.video.currentTime
          : this.state.time),
      playing:
        this.wantsPlay ||
        (this.state.phase === 'loading' && this.options.autoplay && this.pending === null),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.wantsPlay = false;
    this.playRequest++;
    this.stopFrames();
    if (this.seekFrame !== null) cancelAnimationFrame(this.seekFrame);
    for (const [name, handler] of this.listeners) this.video.removeEventListener(name, handler);
    this.listeners = [];
    this.video.pause();
  }
}
