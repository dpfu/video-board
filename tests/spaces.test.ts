import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { csvExport, quotation } from '../src/analysis';
import { backupBoard, restoreArchive } from '../src/archive';
import { reflow, translate } from '../src/docking';
import { assetKeys, migrateBoard, type Board, type SpaceCard, type V3Board } from '../src/model';
import {
  addEvidence,
  moveEvidence,
  promoteGroup,
  reconcileSpaces,
  removeEvidence,
} from '../src/spaces';
import { validateBoard } from '../src/validation';
import { visibleModuleIds } from '../src/viewport';
import { boardFixture } from './board';

const group = (id: string, codeId?: string): SpaceCard => ({
  id,
  kind: 'space',
  name: 'Attention',
  memo: 'A developing interpretation.',
  x: 1400,
  y: 100,
  width: 700,
  height: 540,
  z: 5,
  codeId,
  items: [],
});
function fixture() {
  const board = boardFixture();
  board.codes = [
    { id: 'attention', name: 'Attention', color: '#b7cde5', definition: 'An existing concept.' },
  ];
  const frame = board.quotations[1];
  board.quotations.push(
    { ...quotation('video', 'range', 1, 2, board.quotations[0].id), id: 'segment' },
    {
      ...quotation('video', 'region', frame.start, frame.end, frame.id),
      id: 'region',
      rect: { x: 0.2, y: 0.1, width: 0.3, height: 0.4 },
    },
  );
  return board;
}

describe('linked evidence spaces', () => {
  it('opens a real v3 snapshot without changing quotation identities, assets, geometry or the old snapshot', () => {
    const { spaces: _, ...base } = fixture();
    const old: V3Board = { ...base, version: 3 };
    const snapshot = structuredClone(old);
    validateBoard(old);
    const next = migrateBoard(old);
    expect(next).toEqual({ ...old, version: 4, spaces: [] });
    expect(old).toEqual(snapshot);
    expect(assetKeys(next)).toEqual(['video', 'still']);
    validateBoard(next);
  });

  it('projects all four quotation kinds once, retaining arranged positions as assignments change', () => {
    let board = fixture();
    board.quotations = board.quotations.map((q) => ({ ...q, codeIds: ['attention'] }));
    board.spaces = [group('live', 'attention')];
    board = reconcileSpaces(board);
    expect(board.spaces[0].items.map((item) => item.quotationId)).toEqual(
      board.quotations.map((q) => q.id),
    );
    board = moveEvidence(board, 'live', 'region', { x: 320, y: 370 });
    const arranged = board.spaces[0].items.find((item) => item.quotationId === 'region');
    board.quotations = board.quotations.map((q) =>
      q.id === 'segment' ? { ...q, codeIds: [] } : q,
    );
    const removed = reconcileSpaces(board);
    expect(removed.spaces[0].items.map((item) => item.quotationId)).not.toContain('segment');
    expect(removed.spaces[0].items.find((item) => item.quotationId === 'region')).toEqual(arranged);
    expect(removed.quotations).toHaveLength(4);
    expect(reconcileSpaces(removed)).toBe(removed);
  });

  it('adds new matches into free cells without moving or overlapping arranged evidence', () => {
    let board = fixture();
    board.spaces = [group('live', 'attention')];
    board.quotations[0].codeIds = ['attention'];
    board = reconcileSpaces(board);
    board = moveEvidence(board, 'live', board.quotations[0].id, { x: 100, y: 100 });
    const before = structuredClone(board.spaces[0].items[0]);
    board.quotations[1].codeIds = ['attention'];
    board = reconcileSpaces(board);
    const added = board.spaces[0].items[1];
    expect(board.spaces[0].items[0]).toEqual(before);
    const overlaps =
      added.x < before.x + 192 &&
      added.x + 192 > before.x &&
      added.y < before.y + 196 &&
      added.y + 196 > before.y;
    expect(overlaps).toBe(false);
  });

  it.each([
    { fromLive: false, toLive: false, label: 'manual → manual' },
    { fromLive: false, toLive: true, label: 'manual → live' },
    { fromLive: true, toLive: false, label: 'live → manual' },
    { fromLive: true, toLive: true, label: 'live → live' },
  ])(
    '$label preserves evidence and applies only the destination coding',
    ({ fromLive, toLive }) => {
      let board = fixture();
      board.codes.push({ id: 'contrast', name: 'Contrast', color: '#d9b5c8', definition: '' });
      board.quotations.find((q) => q.id === 'region')!.codeIds = ['attention'];
      board.spaces = [
        group('from', fromLive ? 'attention' : undefined),
        group('to', toLive ? 'contrast' : undefined),
      ];
      board = addEvidence(board, 'from', 'region');
      const before = structuredClone(board);
      const next = addEvidence(board, 'to', 'region', { x: 50, y: 40 }, 'from');
      expect(board).toEqual(before);
      expect(next.spaces[0].items).toHaveLength(fromLive ? 1 : 0);
      expect(next.spaces[1].items).toEqual([{ quotationId: 'region', x: 50, y: 40 }]);
      expect(next.quotations.find((q) => q.id === 'region')).toMatchObject({
        ...before.quotations.find((q) => q.id === 'region'),
        codeIds: toLive ? ['attention', 'contrast'] : ['attention'],
        updatedAt: expect.any(String),
      });
      expect(next.quotations.map((q) => q.id)).toEqual(before.quotations.map((q) => q.id));
      expect(assetKeys(next)).toEqual(assetKeys(before));
    },
  );

  it.each([false, true])(
    'dropping an existing member into its own space is idempotent (live = %s)',
    (live) => {
      let board = fixture();
      board.spaces = [group('space', live ? 'attention' : undefined)];
      board = addEvidence(board, 'space', 'region', { x: 303, y: 215 });
      const before = structuredClone(board);
      const next = addEvidence(board, 'space', 'region', undefined, 'space');
      expect(next).toEqual(before);
      expect(next.spaces[0].items).toHaveLength(1);
      expect(board).toEqual(before);
    },
  );

  it('promotes with explicit case-insensitive reuse, keeping memos, other codes and existing matches', () => {
    let board = fixture();
    board.codes.push({ id: 'other', name: 'Other', color: '#aabbcc', definition: '' });
    board.quotations[0].codeIds = ['attention'];
    board.quotations[1].codeIds = ['other'];
    board.spaces = [{ ...group('candidate'), name: '  attention  ' }];
    board = addEvidence(board, 'candidate', board.quotations[1].id, { x: 340, y: 220 });
    const snapshot = structuredClone(board);
    const next = promoteGroup(board, 'candidate');
    expect(board).toEqual(snapshot);
    expect(next.codes).toEqual(board.codes);
    expect(next.spaces[0]).toMatchObject({ codeId: 'attention', memo: board.spaces[0].memo });
    expect(next.spaces[0].items).toContainEqual(snapshot.spaces[0].items[0]);
    expect(next.spaces[0].items).toHaveLength(2);
    expect(next.quotations[1].codeIds).toEqual(['other', 'attention']);
    expect(promoteGroup(next, 'candidate')).toBe(next);
  });

  it('creates one code for a named nonempty group; empty and unnamed groups remain provisional', () => {
    let board = fixture();
    board.spaces = [{ ...group('candidate'), name: 'An emerging pattern' }];
    expect(promoteGroup(board, 'candidate')).toBe(board);
    board = addEvidence(board, 'candidate', 'region');
    board.spaces[0].name = ' ';
    expect(promoteGroup(board, 'candidate')).toBe(board);
    board.spaces[0].name = 'An emerging pattern';
    const next = promoteGroup(board, 'candidate');
    expect(next.codes).toHaveLength(2);
    expect(next.spaces[0].codeId).toBe(next.codes[1].id);
    expect(next.quotations.find((q) => q.id === 'region')!.codeIds).toEqual([next.codes[1].id]);
  });

  it('removes manual membership independently; explicit live removal updates every collection but preserves evidence', () => {
    let board = fixture();
    board.spaces = [
      group('manual'),
      group('live', 'attention'),
      group('another-live', 'attention'),
    ];
    board = addEvidence(board, 'live', 'region');
    board = addEvidence(board, 'manual', 'region');
    board = removeEvidence(board, 'manual', 'region');
    expect(board.spaces[1].items).toHaveLength(1);
    expect(board.quotations.find((q) => q.id === 'region')!.codeIds).toEqual(['attention']);
    board = removeEvidence(board, 'live', 'region');
    expect(board.spaces.every((space) => !space.items.length)).toBe(true);
    expect(board.quotations.find((q) => q.id === 'region')).toBeDefined();
    expect(board.codes).toHaveLength(1);
  });

  it('removes deleted quotation references and keeps a frozen snapshot safe during docking and group movement', () => {
    let board = fixture();
    board.spaces = [{ ...group('manual'), dock: { to: 'audio', side: 'bottom', offset: 0 } }];
    board = addEvidence(board, 'manual', 'region');
    const snapshot = structuredClone(board);
    Object.freeze(board.spaces[0]);
    Object.freeze(board.spaces[0].items[0]);
    const laidOut = reflow(board);
    expect(board).toEqual(snapshot);
    expect(laidOut.spaces[0]).toMatchObject({ x: 100, y: 495 });
    const moved = translate(laidOut, new Map([[laidOut.spaces[0].id, laidOut.spaces[0]]]), {
      x: 30,
      y: 20,
    });
    expect(moved.spaces[0]).toMatchObject({ x: 130, y: 515, items: board.spaces[0].items });
    expect(visibleModuleIds(moved, { width: 1200, height: 900 }).has('manual')).toBe(true);
    const removed = reconcileSpaces({
      ...board,
      quotations: board.quotations.filter((q) => q.id !== 'region'),
    });
    expect(removed.spaces[0].items).toEqual([]);
  });
});

describe('portable evidence spaces', () => {
  it.each(['missing-quote', 'duplicate-quote', 'missing-code', 'invalid-position', 'sparse-items'])(
    'rejects %s before project replacement',
    (invalid) => {
      const board = fixture();
      const space = group('manual');
      space.items = [{ quotationId: 'region', x: 12, y: 12 }];
      board.spaces = [space];
      if (invalid === 'missing-quote') space.items[0].quotationId = 'absent';
      if (invalid === 'duplicate-quote') space.items.push({ ...space.items[0] });
      if (invalid === 'missing-code') space.codeId = 'absent';
      if (invalid === 'invalid-position') space.items[0].x = NaN;
      if (invalid === 'sparse-items') space.items = new Array(1);
      expect(() => validateBoard(board)).toThrow(/evidence|collection/i);
    },
  );

  it('roundtrips memos and arrangements with one original and no duplicate analytical CSV rows', async () => {
    let board: Board = fixture();
    board.spaces = [group('manual'), group('live', 'attention')];
    board = addEvidence(board, 'manual', 'region', { x: 303, y: 215 });
    board = addEvidence(board, 'live', 'region');
    const csv = csvExport(board);
    expect(csv.split('\r\n').filter((row) => row.startsWith('"region","'))).toHaveLength(1);
    const assets = new Map(assetKeys(board).map((id) => [id, new Blob([`original:${id}`])]));
    const backup = await backupBoard(board, assets);
    const zip = await JSZip.loadAsync(await backup.arrayBuffer());
    expect(
      Object.keys(zip.files).filter((path) => path.startsWith('assets/') && !zip.files[path].dir),
    ).toHaveLength(2);
    const restored = await restoreArchive(backup);
    expect(restored.board).toEqual(board);
    expect(await restored.assets.get('video')!.text()).toBe('original:video');
    expect(csvExport(restored.board)).toBe(csv);
  });
});
