import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Input, ALL_FORMATS, BlobSource } from 'mediabunny';
import type { Page } from '@playwright/test';
import { test, expect, assetHash, openVideo, savedBoard, waitSaved } from './helpers';

const coreURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/';
async function coreFiles(page: Page) {
  const requests: string[] = [];
  await page.route(`${coreURL}**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)!;
    expect(['ffmpeg-core.js', 'ffmpeg-core.wasm']).toContain(name);
    requests.push(name);
    const path = fileURLToPath(
      new URL(`../node_modules/@ffmpeg/core/dist/esm/${name}`, import.meta.url),
    );
    await route.fulfill({
      path,
      contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
    });
  });
  return requests;
}

test('exports the chosen clip with real Wasm, video and audio; caches tools and preserves source evidence', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const requests = await coreFiles(page);
  const source = await openVideo(page);
  await page.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  const clip = page.locator('.clip-card');
  await clip.getByRole('textbox', { name: 'Clip out', exact: true }).fill('00:02.750');
  await clip.getByRole('textbox', { name: 'Clip out', exact: true }).press('Enter');
  await clip.getByRole('textbox', { name: 'Clip in', exact: true }).fill('00:01.250');
  await clip.getByRole('textbox', { name: 'Clip in', exact: true }).press('Enter');
  await waitSaved(page);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  const before = await savedBoard(page),
    original = await assetHash(page, source.id),
    quote = before.quotations.find((q) => q.id === before.clips[0].quotationId)!;
  const download = page.waitForEvent('download');
  await clip.getByRole('button', { name: 'Download clip as MP4', exact: true }).click();
  const file = await download,
    path = testInfo.outputPath('excerpt.mp4');
  await file.saveAs(path);
  await expect(page.getByRole('button', { name: 'Cancel clip export', exact: true })).toHaveCount(
    0,
  );
  expect(requests.sort()).toEqual(['ffmpeg-core.js', 'ffmpeg-core.wasm']);
  const encoded = (await readFile(path)).toString('base64');
  const result = await page.evaluate(
    async ({ encoded, start }) => {
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)),
        blob = new Blob([bytes], { type: 'video/mp4' }),
        url = URL.createObjectURL(blob),
        video = document.createElement('video');
      video.muted = true;
      video.src = url;
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error('The exported MP4 does not decode.'));
      });
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = 0.001;
      });
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(video, 0, 0);
      const exported = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const source = document.createElement('video');
      source.muted = true;
      source.src = document.querySelector<HTMLVideoElement>('.video-card video')!.currentSrc;
      await new Promise<void>((resolve, reject) => {
        source.onloadeddata = () => resolve();
        source.onerror = () => reject(new Error('The original video does not decode.'));
      });
      await new Promise<void>((resolve) => {
        source.onseeked = () => resolve();
        source.currentTime = start + 0.001;
      });
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      ctx.drawImage(source, 0, 0);
      const expected = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let error = 0;
      for (let i = 0; i < expected.length; i++)
        if (i % 4 !== 3) error += Math.abs(expected[i] - exported[i]);
      const audio = new AudioContext();
      const decoded = await audio.decodeAudioData(await blob.arrayBuffer()),
        samples = decoded.getChannelData(0);
      const rms = Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
      const result = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        imageError: error / (canvas.width * canvas.height * 3),
        audioDuration: decoded.duration,
        rms,
      };
      await audio.close();
      video.removeAttribute('src');
      video.load();
      source.removeAttribute('src');
      source.load();
      URL.revokeObjectURL(url);
      return result;
    },
    { encoded, start: quote.start },
  );
  expect(result.width).toBe(320);
  expect(result.height).toBe(180);
  expect(result.duration).toBeCloseTo(quote.end - quote.start, 1);
  expect(result.audioDuration).toBeGreaterThan(1.3);
  expect(result.rms).toBeGreaterThan(0.01);
  expect(result.imageError).toBeLessThan(12);
  expect(await assetHash(page, source.id)).toBe(original);
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
  expect((await savedBoard(page)).clips).toEqual(before.clips);
  const again = page.waitForEvent('download');
  await page.context().setOffline(true);
  await clip.getByRole('button', { name: 'Download clip as MP4', exact: true }).click();
  await (await again).saveAs(testInfo.outputPath('cached-excerpt.mp4'));
  expect(requests).toHaveLength(2);
  await page.screenshot({ path: testInfo.outputPath('clip-export.png') });
});

test('cancelling a pending tools download leaves editing usable and a fresh export succeeds', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const requests = await coreFiles(page);
  let release!: () => void;
  const held = new Promise<void>((done) => (release = done));
  await page.route(`${coreURL}ffmpeg-core.wasm`, async (route) => {
    await held;
    await route.fallback();
  });
  await openVideo(page);
  await page.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  await page.getByRole('button', { name: 'Download clip as MP4', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel clip export', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Board name', exact: true }).fill('Still responsive');
  await page.getByRole('button', { name: 'Cancel clip export', exact: true }).click();
  release();
  await expect(
    page.getByRole('button', { name: 'Download clip as MP4', exact: true }),
  ).toBeEnabled();
  await page.unroute(`${coreURL}ffmpeg-core.wasm`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download clip as MP4', exact: true }).click();
  await (await download).saveAs(testInfo.outputPath('after-cancel.mp4'));
  expect(requests).toContain('ffmpeg-core.wasm');
  await waitSaved(page);
  expect((await savedBoard(page)).name).toBe('Still responsive');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('invalid range drafts block export; a corrupt runtime is rejected and retry exports silent video', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await coreFiles(page);
  await page.route(`${coreURL}ffmpeg-core.wasm`, (route) =>
    route.fulfill({ body: Buffer.from('corrupt core'), contentType: 'application/wasm' }),
  );
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Add videos', exact: true })).toBeEnabled();
  await page
    .locator('input[type=file][accept^="video/"]')
    .setInputFiles(fileURLToPath(new URL('./fixtures/scenes.webm', import.meta.url)));
  await expect.poll(async () => (await savedBoard(page)).videos[0]?.analysis).toBe('ready');
  await page.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  const clip = page.locator('.clip-card'),
    button = clip.getByRole('button', { name: 'Download clip as MP4', exact: true }),
    field = clip.getByRole('textbox', { name: 'Clip in', exact: true });
  await field.fill('not a time');
  await expect(button).toBeDisabled();
  await field.press('Escape');
  await expect(button).toBeEnabled();
  await waitSaved(page);
  const before = await savedBoard(page),
    original = await assetHash(page, before.videos[0].id);
  await button.click();
  await expect(page.getByRole('alert')).toContainText('integrity check');
  await expect(button).toBeEnabled();
  await page.unroute(`${coreURL}ffmpeg-core.wasm`);
  const download = page.waitForEvent('download');
  await button.click();
  const path = testInfo.outputPath('silent-excerpt.mp4');
  await (await download).saveAs(path);
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(new Blob([await readFile(path)])),
  });
  try {
    expect(await input.getPrimaryAudioTrack()).toBeNull();
    expect(await input.getPrimaryVideoTrack()).not.toBeNull();
    expect(await input.computeDuration()).toBeGreaterThan(0.5);
  } finally {
    input.dispose();
  }
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
  expect(await assetHash(page, before.videos[0].id)).toBe(original);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
