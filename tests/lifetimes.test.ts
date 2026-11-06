import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetLibrary } from '../src/assets';
import { Autosave } from '../src/autosave';
import { Tasks } from '../src/tasks';
import { restoreEdit } from '../src/history';
import { boardFixture } from './board';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('autosave ownership', () => {
  it('debounces edits and serializes writes without reporting an older save as current', async () => {
    vi.useFakeTimers();
    const first = deferred();
    const writes: string[] = [],
      states: string[] = [];
    const save = new Autosave<string>(
      async (snapshot) => {
        writes.push(snapshot);
        if (snapshot === 'b') await first.promise;
      },
      (state) => states.push(state),
    );
    save.schedule('a');
    save.schedule('b');
    await vi.advanceTimersByTimeAsync(220);
    expect(writes).toEqual(['b']);
    save.schedule('c');
    await vi.advanceTimersByTimeAsync(220);
    expect(writes).toEqual(['b']);
    first.resolve();
    await save.drain();
    expect(writes).toEqual(['b', 'c']);
    expect(states).not.toContain('saved');
    save.schedule('d');
    await vi.advanceTimersByTimeAsync(220);
    expect(states.at(-1)).toBe('saved');
    save.dispose();
  });

  it('reports a current failure and recovers on a later edit', async () => {
    vi.useFakeTimers();
    const cause = new Error('Quota exceeded');
    const changed = vi.fn();
    const save = new Autosave(async (snapshot: number) => {
      if (snapshot === 1) throw cause;
    }, changed);
    save.schedule(1);
    await vi.advanceTimersByTimeAsync(220);
    expect(changed).toHaveBeenLastCalledWith('error', cause);
    save.schedule(2);
    await vi.advanceTimersByTimeAsync(220);
    expect(changed).toHaveBeenLastCalledWith('saved');
    save.dispose();
  });

  it('drains in-flight I/O while cancelling pending edits and obsolete errors before replacement', async () => {
    vi.useFakeTimers();
    const write = deferred(),
      changed = vi.fn(),
      persist = vi.fn(() => write.promise);
    const save = new Autosave(persist, changed);
    save.schedule('old');
    await vi.advanceTimersByTimeAsync(220);
    save.schedule('pending');
    let drained = false;
    const draining = save.drain().then(() => {
      drained = true;
    });
    await Promise.resolve();
    expect(drained).toBe(false);
    changed.mockClear();
    write.reject(new Error('Old project failure'));
    await draining;
    await vi.runAllTimersAsync();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    save.dispose();
  });

  it('disposal suppresses late completion and rejects future scheduling', async () => {
    vi.useFakeTimers();
    const write = deferred(),
      changed = vi.fn(),
      persist = vi.fn(() => write.promise);
    const save = new Autosave(persist, changed);
    save.schedule('a');
    await vi.advanceTimersByTimeAsync(220);
    save.dispose();
    changed.mockClear();
    save.schedule('b');
    write.resolve();
    await save.drain();
    await vi.runAllTimersAsync();
    expect(changed).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('project assets and short tasks', () => {
  it('shares blobs, retires replaced URLs, and releases current and retired URLs exactly once', () => {
    vi.useFakeTimers();
    let serial = 0;
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++serial}`);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const changed = vi.fn();
    const assets = new AssetLibrary(changed),
      original = new Blob(['original']);
    assets.install(
      new Map([
        ['video', original],
        ['still', new Blob(['frame1'])],
      ]),
    );
    assets.install(new Map([['still', new Blob(['frame2'])]]));
    expect(assets.blobs.get('video')).toBe(original);
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke.mock.calls.flat()).toEqual(['blob:2']);
    assets.install(new Map([['still', new Blob(['frame3'])]]));
    assets.replace(new Map([['video', original]]));
    expect(assets.generation).toBe(1);
    expect([...assets.blobs.keys()]).toEqual(['video']);
    expect(assets.blobs.get('video')).toBe(original);
    assets.dispose();
    assets.dispose();
    assets.install(new Map([['ignored', original]]));
    vi.runAllTimers();
    expect(create).toHaveBeenCalledTimes(5);
    expect(revoke.mock.calls.flat().sort()).toEqual([
      'blob:1',
      'blob:2',
      'blob:3',
      'blob:4',
      'blob:5',
    ]);
    expect(assets.blobs.size).toBe(0);
  });

  it('failed URL creation leaves the current project usable and releases partial allocations', () => {
    const create = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:old')
      .mockReturnValueOnce('blob:partial')
      .mockImplementation(() => {
        throw new Error('URL allocation failed');
      });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const changed = vi.fn(),
      assets = new AssetLibrary(changed),
      original = new Blob(['old']);
    assets.install(new Map([['video', original]]));
    expect(() =>
      assets.replace(
        new Map([
          ['a', new Blob()],
          ['b', new Blob()],
        ]),
      ),
    ).toThrow('URL allocation failed');
    expect(assets.blobs.get('video')).toBe(original);
    expect(assets.generation).toBe(0);
    expect(revoke.mock.calls.flat()).toEqual(['blob:partial']);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(3);
    assets.dispose();
  });

  it('rejects duplicate work and prevents an old completion from finishing a newer task', () => {
    const tasks = new Tasks(),
      first = tasks.begin('frame')!;
    expect(tasks.begin('frame')).toBeNull();
    const other = tasks.begin('source')!;
    first.finish();
    const second = tasks.begin('frame')!;
    first.finish();
    expect(tasks.size).toBe(2);
    expect(first.current()).toBe(false);
    expect(second.current()).toBe(true);
    tasks.dispose();
    expect(other.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(true);
    expect(second.current()).toBe(false);
    expect(tasks.begin('new')).toBeNull();
  });
});

it('Undo restores evidence and geometry while preserving analysis and the live camera', () => {
  const previous = boardFixture(),
    live = structuredClone(previous);
  live.videos[0] = {
    ...live.videos[0],
    x: 900,
    hidden: true,
    time: 3,
    peaks: [0.8],
    analysis: 'ready',
    frameTimes: [0, 0.04],
  };
  live.camera = { x: 300, y: -200, scale: 0.6 };
  live.quotations[1].memo = 'Changed';
  const restored = restoreEdit(previous, live);
  expect(restored.quotations).toBe(previous.quotations);
  expect(restored.camera).toBe(live.camera);
  expect(restored.videos[0]).toMatchObject({
    x: previous.videos[0].x,
    time: previous.videos[0].time,
    hidden: previous.videos[0].hidden,
    peaks: [0.8],
    analysis: 'ready',
    frameTimes: [0, 0.04],
  });
  expect(live.videos[0].x).toBe(900);
});

it('effect replay retains its owner, while actual unmount releases it once', async () => {
  const { createLifetime } = await import('../src/lifetime');
  const dispose = vi.fn(),
    acquire = createLifetime(dispose);
  const firstCleanup = acquire();
  firstCleanup();
  const finalCleanup = acquire();
  await Promise.resolve();
  expect(dispose).not.toHaveBeenCalled();
  finalCleanup();
  finalCleanup();
  await Promise.resolve();
  expect(dispose).toHaveBeenCalledOnce();
});
