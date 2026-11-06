import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeVideo, captureFrame, probeVideo, type MediaResponse } from '../src/media';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: MessageEvent<MediaResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
  reply(data: MediaResponse) {
    this.onmessage?.({ data } as MessageEvent<MediaResponse>);
  }
}

beforeEach(() => {
  TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('media worker lifetime', () => {
  it('reports progress, resolves the requested result, and releases the worker', async () => {
    const progress = vi.fn(),
      job = analyzeVideo(new Blob(), progress),
      worker = TestWorker.instances[0];
    worker.reply({ type: 'progress', label: 'Reading audio' });
    expect(progress).toHaveBeenCalledWith('Reading audio');
    const result = {
      thumbnails: [],
      peaks: [],
      frameTimes: [],
      scenes: {
        algorithm: 'ffmpeg-scdet-v1' as const,
        width: 2,
        height: 2,
        threshold: 10,
        times: [0],
        scores: [0],
      },
    };
    worker.reply({ type: 'result', task: 'analyze', result });
    await expect(job).resolves.toEqual(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(worker.onmessage).toBeNull();
  });

  it('does not start a decoder for an already canceled capture', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(captureFrame(new Blob(), 0, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(TestWorker.instances).toHaveLength(0);
  });

  it('cancels an active decoder and detaches the abort listener after success', async () => {
    const canceled = new AbortController(),
      failed = captureFrame(new Blob(), 0, { signal: canceled.signal });
    const first = TestWorker.instances[0];
    canceled.abort();
    await expect(failed).rejects.toMatchObject({ name: 'AbortError' });
    expect(first.terminate).toHaveBeenCalledOnce();
    const completed = new AbortController(),
      success = captureFrame(new Blob(), 1, { signal: completed.signal });
    const second = TestWorker.instances[1],
      result = { blob: new Blob(), time: 1, duration: 0.04 };
    second.reply({ type: 'result', task: 'capture', result });
    await expect(success).resolves.toEqual(result);
    completed.abort();
    expect(second.terminate).toHaveBeenCalledOnce();
  });

  it('cleans up when posting fails, rather than leaving a worker alive', async () => {
    vi.stubGlobal(
      'Worker',
      class extends TestWorker {
        constructor() {
          super();
          this.postMessage.mockImplementation(() => {
            throw new DOMException('Cannot clone input', 'DataCloneError');
          });
        }
      },
    );
    await expect(probeVideo(new Blob())).rejects.toThrow('Cannot clone input');
    expect(TestWorker.instances[0].terminate).toHaveBeenCalledOnce();
  });

  it('rejects worker, decoding and task-mismatch errors, releasing every worker', async () => {
    const failed = probeVideo(new Blob()),
      worker = TestWorker.instances[0];
    worker.reply({ type: 'error', message: 'Unsupported codec' });
    await expect(failed).rejects.toThrow('Unsupported codec');
    const mismatch = probeVideo(new Blob());
    TestWorker.instances[1].reply({
      type: 'result',
      task: 'capture',
      result: { blob: new Blob(), time: 0, duration: 0.04 },
    });
    await expect(mismatch).rejects.toThrow('Unexpected media worker response');
    const unreadable = probeVideo(new Blob());
    TestWorker.instances[2].onmessageerror?.();
    await expect(unreadable).rejects.toThrow('could not be read');
    for (const instance of TestWorker.instances) expect(instance.terminate).toHaveBeenCalledOnce();
  });

  it('rejects worker construction failures asynchronously', async () => {
    vi.stubGlobal('Worker', function () {
      throw new Error('Worker unavailable');
    });
    await expect(probeVideo(new Blob())).rejects.toThrow('Worker unavailable');
  });

  it('cleans up browser error events and throwing progress handlers', async () => {
    const job = probeVideo(new Blob()),
      worker = TestWorker.instances[0],
      preventDefault = vi.fn();
    worker.onerror?.({ message: 'Worker crashed', preventDefault } as unknown as ErrorEvent);
    await expect(job).rejects.toThrow('Worker crashed');
    expect(preventDefault).toHaveBeenCalledOnce();
    const progress = analyzeVideo(new Blob(), () => {
      throw new Error('Progress handler failed');
    });
    TestWorker.instances[1].reply({ type: 'progress', label: 'Reading audio' });
    await expect(progress).rejects.toThrow('Progress handler failed');
    for (const instance of TestWorker.instances) expect(instance.terminate).toHaveBeenCalledOnce();
  });
});

it('cancels an import probe and releases its decoder before metadata arrives', async () => {
  const controller = new AbortController(),
    result = probeVideo(new Blob(), controller.signal);
  const worker = TestWorker.instances[0];
  controller.abort();
  await expect(result).rejects.toMatchObject({ name: 'AbortError' });
  expect(worker.terminate).toHaveBeenCalledOnce();
  expect(worker.onmessage).toBeNull();
});
