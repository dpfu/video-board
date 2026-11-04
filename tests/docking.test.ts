import { describe, expect, it } from 'vitest';
import { applySnap, detachModule, findSnap, groupIds, reflow, translate } from '../src/docking';
import { allCards, mapCards } from '../src/model';
import { boardFixture } from './board';

describe('modular board behavior', () => {
  it('moves the same assembly from a child header, preserving spacing and unrelated stills', () => {
    const board = boardFixture(), before = structuredClone(board);
    const group = groupIds(board, 'audio');
    expect([...group].sort()).toEqual(['audio', 'frames', 'video']);
    const originals = new Map(allCards(board).filter(c => group.has(c.id)).map(c => [c.id, c]));
    const moved = translate(board, originals, { x: 70, y: 30 });
    expect(moved.videos[0]).toMatchObject({ x: 170, y: 130 });
    expect(moved.tracks.map(t => [t.x, t.y])).toEqual([[170, 335], [170, 440]]);
    expect(moved.stills).toEqual(before.stills);
    expect(board).toEqual(before);
  });

  it('peels a middle module out without moving neighbours or changing their source video', () => {
    const board = boardFixture(), before = structuredClone(board);
    const detached = detachModule(board, 'frames');
    expect([...groupIds(detached, 'frames')]).toEqual(['frames']);
    expect([...groupIds(detached, 'video')]).toEqual(['video']);
    expect([...groupIds(detached, 'audio')]).toEqual(['audio']);
    expect(detached.tracks.map(t => [t.x, t.y, t.videoId, t.dock])).toEqual([[100, 305, 'video', undefined], [100, 410, 'video', undefined]]);
    expect(board).toEqual(before);
  });

  it('reflows after a player resize while keeping each scrubber’s independent size and the input snapshot', () => {
    const board = boardFixture(), before = structuredClone(board);
    const resized = reflow({ ...board, videos: [{ ...board.videos[0], width: 480, height: 240 }] });
    expect(resized.tracks.map(t => [t.x, t.y, t.width, t.height])).toEqual([[100, 345, 400, 100], [100, 450, 600, 80]]);
    expect(resized.stills).toEqual(before.stills);
    expect(board).toEqual(before);
  });

  it.each([
    ['top', 113, -5], ['bottom', 113, 305], ['left', -305, 113], ['right', 505, 113],
  ] as const)('keeps a module on its %s anchor through reflow', (side, x, y) => {
    const board = boardFixture();
    board.tracks[0].dock = { to: 'video', side, offset: 13 };
    expect(reflow(board).tracks[0]).toMatchObject({ x, y, width: 400, height: 100, videoId: 'video' });
  });

  it.each([.5, 1, 2])('has the same magnetic reach in screen pixels at %sx zoom', scale => {
    const board = detachModule(boardFixture(), 'audio'); board.camera.scale = scale;
    const nearby = mapCards(board, c => c.id === 'audio' ? { ...c, y: 410 + 12 / scale } : c);
    const snap = findSnap(nearby, new Set(['audio']), 'audio');
    expect(snap).toMatchObject({ dock: { to: 'frames', side: 'bottom', offset: 0 }, x: 100, y: 410 });
    expect([...groupIds(applySnap(nearby, snap!), 'audio')].sort()).toEqual(['audio', 'frames', 'video']);
    const tooFar = mapCards(board, c => c.id === 'audio' ? { ...c, y: 410 + 20 / scale } : c);
    expect(findSnap(tooFar, new Set(['audio']), 'audio')).toBeNull();
  });

  it('does not magnetically dock into an occupied destination or its own assembly', () => {
    const board = detachModule(boardFixture(), 'audio');
    board.stills[0] = { ...board.stills[0], x: 100, y: 410 };
    expect(findSnap(board, new Set(['audio']), 'audio')).toBeNull();
    const original = boardFixture();
    expect(findSnap(original, groupIds(original, 'video'), 'video')).toBeNull();
  });
});
