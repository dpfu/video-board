export type SaveState = 'waiting' | 'writing' | 'saved' | 'error';

/** Debounced snapshots, serialized writes, and status belonging to the latest edit. */
export class Autosave<Snapshot> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private queue = Promise.resolve();
  private revision = 0;
  private disposed = false;

  constructor(
    private readonly write: (snapshot: Snapshot) => Promise<void>,
    private readonly changed: (state: SaveState, error?: unknown) => void,
    private readonly delay = 220,
  ) {}

  schedule(snapshot: Snapshot) {
    if (this.disposed) return;
    this.cancelPending();
    const revision = ++this.revision;
    this.changed('waiting');
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.queue = this.queue
        .catch(() => {})
        .then(async () => {
          if (this.disposed) return;
          if (revision === this.revision) this.changed('writing');
          try {
            await this.write(snapshot);
            if (!this.disposed && revision === this.revision) this.changed('saved');
          } catch (error) {
            if (!this.disposed && revision === this.revision) this.changed('error', error);
          }
        });
    }, this.delay);
  }

  cancelPending() {
    clearTimeout(this.timer);
    this.timer = undefined;
    // An older in-flight save cannot publish status after suspension/replacement.
    this.revision++;
  }

  async drain() {
    this.cancelPending();
    await this.queue;
  }

  dispose() {
    this.disposed = true;
    this.cancelPending();
  }
}
