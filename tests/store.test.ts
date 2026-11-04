import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { emptyBoard } from '../src/model';
import { loadBoard, replaceBoard, saveAssets, saveBoard } from '../src/store';
import { boardFixture } from './board';

beforeEach(async () => { await replaceBoard(emptyBoard(), new Map()); });

it('reloads media and dock geometry from storage, rather than relying on in-memory objects', async () => {
  const board = boardFixture();
  await saveAssets(new Map([['video', new Blob(['original bytes'])], ['still', new Blob(['still bytes'])]]));
  await saveBoard(board);
  board.tracks[1].width = 999;
  const loaded = await loadBoard();
  expect(loaded.board).toEqual(boardFixture());
  expect(await loaded.assets.get('video')!.text()).toBe('original bytes');
  expect(await loaded.assets.get('still')!.text()).toBe('still bytes');
});

it('keeps the previous project and original media when a replacement fails after clearing assets', async () => {
  const before = boardFixture();
  await replaceBoard(before, new Map([['video', new Blob(['keep video'])], ['still', new Blob(['keep still'])]]));
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
    if (this.name === 'boards') throw new DOMException('Simulated disk quota failure', 'QuotaExceededError');
    return key === undefined ? put.call(this, value) : put.call(this, value, key);
  });
  try {
    await expect(replaceBoard({ ...emptyBoard(), name: 'Replacement' }, new Map([['new', new Blob(['replacement'])]]))).rejects.toThrow('Simulated disk quota failure');
  } finally { spy.mockRestore(); }
  const after = await loadBoard();
  expect(after.board).toEqual(before);
  expect(await after.assets.get('video')!.text()).toBe('keep video');
  expect(await after.assets.get('still')!.text()).toBe('keep still');
});
