import {
  test,
  expect,
  assetHash,
  box,
  fixturePath,
  openVideo,
  savedBoard,
  seedBoard,
  waitSaved,
} from './helpers';
import { collectionFixture } from './board-fixtures';
import { failNextReplacement, holdFirstMediaResult, mediaControl } from './controlled-media';

for (const task of ['analyze', 'scenes'] as const) {
  test(`failed project replacement resumes interrupted ${task} work without reloading`, async ({
    page,
  }, testInfo) => {
    await holdFirstMediaResult(page, task);
    if (task === 'analyze') {
      await page.goto('./');
      await expect(page.getByRole('button', { name: 'Add videos', exact: true })).toBeEnabled();
      await page.locator('input[type=file][accept^="video/"]').setInputFiles(fixturePath);
    } else {
      await openVideo(page);
      const legacy = await savedBoard(page);
      delete legacy.videos[0].scenes;
      await seedBoard(page, legacy);
      await page.getByRole('button', { name: 'Add cuts scrubber', exact: true }).click();
    }
    await expect.poll(async () => (await mediaControl(page)).held).toBe(true);
    await expect.poll(async () => (await savedBoard(page)).videos.length).toBe(1);
    const before = await savedBoard(page),
      id = before.videos[0].id;
    const original = await assetHash(page, id);
    const backup = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
    const path = testInfo.outputPath(`${task}-pending.zip`);
    await (await backup).saveAs(path);
    await failNextReplacement(page);
    const recovery = page.waitForEvent('download');
    await page.locator('input[type=file][accept=".zip"]').setInputFiles(path);
    await (await recovery).saveAs(testInfo.outputPath(`${task}-before-open.zip`));
    await expect(page.getByRole('alert')).toContainText('Injected project replacement failure');
    await expect(page.locator('.board')).toHaveJSProperty('inert', false);
    await expect
      .poll(async () => {
        const video = (await savedBoard(page)).videos[0];
        return task === 'analyze' ? video.analysis === 'ready' : !!video.scenes;
      })
      .toBe(true);
    await waitSaved(page);
    expect(await mediaControl(page)).toMatchObject({ created: 2, active: 0, disposed: 2 });
    expect((await savedBoard(page)).videos[0].id).toBe(id);
    expect((await savedBoard(page)).quotations).toEqual(before.quotations);
    expect(await assetHash(page, id)).toBe(original);
    await expect(page.locator('.save-state')).not.toContainText('Processing');

    await test.step('Retry the pending backup successfully and resume its requested work', async () => {
      const retryRecovery = page.waitForEvent('download');
      await page.locator('input[type=file][accept=".zip"]').setInputFiles(path);
      await (await retryRecovery).saveAs(testInfo.outputPath(`${task}-retry-recovery.zip`));
      await expect.poll(async () => (await mediaControl(page)).created).toBe(3);
      await expect
        .poll(async () => {
          const video = (await savedBoard(page)).videos[0];
          return task === 'analyze' ? video.analysis === 'ready' : !!video.scenes;
        })
        .toBe(true);
      await waitSaved(page);
      expect(await mediaControl(page)).toMatchObject({ created: 3, active: 0, disposed: 3 });
      expect(await assetHash(page, id)).toBe(original);
    });
  });
}

test('a file operation releases a pinned preview and leaves evidence editing intact after rejection', async ({
  page,
}, testInfo) => {
  await openVideo(page);
  await seedBoard(page, collectionFixture(await savedBoard(page)));
  const tile = page.locator('[data-evidence-id="excerpt-0"]');
  await tile.getByRole('button', { name: 'Play preview: Excerpt 000', exact: true }).click();
  await expect(tile.locator('video')).toHaveCount(1);
  const download = page.waitForEvent('download');
  // Keep the pointer in place: a file boundary, rather than mouseleave, must stop ownership.
  await page
    .getByRole('button', { name: 'Download project backup', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  await (await download).saveAs(testInfo.outputPath('preview-boundary.zip'));
  await expect(page.locator('.space-card video')).toHaveCount(0);
  await expect(
    tile.getByRole('button', { name: 'Play preview: Excerpt 000', exact: true }),
  ).toBeVisible();

  await tile.getByRole('button', { name: 'Code Excerpt 000', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Code quotation', exact: true });
  await popover
    .getByRole('textbox', { name: 'Selection memo', exact: true })
    .fill('Keep this context.');
  await page.locator('input[type=file][accept=".zip"]').setInputFiles({
    name: 'broken.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('broken'),
  });
  await expect(page.getByRole('alert')).toContainText('not a readable');
  await expect(popover.getByRole('textbox', { name: 'Selection memo', exact: true })).toHaveValue(
    'Keep this context.',
  );
});

test('drawing and segment modes are exclusive, fresh drafts reset validity, and Escape discards an unfinished rectangle', async ({
  page,
}) => {
  await openVideo(page);
  const player = page.locator('.video-card');
  await player.getByRole('button', { name: 'Capture still', exact: true }).click();
  const still = page.locator('.still-card').first();
  await expect(page.locator('.still-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Fit board', exact: true }).click();
  const draw = still.getByRole('button', { name: 'Draw region', exact: true });
  await draw.click();
  const area = await box(still.locator('.regions'));
  await page.mouse.move(area.x + area.width * 0.2, area.y + area.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.6, area.y + area.height * 0.6, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(draw).toHaveAttribute('aria-pressed', 'false');
  await expect(still.locator('[data-region-id]')).toHaveCount(0);
  await expect(still.locator('.region--preview')).toBeHidden();

  const segment = player.getByRole('button', { name: 'Select video segment', exact: true });
  await segment.click();
  const editor = page.locator('.segment-editor');
  await expect(editor).toHaveCount(1);
  await draw.click();
  await expect(editor).toHaveCount(0);
  await expect(draw).toHaveAttribute('aria-pressed', 'true');
  await segment.click();
  await expect(draw).toHaveAttribute('aria-pressed', 'false');
  await editor.getByRole('textbox', { name: 'Segment in', exact: true }).fill('invalid');
  await expect(
    editor.getByRole('button', { name: 'Save free quotation', exact: true }),
  ).toBeDisabled();
  await player.getByRole('button', { name: 'Capture still', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(2);
  await expect(editor.getByRole('textbox', { name: 'Segment in', exact: true })).toHaveValue(
    'invalid',
  );
  await segment.click();
  await expect(editor.getByRole('textbox', { name: 'Segment in', exact: true })).not.toHaveValue(
    'invalid',
  );
  await expect(
    editor.getByRole('button', { name: 'Save free quotation', exact: true }),
  ).toBeEnabled();
  await editor.getByRole('button', { name: 'Save free quotation', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.filter((q) => q.kind === 'range')).toHaveLength(1);
  expect((await savedBoard(page)).quotations.filter((q) => q.kind === 'region')).toHaveLength(0);
});

for (const foreignEvent of ['pointerup', 'pointercancel'] as const) {
  test(`range editing ignores another pointer's ${foreignEvent} and Escape retains the last live value`, async ({
    page,
  }) => {
    await openVideo(page);
    await page
      .locator('.video-card')
      .getByRole('button', { name: 'Create clip at playhead', exact: true })
      .click();
    await page.getByRole('button', { name: 'Fit board', exact: true }).click();
    const track = page.locator('.clip-card .range-track');
    const handle = page.locator('.clip-card .range-handle--end');
    const start = await box(handle);
    const x = start.x + start.width / 2,
      y = start.y + start.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    try {
      await page.mouse.move(x - 20, y, { steps: 4 });
      const first = Number(await handle.getAttribute('aria-valuenow'));
      await track.dispatchEvent(foreignEvent, { pointerId: 99 });
      await page.mouse.move(x - 40, y, { steps: 4 });
      await expect
        .poll(async () => Number(await handle.getAttribute('aria-valuenow')))
        .toBeLessThan(first - 0.05);
      await page.keyboard.press('Escape');
      const cancelled = Number(await handle.getAttribute('aria-valuenow'));
      await page.mouse.move(x - 60, y, { steps: 4 });
      expect(Number(await handle.getAttribute('aria-valuenow'))).toBeCloseTo(cancelled, 6);
    } finally {
      await page.mouse.up();
    }
  });
}

for (const cancellation of ['blur', 'lost capture'] as const) {
  test(`range editing ends on ${cancellation} while keeping its latest applied value`, async ({
    page,
  }) => {
    await openVideo(page);
    await page
      .locator('.video-card')
      .getByRole('button', { name: 'Create clip at playhead', exact: true })
      .click();
    await page.getByRole('button', { name: 'Fit board', exact: true }).click();
    const track = page.locator('.clip-card .range-track');
    const handle = page.locator('.clip-card .range-handle--end');
    const start = await box(handle);
    const x = start.x + start.width / 2,
      y = start.y + start.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    try {
      await page.mouse.move(x - 20, y, { steps: 4 });
      const applied = Number(await handle.getAttribute('aria-valuenow'));
      if (cancellation === 'blur')
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      else await track.evaluate((element) => element.releasePointerCapture(1));
      await page.mouse.move(x - 40, y, { steps: 4 });
      expect(Number(await handle.getAttribute('aria-valuenow'))).toBeCloseTo(applied, 6);
    } finally {
      await page.mouse.up();
    }
  });
}
