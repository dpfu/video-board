import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { csvExport, editQuotation, quotation } from '../src/analysis';
import { assetKeys } from '../src/store';
import { migrateBoard, type V2Board } from '../src/model';
import { boardFixture } from './board';

describe('source-linked qualitative selections', () => {
  it('retimes every region on a frame while retaining its geometry, identity, codes and memo', () => {
    const board = boardFixture(), frame = board.quotations[1];
    const region = { ...quotation('video', 'region', frame.start, frame.end, frame.id), rect: { x: .1, y: .2, width: .4, height: .3 }, codeIds: ['attention'], memo: 'Analytical observation' };
    board.quotations.push(region);
    const next = editQuotation(board, frame.id, { start: 2, end: 2.04 });
    expect(next.quotations.find(q => q.id === region.id)).toMatchObject({ ...region, start: 2, end: 2.04, updatedAt: expect.any(String) });
    expect(board.quotations[1].start).toBe(1.25);
  });
  it('retains overlapping and out-of-parent source ranges after trimming a clip', () => {
    const board = boardFixture(), clip = quotation('video', 'range', 1, 3), child = quotation('video', 'range', 1.5, 2.75, clip.id), overlap = quotation('video', 'range', 2, 3.5);
    board.quotations.push(clip, child, overlap);
    const next = editQuotation(board, clip.id, { start: 2, end: 2.5 });
    expect(next.quotations.find(q => q.id === child.id)).toEqual(child);
    expect(next.quotations.find(q => q.id === overlap.id)).toEqual(overlap);
  });
  it('keeps media and coded occurrences unique across duplicate views and CSV export', () => {
    const board = boardFixture(), q = { ...quotation('video', 'range', 1, 2), memo: 'Line one\n"line two", detail', codeIds: ['code'] };
    board.codes.push({ id: 'code', name: '=Observation', color: '#aabbcc', definition: 'A definition' }); board.quotations.push(q);
    board.clips.push({ id: 'clip-a', videoId: 'video', quotationId: q.id, time: 1, x: 0, y: 0, width: 340, z: 1 }, { id: 'clip-b', videoId: 'video', quotationId: q.id, time: 1, x: 0, y: 300, width: 340, z: 2 });
    board.stills.push({ ...board.stills[0], id: 'still-view-b', assetId: 'still' });
    expect(assetKeys(board)).toEqual(['video', 'still']);
    const csv = csvExport(board);
    expect(csv.split(`"${q.id}"`)).toHaveLength(2);
    expect(csv).toContain('"\'=Observation"');
    expect(csv).toContain('Line one\n""line two"", detail');
    expect(csv).toContain('"A definition"');
  });
  it('adds uncoded frame/source quotations to v2 without changing original IDs or mutating its snapshot', () => {
    const { quotations: _q, clips: _c, codes: _code, panels: _p, ...base } = boardFixture();
    const old: V2Board = { ...base, version: 2, stills: base.stills.map(({ quotationId: _id, ...s }) => s) }, before = structuredClone(old);
    const next = migrateBoard(old);
    expect(old).toEqual(before);
    expect(next.videos).toEqual(old.videos);
    expect(next.quotations.map(q => [q.sourceId, q.kind, q.start, q.codeIds])).toEqual([['video', 'video', 0, []], ['video', 'frame', 1.25, []]]);
    expect(next.stills[0]).toMatchObject({ id: 'still', quotationId: next.quotations[1].id, time: 1.25 });
    expect(assetKeys(next)).toEqual(assetKeys(boardFixture()));
  });
});
