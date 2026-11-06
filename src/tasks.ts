export type OwnedTask = {
  signal: AbortSignal;
  current: () => boolean;
  finish: () => void;
};

/** Exclusive short-lived work (import/capture), cancelled when its owner leaves. */
export class Tasks {
  private active = new Map<string, AbortController>();
  private disposed = false;

  begin(key: string): OwnedTask | null {
    if (this.disposed || this.active.has(key)) return null;
    const controller = new AbortController();
    this.active.set(key, controller);
    const current = () => this.active.get(key) === controller && !controller.signal.aborted;
    return {
      signal: controller.signal,
      current,
      finish: () => {
        if (this.active.get(key) === controller) this.active.delete(key);
      },
    };
  }

  get size() {
    return this.active.size;
  }

  dispose() {
    this.disposed = true;
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }
}
