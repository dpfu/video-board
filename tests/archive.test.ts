import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { backupBoard, restoreArchive } from '../src/archive';
import { quotation } from '../src/analysis';
import { assetKeys, migrateBoard, type Board, type LegacyBoard, type V2Board } from '../src/model';
import { validateBoard } from '../src/validation';
import { boardFixture } from './board';

describe('project validation', () => {
  it('accepts all supported versions without changing the input', () => {
    const current = boardFixture();
    const { quotations: _q, codes: _c, clips: _v, panels: _p, spaces: _s, ...base } = current;
    const v2: V2Board = { ...base, version: 2 };
    const { tracks: _t, ...old } = v2;
    const v1: LegacyBoard = { ...old, version: 1 };
    for (const board of [v1, v2, current]) {
      const before = structuredClone(board);
      expect(() => validateBoard(board)).not.toThrow();
      expect(board).toEqual(before);
      expect(() => validateBoard(migrateBoard(board))).not.toThrow();
    }
  });

  it.each(['videos', 'stills', 'tracks', 'clips', 'panels', 'spaces', 'quotations', 'codes'])(
    'rejects null and sparse %s entries with an actionable error',
    (field) => {
      for (const entries of [[null], new Array(1)]) {
        const board = { ...boardFixture(), [field]: entries };
        expect(() => validateBoard(board)).toThrow(/Invalid/);
        expect(() => validateBoard(board)).not.toThrow(TypeError);
      }
    },
  );

  it('rejects conflicting image references, inconsistent shared frames and unsorted frame times', () => {
    const badImage = boardFixture();
    badImage.stills[0].assetId = 'video';
    expect(() => validateBoard(badImage)).toThrow('Invalid linked still');
    const shared = boardFixture();
    shared.stills.push({ ...shared.stills[0], id: 'another-view', assetId: 'different-image' });
    expect(() => validateBoard(shared)).toThrow('Invalid still quotation');
    shared.stills[1].assetId = 'still';
    expect(() => validateBoard(shared)).not.toThrow();
    shared.stills[1].duration = 0.1;
    expect(() => validateBoard(shared)).toThrow('Invalid still quotation');
    const unsorted = boardFixture();
    unsorted.videos[0].frameTimes = [0, 0.2, 0.1];
    expect(() => validateBoard(unsorted)).toThrow('Invalid video');
    const hidden = { ...boardFixture().videos[0], hidden: 'yes' };
    expect(() => validateBoard({ ...boardFixture(), videos: [hidden] })).toThrow('Invalid video');
  });

  it('checks both frame boundaries for a region, while allowing a temporal child to extend beyond its parent', () => {
    const board = boardFixture(),
      frame = board.quotations[1];
    const region = {
      ...quotation('video', 'region', frame.start, frame.end, frame.id),
      rect: { x: 0, y: 0, width: 0.5, height: 0.5 },
    };
    board.quotations.push(region);
    expect(() => validateBoard(board)).not.toThrow();
    region.end += 0.1;
    expect(() => validateBoard(board)).toThrow('Invalid quotation source context');
    board.quotations.pop();
    const parent = quotation('video', 'range', 1, 2),
      child = quotation('video', 'range', 1.5, 3, parent.id);
    board.quotations.push(parent, child);
    expect(() => validateBoard(board)).not.toThrow();
  });

  it('handles deep quotation chains without recursion and rejects cycles in either graph', () => {
    const board = boardFixture(),
      base = quotation('video', 'range', 1, 2);
    let parentId = board.quotations[0].id;
    for (let i = 0; i < 12_000; i++) {
      const id = `selection-${i}`;
      board.quotations.push({ ...base, id, parentId });
      parentId = id;
    }
    expect(() => validateBoard(board)).not.toThrow();
    board.quotations[2].parentId = parentId;
    expect(() => validateBoard(board)).toThrow('Cyclic quotation context');
    const dockCycle = boardFixture();
    dockCycle.videos[0].dock = { to: 'audio', side: 'top', offset: 0 };
    expect(() => validateBoard(dockCycle)).toThrow('Cyclic module docking');
    const badDock = { ...boardFixture().tracks[0], dock: null };
    expect(() => validateBoard({ ...boardFixture(), tracks: [badDock] })).toThrow(
      'Invalid module docking',
    );
  });
});

describe('portable ZIP archives', () => {
  it('roundtrips original bytes, shared still assets and quotation identities without IndexedDB', async () => {
    const board = boardFixture();
    board.stills.push({ ...board.stills[0], id: 'second-view', assetId: 'still' });
    const assets = new Map(assetKeys(board).map((id) => [id, new Blob([`bytes:${id}`])]));
    const restored = await restoreArchive(await backupBoard(board, assets));
    expect(restored.board).toEqual(board);
    expect([...restored.assets.keys()]).toEqual(['video', 'still']);
    for (const [id, blob] of restored.assets) expect(await blob.text()).toBe(`bytes:${id}`);
  });

  it('distinguishes corrupt ZIP, corrupt manifest and missing media without changing the supplied board', async () => {
    const before: Board = boardFixture(),
      snapshot = structuredClone(before);
    await expect(restoreArchive(new Blob(['not a ZIP']))).rejects.toThrow(
      'not a readable Video Board backup',
    );
    const zip = new JSZip();
    zip.file('board.json', '{broken');
    await expect(restoreArchive(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(
      'unreadable board manifest',
    );
    zip.file('board.json', JSON.stringify(before));
    await expect(restoreArchive(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(
      'missing a media file',
    );
    expect(before).toEqual(snapshot);
  });
});
