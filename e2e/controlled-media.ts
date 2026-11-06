import type { Page } from '@playwright/test';
import type { MediaRequest, MediaResponse } from '../src/media';

type MediaControl = { created: number; active: number; disposed: number; held: boolean };
type ControlledWindow = Window & { __mediaControl: MediaControl };

/** Decode real media, but hold the first result so restore can interrupt a known job. */
export async function holdFirstMediaResult(page: Page, task: 'analyze' | 'scenes') {
  await page.addInitScript((heldTask) => {
    const native = window.Worker;
    const control: MediaControl = { created: 0, active: 0, disposed: 0, held: false };
    (window as unknown as ControlledWindow).__mediaControl = control;
    class ControlledWorker {
      private worker: Worker;
      private tracked = false;
      private first = false;
      private terminated = false;
      onmessage: Worker['onmessage'] = null;
      onerror: Worker['onerror'] = null;
      onmessageerror: Worker['onmessageerror'] = null;
      constructor(url: string | URL, options?: WorkerOptions) {
        this.worker = new native(url, options);
        this.worker.onmessage = (event: MessageEvent<MediaResponse>) => {
          if (this.first && event.data.type === 'result') control.held = true;
          else this.onmessage?.call(this.worker, event);
        };
        this.worker.onerror = (event) => this.onerror?.call(this.worker, event);
        this.worker.onmessageerror = (event) => this.onmessageerror?.call(this.worker, event);
      }
      postMessage(request: MediaRequest) {
        if (request.task === heldTask) {
          this.tracked = true;
          control.created++;
          control.active++;
          this.first = control.created === 1;
        }
        this.worker.postMessage(request);
      }
      terminate() {
        if (this.terminated) return;
        this.terminated = true;
        if (this.tracked) {
          control.active--;
          control.disposed++;
        }
        this.worker.terminate();
      }
    }
    window.Worker = ControlledWorker as unknown as typeof Worker;
  }, task);
}

export function mediaControl(page: Page) {
  return page.evaluate(() => (window as unknown as ControlledWindow).__mediaControl);
}

/** Fail only the next atomic project replacement; metadata autosaves still work. */
export async function failNextReplacement(page: Page) {
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      if (
        mode === 'readwrite' &&
        Array.isArray(stores) &&
        stores.includes('boards') &&
        stores.includes('assets')
      ) {
        IDBDatabase.prototype.transaction = transaction;
        throw new DOMException('Injected project replacement failure', 'QuotaExceededError');
      }
      return transaction.call(this, stores, mode, options);
    };
  });
}
