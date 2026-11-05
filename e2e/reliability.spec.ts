import { test, expect, box, openVideo, savedBoard, scrub, waitSaved } from './helpers';

test('restoring a hidden source resets its scrubbers to the saved clock, not the previous session', async ({
  page,
}, testInfo) => {
  await openVideo(page);
  const player = page.locator('.video-card');
  await scrub(page, player.getByRole('slider'), 0.25);
  await player.getByRole('button', { name: 'Hide source player', exact: true }).click();
  await waitSaved(page);
  const before = await savedBoard(page);
  const backup = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const zipPath = testInfo.outputPath('hidden-source.zip');
  await (await backup).saveAs(zipPath);

  await page.getByRole('button', { name: 'Open codes and quotations', exact: true }).click();
  await page.locator('.codes-card').getByRole('tab', { name: 'Sources', exact: true }).click();
  await page.locator('.source-list button').click();
  await expect(player).toHaveCount(1);
  await scrub(page, player.getByRole('slider'), 0.75);
  await player.getByRole('button', { name: 'Hide source player', exact: true }).click();
  await waitSaved(page);
  expect((await savedBoard(page)).videos[0].time).toBeCloseTo(3, 2);

  const recovery = page.waitForEvent('download');
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(zipPath);
  await (await recovery).saveAs(testInfo.outputPath('before-restore.zip'));
  await expect(player).toHaveCount(0);
  await waitSaved(page);
  expect(await savedBoard(page)).toEqual(before);
  await expect
    .poll(async () => {
      const times = await page
        .getByRole('slider', { name: /^Scrub / })
        .evaluateAll((elements) => elements.map((el) => Number(el.getAttribute('aria-valuenow'))));
      return (
        times.length === 2 && times.every((time) => Math.abs(time - before.videos[0].time) < 0.01)
      );
    })
    .toBe(true);
});

test('unrelated pointer release and cancellation do not end the active drag', async ({ page }) => {
  await openVideo(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const player = page.locator('.video-card');
  for (const type of ['pointerup', 'pointercancel']) {
    const before = await box(player),
      title = await box(player.locator('.card-title'));
    const x = title.x + title.width / 2,
      y = title.y + title.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y, { steps: 4 });
    await page.evaluate(
      (type) => window.dispatchEvent(new PointerEvent(type, { pointerId: 99, bubbles: true })),
      type,
    );
    await page.mouse.move(x + 70, y, { steps: 4 });
    await page.mouse.up();
    expect((await box(player)).x - before.x).toBeCloseTo(70, 1);
  }
});

test('a corrupt backup gives a clear error and releases the board for further edits', async ({
  page,
}) => {
  await openVideo(page);
  await waitSaved(page);
  const before = await savedBoard(page);
  await page.locator('input[type=file][accept=".zip"]').setInputFiles({
    name: 'broken.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a ZIP'),
  });
  await expect(page.getByRole('alert')).toContainText('not a readable Video Board backup');
  await expect(page.locator('.board')).toHaveJSProperty('inert', false);
  expect(await savedBoard(page)).toEqual(before);
  await page.getByRole('textbox', { name: 'Board name', exact: true }).fill('Still editable');
  await waitSaved(page);
  expect((await savedBoard(page)).name).toBe('Still editable');
});
