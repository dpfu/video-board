import { describe, expect, it } from 'vitest';
import { BackgroundJobs, type JobContext, type JobState } from '../src/jobs';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('background job lifetimes', () => {
  it('serializes decoding, deduplicates requests and preserves published snapshots', async () => {
    const started = deferred(),
      release = deferred(),
      idle = deferred();
    const states: JobState[][] = [];
    const order: string[] = [];
    const queue = new BackgroundJobs((state) => {
      states.push(state);
      if (!state.length) idle.resolve();
    });
    const failures: unknown[] = [];
    const failed = (error: unknown) => {
      failures.push(error);
    };
    queue.enqueue(
      { sourceId: 'a', kind: 'analysis' },
      async (job) => {
        order.push('a');
        started.resolve();
        job.progress('Decoding a');
        await release.promise;
      },
      failed,
    );
    expect(queue.enqueue({ sourceId: 'a', kind: 'analysis' }, async () => {}, failed)).toBe(false);
    queue.enqueue(
      { sourceId: 'b', kind: 'scenes' },
      async () => {
        order.push('b');
      },
      failed,
    );
    await started.promise;
    expect(order).toEqual(['a']);
    expect(states[0][0].phase).toBe('queued');
    expect(states.at(-1)![0].label).toBe('Decoding a');
    release.resolve();
    await idle.promise;
    expect(order).toEqual(['a', 'b']);
    expect(states.at(-1)).toEqual([]);
    expect(failures).toEqual([]);
  });

  it('cancels running and queued work, ignores late progress, and can restart the same source', async () => {
    const started = deferred();
    let old!: JobContext;
    let state: JobState[] = [];
    const errors: unknown[] = [];
    const queue = new BackgroundJobs((next) => {
      state = next;
    });
    queue.enqueue(
      { sourceId: 'a', kind: 'analysis' },
      async (job) => {
        old = job;
        started.resolve();
        await new Promise((_, reject) =>
          job.signal.addEventListener('abort', () => reject(job.signal.reason), { once: true }),
        );
      },
      (error) => errors.push(error),
    );
    let queuedStarted = false;
    queue.enqueue(
      { sourceId: 'b', kind: 'scenes' },
      async () => {
        queuedStarted = true;
      },
      (error) => errors.push(error),
    );
    await started.promise;
    expect(await queue.cancelAll()).toEqual([
      { sourceId: 'a', kind: 'analysis' },
      { sourceId: 'b', kind: 'scenes' },
    ]);
    expect(old.signal.aborted).toBe(true);
    expect(old.current()).toBe(false);
    expect(queuedStarted).toBe(false);
    expect(state).toEqual([]);
    expect(errors).toEqual([]);
    const fresh = deferred(),
      finish = deferred();
    queue.enqueue(
      { sourceId: 'a', kind: 'analysis' },
      async (job) => {
        job.progress('Fresh decoding');
        fresh.resolve();
        await finish.promise;
      },
      (error) => errors.push(error),
    );
    await fresh.promise;
    old.progress('Obsolete progress');
    expect(state[0].label).toBe('Fresh decoding');
    finish.resolve();
    await queue.cancelAll();
  });

  it('reports a current failure once and continues the queue', async () => {
    const idle = deferred();
    const failures: unknown[] = [];
    const queue = new BackgroundJobs((state) => {
      if (!state.length) idle.resolve();
    });
    const cause = new Error('Unreadable frames');
    queue.enqueue(
      { sourceId: 'bad', kind: 'analysis' },
      async () => {
        throw cause;
      },
      (error) => failures.push(error),
    );
    let continued = false;
    queue.enqueue(
      { sourceId: 'next', kind: 'analysis' },
      async () => {
        continued = true;
      },
      (error) => failures.push(error),
    );
    await idle.promise;
    expect(failures).toEqual([cause]);
    expect(continued).toBe(true);
  });
});

it('disposing a job owner aborts native work, drops queued work, and silences callbacks', async () => {
  const started = deferred(),
    release = deferred();
  const states: JobState[][] = [],
    failures: unknown[] = [];
  const queue = new BackgroundJobs((state) => states.push(state));
  let owned!: JobContext,
    queued = false;
  queue.enqueue(
    { sourceId: 'first', kind: 'analysis' },
    async (job) => {
      owned = job;
      started.resolve();
      await release.promise;
      job.progress('Late progress');
      throw new Error('Late failure');
    },
    (error) => failures.push(error),
  );
  queue.enqueue(
    { sourceId: 'next', kind: 'analysis' },
    async () => {
      queued = true;
    },
    (error) => failures.push(error),
  );
  await started.promise;
  queue.dispose();
  const count = states.length;
  expect(owned.signal.aborted).toBe(true);
  release.resolve();
  await queue.cancelAll();
  expect(states).toHaveLength(count);
  expect(queued).toBe(false);
  expect(failures).toEqual([]);
  expect(
    queue.enqueue(
      { sourceId: 'new', kind: 'scenes' },
      async () => {},
      () => {},
    ),
  ).toBe(false);
});
