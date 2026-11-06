export type AssetSnapshot = { urls: Record<string, string>; generation: number };

/** Blob and URL ownership for one open project; old revisions survive briefly for live media. */
export class AssetLibrary {
  readonly blobs = new Map<string, Blob>();
  private snapshot: AssetSnapshot = { urls: {}, generation: 0 };
  private retired = new Map<string, ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(private readonly changed: (snapshot: AssetSnapshot) => void) {}

  get generation() {
    return this.snapshot.generation;
  }

  private create(additions: Map<string, Blob>) {
    const urls: Record<string, string> = {};
    try {
      for (const [key, blob] of additions) urls[key] = URL.createObjectURL(blob);
      return urls;
    } catch (error) {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
      throw error;
    }
  }

  install(additions: Map<string, Blob>) {
    if (this.disposed) return;
    const urls = this.create(additions);
    for (const [key, blob] of additions) {
      this.blobs.set(key, blob);
      const old = this.snapshot.urls[key];
      if (old)
        this.retired.set(
          old,
          setTimeout(() => {
            URL.revokeObjectURL(old);
            this.retired.delete(old);
          }, 1000),
        );
    }
    this.snapshot = { ...this.snapshot, urls: { ...this.snapshot.urls, ...urls } };
    this.changed(this.snapshot);
  }

  replace(additions: Map<string, Blob>) {
    if (this.disposed) return;
    const urls = this.create(additions);
    this.release();
    this.blobs.clear();
    for (const [key, blob] of additions) this.blobs.set(key, blob);
    this.snapshot = { urls, generation: this.snapshot.generation + 1 };
    this.changed(this.snapshot);
  }

  private release() {
    for (const url of Object.values(this.snapshot.urls)) URL.revokeObjectURL(url);
    for (const [url, timer] of this.retired) {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    this.retired.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.release();
    this.blobs.clear();
  }
}
