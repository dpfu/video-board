export type JobRequest = { sourceId: string; kind: 'analysis' | 'scenes' };
export type JobState = JobRequest & { phase: 'queued' | 'running'; label: string };
type Job = JobState & { controller: AbortController };
export type JobContext = {
  signal: AbortSignal;
  current: () => boolean;
  progress: (label: string) => void;
};

/** A serial queue whose cancelled work cannot publish progress or commit a result. */
export class BackgroundJobs {
  private jobs = new Map<string, Job>();
  private tail = Promise.resolve();
  constructor(private readonly changed: (jobs: JobState[]) => void) {}

  private publish() {
    this.changed(
      [...this.jobs.values()].map(({ sourceId, kind, phase, label }) => ({
        sourceId,
        kind,
        phase,
        label,
      })),
    );
  }

  enqueue(
    request: JobRequest,
    work: (context: JobContext) => Promise<void>,
    failed: (error: unknown) => void,
  ) {
    const key = `${request.kind}:${request.sourceId}`;
    if (this.jobs.has(key)) return false;
    const job: Job = {
      ...request,
      phase: 'queued',
      label: request.kind === 'analysis' ? 'Analyzing video…' : 'Detecting cuts…',
      controller: new AbortController(),
    };
    const current = () => this.jobs.get(key) === job && !job.controller.signal.aborted;
    this.jobs.set(key, job);
    this.publish();
    this.tail = this.tail
      .catch(() => {})
      .then(async () => {
        if (!current()) return;
        job.phase = 'running';
        this.publish();
        try {
          await work({
            signal: job.controller.signal,
            current,
            progress: (label) => {
              if (!current()) return;
              job.label = label;
              this.publish();
            },
          });
        } catch (error) {
          if (current()) failed(error);
        } finally {
          if (this.jobs.get(key) === job) {
            this.jobs.delete(key);
            this.publish();
          }
        }
      });
    return true;
  }

  async cancelAll(): Promise<JobRequest[]> {
    const interrupted = [...this.jobs.values()];
    const draining = this.tail;
    this.jobs.clear();
    for (const job of interrupted) job.controller.abort();
    this.publish();
    await draining.catch(() => {});
    return interrupted.map(({ sourceId, kind }) => ({ sourceId, kind }));
  }
}
