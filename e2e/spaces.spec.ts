import type { Locator, Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, assetHash, box, dragBy, openVideo, savedBoard, waitSaved } from './helpers';

async function newGroup(page: Page, name: string) {
  await page.getByRole('button', { name: 'New evidence group', exact: true }).click();
  const space = page.locator('.space-card').last();
  await space.getByRole('textbox', { name: 'Group name', exact: true }).fill(name);
  const id = await space.getAttribute('data-space-id');
  return page.locator(`[data-space-id="${id}"]`);
}

async function gather(space: Locator, names: string[], live = false) {
  await space.getByRole('button', { name: 'Add evidence', exact: true }).click();
  for (const name of names)
    await space
      .getByRole('button', { name: `Add ${name} to ${live ? 'collection' : 'group'}`, exact: true })
      .click();
  await space.getByRole('button', { name: 'Close evidence picker', exact: true }).click();
}

test('provisional groups arrange shared evidence, move and resize together, promote atomically, and survive Undo and reload', async ({
  page,
}) => {
  await openVideo(page);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(1);
  const space = await newGroup(page, 'Gesture candidates');
  await expect(space.getByRole('button', { name: 'Turn into code', exact: true })).toBeDisabled();
  await space
    .getByRole('textbox', { name: 'Group memo', exact: true })
    .fill('Compare how attention is organized.');
  await gather(space, ['synthetic.webm', 'Still']);
  await expect(space.locator('.evidence-tile')).toHaveCount(2);
  await waitSaved(page);
  const beforeArrange = await savedBoard(page);
  const frame = beforeArrange.quotations.find((q) => q.kind === 'frame')!;
  const grip = space.getByRole('button', { name: 'Move Still', exact: true });
  await grip.dragTo(space.locator('.space-canvas'), { targetPosition: { x: 380, y: 205 } });
  await waitSaved(page);
  const arranged = (await savedBoard(page)).spaces[0].items.find(
    (item) => item.quotationId === frame.id,
  )!;
  expect(arranged.x).toBeGreaterThan(300);
  await grip.press('Shift+ArrowRight');
  await waitSaved(page);
  const nudged = (await savedBoard(page)).spaces[0].items.find(
    (item) => item.quotationId === frame.id,
  )!;
  expect(nudged.x).toBeCloseTo(arranged.x + 10, 4);

  const beforeMove = await savedBoard(page);
  await page.keyboard.down('Shift');
  await dragBy(page, space.locator('.space-mode'), 28, -18);
  await page.keyboard.up('Shift');
  await waitSaved(page);
  const moved = await savedBoard(page);
  expect(moved.spaces[0].x).toBeCloseTo(beforeMove.spaces[0].x + 28, 3);
  expect(moved.spaces[0].items).toEqual(beforeMove.spaces[0].items);
  expect(moved.videos[0].x).toBe(beforeMove.videos[0].x);
  await dragBy(
    page,
    space.getByRole('button', { name: 'Resize evidence space', exact: true }),
    50,
    12,
  );
  await waitSaved(page);
  const resized = await savedBoard(page);
  expect(resized.spaces[0].width).toBeCloseTo(moved.spaces[0].width + 50, 3);
  expect(resized.spaces[0].items).toEqual(moved.spaces[0].items);
  expect(resized.codes).toEqual([]);
  expect(resized.quotations.every((q) => q.codeIds.length === 0)).toBe(true);

  await space.getByRole('button', { name: 'Turn into code', exact: true }).click();
  await expect(space.locator('.space-mode')).toHaveText('LIVE');
  await waitSaved(page);
  const promoted = await savedBoard(page);
  expect(promoted.codes).toHaveLength(1);
  expect(promoted.spaces[0]).toMatchObject({
    codeId: promoted.codes[0].id,
    memo: resized.spaces[0].memo,
    items: resized.spaces[0].items,
  });
  expect(promoted.quotations.every((q) => q.codeIds.includes(promoted.codes[0].id))).toBe(true);
  expect(promoted.quotations.map((q) => q.id)).toEqual(resized.quotations.map((q) => q.id));
  await page.getByRole('button', { name: 'Undo last edit', exact: true }).click();
  await expect(space.locator('.space-mode')).toHaveText('GROUP');
  await waitSaved(page);
  expect((await savedBoard(page)).codes).toEqual([]);
  expect((await savedBoard(page)).spaces[0].items).toEqual(resized.spaces[0].items);
  await space.getByRole('button', { name: 'Turn into code', exact: true }).click();
  await waitSaved(page);
  const saved = await savedBoard(page);
  await page.reload();
  await expect(page.locator('.space-mode')).toHaveText('LIVE');
  await waitSaved(page);
  expect((await savedBoard(page)).spaces).toEqual(saved.spaces);
});

test('large live collections keep rendering and decoding bounded while scrolling and previewing', async ({
  page,
}) => {
  await openVideo(page);
  await waitSaved(page);
  const board = await savedBoard(page);
  const sourceQuote = board.quotations[0];
  board.videos[0].hidden = true;
  board.tracks = [];
  board.codes = [{ id: 'review', name: 'Review', color: '#b7cde5', definition: '' }];
  board.quotations = [
    sourceQuote,
    ...Array.from({ length: 250 }, (_, index) => ({
      ...sourceQuote,
      id: `excerpt-${index}`,
      kind: 'range' as const,
      title: `Excerpt ${String(index).padStart(3, '0')}`,
      start: 1,
      end: 2,
      parentId: sourceQuote.id,
      codeIds: ['review'],
    })),
  ];
  board.spaces = [
    {
      id: 'review-space',
      kind: 'space',
      name: '',
      memo: '',
      codeId: 'review',
      items: [],
      x: 80,
      y: 50,
      width: 700,
      height: 540,
      z: 10,
    },
  ];
  board.camera = { x: 0, y: 0, scale: 1 };
  // This test context owns its generated-media database; no working profile is used.
  await page.evaluate(async (board) => {
    const request = indexedDB.open('video-board', 1);
    const db = await new Promise<IDBDatabase>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    try {
      const tx = db.transaction('boards', 'readwrite');
      tx.objectStore('boards').put(board, 'current');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, board);
  await page.reload();
  const space = page.locator('.space-card');
  await expect(space.locator('.space-count')).toHaveText('250 quotations');
  await expect.poll(() => space.locator('.evidence-tile').count()).toBeLessThan(18);
  await space.getByRole('button', { name: 'Play preview: Excerpt 000', exact: true }).click();
  const player = space.locator('video');
  await expect
    .poll(() => player.evaluate((video) => !(video as HTMLVideoElement).paused))
    .toBe(true);
  await space.locator('.space-viewport').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(space.locator('[data-evidence-id="excerpt-249"]')).toBeVisible();
  await expect(space.locator('video')).toHaveCount(1);
  await expect.poll(() => space.locator('.evidence-tile').count()).toBeLessThan(18);
  await space.getByRole('button', { name: 'Stop preview: Excerpt 000', exact: true }).click();
  await expect(space.locator('video')).toHaveCount(0);
  await space.getByRole('button', { name: 'Add evidence', exact: true }).click();
  await space.getByRole('searchbox', { name: 'Find evidence', exact: true }).fill('Excerpt 249');
  await expect(space.locator('.space-picker-results > button')).toHaveCount(1);
  await space.getByRole('checkbox', { name: /Uncoded only/ }).check();
  await expect(space.locator('.space-picker-results > button')).toHaveCount(0);
});

test('a code opens by button or native drag, follows assignments and renames, and closing it preserves evidence', async ({
  page,
}) => {
  const source = await openVideo(page);
  const originalHash = await assetHash(page, source.id);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Code whole video', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Code quotation', exact: true });
  await popover
    .getByRole('textbox', { name: 'Find or create code', exact: true })
    .fill('Attention');
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).press('Enter');
  await popover.getByRole('button', { name: 'Open codes & quotations', exact: true }).click();
  const panel = page.locator('.codes-card');
  await panel
    .getByRole('button', { name: 'Open live collection for Attention', exact: true })
    .click();
  await expect(page.locator('.space-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Close live collection', exact: true }).click();
  await expect(page.locator('.space-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Open codes and quotations', exact: true }).click();
  await panel
    .locator('.code-retrieve')
    .dragTo(page.locator('.board'), { targetPosition: { x: 850, y: 700 } });
  const space = page.locator('.space-card');
  await expect(space.locator('.space-mode')).toHaveText('LIVE');
  await expect(space.locator('.evidence-tile')).toHaveCount(1);
  await gather(space, ['Still'], true);
  await expect(space.locator('.evidence-tile')).toHaveCount(2);
  await space
    .getByRole('textbox', { name: 'Collection memo', exact: true })
    .fill('A comparison across evidence types.');
  await space
    .getByRole('textbox', { name: 'Collection code name', exact: true })
    .fill('Attention revised');
  await expect(page.locator('.video-card .media-codes')).toHaveText('Attention revised');
  await space
    .getByRole('button', { name: 'Remove Attention revised from synthetic.webm', exact: true })
    .click();
  await expect(space.locator('.evidence-tile')).toHaveCount(1);
  await waitSaved(page);
  const beforeClose = await savedBoard(page);
  expect(beforeClose.quotations.find((q) => q.kind === 'video')!.codeIds).toEqual([]);
  expect(beforeClose.quotations.find((q) => q.kind === 'frame')!.codeIds).toEqual([
    beforeClose.codes[0].id,
  ]);
  await space.getByRole('button', { name: 'Close live collection', exact: true }).click();
  await waitSaved(page);
  const closed = await savedBoard(page);
  expect(closed.spaces).toEqual([]);
  expect(closed.quotations).toEqual(beforeClose.quotations);
  expect(closed.codes).toEqual(beforeClose.codes);
  expect(await assetHash(page, source.id)).toBe(originalHash);
});

test('mixed region and clip evidence stays linked through retiming, copying out, promotion reuse, PNG and fresh ZIP restore', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(60_000);
  const source = await openVideo(page);
  const originalHash = await assetHash(page, source.id);
  await page.getByRole('button', { name: 'Create clip at playhead', exact: true }).click();
  await expect(page.locator('.clip-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  const still = page.locator('.still-card');
  await expect(still).toHaveCount(1);
  await still.getByRole('button', { name: 'Draw region', exact: true }).click();
  const image = await box(still.locator('.regions'));
  await page.mouse.move(image.x + image.width * 0.2, image.y + image.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width * 0.65, image.y + image.height * 0.7, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  const panel = page.locator('.codes-card');
  await panel.getByRole('textbox', { name: 'Quotation title', exact: true }).fill('Hand area');
  await panel
    .getByRole('textbox', { name: 'Quotation memo', exact: true })
    .fill('Follow the visible gesture.');
  const space = await newGroup(page, 'Gesture');
  await gather(space, ['Hand area', 'Segment']);
  await space
    .getByRole('textbox', { name: 'Group memo', exact: true })
    .fill('Two forms of the same evidence.');
  await space.getByRole('button', { name: 'Turn into code', exact: true }).click();
  await expect(space.locator('.evidence-region')).toHaveCount(1);
  await waitSaved(page);
  const beforeRetime = await savedBoard(page);
  const region = beforeRetime.quotations.find((q) => q.kind === 'region')!;
  await page.getByRole('button', { name: 'Fit board', exact: true }).click();
  await still.getByRole('button', { name: 'Next frame', exact: true }).click();
  await expect
    .poll(async () => (await savedBoard(page)).quotations.find((q) => q.id === region.id)!.start)
    .toBeGreaterThan(region.start);
  const afterRetime = (await savedBoard(page)).quotations.find((q) => q.id === region.id)!;
  expect(afterRetime.rect).toEqual(region.rect);
  expect(afterRetime.codeIds).toEqual(region.codeIds);
  expect(afterRetime.memo).toBe(region.memo);
  expect(
    await space
      .locator(`[data-evidence-id="${region.id}"] .evidence-region`)
      .evaluate((element) => parseFloat((element as HTMLElement).style.left)),
  ).toBeCloseTo(region.rect!.x * 100, 4);

  await still.getByRole('button', { name: 'Remove still view', exact: true }).click();
  await expect(still).toHaveCount(0);
  const regionTile = space.locator(`[data-evidence-id="${region.id}"]`);
  await expect(regionTile.locator('img')).toHaveCount(1);
  await expect
    .poll(() =>
      regionTile.locator('img').evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0);
  await regionTile.getByRole('button', { name: 'Reveal Hand area in source', exact: true }).click();
  await expect(still).toHaveCount(1);
  await waitSaved(page);
  expect((await savedBoard(page)).quotations.find((q) => q.id === region.id)).toEqual(afterRetime);

  const second = await newGroup(page, 'Gesture');
  await page.getByRole('button', { name: 'Fit board', exact: true }).click();
  await space
    .getByRole('button', { name: 'Move Hand area', exact: true })
    .dragTo(second.locator('.space-canvas'), { targetPosition: { x: 45, y: 45 } });
  await expect(second.locator('.evidence-tile')).toHaveCount(1);
  await expect(space.locator('.evidence-tile')).toHaveCount(2);
  await second.getByRole('button', { name: 'Turn into code', exact: true }).click();
  await expect(second.locator('.space-mode')).toHaveText('LIVE');
  await waitSaved(page);
  expect((await savedBoard(page)).codes).toHaveLength(1);
  await expect(second.locator('.evidence-tile')).toHaveCount(2);
  await second.getByRole('button', { name: 'Play preview: Segment', exact: true }).click();
  const preview = page.locator('.evidence-tile video');
  await expect(preview).toHaveCount(1);
  await expect
    .poll(() => preview.evaluate((video) => (video as HTMLVideoElement).readyState))
    .toBeGreaterThanOrEqual(2);
  expect(await preview.evaluate((video) => (video as HTMLVideoElement).muted)).toBe(true);
  await second.getByRole('button', { name: 'Stop preview: Segment', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await waitSaved(page);
  const state = await savedBoard(page);
  expect(state.quotations).toHaveLength(4);
  expect(await assetHash(page, source.id)).toBe(originalHash);
  const pngDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export board as PNG', exact: true }).click();
  const pngPath = testInfo.outputPath('evidence-spaces.png');
  await (await pngDownload).saveAs(pngPath);
  expect((await readFile(pngPath)).subarray(1, 4).toString()).toBe('PNG');
  const backupDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const backupPath = testInfo.outputPath('evidence-spaces.videoboard.zip');
  await (await backupDownload).saveAs(backupPath);
  const zip = await JSZip.loadAsync(await readFile(backupPath));
  expect(zip.filter((path) => path === `assets/${source.id}`)).toHaveLength(1);
  const restoredContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const restored = await restoredContext.newPage();
    const errors: string[] = [];
    restored.on('pageerror', (error) => errors.push(error.message));
    await restored.goto(page.url());
    await restored.locator('input[type=file][accept=".zip"]').setInputFiles(backupPath);
    await expect(restored.locator('.space-card')).toHaveCount(2);
    await waitSaved(restored);
    const reopened = await savedBoard(restored);
    expect(reopened.version).toBe(4);
    expect(reopened.spaces).toEqual(state.spaces);
    expect(reopened.quotations).toEqual(state.quotations);
    expect(reopened.codes).toEqual(state.codes);
    expect(await assetHash(restored, source.id)).toBe(originalHash);
    expect(errors).toEqual([]);
  } finally {
    await restoredContext.close();
  }
});
