import { expect, it } from 'vitest';
import { visibleModuleIds } from '../src/viewport';
import { boardFixture } from './board';

it('culls only DOM views, retaining offscreen evidence and explicit keep-alive controls', () => {
  const board = boardFixture(),
    before = structuredClone(board);
  const visible = visibleModuleIds(board, { width: 800, height: 600 }, new Set(), 0);
  expect([...visible].sort()).toEqual(['audio', 'frames', 'video']);
  expect(
    visibleModuleIds(board, { width: 800, height: 600 }, new Set(['still']), 0).has('still'),
  ).toBe(true);
  expect(board).toEqual(before);
});

it('uses camera coordinates and keeps overscan consistent in screen pixels', () => {
  const board = boardFixture();
  board.camera = { x: -700, y: 0, scale: 1 };
  expect([...visibleModuleIds(board, { width: 800, height: 600 }, new Set(), 0)]).toEqual([
    'still',
  ]);
  board.camera = { x: 0, y: 0, scale: 2 };
  expect([...visibleModuleIds(board, { width: 800, height: 600 }, new Set(), 0)]).toEqual([
    'video',
  ]);
  board.tracks[0] = { ...board.tracks[0], x: 460, y: 0 };
  board.tracks[1] = { ...board.tracks[1], x: 540, y: 0 };
  const overscan = visibleModuleIds(board, { width: 800, height: 600 });
  expect(overscan.has('frames')).toBe(true); // 120px past the screen's right edge
  expect(overscan.has('audio')).toBe(false); // 280px past it
});
