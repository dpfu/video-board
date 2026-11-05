import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import {
  test,
  expect,
  assetHash,
  box,
  dragBy,
  openVideo,
  savedBoard,
  scrub,
  waitSaved,
} from './helpers';

test('shot clips preview silently and independently; duplicate views share coding and nested ranges survive trimming', async ({
  page,
}, testInfo) => {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Add videos', exact: true })).toBeEnabled();
  await page
    .locator('input[type=file][accept^="video/"]')
    .setInputFiles(fileURLToPath(new URL('./fixtures/scenes.webm', import.meta.url)));
  await expect.poll(async () => (await savedBoard(page))?.videos[0]?.analysis).toBe('ready');
  await scrub(page, page.locator('.video-card').getByRole('slider'), 0.48);
  await page.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  const clip = page.locator('.clip-card').first();
  await expect(clip).toBeVisible();
  await waitSaved(page);
  await expect(clip.locator('.clip-poster')).toHaveAttribute('data-cover-ready', 'true');
  let state = await savedBoard(page);
  const qid = state.clips[0].quotationId,
    sourceId = state.videos[0].id;
  expect(state.quotations.find((q) => q.id === qid)).toMatchObject({ start: 2, end: 3, sourceId });
  const sourceTime = state.videos[0].time;
  await clip.locator('.clip-media').hover();
  await expect(clip.locator('video')).toHaveCount(1);
  await expect
    .poll(() => clip.locator('video').evaluate((el) => !(el as HTMLVideoElement).paused))
    .toBe(true);
  expect(await clip.locator('video').evaluate((el) => (el as HTMLVideoElement).muted)).toBe(true);
  await page.waitForTimeout(1250);
  const previewTime = await clip
    .locator('video')
    .evaluate((el) => (el as HTMLVideoElement).currentTime);
  expect(previewTime).toBeGreaterThanOrEqual(2);
  expect(previewTime).toBeLessThan(3.1);
  expect(
    await page.locator('.video-card video').evaluate((el) => (el as HTMLVideoElement).currentTime),
  ).toBeCloseTo(sourceTime, 2);
  await page.mouse.move(30, 75);
  await expect(clip.locator('video')).toHaveCount(0);
  await clip.getByRole('slider', { name: 'Scrub clip', exact: true }).focus();
  await clip.getByRole('slider', { name: 'Scrub clip', exact: true }).press('ArrowRight');
  await expect(clip.locator('video')).toHaveCount(1);
  await expect
    .poll(() => clip.locator('video').evaluate((el) => (el as HTMLVideoElement).paused))
    .toBe(true);
  await expect
    .poll(() => clip.locator('video').evaluate((el) => (el as HTMLVideoElement).currentTime))
    .toBeCloseTo(2.04, 2);
  expect(
    await page.locator('.video-card video').evaluate((el) => (el as HTMLVideoElement).currentTime),
  ).toBeCloseTo(sourceTime, 2);
  await clip.getByRole('button', { name: 'Duplicate clip view', exact: true }).click();
  await expect(page.locator('.clip-card')).toHaveCount(2);
  await waitSaved(page);
  expect(new Set((await savedBoard(page)).clips.map((c) => c.quotationId)).size).toBe(1);

  await page.getByRole('button', { name: 'Open codes and quotations', exact: true }).click();
  const codes = page.locator('.codes-card');
  await codes.getByRole('textbox', { name: 'New code name', exact: true }).fill('Gesture');
  await codes.getByRole('button', { name: 'Create code', exact: true }).click();
  await codes
    .getByRole('textbox', { name: 'Quotation memo', exact: true })
    .fill('An observation across both player views.');
  await clip.getByRole('button', { name: 'Select segment in clip', exact: true }).click();
  const start = codes.getByRole('textbox', { name: 'Segment in', exact: true }),
    end = codes.getByRole('textbox', { name: 'Segment out', exact: true });
  await start.fill('00:02.250');
  await start.press('Tab');
  await end.fill('00:02.750');
  await end.press('Tab');
  await codes.getByRole('button', { name: 'Save free quotation', exact: true }).click();
  await clip.locator('.card-title').click();
  await expect(codes.locator('[data-editing-quotation]')).toHaveAttribute(
    'data-editing-quotation',
    qid,
  );
  await clip.getByRole('textbox', { name: 'Clip out', exact: true }).fill('00:02.500');
  await clip.getByRole('textbox', { name: 'Clip out', exact: true }).press('Tab');
  await waitSaved(page);
  state = await savedBoard(page);
  expect(state.quotations.find((q) => q.id === qid)).toMatchObject({
    start: 2,
    end: 2.5,
    memo: 'An observation across both player views.',
    codeIds: [state.codes[0].id],
  });
  expect(state.quotations.find((q) => q.parentId === qid)).toMatchObject({
    start: 2.25,
    end: 2.75,
    codeIds: [],
  });
  await codes.locator('.code-retrieve').click();
  await expect(codes.locator('[data-quotation-result]')).toHaveCount(1);
  const codeId = state.codes[0].id;
  await codes.getByRole('textbox', { name: 'Code name', exact: true }).fill('Gesture revised');
  await codes
    .getByRole('textbox', { name: 'Code definition', exact: true })
    .fill('Visible gestures, broadly understood.');
  await waitSaved(page);
  state = await savedBoard(page);
  expect(state.codes[0].id).toBe(codeId);
  const csvDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export quotations as CSV', exact: true }).click();
  const csvPath = testInfo.outputPath('quotations.csv');
  await (await csvDownload).saveAs(csvPath);
  const csv = await readFile(csvPath, 'utf8');
  expect(csv).toContain('Gesture revised');
  expect(csv).toContain('2.75');
  expect(csv.split(`"${qid}","${sourceId}"`)).toHaveLength(2);
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const backupPath = testInfo.outputPath('coded-clips.videoboard.zip');
  await (await backupDownload).saveAs(backupPath);
  const zip = await JSZip.loadAsync(await readFile(backupPath));
  expect(zip.filter((path) => path.startsWith('assets/') && !path.endsWith('/'))).toHaveLength(13);
  const invalid = structuredClone(state);
  invalid.quotations.find((q) => q.id === qid)!.sourceId = 'missing-source';
  zip.file('board.json', JSON.stringify(invalid));
  await page.locator('input[type=file][accept=".zip"]').setInputFiles({
    name: 'bad-quotation.zip',
    mimeType: 'application/zip',
    buffer: await zip.generateAsync({ type: 'nodebuffer' }),
  });
  await expect(page.getByRole('alert')).toContainText('Invalid quotation');
  expect((await savedBoard(page)).quotations).toEqual(state.quotations);
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('clips-coding.png') });
  const recovery = page.waitForEvent('download');
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(backupPath);
  await (await recovery).saveAs(testInfo.outputPath('before-reopen.zip'));
  await waitSaved(page);
  expect((await savedBoard(page)).quotations).toEqual(state.quotations);
  expect((await savedBoard(page)).clips).toEqual(state.clips);
  await page.reload();
  await expect(page.locator('.clip-card')).toHaveCount(2);
  await waitSaved(page);
  expect((await savedBoard(page)).codes).toEqual(state.codes);
  await page.getByRole('button', { name: 'Create clips from all shots', exact: true }).click();
  await expect.poll(async () => (await savedBoard(page)).clips.length).toBe(7);
  await waitSaved(page);
  expect(
    (await savedBoard(page)).quotations
      .filter((q) => q.kind === 'range' && q.id !== qid && q.parentId !== qid)
      .map((q) => [q.start, q.end]),
  ).toEqual([
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
  ]);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await expect(page.locator('.clip-card')).toHaveCount(2);
  await waitSaved(page);
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export board as PNG', exact: true }).click();
  await (await pngDownload).saveAs(testInfo.outputPath('clips-board.png'));
});

test('whole-video and whole-frame coding use a compact popover; free source segments stay uncoded and hidden sources remain retrievable', async ({
  page,
}) => {
  const source = await openVideo(page),
    originalHash = await assetHash(page, source.id);
  await page.getByRole('button', { name: 'Code whole video', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Code quotation', exact: true });
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).fill('Context');
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).press('Enter');
  await expect(popover.getByRole('button', { name: 'Apply Context', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await popover
    .getByRole('textbox', { name: 'Selection memo', exact: true })
    .fill('Whole-source context.');
  await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  const still = page.locator('.still-card');
  await expect(still).toBeVisible();
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.kind === 'frame')?.codeIds).toEqual([]);
  await still.getByRole('button', { name: 'Code still', exact: true }).click();
  await popover.getByRole('button', { name: 'Apply Context', exact: true }).click();
  await popover.getByRole('button', { name: 'Open codes & quotations', exact: true }).click();
  await page.getByRole('button', { name: 'Select video segment', exact: true }).click();
  const panel = page.locator('.codes-card');
  await panel.getByRole('textbox', { name: 'Segment out', exact: true }).fill('00:03.250');
  await panel.getByRole('textbox', { name: 'Segment out', exact: true }).press('Tab');
  await panel.getByRole('textbox', { name: 'Segment in', exact: true }).fill('00:01.250');
  await panel.getByRole('textbox', { name: 'Segment in', exact: true }).press('Tab');
  await panel.getByRole('button', { name: 'Save free quotation', exact: true }).click();
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.kind === 'range')).toMatchObject({
    start: 1.25,
    end: 3.25,
    sourceId: source.id,
    codeIds: [],
  });
  await panel.locator('.code-retrieve').click();
  await expect(panel.locator('[data-quotation-result]')).toHaveCount(2);
  const before = await savedBoard(page);
  await page.getByRole('button', { name: 'Hide source player', exact: true }).click();
  await expect(page.locator('.video-card')).toHaveCount(0);
  await waitSaved(page);
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
  expect(await assetHash(page, source.id)).toBe(originalHash);
  await panel.getByRole('tab', { name: 'Sources', exact: true }).click();
  await panel.locator('.source-list button').click();
  await expect(page.locator('.video-card')).toHaveCount(1);
  await waitSaved(page);
  expect(await assetHash(page, source.id)).toBe(originalHash);
  expect((await savedBoard(page)).quotations).toEqual(before.quotations);
});

test('rectangular free regions retain geometry and coding through retiming, undo, resize, duplicate views and ZIP reopen', async ({
  page,
}, testInfo) => {
  await openVideo(page);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  const still = page.locator('.still-card').first();
  await expect(still).toBeVisible();
  await still.getByRole('button', { name: 'Draw region', exact: true }).click();
  const image = await box(still.locator('.regions'));
  await page.mouse.move(image.x + image.width * 0.1, image.y + image.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width * 0.6, image.y + image.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await expect(still.locator('.region:not(.region--preview)')).toHaveCount(1);
  await page.keyboard.press('Escape');
  const codes = page.locator('.codes-card');
  await codes.getByRole('textbox', { name: 'New code name', exact: true }).fill('Attention');
  await codes.getByRole('button', { name: 'Create code', exact: true }).click();
  await codes
    .getByRole('textbox', { name: 'Quotation memo', exact: true })
    .fill('The selected area stays in place.');
  await waitSaved(page);
  let state = await savedBoard(page);
  const before = state.quotations.find((q) => q.kind === 'region')!,
    stillId = state.stills[0].id,
    frameId = state.stills[0].quotationId;
  const hash = await assetHash(page, stillId);
  const timecode = still.getByRole('textbox', { name: /^Still timecode/ });
  await timecode.fill('00:01.250');
  await timecode.press('Tab');
  await expect
    .poll(async () => (await savedBoard(page)).quotations.find((q) => q.id === before.id)?.start)
    .toBeCloseTo(1.25, 5);
  state = await savedBoard(page);
  expect(state.quotations.find((q) => q.id === before.id)).toMatchObject({
    id: before.id,
    rect: before.rect,
    codeIds: before.codeIds,
    memo: before.memo,
  });
  expect(await assetHash(page, stillId)).not.toBe(hash);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.id === before.id)?.start).toBe(
    before.start,
  );
  expect(await assetHash(page, stillId)).toBe(hash);
  await timecode.fill('00:01.250');
  await timecode.press('Tab');
  await expect.poll(async () => (await savedBoard(page)).stills[0].time).toBeCloseTo(1.25, 5);
  await dragBy(page, still.locator('.resize-handle'), 130, 140);
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.id === before.id)?.rect).toEqual(
    before.rect,
  );
  const contained = await box(still.locator('.region-image-space')),
    card = await box(still);
  expect(contained.height).toBeLessThan(card.height - 52); // letterboxing is excluded
  const region = still.locator('.region:not(.region--preview)');
  await dragBy(page, region, 12, 8);
  await waitSaved(page);
  expect(
    (await savedBoard(page)).quotations.find((q) => q.id === before.id)!.rect!.x,
  ).toBeGreaterThan(before.rect!.x);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.id === before.id)?.rect).toEqual(
    before.rect,
  );
  await region.focus();
  await region.press('Enter');
  await dragBy(page, region.locator('[data-corner=se]'), 14, 9);
  await waitSaved(page);
  expect(
    (await savedBoard(page)).quotations.find((q) => q.id === before.id)!.rect!.width,
  ).toBeGreaterThan(before.rect!.width);
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.id === before.id)?.rect).toEqual(
    before.rect,
  );
  await still.getByRole('button', { name: 'Duplicate still view', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(2);
  await waitSaved(page);
  state = await savedBoard(page);
  expect(new Set(state.stills.map((s) => s.quotationId))).toEqual(new Set([frameId]));
  expect(state.quotations.filter((q) => q.kind === 'region')).toHaveLength(1);
  expect(new Set(state.stills.map((s) => s.assetId)).size).toBe(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const backup = testInfo.outputPath('regions.videoboard.zip');
  await (await download).saveAs(backup);
  await page.screenshot({ path: testInfo.outputPath('regions-coding.png') });
  const recovery = page.waitForEvent('download');
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(backup);
  await (await recovery).saveAs(testInfo.outputPath('before-region-reopen.zip'));
  await waitSaved(page);
  expect((await savedBoard(page)).quotations).toEqual(state.quotations);
  await expect(page.locator('.region:not(.region--preview)')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.still-card')).toHaveCount(2);
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.id === before.id)).toMatchObject({
    rect: before.rect,
    start: 1.25,
    memo: before.memo,
    codeIds: before.codeIds,
  });
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export board as PNG', exact: true }).click();
  await (await pngDownload).saveAs(testInfo.outputPath('regions-board.png'));
});

test('settling can be grabbed without a jump, and reduced motion preserves exact manipulation and scrubbing', async ({
  page,
}) => {
  await openVideo(page);
  const audio = page.locator('[data-track-kind=waveform]');
  await audio.getByRole('button', { name: 'Undock module', exact: true }).click();
  await audio.evaluate((el) =>
    Promise.all(
      el.getAnimations().map(async (animation) => {
        animation.pause();
        await animation.ready;
      }),
    ),
  );
  const before = await box(audio);
  await page.keyboard.down('Shift');
  await dragBy(page, audio.locator('.track-title'), 42, 17);
  await page.keyboard.up('Shift');
  await waitSaved(page);
  const after = await box(audio);
  expect(after.x - before.x).toBeCloseTo(42, 1);
  expect(after.y - before.y).toBeCloseTo(17, 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(1);
  await waitSaved(page);
  expect(
    await page
      .locator('.board-world')
      .evaluate(
        (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
      ),
  ).toBe(0);
  await scrub(page, audio.getByRole('slider'), 0.4);
  await expect
    .poll(() =>
      page.locator('.video-card video').evaluate((el) => (el as HTMLVideoElement).currentTime),
    )
    .toBeCloseTo(1.6, 1);
  expect(await audio.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
});
