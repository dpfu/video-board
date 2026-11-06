import { test, expect, box, openVideo, savedBoard, scrub, waitSaved } from './helpers';
import { expectPreviewLoop } from './media-assertions';

test('scrubbing an inactive clip opens a paused view at the requested time, then edited bounds loop independently', async ({
  page,
}) => {
  await openVideo(page);
  const source = page.locator('.video-card');
  await source.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  const clip = page.locator('.clip-card');
  await expect(clip).toHaveCount(1);
  await expect(clip.locator('video')).toHaveCount(0);
  await waitSaved(page);
  const before = await savedBoard(page);
  const q = before.quotations.find((q) => q.id === before.clips[0].quotationId)!;
  const desired = q.start + (q.end - q.start) * 0.6;
  await scrub(page, clip.getByRole('slider', { name: 'Scrub clip', exact: true }), 0.6);
  const player = clip.locator('video');
  await expect(player).toHaveJSProperty('paused', true);
  await expect
    .poll(() =>
      player.evaluate(
        (el, desired) => Math.abs((el as HTMLVideoElement).currentTime - desired),
        desired,
      ),
    )
    .toBeLessThan(0.04);
  await clip.getByRole('textbox', { name: 'Clip in', exact: true }).fill('00:00.400');
  await clip.getByRole('textbox', { name: 'Clip in', exact: true }).press('Enter');
  await clip.getByRole('textbox', { name: 'Clip out', exact: true }).fill('00:00.800');
  await clip.getByRole('textbox', { name: 'Clip out', exact: true }).press('Enter');
  await clip.getByRole('button', { name: 'Play clip', exact: true }).click();
  await waitSaved(page);
  const edited = (await savedBoard(page)).quotations.find((quote) => quote.id === q.id)!;
  await expectPreviewLoop(player, edited.start, edited.end);
  await expect(player).toHaveJSProperty('muted', true);
  await expect(source.locator('video')).toHaveJSProperty('paused', true);
  await expect(source.locator('video')).toHaveJSProperty('currentTime', before.videos[0].time);
  await clip.getByRole('button', { name: 'Stop clip preview', exact: true }).click();
  await expect(player).toHaveCount(0);
  await waitSaved(page);
  expect((await savedBoard(page)).videos[0].time).toBe(before.videos[0].time);
});

test('timecode editors reject invalid drafts, Escape restores the committed value, and valid still retiming stays linked', async ({
  page,
}) => {
  await openVideo(page);
  const source = page.locator('.video-card');
  await source.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  await source.getByRole('button', { name: 'Capture still', exact: true }).click();
  const still = page.locator('.still-card'),
    clip = page.locator('.clip-card');
  await expect(still.getByRole('textbox')).toBeEnabled();
  await waitSaved(page);
  const before = await savedBoard(page);
  for (const field of [
    clip.getByRole('textbox', { name: 'Clip in', exact: true }),
    still.getByRole('textbox'),
  ]) {
    const committed = await field.inputValue();
    await field.fill('invalid timestamp');
    await field.press('Tab');
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await field.focus();
    await field.press('Escape');
    await expect(field).toHaveValue(committed);
    await expect(field).toHaveAttribute('aria-invalid', 'false');
  }
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
  await still.getByRole('button', { name: 'Duplicate still view', exact: true }).click();
  const field = still.first().getByRole('textbox');
  await field.fill('00:01.000');
  await field.press('Enter');
  await expect
    .poll(async () =>
      (await savedBoard(page)).stills.every((frame) => Math.abs(frame.time - 1) < 0.001),
    )
    .toBe(true);
  const after = await savedBoard(page);
  expect(new Set(after.stills.map((frame) => frame.assetId)).size).toBe(1);
  expect(new Set(after.stills.map((frame) => frame.quotationId)).size).toBe(1);
  expect(after.quotations).toHaveLength(before.quotations.length);
});

test('a failed autosave reports its error and the next edit recovers with the latest snapshot', async ({
  page,
}) => {
  await openVideo(page);
  await waitSaved(page);
  const before = await savedBoard(page);
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (
      this: IDBDatabase,
      ...args: Parameters<IDBDatabase['transaction']>
    ) {
      const names = typeof args[0] === 'string' ? [args[0]] : [...args[0]];
      if (args[1] === 'readwrite' && names.length === 1 && names[0] === 'boards') {
        IDBDatabase.prototype.transaction = original;
        throw new DOMException('Injected autosave failure', 'QuotaExceededError');
      }
      return original.apply(this, args);
    } as IDBDatabase['transaction'];
  });
  const name = page.getByRole('textbox', { name: 'Board name', exact: true });
  await name.fill('Unwritten edit');
  await expect(page.getByRole('alert')).toContainText(
    'Could not save locally: Injected autosave failure',
  );
  await expect(page.locator('.save-state')).toHaveText('Save failed');
  expect((await savedBoard(page)).name).toBe(before.name);
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  await name.fill('Intermediate edit');
  await name.fill('Latest recovered edit');
  await waitSaved(page);
  expect((await savedBoard(page)).name).toBe('Latest recovered edit');
  await page.reload();
  await expect(name).toHaveValue('Latest recovered edit');
  await waitSaved(page);
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
});

test('losing board pointer capture ends the owned move and a fresh gesture can continue', async ({
  page,
}) => {
  await openVideo(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const source = page.locator('.video-card'),
    title = source.locator('.card-title');
  const origin = await box(source),
    grip = await box(title);
  const x = grip.x + grip.width / 2,
    y = grip.y + grip.height / 2;
  let pointerId = 0;
  await source.evaluate((el) =>
    el.addEventListener(
      'pointerdown',
      (event) => {
        (window as unknown as { __boardPointer: number }).__boardPointer = (
          event as PointerEvent
        ).pointerId;
      },
      { once: true, capture: true },
    ),
  );
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 35, y + 15, { steps: 4 });
  const moved = await box(source);
  pointerId = await page.evaluate(
    () => (window as unknown as { __boardPointer: number }).__boardPointer,
  );
  await source.dispatchEvent('lostpointercapture', { pointerId, bubbles: true });
  await page.mouse.move(x + 90, y + 35, { steps: 4 });
  await page.mouse.up();
  expect((await box(source)).x).toBeCloseTo(moved.x, 1);
  expect(moved.x - origin.x).toBeCloseTo(35, 1);
  await expect(page.locator('body')).not.toHaveClass(/is-dragging/);
  const nextGrip = await box(title);
  await page.mouse.move(nextGrip.x + nextGrip.width / 2, nextGrip.y + nextGrip.height / 2);
  await page.mouse.down();
  await page.mouse.move(nextGrip.x + nextGrip.width / 2 + 20, nextGrip.y + nextGrip.height / 2, {
    steps: 4,
  });
  await page.mouse.up();
  expect((await box(source)).x - moved.x).toBeCloseTo(20, 1);
});
