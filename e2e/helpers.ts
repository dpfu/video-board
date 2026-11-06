import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  test as base,
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import type { Board, PersistedBoard } from '../src/model';
import { validateBoard } from '../src/validation';
import { testAppURL } from './test-settings';

export const fixturePath = fileURLToPath(new URL('./fixtures/synthetic.webm', import.meta.url));

// Fresh Playwright contexts and port 4193 keep all test data off the working origin.
function monitorContext(context: BrowserContext, errors: string[]) {
  const origin = new URL(testAppURL).origin;
  const observe = (page: Page) => {
    page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${page.url()}: ${message.text()}`);
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && new URL(response.url()).origin === origin)
        errors.push(`HTTP ${response.status()}: ${response.url()}`);
    });
  };
  context.pages().forEach(observe);
  context.on('page', observe);
}

export const test = base.extend<{
  browserErrors: string[];
  newProjectPage: () => Promise<Page>;
}>({
  browserErrors: [
    async ({ context }, use) => {
      const errors: string[] = [];
      monitorContext(context, errors);
      try {
        await use(errors);
      } finally {
        expect(errors, 'No runtime, console or failed HTTP responses in any test page').toEqual([]);
      }
    },
    { auto: true },
  ],
  newProjectPage: async ({ browser, browserErrors, baseURL, viewport }, use) => {
    const contexts: BrowserContext[] = [];
    try {
      await use(async () => {
        const context = await browser.newContext({ baseURL, viewport });
        contexts.push(context);
        monitorContext(context, browserErrors);
        return context.newPage();
      });
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  },
});
export { expect };

type DatabaseTask =
  { kind: 'board' } | { kind: 'hash'; key: string } | { kind: 'seed'; board: PersistedBoard };

async function testDatabase(page: Page, task: DatabaseTask) {
  const url = new URL(page.url()),
    target = new URL(testAppURL);
  if (url.origin !== target.origin || !url.pathname.startsWith(target.pathname))
    throw new Error(`Test database access is restricted to ${testAppURL}; received ${page.url()}.`);
  return page.evaluate(async (task) => {
    const request = indexedDB.open('video-board', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('The test database is blocked.'));
    });
    try {
      const read = <T>(store: 'boards' | 'assets', key: string) =>
        new Promise<T>((resolve, reject) => {
          const tx = db.transaction(store),
            request = tx.objectStore(store).get(key);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          tx.onabort = () => reject(tx.error || new Error('The test database read was aborted.'));
        });
      if (task.kind === 'seed') {
        const tx = db.transaction('boards', 'readwrite');
        tx.objectStore('boards').put(task.board, 'current');
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error || new Error('The test fixture could not be saved.'));
          tx.onerror = () => reject(tx.error);
        });
        return;
      }
      const board = await read<Board | undefined>('boards', 'current');
      if (task.kind === 'board') return board;
      const id = board?.stills.find((still) => still.id === task.key)?.assetId || task.key;
      const blob = await read<Blob | undefined>('assets', id);
      if (!blob) throw new Error(`Missing test media asset: ${id}`);
      const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      );
    } finally {
      db.close();
    }
  }, task);
}

export async function savedBoard(page: Page): Promise<Board> {
  let board: Board | undefined;
  await expect
    .poll(
      async () => {
        const value = await testDatabase(page, { kind: 'board' });
        board = typeof value === 'object' ? value : undefined;
        return !!board;
      },
      { message: 'A board has been persisted in the disposable test database' },
    )
    .toBe(true);
  return board!;
}

export async function assetHash(page: Page, key: string): Promise<string> {
  return (await testDatabase(page, { kind: 'hash', key })) as string;
}

/** Replace metadata in this test context only, retaining its generated media. */
export async function seedBoard(page: Page, board: PersistedBoard) {
  validateBoard(board);
  await waitSaved(page);
  await testDatabase(page, { kind: 'seed', board });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add videos', exact: true })).toBeEnabled();
  await waitSaved(page);
}

export async function openVideo(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Add videos', exact: true })).toBeEnabled();
  await page.locator('input[type=file][accept^="video/"]').setInputFiles(fixturePath);
  await expect(page.locator('.video-card')).toHaveCount(1);
  await expect.poll(async () => (await savedBoard(page))?.videos[0]?.analysis).toBe('ready');
  await expect(page.locator('.timeline__filmstrip img')).toHaveCount(12);
  await expect(page.locator('.waveform path')).toHaveCount(1);
  await expect
    .poll(() => page.locator('video').evaluate((el) => (el as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  return (await savedBoard(page)).videos[0];
}

export async function box(locator: Locator) {
  const rect = await locator.boundingBox();
  if (!rect) throw new Error('Expected an exposed module or control');
  return rect;
}

export async function dragBy(
  page: Page,
  locator: Locator,
  dx: number,
  dy: number,
  beforeRelease?: () => Promise<void>,
) {
  await expect(locator).toBeInViewport({ ratio: 1 });
  await locator.hover(); // Like a click, acquire the control after layout settles.
  const rect = await box(locator),
    x = rect.x + rect.width / 2,
    y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  try {
    await page.mouse.move(x + dx, y + dy, { steps: 10 });
    await beforeRelease?.();
  } finally {
    await page.mouse.up();
  }
}

export async function scrub(page: Page, slider: Locator, fraction: number) {
  const rect = await box(slider);
  await page.mouse.move(rect.x + rect.width * 0.15, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * fraction, rect.y + rect.height / 2, { steps: 10 });
  await page.mouse.up();
}

export async function expectSynchronized(page: Page, time: number) {
  await expect
    .poll(async () => {
      const times = await page
        .getByRole('slider', { name: /^Scrub / })
        .evaluateAll((elements) => elements.map((el) => Number(el.getAttribute('aria-valuenow'))));
      const actual = await page
        .locator('video')
        .evaluate((el) => (el as HTMLVideoElement).currentTime);
      return Math.max(Math.abs(actual - time), ...times.map((t) => Math.abs(t - time)));
    })
    .toBeLessThan(0.04);
}

export const waitSaved = (page: Page) =>
  expect(page.locator('.save-state')).toHaveText('Saved locally');
export const fixtureBytes = () => readFile(fixturePath);
