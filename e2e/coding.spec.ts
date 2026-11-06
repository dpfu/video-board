import type { Locator, Page } from '@playwright/test';
import { test, expect, box, dragBy, openVideo, savedBoard, scrub, waitSaved } from './helpers';

async function drawRegion(page: Page, still: Locator) {
  await still.getByRole('button', { name: 'Draw region', exact: true }).click();
  const image = await box(still.locator('.regions'));
  await page.mouse.move(image.x + image.width * 0.15, image.y + image.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(image.x + image.width * 0.65, image.y + image.height * 0.75, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(still.locator('[data-region-id]')).toHaveCount(1);
}

test('coding stays on a region through frame stepping, text retiming and another linked view', async ({
  page,
}) => {
  await openVideo(page);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  const still = page.locator('.still-card').first(),
    panel = page.locator('.codes-card');
  await drawRegion(page, still);
  await panel.getByRole('textbox', { name: 'Quotation title', exact: true }).fill('Gesture area');
  await panel.getByRole('textbox', { name: 'New code name', exact: true }).fill('Attention');
  await panel.getByRole('button', { name: 'Create code', exact: true }).click();
  await panel
    .getByRole('textbox', { name: 'Quotation memo', exact: true })
    .fill('Keep this area selected.');
  await waitSaved(page);
  const before = (await savedBoard(page)).quotations.find((q) => q.kind === 'region')!;
  await still.getByRole('button', { name: 'Next frame', exact: true }).click();
  await expect
    .poll(async () => (await savedBoard(page)).stills[0].time)
    .toBeGreaterThan(before.start);
  await expect(panel.locator('[data-editing-quotation]')).toHaveAttribute(
    'data-editing-quotation',
    before.id,
  );
  const field = still.getByRole('textbox', { name: /^Still timecode/ });
  await field.fill('00:01.250');
  await field.press('Tab');
  await expect.poll(async () => (await savedBoard(page)).stills[0].time).toBeCloseTo(1.25, 5);
  await expect(panel.locator('[data-editing-quotation]')).toHaveAttribute(
    'data-editing-quotation',
    before.id,
  );
  await still.getByRole('button', { name: 'Duplicate still view', exact: true }).click();
  const other = page.locator('.still-card').nth(1);
  await expect(other.getByText('2 linked views', { exact: true })).toBeVisible();
  await page.keyboard.down('Shift');
  await dragBy(page, other.locator('.card-kind'), 0, 250);
  await page.keyboard.up('Shift');
  await still.locator('[data-region-id]').click();
  await other.getByRole('button', { name: 'Next frame', exact: true }).click();
  await expect.poll(async () => (await savedBoard(page)).stills[0].time).toBeGreaterThan(1.25);
  await expect(panel.locator('[data-editing-quotation]')).toHaveAttribute(
    'data-editing-quotation',
    before.id,
  );
  await panel.getByRole('textbox', { name: 'New code name', exact: true }).fill('Detail');
  await panel.getByRole('button', { name: 'Create code', exact: true }).click();
  await waitSaved(page);
  const after = await savedBoard(page),
    region = after.quotations.find((q) => q.id === before.id)!;
  expect(region).toMatchObject({ rect: before.rect, memo: before.memo, title: before.title });
  expect(region.codeIds).toEqual(after.codes.map((c) => c.id));
  expect(after.quotations.filter((q) => q.kind === 'region')).toHaveLength(1);
  expect(after.quotations.find((q) => q.kind === 'frame')?.codeIds).toEqual([]);
  expect(after.stills[0].assetId).toBe(after.stills[1].assetId);
});

test('draft segments cannot code the previous target; saved segments stay selected during source transport', async ({
  page,
}) => {
  const source = await openVideo(page);
  await page.getByRole('button', { name: 'Code whole video', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Code quotation', exact: true });
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).fill('Context');
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.locator('.video-card .media-codes')).toHaveText('Context');
  await page.getByRole('button', { name: 'Select video segment', exact: true }).click();
  const panel = page.locator('.codes-card');
  await expect(panel.locator('[data-editing-quotation]')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Assign Context', exact: true })).toBeDisabled();
  await expect(panel.getByRole('textbox', { name: 'New code name', exact: true })).toBeDisabled();
  const end = panel.getByRole('textbox', { name: 'Segment out', exact: true });
  await end.fill('invalid');
  await end.press('Tab');
  await expect(end).toHaveAttribute('aria-invalid', 'true');
  await expect(
    panel.getByRole('button', { name: 'Save free quotation', exact: true }),
  ).toBeDisabled();
  await end.press('Escape');
  await expect(end).toHaveValue('00:01.000');
  await expect(
    panel.getByRole('button', { name: 'Save free quotation', exact: true }),
  ).toBeVisible();
  await end.fill('00:02.000');
  await end.press('Tab');
  const start = panel.getByRole('textbox', { name: 'Segment in', exact: true });
  await start.fill('00:01.000');
  await start.press('Tab');
  await panel.getByRole('button', { name: 'Save free quotation', exact: true }).click();
  await waitSaved(page);
  const range = (await savedBoard(page)).quotations.find((q) => q.kind === 'range')!;
  expect(range).toMatchObject({ start: 1, end: 2, codeIds: [] });
  await panel.getByRole('button', { name: 'Assign Context', exact: true }).click();
  await panel.getByRole('button', { name: 'Reveal source context', exact: true }).click();
  const player = page.locator('.video-card');
  await player.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(player.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
  await player.getByRole('button', { name: 'Pause', exact: true }).click();
  await scrub(page, player.getByRole('slider'), 0.7);
  await expect(panel.locator('[data-editing-quotation]')).toHaveAttribute(
    'data-editing-quotation',
    range.id,
  );
  await panel.getByRole('textbox', { name: 'New code name', exact: true }).fill('Segment only');
  await panel.getByRole('button', { name: 'Create code', exact: true }).click();
  await waitSaved(page);
  const after = await savedBoard(page);
  expect(after.quotations.find((q) => q.id === range.id)?.codeIds).toHaveLength(2);
  expect(
    after.quotations.find((q) => q.sourceId === source.id && q.kind === 'video')?.codeIds,
  ).toEqual([after.codes[0].id]);
});

test('code reuse is idempotent across entry points and definition searches retrieve every match', async ({
  page,
}) => {
  await openVideo(page);
  await page.getByRole('button', { name: 'Code whole video', exact: true }).click();
  const popover = page.getByRole('dialog', { name: 'Code quotation', exact: true });
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).fill('Movement');
  await popover.getByRole('textbox', { name: 'Find or create code', exact: true }).press('Enter');
  await popover.getByRole('button', { name: 'Open codes & quotations', exact: true }).click();
  const panel = page.locator('.codes-card');
  await panel.getByRole('textbox', { name: 'New code name', exact: true }).fill(' movement ');
  await panel.getByRole('button', { name: 'Create code', exact: true }).click();
  await waitSaved(page);
  const before = await savedBoard(page);
  expect(before.codes).toHaveLength(1);
  expect(before.quotations.find((q) => q.kind === 'video')?.codeIds).toEqual([before.codes[0].id]);
  await panel.locator('.code-retrieve').click();
  await panel
    .getByRole('textbox', { name: 'Code definition', exact: true })
    .fill('A kinetic observation.');
  await panel.getByRole('tab', { name: 'Codes', exact: true }).click();
  const search = panel.getByRole('searchbox', { name: 'Search codes and quotations', exact: true });
  await search.fill('kinetic');
  await expect(panel.locator('.code-retrieve')).toHaveCount(1);
  await panel.locator('.code-retrieve').click();
  await expect(search).toHaveValue('');
  await expect(panel.locator('[data-quotation-result]')).toHaveCount(1);
  await search.fill(' kinetic ');
  await expect(panel.locator('[data-quotation-result]')).toHaveCount(1);
  await search.fill('');
  await panel.getByRole('textbox', { name: 'Code name', exact: true }).fill('Movement revised');
  await expect(page.locator('.video-card .media-codes')).toHaveText('Movement revised');
  await waitSaved(page);
  expect((await savedBoard(page)).codes[0].id).toBe(before.codes[0].id);
});

test('Undo works from action buttons and Shift+Undo never undoes another edit', async ({
  page,
}) => {
  await openVideo(page);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  await page
    .locator('.still-card')
    .getByRole('button', { name: 'Duplicate still view', exact: true })
    .click();
  await expect(page.locator('.still-card')).toHaveCount(2);
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+z`);
  await expect(page.locator('.still-card')).toHaveCount(1);
  // The app currently has Undo only. Redo's shortcut must not consume Undo.
  await page.locator('.still-card .still-image').focus();
  await page.keyboard.press(`${modifier}+Shift+z`);
  await waitSaved(page);
  expect((await savedBoard(page)).stills).toHaveLength(1);
});

test('retrieval raises covered evidence and reopening Codes reveals the existing offscreen panel', async ({
  page,
}) => {
  await openVideo(page);
  await page.getByRole('button', { name: 'Capture still', exact: true }).click();
  const still = page.locator('.still-card'),
    panel = page.locator('.codes-card');
  await drawRegion(page, still);
  await waitSaved(page);
  expect(
    await page.locator('.board').evaluate((stage) => [stage.scrollLeft, stage.scrollTop]),
    'Focusing evidence must not scroll the workspace independently of its camera',
  ).toEqual([0, 0]);
  await expect(page.getByRole('button', { name: 'Pan board', exact: true })).toBeInViewport({
    ratio: 1,
  });
  const before = await savedBoard(page),
    region = before.quotations.find((q) => q.kind === 'region')!;
  const player = page.locator('.video-card');
  await page.keyboard.down('Shift');
  await dragBy(page, player.locator('.card-title'), 500, 0);
  await page.keyboard.up('Shift');
  await panel.getByRole('tab', { name: 'Quotations', exact: true }).click();
  await panel.locator(`[data-quotation-result="${region.id}"]`).click();
  await waitSaved(page);
  expect((await savedBoard(page)).stills[0].z).toBeGreaterThan(
    (await savedBoard(page)).videos[0].z,
  );
  const r = await box(still.locator('[data-region-id]'));
  expect(
    await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.still-card'), {
      x: r.x + r.width / 2,
      y: r.y + r.height / 2,
    }),
  ).toBe(true);
  await page.mouse.move(40, 900);
  await page.mouse.wheel(1800, 0);
  await expect.poll(async () => (await box(panel)).x).toBeLessThan(0);
  await page.getByRole('button', { name: 'Open codes and quotations', exact: true }).click();
  await expect(panel).toBeInViewport({ ratio: 1 });
  await waitSaved(page);
  const after = await savedBoard(page);
  expect(after.panels).toHaveLength(1);
  expect(after.panels[0].id).toBe(before.panels[0].id);
  expect(after.quotations).toEqual(before.quotations);
});
