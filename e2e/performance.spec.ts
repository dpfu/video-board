import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { test, expect, box, openVideo, savedBoard, seedBoard, waitSaved } from './helpers';
import { sourceQuotationId } from '../src/model';

const frames = async (page: import('@playwright/test').Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );

test('continuous group movement keeps connectors live with bounded React work, and Undo ends the active gesture', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const state = { commits: 0 };
    const target = window as unknown as {
      __boardPerf: typeof state;
      __REACT_DEVTOOLS_GLOBAL_HOOK__: object;
    };
    target.__boardPerf = state;
    target.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      inject: () => 1,
      onCommitFiberRoot: () => state.commits++,
      onCommitFiberUnmount: () => {},
    };
  });
  await openVideo(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const source = page.locator('.video-card');
  await source.getByRole('button', { name: 'Capture still', exact: true }).click();
  await expect(page.locator('.still-card')).toHaveCount(1);
  await waitSaved(page);
  const before = await savedBoard(page),
    origin = await box(source),
    title = await box(source.locator('.card-title'));
  const link = page.locator('.board-links path'),
    initialPath = await link.getAttribute('d');
  const counter = () =>
    page.evaluate(
      () => (window as unknown as { __boardPerf: { commits: number } }).__boardPerf.commits,
    );
  expect(await counter(), 'React instrumentation observed actual startup commits').toBeGreaterThan(
    0,
  );
  const x = title.x + title.width / 2,
    y = title.y + title.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await frames(page);
  const initialCommits = await counter();
  for (let step = 1; step <= 40; step++) {
    await page.mouse.move(x + step * 1.5, y + step * 0.5);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  expect((await box(source)).x - origin.x).toBeCloseTo(60, 1);
  expect((await box(source)).y - origin.y).toBeCloseTo(20, 1);
  expect(await link.getAttribute('d')).not.toBe(initialPath);
  expect(
    (await counter()) - initialCommits,
    'Live pixels do not cause a full React commit per pointer step',
  ).toBeLessThanOrEqual(8);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await frames(page);
  expect((await box(source)).x).toBeCloseTo(origin.x, 1);
  expect((await box(source)).y).toBeCloseTo(origin.y, 1);
  await page.mouse.move(x + 90, y + 35);
  await page.mouse.up();
  await expect(page.locator('body')).not.toHaveClass(/is-dragging/);
  await waitSaved(page);
  const after = await savedBoard(page);
  expect(after.videos.map((v) => [v.x, v.y])).toEqual(before.videos.map((v) => [v.x, v.y]));
  expect(after.tracks).toEqual(before.tracks);
  expect(after.quotations).toEqual(before.quotations);
  expect(await link.getAttribute('d')).toBe(initialPath);
});

test('panning reveals culled evidence before release and zoom/grid remain aligned with the persisted camera', async ({
  page,
}) => {
  await openVideo(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const board = await savedBoard(page),
    source = board.videos[0],
    template = board.quotations[0];
  board.tracks = [];
  board.quotations.push({
    ...template,
    id: 'distant-range',
    kind: 'range',
    parentId: sourceQuotationId(source.id),
    start: 1,
    end: 2,
  });
  board.clips.push({
    id: 'distant-view',
    videoId: source.id,
    quotationId: 'distant-range',
    time: 1,
    x: 1900,
    y: 90,
    width: 340,
    z: 5,
  });
  await seedBoard(page, board);
  const clip = page.locator('[data-clip-id="distant-view"]');
  await expect(clip).toHaveCount(0);
  await page.mouse.move(1300, 850);
  await page.mouse.down();
  await page.mouse.move(300, 850, { steps: 30 });
  await expect(clip).toBeInViewport();
  await expect(page.locator('body')).toHaveClass(/is-dragging/);
  await page.mouse.up();
  await waitSaved(page);
  expect((await savedBoard(page)).camera.x).toBeCloseTo(-1000, 1);
  const beforeZoom = (await savedBoard(page)).camera;
  await page.mouse.move(750, 600);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -35);
  await page.keyboard.up('Control');
  await expect
    .poll(async () => (await savedBoard(page)).camera.scale)
    .toBeGreaterThan(beforeZoom.scale);
  await waitSaved(page);
  const after = await savedBoard(page),
    workspace = await box(page.locator('.board'));
  expect(after.camera.scale).toBeGreaterThan(beforeZoom.scale);
  const anchor = { x: 750 - workspace.x, y: 600 - workspace.y };
  expect((anchor.x - after.camera.x) / after.camera.scale).toBeCloseTo(
    (anchor.x - beforeZoom.x) / beforeZoom.scale,
    2,
  );
  expect((anchor.y - after.camera.y) / after.camera.scale).toBeCloseTo(
    (anchor.y - beforeZoom.y) / beforeZoom.scale,
    2,
  );
  await expect(page.locator('.zoom-value')).toHaveText(`${Math.round(after.camera.scale * 100)}%`);
  const grid = await page.locator('.board-grid').evaluate((el) => {
    const style = getComputedStyle(el),
      matrix = new DOMMatrixReadOnly(style.transform);
    return { x: matrix.m41, y: matrix.m42, cell: parseFloat(style.backgroundSize) };
  });
  expect(grid.cell).toBeCloseTo(after.camera.scale * 24, 3);
  expect((grid.x - 80 - after.camera.x) / grid.cell).toBeCloseTo(
    Math.round((grid.x - 80 - after.camera.x) / grid.cell),
    3,
  );
  expect((grid.y - 80 - after.camera.y) / grid.cell).toBeCloseTo(
    Math.round((grid.y - 80 - after.camera.y) / grid.cell),
    3,
  );
  const snapshot = structuredClone(after);
  await page.reload();
  await waitSaved(page);
  expect((await savedBoard(page)).camera).toEqual(snapshot.camera);
  expect((await savedBoard(page)).quotations).toEqual(snapshot.quotations);
  // A wheel event and reset can share a React batch; reset must use the live camera.
  await page.locator('.board').evaluate((stage) => {
    stage.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -20,
        clientX: 750,
        clientY: 600,
      }),
    );
    (stage.querySelector('.zoom-value') as HTMLButtonElement).click();
  });
  await expect(page.locator('.zoom-value')).toHaveText('100%');
  await waitSaved(page);
  expect((await savedBoard(page)).camera.scale).toBe(1);
});

test('a project download flushes a live move and its ZIP matches the saved geometry', async ({
  page,
}, testInfo) => {
  await openVideo(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const before = await savedBoard(page),
    source = page.locator('.video-card'),
    origin = await box(source),
    title = await box(source.locator('.card-title'));
  const x = title.x + title.width / 2,
    y = title.y + title.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 47, y + 19, { steps: 8 });
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Download project backup', exact: true })
    .evaluate((button) => (button as HTMLButtonElement).click());
  const path = testInfo.outputPath('live-move.videoboard.zip');
  await (await download).saveAs(path);
  await page.mouse.up();
  await waitSaved(page);
  expect((await box(source)).x - origin.x).toBeCloseTo(47, 1);
  const saved = await savedBoard(page),
    zip = await JSZip.loadAsync(await readFile(path));
  const archived = JSON.parse(await zip.file('board.json')!.async('text'));
  expect(archived.videos[0]).toMatchObject({
    x: before.videos[0].x + 47,
    y: before.videos[0].y + 19,
  });
  expect(archived.tracks).toEqual(saved.tracks);
  expect(archived.quotations).toEqual(before.quotations);
  expect(saved.videos[0].x).toBe(archived.videos[0].x);
  expect(saved.videos[0].y).toBe(archived.videos[0].y);
  await expect(page.locator('body')).not.toHaveClass(/is-dragging/);
});
