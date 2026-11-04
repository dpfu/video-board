import { test, expect, openVideo, savedBoard, waitSaved } from './helpers';

test('offscreen culling preserves evidence, pinned playback, speed and full-board exports', async ({ page }, testInfo) => {
  const source = await openVideo(page);
  await page.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  const clip = page.locator('.clip-card'); await expect(clip).toHaveCount(1);
  await clip.getByRole('combobox', { name: 'Clip playback speed', exact: true }).selectOption('2');
  await clip.getByRole('button', { name: 'Code clip', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Code quotation', exact: true });
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).fill('Keep evidence');
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).press('Enter');
  await popover.getByRole('textbox', { name: 'Selection memo', exact: true }).fill('Stable across viewport changes.');
  await page.keyboard.press('Escape'); await waitSaved(page);
  const before = await savedBoard(page);
  await clip.getByRole('button', { name: 'Play clip', exact: true }).click();
  await expect.poll(() => clip.locator('video').evaluate(el => (el as HTMLVideoElement).paused)).toBe(false);
  await page.mouse.move(30, 850); await page.mouse.wheel(2500, 0); await waitSaved(page);
  await expect(clip.locator('video')).toHaveCount(1); // pinned playback survives panning
  await expect.poll(() => clip.locator('video').evaluate(el => (el as HTMLVideoElement).playbackRate)).toBe(2);
  await page.getByRole('textbox', { name: 'Board name', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(clip).toHaveCount(0);
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
  expect((await savedBoard(page)).clips).toEqual(before.clips);
  await expect(page.locator('.video-card')).toHaveCount(1); // source transport remains alive

  const png = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export board as PNG', exact: true }).click();
  await (await png).saveAs(testInfo.outputPath('offscreen-clip.png'));
  const backup = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const zipPath = testInfo.outputPath('offscreen.videoboard.zip'); await (await backup).saveAs(zipPath);
  const recovery = page.waitForEvent('download'); await page.locator('input[type=file][accept=".zip"]').setInputFiles(zipPath);
  await (await recovery).saveAs(testInfo.outputPath('before-open.zip')); await waitSaved(page);
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
  expect((await savedBoard(page)).clips).toEqual(before.clips);
  expect((await savedBoard(page)).videos[0].id).toBe(source.id);
  await page.reload(); await expect(page.locator('.video-card')).toHaveCount(1); await waitSaved(page);
  await expect(clip).toHaveCount(0);
  await page.mouse.move(30, 850); await page.mouse.wheel(-2500, 0); await expect(clip).toHaveCount(1);
  await expect(clip.getByRole('combobox', { name: 'Clip playback speed', exact: true })).toHaveValue('2');
  await clip.getByRole('button', { name: 'Code clip', exact: true }).click();
  await expect(popover.getByRole('button', { name: 'Apply Keep evidence', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(popover.getByRole('textbox', { name: 'Selection memo', exact: true })).toHaveValue('Stable across viewport changes.');
});
