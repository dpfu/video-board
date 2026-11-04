import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, assetHash, box, dragBy, expectSynchronized, fixtureBytes, openVideo, savedBoard, scrub, waitSaved } from './helpers';

test('real video: resized detached scrubbers stay synchronized and stills retain exact frame links', async ({ page }) => {
  const video = await openVideo(page);
  expect(video.peaks.some(peak => peak > .01)).toBe(true);
  expect(video.frameTimes.length).toBeGreaterThan(40);
  const audio = page.locator('[data-track-kind=waveform]');
  await audio.getByRole('button', { name: 'Undock module', exact: true }).click();
  await expect(audio).not.toHaveAttribute('data-docked-to');
  await dragBy(page, audio.locator('.resize-handle'), 250, 24);
  expect((await box(audio)).width).toBeGreaterThan(680);
  const slider = audio.getByRole('slider');
  await scrub(page, slider, .65);
  await expectSynchronized(page, video.duration * .65);
  await expect.poll(() => page.locator('video').evaluate(el => (el as HTMLVideoElement).paused)).toBe(true);

  await audio.getByRole('button', { name: 'Capture still from audio', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(1);
  await expect.poll(() => page.locator('.still-image').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(320);
  await waitSaved(page);
  const firstId = (await savedBoard(page)).stills[0].id;
  const originalHash = await assetHash(page, firstId);
  const first = page.locator(`[data-still-id="${firstId}"]`);
  const timecode = first.getByRole('textbox');
  await timecode.fill('00:01.100'); await timecode.press('Tab');
  await expect.poll(async () => Math.abs((await savedBoard(page)).stills[0].time - 1.1)).toBeLessThan(.09);
  await expect.poll(() => assetHash(page, firstId)).not.toBe(originalHash);
  const adjusted = (await savedBoard(page)).stills[0].time;

  await scrub(page, slider, .85);
  await audio.getByRole('button', { name: 'Capture still from audio', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(2); await waitSaved(page);
  expect((await savedBoard(page)).stills[0].time).toBe(adjusted);
  const secondTime = (await savedBoard(page)).stills[1].time;
  const nextFrame = video.frameTimes.find(t => t > adjusted + .00001)!;
  await first.getByRole('button', { name: 'Next frame', exact: true }).click();
  await expect.poll(async () => (await savedBoard(page)).stills[0].time).toBeCloseTo(nextFrame, 6);
  const exactHash = await assetHash(page, firstId);
  expect((await savedBoard(page)).stills[1].time).toBe(secondTime);
  await first.getByRole('button', { name: 'Jump to video', exact: true }).click();
  await expectSynchronized(page, nextFrame);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(3); await waitSaved(page);
  const recaptured = (await savedBoard(page)).stills[2];
  expect(recaptured.time).toBeCloseTo(nextFrame, 6);
  expect(await assetHash(page, recaptured.id)).toBe(exactHash);
});

test('magnetic groups move, peel, resize, redock and survive removal undo and reload', async ({ page }) => {
  await openVideo(page);
  const player = page.locator('.video-card'), frames = page.locator('[data-track-kind=filmstrip]'), audio = page.locator('[data-track-kind=waveform]');
  const start = await Promise.all([player, frames, audio].map(box));
  await dragBy(page, player.locator('.card-title'), 70, 35);
  for (const [index, module] of [player, frames, audio].entries()) {
    const after = await box(module);
    expect(after.x - start[index].x).toBeCloseTo(70, 1); expect(after.y - start[index].y).toBeCloseTo(35, 1);
  }
  const beforePeel = await Promise.all([player, frames].map(box));
  await dragBy(page, audio.getByRole('button', { name: 'Drag module independently', exact: true }), 650, 70);
  await expect(audio).not.toHaveAttribute('data-docked-to');
  expect(await Promise.all([player, frames].map(box))).toEqual(beforePeel);
  const freeAudio = await box(audio);
  await dragBy(page, frames.locator('.resize-handle'), 0, 48);
  expect(await box(audio)).toEqual(freeAudio);
  const target = await box(frames), current = await box(audio);
  await dragBy(page, audio.locator('.track-title'), target.x - current.x, target.y + target.height + 5 - current.y, async () => {
    await expect(page.locator('.dock-preview')).toBeVisible();
    await expect(page.locator('.dock-preview')).toHaveText('Dock below');
  });
  await expect(audio).toHaveAttribute('data-docked-to', (await frames.getAttribute('data-module-id'))!);
  await dragBy(page, audio.locator('.resize-handle'), 250, 20);
  expect((await box(audio)).width - (await box(frames)).width).toBeCloseTo(250, 1);
  const beforeResize = await box(audio);
  await dragBy(page, frames.locator('.resize-handle'), 0, 20);
  expect((await box(audio)).y - beforeResize.y).toBeCloseTo(20, 1);
  const beforeGroupMove = await Promise.all([player, frames, audio].map(box));
  await dragBy(page, audio.locator('.track-title'), 30, 12);
  for (const [index, module] of [player, frames, audio].entries()) {
    const moved = await box(module);
    expect(moved.x - beforeGroupMove[index].x).toBeCloseTo(30, 1); expect(moved.y - beforeGroupMove[index].y).toBeCloseTo(12, 1);
  }
  await frames.getByRole('button', { name: 'Remove frames scrubber', exact: true }).click();
  await expect(frames).toHaveCount(0); await expect(audio).not.toHaveAttribute('data-docked-to');
  await page.getByRole('button', { name: 'Undo removal', exact: true }).click();
  await expect(frames).toHaveCount(1);
  await expect(audio).toHaveAttribute('data-docked-to', (await frames.getAttribute('data-module-id'))!);
  await waitSaved(page); const persisted = await savedBoard(page);
  await page.reload(); await expect(audio).toHaveCount(1); await waitSaved(page);
  expect(await savedBoard(page)).toEqual(persisted);
  await scrub(page, audio.getByRole('slider'), .5); await expectSynchronized(page, persisted.videos[0].duration * .5);
});

test('ZIP and PNG include offscreen modules; incomplete backups cannot replace the working board', async ({ page }, testInfo) => {
  const video = await openVideo(page);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(1); await waitSaved(page);
  const audio = page.locator('[data-track-kind=waveform]');
  await audio.getByRole('button', { name: 'Undock module', exact: true }).click();
  await dragBy(page, audio.locator('.resize-handle'), 460, 10);
  await dragBy(page, audio.locator('.track-title'), 850, 0);
  expect((await box(audio)).x + (await box(audio)).width).toBeGreaterThan(1440);
  await page.getByRole('textbox', { name: 'Board name', exact: true }).fill('Roundtrip'); await waitSaved(page);
  const before = await savedBoard(page), stillHash = await assetHash(page, before.stills[0].id);
  const zipPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const zipPath = testInfo.outputPath('roundtrip.videoboard.zip'); await (await zipPromise).saveAs(zipPath);
  const archive = await JSZip.loadAsync(await readFile(zipPath));
  expect(JSON.parse(await archive.file('board.json')!.async('string'))).toEqual(before);
  expect(await archive.file(`assets/${video.id}`)!.async('nodebuffer')).toEqual(await fixtureBytes());

  await page.getByRole('textbox', { name: 'Board name', exact: true }).fill('Keep me'); await waitSaved(page);
  const intact = await savedBoard(page);
  archive.remove(`assets/${video.id}`);
  await page.locator('input[type=file][accept=".zip"]').setInputFiles({ name: 'incomplete.zip', mimeType: 'application/zip', buffer: await archive.generateAsync({ type: 'nodebuffer' }) });
  await expect(page.getByRole('alert')).toContainText('missing a media file');
  expect(await savedBoard(page)).toEqual(intact);
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  const recoveryPromise = page.waitForEvent('download');
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(zipPath);
  await (await recoveryPromise).saveAs(testInfo.outputPath('before-open.zip'));
  await expect(page.getByRole('textbox', { name: 'Board name', exact: true })).toHaveValue('Roundtrip'); await waitSaved(page);
  expect(await savedBoard(page)).toEqual(before);
  expect(await assetHash(page, before.stills[0].id)).toBe(stillHash);
  await page.reload(); await expect(page.locator('.still-card')).toHaveCount(1); await waitSaved(page);
  expect(await savedBoard(page)).toEqual(before);
  await expect.poll(() => page.locator('video').evaluate(el => (el as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(2);

  const pngPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export board as PNG', exact: true }).click();
  const pngPath = testInfo.outputPath('board.png'); await (await pngPromise).saveAs(pngPath);
  const png = await readFile(pngPath);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBeGreaterThan(1440);
  expect(png.readUInt32BE(20)).toBeGreaterThan(500);
});
