import { describe, expect, it } from 'vitest';
import { BoxIndex, overlaps } from '../src/spatial';
import { cameraCovered } from '../src/viewport';
import { createSnapSearch, detachModule, findSnap, groupIds, translate } from '../src/docking';
import { allCards, mapCards } from '../src/model';
import { boardFixture } from './board';

describe('spatial broad phase', () => {
  it('retains board order and finds negative, cell-edge and oversized boxes without duplicates', () => {
    const boxes = [
      { id: 'huge', x: -10000, y: -10000, width: 20000, height: 20000 },
      { id: 'negative', x: -520, y: -520, width: 30, height: 30 },
      { id: 'edge', x: 510, y: 510, width: 10, height: 10 },
      { id: 'far', x: 100000, y: 100000, width: 20, height: 20 },
    ];
    const index = new BoxIndex(boxes);
    expect(
      index.query({ x: -513, y: -513, width: 1026, height: 1026 }).map((box) => box.id),
    ).toEqual(['huge', 'negative', 'edge']);
    expect(index.query({ x: 520, y: 520, width: 1, height: 1 }).map((box) => box.id)).toEqual([
      'huge',
    ]);
    expect(index.query({ x: -100000, y: -100000, width: 300000, height: 300000 })).toEqual(boxes);
    expect(index.query({ x: 10000, y: 10000, width: 1, height: 1 })).toEqual([]);
    const hugeCoordinate = { x: 1e30, y: 1e30, width: 1e28, height: 1e28 };
    expect(new BoxIndex([hugeCoordinate]).query(hugeCoordinate)).toEqual([hugeCoordinate]);
  });

  it('matches a flat collision scan over varied coordinates, sizes and queries', () => {
    let seed = 42;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const boxes = Array.from({ length: 400 }, (_, id) => ({
      id,
      x: random() * 20000 - 10000,
      y: random() * 20000 - 10000,
      width: random() * 2000 + 1,
      height: random() * 2000 + 1,
    }));
    const snapshot = structuredClone(boxes),
      index = new BoxIndex(boxes);
    for (let i = 0; i < 120; i++) {
      const query = {
        x: random() * 20000 - 10000,
        y: random() * 20000 - 10000,
        width: random() * 2000 + 1,
        height: random() * 2000 + 1,
      };
      expect(index.query(query)).toEqual(boxes.filter((box) => overlaps(box, query)));
    }
    expect(boxes).toEqual(snapshot);
  });
});

it.each([0.15, 0.5, 1, 3])(
  'cached snap searches match full scans for groups, collisions and stable ties at %sx',
  (scale) => {
    let board = detachModule(boardFixture(), 'audio');
    board.camera.scale = scale;
    for (let i = 0; i < 70; i++)
      board.panels.push({
        id: `panel-${i}`,
        kind: 'codes',
        x: (i % 10) * 400 - 1600,
        y: Math.floor(i / 10) * 320 - 960,
        width: 326,
        height: 300,
        z: 10 + i,
      });
    const snapshot = structuredClone(board);
    for (const id of ['audio', 'video', 'still']) {
      const moving = groupIds(board, id),
        originals = new Map(
          allCards(board)
            .filter((card) => moving.has(card.id))
            .map((card) => [card.id, card]),
        );
      const search = createSnapSearch(board, moving, id, originals);
      for (let x = -500; x <= 500; x += 61)
        for (let y = -500; y <= 500; y += 71) {
          const delta = { x, y };
          expect(search(delta, scale)).toEqual(
            findSnap(translate(board, originals, delta), moving, id),
          );
        }
      const live = translate(board, originals, { x: 70, y: -30 });
      const rebuilt = createSnapSearch(live, moving, id, originals);
      expect(rebuilt({ x: 100, y: 20 }, scale)).toEqual(search({ x: 100, y: 20 }, scale));
    }
    expect(board).toEqual(snapshot);
  },
);

it('preserves snap identity and rules when different cells contain equally scored targets', () => {
  const board = mapCards(detachModule(boardFixture(), 'audio'), (card) =>
    card.id === 'audio' ? { ...card, y: 420 } : card,
  );
  board.panels.push({
    id: 'same-anchor',
    kind: 'codes',
    x: 100,
    y: 100,
    width: 400,
    height: 305,
    z: 9,
  });
  const moving = new Set(['audio']);
  expect(createSnapSearch(board, moving, 'audio')({ x: 0, y: 0 }, 1)).toEqual(
    findSnap(board, moving, 'audio'),
  );
});

it('publishes culling before pan/zoom can leave rendered overscan', () => {
  const camera = { x: 0, y: 0, scale: 1 },
    viewport = { width: 1440, height: 1000 };
  expect(cameraCovered(camera, { ...camera, x: 100, y: -100 }, viewport)).toBe(true);
  expect(cameraCovered(camera, { ...camera, x: 101 }, viewport)).toBe(false);
  expect(cameraCovered(camera, { ...camera, y: -101 }, viewport)).toBe(false);
  expect(cameraCovered(camera, { ...camera, scale: 0.5 }, viewport)).toBe(false);
  expect(cameraCovered(camera, { ...camera, scale: 2 }, viewport)).toBe(true);
});
