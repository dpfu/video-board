import type { Locator, Page } from '@playwright/test';
import { collectionFixture } from './board-fixtures';
import {
  test,
  expect,
  assetHash,
  box,
  openVideo,
  savedBoard,
  seedBoard,
  waitSaved,
} from './helpers';
import { pngColorBands } from './media-assertions';

/** Native HTML drag uses physical pointer coordinates, including transformed canvases. */
async function dropAt(page: Page, handle: Locator, point: { x: number; y: number }) {
  await handle.hover();
  const from = await box(handle);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  try {
    await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 3 });
    await page.mouse.move(point.x, point.y, { steps: 12 });
    await page.mouse.move(point.x + 1, point.y);
  } finally {
    await page.mouse.up();
  }
}

test('same-project restore rebuilds collection covers and PNG includes scrolled-out evidence', async ({
  page,
}, testInfo) => {
  const source = await openVideo(page);
  const originalHash = await assetHash(page, source.id);
  const fixture = collectionFixture(await savedBoard(page));
  fixture.spaces[0].memo = 'Saved interpretation.';
  fixture.spaces[0].items = [
    { quotationId: 'excerpt-0', x: 12, y: 12 },
    { quotationId: 'excerpt-1', x: 228, y: 500 },
  ];
  await seedBoard(page, fixture);
  const space = page.locator('.space-card');
  const cover = space.locator('[data-evidence-id="excerpt-0"] img');
  await expect
    .poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(320);
  const oldURL = await cover.getAttribute('src');
  expect(oldURL).toBeTruthy();
  await expect(space.locator('[data-evidence-id="excerpt-1"]')).toHaveCount(0);
  const before = await savedBoard(page);

  await test.step('Export image content even when its tile is not mounted', async () => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export board as PNG', exact: true }).click();
    const path = testInfo.outputPath('scrolled-collection.png');
    await (await download).saveAs(path);
    const image = await pngColorBands(page, path);
    expect(image.width).toBeGreaterThan(800);
    expect(image.height).toBeGreaterThan(600);
    // Only the two synthetic video images have this saturation. UI/code colours
    // are deliberately excluded, so an empty frame or missing second tile fails.
    expect(image.bands[0], 'Visible quotation appears in the upper image band').toBeGreaterThan(
      1000,
    );
    expect(
      image.bands[2],
      'Scrolled-out quotation appears in the lower image band',
    ).toBeGreaterThan(1000);
  });

  await test.step('Reopen identical quotation/space IDs in the same browser session', async () => {
    const backup = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
    const path = testInfo.outputPath('same-project.videoboard.zip');
    await (await backup).saveAs(path);
    await space
      .getByRole('textbox', { name: 'Collection memo', exact: true })
      .fill('More recent work.');
    await waitSaved(page);
    const recovery = page.waitForEvent('download');
    await page.locator('input[type=file][accept=".zip"]').setInputFiles(path);
    await (await recovery).saveAs(testInfo.outputPath('before-open.videoboard.zip'));
    await expect(space.getByRole('textbox', { name: 'Collection memo', exact: true })).toHaveValue(
      before.spaces[0].memo,
    );
    await waitSaved(page);
    await expect(cover).not.toHaveAttribute('src', oldURL!);
    await expect
      .poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBe(320);
    const after = await savedBoard(page);
    expect(after.spaces).toEqual(before.spaces);
    expect(after.quotations).toEqual(before.quotations);
    expect(await assetHash(page, source.id)).toBe(originalHash);
  });
});

test('coding changes outside a tile release pinned playback and deleted quotations leave no stale views', async ({
  page,
}) => {
  await openVideo(page);
  await seedBoard(page, collectionFixture(await savedBoard(page)));
  const space = page.locator('.space-card');
  const first = space.locator('[data-evidence-id="excerpt-0"]');
  const second = space.locator('[data-evidence-id="excerpt-1"]');
  const popover = page.getByRole('dialog', { name: 'Code quotation', exact: true });
  await test.step('Removing an assignment outside its collection cancels the pinned preview', async () => {
    await first.getByRole('button', { name: 'Play preview: Excerpt 000', exact: true }).click();
    await expect
      .poll(() => first.locator('video').evaluate((video) => (video as HTMLVideoElement).paused))
      .toBe(false);
    await first.getByRole('button', { name: 'Code Excerpt 000', exact: true }).click();
    await popover.getByRole('button', { name: 'Apply Review', exact: true }).click();
    await expect(first).toHaveCount(0);
    // Close only the popover: Escape would itself clear preview state and mask a bug.
    await popover.getByRole('button', { name: 'Close coding popover', exact: true }).click();
    await second.locator('.evidence-image').hover();
    await expect(second.locator('video')).toHaveCount(1);
    await expect
      .poll(() => second.locator('video').evaluate((video) => (video as HTMLVideoElement).paused))
      .toBe(false);
    expect(
      await second.locator('video').evaluate((video) => (video as HTMLVideoElement).muted),
    ).toBe(true);
    await waitSaved(page);
    expect((await savedBoard(page)).quotations.find((q) => q.id === 'excerpt-0')!.codeIds).toEqual(
      [],
    );
  });
  await test.step('Deleting the remaining quotation removes its linked view and playback', async () => {
    await second.getByRole('button', { name: 'Play preview: Excerpt 001', exact: true }).click();
    await second.getByRole('button', { name: 'Code Excerpt 001', exact: true }).click();
    await popover.getByRole('button', { name: 'Open codes & quotations', exact: true }).click();
    await page
      .locator('.codes-card')
      .getByRole('button', { name: 'Delete quotation', exact: true })
      .click();
    await expect(space.locator('.space-count')).toHaveText('0 quotations');
    await expect(space.locator('video')).toHaveCount(0);
    await expect(space.locator('.evidence-tile')).toHaveCount(0);
    await waitSaved(page);
    const after = await savedBoard(page);
    expect(after.quotations.find((q) => q.id === 'excerpt-1')).toBeUndefined();
    expect(after.quotations.find((q) => q.id === 'excerpt-0')).toBeDefined();
    expect(after.codes.map((code) => code.id)).toEqual(['review']);
  });
});

for (const scale of [0.6, 1.3]) {
  test(`manual evidence transfers stay under the pointer at ${scale * 100}% zoom with a scrolled destination`, async ({
    page,
  }) => {
    await openVideo(page);
    const fixture = collectionFixture(await savedBoard(page));
    const template = fixture.spaces[0];
    fixture.spaces = [
      {
        ...template,
        id: 'from',
        name: 'First group',
        codeId: undefined,
        x: 0,
        y: 80,
        items: [{ quotationId: 'excerpt-0', x: 12, y: 12 }],
      },
      {
        ...template,
        id: 'to',
        name: 'Second group',
        codeId: undefined,
        x: 800,
        y: 80,
        items: [{ quotationId: 'excerpt-1', x: 900, y: 700 }],
      },
    ];
    fixture.camera = { x: 32, y: 64, scale };
    await seedBoard(page, fixture);
    const before = await savedBoard(page);
    const destination = page.locator('[data-space-id="to"] .space-viewport');
    await destination.evaluate((element) => {
      element.scrollLeft = 200;
      element.scrollTop = 300;
    });
    const viewport = await box(destination);
    const point = { x: viewport.x + 120 * scale, y: viewport.y + 120 * scale };
    await test.step('Move a quotation between provisional groups', async () => {
      await dropAt(
        page,
        page
          .locator('[data-space-id="from"]')
          .getByRole('button', { name: 'Move Excerpt 000', exact: true }),
        point,
      );
      const handle = page
        .locator('[data-space-id="to"]')
        .getByRole('button', { name: 'Move Excerpt 000', exact: true });
      await expect(handle).toHaveCount(1);
      const landed = await box(handle);
      expect(Math.abs(landed.x + landed.width / 2 - point.x)).toBeLessThan(14 * scale);
      expect(Math.abs(landed.y + landed.height / 2 - point.y)).toBeLessThan(14 * scale);
      await expect.poll(async () => (await savedBoard(page)).spaces[0].items.length).toBe(0);
      const transferred = await savedBoard(page);
      expect(transferred.spaces[1].items).toHaveLength(2);
      expect(transferred.quotations).toEqual(before.quotations);
    });
    await test.step('Drag out to create a group while preserving analytical identity', async () => {
      const board = await box(page.locator('.board'));
      await dropAt(
        page,
        page
          .locator('[data-space-id="to"]')
          .getByRole('button', { name: 'Move Excerpt 000', exact: true }),
        { x: board.x + 20, y: board.y + 20 },
      );
      await expect.poll(async () => (await savedBoard(page)).spaces.length).toBe(3);
      const after = await savedBoard(page);
      expect(after.spaces[1].items.map((item) => item.quotationId)).toEqual(['excerpt-1']);
      expect(after.spaces[2].items.map((item) => item.quotationId)).toEqual(['excerpt-0']);
      expect(after.quotations).toEqual(before.quotations);
      expect(after.codes).toEqual(before.codes);
    });
  });
}
