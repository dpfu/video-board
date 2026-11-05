import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Locator, type Page } from '@playwright/test';
import type { Board } from '../src/model';

export const fixturePath = fileURLToPath(new URL('./fixtures/synthetic.webm', import.meta.url));

// Fresh Playwright contexts and port 4193 keep all test data off the working origin.
export const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await use(errors);
      expect(errors, 'No browser/runtime errors').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function savedBoard(page: Page): Promise<Board> {
  return page.evaluate(async () => {
    const request = indexedDB.open('video-board', 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<Board>((resolve, reject) => {
        const read = db.transaction('boards').objectStore('boards').get('current');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
    } finally {
      db.close();
    }
  });
}

export async function assetHash(page: Page, key: string) {
  return page.evaluate(async (key) => {
    const request = indexedDB.open('video-board', 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const board = await new Promise<Board>((resolve) => {
        const read = db.transaction('boards').objectStore('boards').get('current');
        read.onsuccess = () => resolve(read.result);
      });
      const assetId = board?.stills.find((s) => s.id === key)?.assetId || key;
      const blob = await new Promise<Blob>((resolve) => {
        const read = db.transaction('assets').objectStore('assets').get(assetId);
        read.onsuccess = () => resolve(read.result);
      });
      const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
    } finally {
      db.close();
    }
  }, key);
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
