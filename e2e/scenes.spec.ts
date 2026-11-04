import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { test, expect, assetHash, box, dragBy, expectSynchronized, openVideo, savedBoard, waitSaved } from './helpers';

const sceneVideo = fileURLToPath(new URL('./fixtures/scenes.webm', import.meta.url));

test('detects real cuts, seeks by shot, changes sensitivity without decoding, and retains scores in ZIP/reload', async ({ page }, testInfo) => {
  let workers = 0; page.on('worker', () => workers++);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add videos', exact: true })).toBeEnabled();
  await page.locator('input[type=file][accept^="video/"]').setInputFiles(sceneVideo);
  await expect.poll(async () => (await savedBoard(page))?.videos[0]?.analysis).toBe('ready');
  const source = (await savedBoard(page)).videos[0], originalHash = await assetHash(page, source.id);
  expect(source.scenes!.times).toHaveLength(60);
  const cuts = source.scenes!.times.filter((time, i) => time > 0 && source.scenes!.scores[i] >= source.scenes!.threshold);
  expect(cuts).toEqual([1, 2, 3, 4]);
  await page.getByRole('button', { name: 'Add cuts scrubber', exact: true }).click();
  const track = page.locator('[data-track-kind=cuts]');
  await expect(track.locator('.shot-segment')).toHaveCount(5);
  await track.getByRole('button', { name: /^Shot 3 ·/ }).click();
  await expectSynchronized(page, 2);
  await expect(track.getByRole('button', { name: /^Shot 3 ·/ })).toHaveAttribute('aria-pressed', 'true');
  const beforeThreshold = workers;
  const threshold = track.getByRole('slider', { name: 'Cut threshold', exact: true });
  await threshold.focus(); await threshold.press('End');
  await expect.poll(() => track.locator('.shot-segment').count()).toBeLessThan(5);
  await waitSaved(page);
  const changed = (await savedBoard(page)).videos[0].scenes!;
  expect(changed.threshold).toBe(50);
  expect(changed.scores).toEqual(source.scenes!.scores);
  expect(changed.times).toEqual(source.scenes!.times);
  expect(workers).toBe(beforeThreshold);
  expect(await assetHash(page, source.id)).toBe(originalHash);
  await track.getByRole('button', { name: 'Undock module', exact: true }).click();
  await dragBy(page, track.locator('.resize-handle'), 100, -50);
  expect((await box(track)).height).toBe(96);
  const footer = await box(track.locator('.cuts-options')), resized = await box(track);
  expect(footer.y + footer.height).toBeLessThan(resized.y + resized.height);

  // The regression artifact also makes the compact module reviewable visually.
  await page.screenshot({ path: testInfo.outputPath('cuts.png') });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download project backup', exact: true }).click();
  const backup = testInfo.outputPath('cuts.videoboard.zip'); await (await download).saveAs(backup);
  const zip = await JSZip.loadAsync(await readFile(backup));
  expect(zip.file(`assets/${source.id}`)).not.toBeNull();
  expect(zip.filter(path => path.startsWith('assets/') && !path.endsWith('/'))).toHaveLength(13);
  expect(JSON.parse(await zip.file('board.json')!.async('string')).videos[0].scenes).toEqual(changed);

  const beforeReload = workers;
  await page.reload(); await expect(track.locator('.shot-segment').first()).toBeVisible(); await waitSaved(page);
  expect((await savedBoard(page)).videos[0].scenes).toEqual(changed);
  expect(workers).toBe(beforeReload);

  const intact = await savedBoard(page);
  const bad = structuredClone(intact); bad.videos[0].scenes!.scores = [];
  zip.file('board.json', JSON.stringify(bad));
  await page.locator('input[type=file][accept=".zip"]').setInputFiles({ name: 'bad-scenes.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
  await expect(page.getByRole('alert')).toContainText('Invalid scene detection data');
  expect(await savedBoard(page)).toEqual(intact);
  await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
  const recovery = page.waitForEvent('download');
  await page.locator('input[type=file][accept=".zip"]').setInputFiles(backup);
  await (await recovery).saveAs(testInfo.outputPath('before-restore.zip'));
  await expect(track.getByRole('slider', { name: 'Cut threshold', exact: true })).toHaveValue('50'); await waitSaved(page);
  expect((await savedBoard(page)).videos[0].scenes).toEqual(changed);
  expect(await assetHash(page, source.id)).toBe(originalHash);
  const png = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export board as PNG', exact: true }).click();
  await (await png).saveAs(testInfo.outputPath('cuts-board.png'));
});

test('opening Cuts analyses an older video once without replacing its original, thumbnails or waveform', async ({ page }) => {
  const source = await openVideo(page);
  const originalHash = await assetHash(page, source.id), thumbnailHash = await assetHash(page, source.thumbnails[0]);
  await waitSaved(page);
  await page.evaluate(async () => {
    const request = indexedDB.open('video-board', 1);
    const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
    const tx = db.transaction('boards', 'readwrite'), store = tx.objectStore('boards'), read = store.get('current');
    read.onsuccess = () => { const board = read.result; delete board.videos[0].scenes; store.put(board, 'current'); };
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
  });
  let workers = 0; page.on('worker', () => workers++);
  await page.reload(); await expect(page.getByRole('button', { name: 'Add cuts scrubber', exact: true })).toBeVisible(); await waitSaved(page);
  expect((await savedBoard(page)).videos[0].scenes).toBeUndefined(); expect(workers).toBe(0);
  await page.getByRole('button', { name: 'Add cuts scrubber', exact: true }).click();
  await expect.poll(async () => (await savedBoard(page)).videos[0].scenes?.scores.length ?? 0).toBeGreaterThan(40);
  const updated = (await savedBoard(page)).videos[0];
  expect(updated.thumbnails).toEqual(source.thumbnails); expect(updated.peaks).toEqual(source.peaks);
  expect(updated.frameTimes).toEqual(source.frameTimes); expect(workers).toBe(1);
  expect(await assetHash(page, source.id)).toBe(originalHash);
  expect(await assetHash(page, source.thumbnails[0])).toBe(thumbnailHash);
  await page.getByRole('button', { name: 'Add cuts scrubber', exact: true }).click();
  await expect(page.locator('[data-track-kind=cuts]')).toHaveCount(2);
  expect(workers).toBe(1);
});
