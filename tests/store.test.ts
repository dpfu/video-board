import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { emptyBoard } from '../src/model';
import { loadBoard, replaceBoard, saveAssets, saveBoard } from '../src/store';
import { boardFixture } from './board';

beforeEach(async () => {
  await replaceBoard(emptyBoard(), new Map());
});

it('reloads media and dock geometry from storage, rather than relying on in-memory objects', async () => {
  const board = boardFixture();
  await saveAssets(
    new Map([
      ['video', new Blob(['original bytes'])],
      ['still', new Blob(['still bytes'])],
    ]),
  );
  await saveBoard(board);
  board.tracks[1].width = 999;
  const loaded = await loadBoard();
  expect(loaded.board).toEqual(boardFixture());
  expect(await loaded.assets.get('video')!.text()).toBe('original bytes');
  expect(await loaded.assets.get('still')!.text()).toBe('still bytes');
});

it('loads a saved v3 project without losing its quotations or original media', async () => {
  const current = boardFixture();
  await replaceBoard(
    current,
    new Map([
      ['video', new Blob(['keep original'])],
      ['still', new Blob(['keep frame'])],
    ]),
  );
  const { spaces: _, ...base } = current;
  const legacy = { ...base, version: 3 as const };
  const db = await openDB('video-board', 1);
  try {
    await db.put('boards', legacy, 'current');
  } finally {
    db.close();
  }
  const loaded = await loadBoard();
  expect(loaded.board).toEqual({ ...legacy, version: 4, spaces: [] });
  expect(await loaded.assets.get('video')!.text()).toBe('keep original');
  expect(await loaded.assets.get('still')!.text()).toBe('keep frame');
});

it('reconciles stored live membership while preserving positions, memos and evidence identities', async () => {
  const board = boardFixture();
  board.codes = [{ id: 'review', name: 'Review', color: '#b7cde5', definition: '' }];
  board.quotations[0].codeIds = ['review'];
  board.quotations.push({
    ...board.quotations[0],
    id: 'new-range',
    kind: 'range',
    start: 1,
    end: 2,
    parentId: board.quotations[0].id,
  });
  board.spaces = [
    {
      id: 'live',
      kind: 'space',
      codeId: 'review',
      name: '',
      memo: 'Keep this interpretation.',
      x: 0,
      y: 0,
      width: 700,
      height: 540,
      z: 1,
      items: [
        { quotationId: 'frame-still', x: 12, y: 12 },
        { quotationId: 'source-video', x: 320, y: 210 },
      ],
    },
  ];
  const before = structuredClone(board);
  await replaceBoard(
    board,
    new Map([
      ['video', new Blob(['keep original'])],
      ['still', new Blob(['keep frame'])],
    ]),
  );
  const loaded = (await loadBoard()).board!;
  expect(board).toEqual(before);
  expect(loaded.spaces[0].items.map((item) => item.quotationId)).toEqual([
    'source-video',
    'new-range',
  ]);
  expect(loaded.spaces[0].items[0]).toEqual(before.spaces[0].items[1]);
  expect(loaded.spaces[0].memo).toBe(before.spaces[0].memo);
  expect(loaded.quotations).toEqual(before.quotations);
});

it('keeps the previous project and original media when a replacement fails after clearing assets', async () => {
  const before = boardFixture();
  await replaceBoard(
    before,
    new Map([
      ['video', new Blob(['keep video'])],
      ['still', new Blob(['keep still'])],
    ]),
  );
  const put = IDBObjectStore.prototype.put;
  const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (this.name === 'boards')
      throw new DOMException('Simulated disk quota failure', 'QuotaExceededError');
    return key === undefined ? put.call(this, value) : put.call(this, value, key);
  });
  try {
    await expect(
      replaceBoard(
        { ...emptyBoard(), name: 'Replacement' },
        new Map([['new', new Blob(['replacement'])]]),
      ),
    ).rejects.toThrow('Simulated disk quota failure');
  } finally {
    spy.mockRestore();
  }
  const after = await loadBoard();
  expect(after.board).toEqual(before);
  expect(await after.assets.get('video')!.text()).toBe('keep video');
  expect(await after.assets.get('still')!.text()).toBe('keep still');
});
