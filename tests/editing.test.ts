import { describe, expect, it } from 'vitest';
import {
  editingTransition as send,
  activeQuotationId,
  canSaveSegment,
  type EditingState,
  type RangeDraft,
} from '../src/editing';
import { boardFixture } from './board';

const idle: EditingState = { kind: 'idle' };
const draft: RangeDraft = {
  id: 'draft-a',
  sourceId: 'video',
  parentId: 'source-video',
  start: 1,
  end: 2,
  min: 0,
  max: 4,
};

describe('evidence editing modes', () => {
  it('makes drawing and segment drafting exclusive while layout selection preserves the active mode', () => {
    const drawing = send(idle, { type: 'draw', stillId: 'still', frameId: 'frame-still' });
    expect(send(drawing, { type: 'selectView', id: 'source-video' })).toBe(drawing);
    const segment = send(drawing, { type: 'startSegment', draft });
    expect(segment.kind).toBe('segment');
    expect(send(segment, { type: 'selectView', id: 'frame-still' })).toBe(segment);
    expect(send(segment, { type: 'draw', stillId: 'still', frameId: 'frame-still' }).kind).toBe(
      'drawing',
    );
    expect(send(segment, { type: 'code', id: 'frame-still', at: { x: 20, y: 30 } })).toEqual({
      kind: 'quotation',
      id: 'frame-still',
      popover: { x: 20, y: 30 },
    });
  });

  it('binds validity and edits to the draft identity and blocks invalid saves', () => {
    let state = send(idle, { type: 'startSegment', draft });
    state = send(state, { type: 'draftValidity', id: draft.id, valid: false });
    expect(canSaveSegment(state)).toBe(false);
    expect(send(state, { type: 'segmentSaved', id: 'new-quotation', draftId: draft.id })).toBe(
      state,
    );
    state = send(state, { type: 'startSegment', draft: { ...draft, id: 'draft-b' } });
    expect(canSaveSegment(state)).toBe(true);
    expect(send(state, { type: 'draftValidity', id: draft.id, valid: false })).toBe(state);
    expect(send(state, { type: 'changeDraft', draft: { ...draft, end: 3 } })).toBe(state);
    expect(
      canSaveSegment(
        send(state, { type: 'changeDraft', draft: { ...draft, id: 'draft-b', end: Infinity } }),
      ),
    ).toBe(false);
    expect(send(state, { type: 'segmentSaved', id: 'new-quotation', draftId: draft.id })).toBe(
      state,
    );
    expect(send(state, { type: 'segmentSaved', id: 'new-quotation', draftId: 'draft-b' })).toEqual({
      kind: 'quotation',
      id: 'new-quotation',
    });
  });

  it('rejects a late region creation after Escape or a switch to another mode', () => {
    const drawing = send(idle, { type: 'draw', stillId: 'still', frameId: 'frame-still' });
    const created = send(drawing, { type: 'regionCreated', stillId: 'still', id: 'region' });
    expect(activeQuotationId(created)).toBe('region');
    const escaped = send(created, { type: 'escape' });
    expect(send(escaped, { type: 'regionCreated', stillId: 'still', id: 'late-region' })).toBe(
      escaped,
    );
    const segment = send(created, { type: 'startSegment', draft });
    expect(send(segment, { type: 'regionCreated', stillId: 'still', id: 'late-region' })).toBe(
      segment,
    );
  });

  it('cancels a draft when its parent is removed and leaves quotation data untouched', () => {
    const board = boardFixture(),
      before = structuredClone(board);
    const state = send(idle, { type: 'startSegment', draft });
    expect(send(state, { type: 'reconcile', board })).toBe(state);
    expect(send(state, { type: 'reconcile', board: { ...board, quotations: [] } })).toEqual(idle);
    expect(board).toEqual(before);
    const drawing = send(idle, { type: 'draw', stillId: 'still', frameId: 'frame-still' });
    expect(send(drawing, { type: 'reconcile', board: { ...board, stills: [] } })).toEqual({
      kind: 'quotation',
      id: 'frame-still',
    });
  });

  it('restores a valid focus on cancel/Undo and clears all context on project replacement', () => {
    const focus = send(idle, { type: 'selectQuotation', id: 'frame-still' });
    const segment = send(focus, { type: 'startSegment', draft });
    expect(send(segment, { type: 'escape' })).toEqual(focus);
    expect(send(segment, { type: 'undo', board: boardFixture() })).toEqual(focus);
    expect(send(segment, { type: 'undo', board: { ...boardFixture(), quotations: [] } })).toEqual(
      idle,
    );
    expect(send(segment, { type: 'reset' })).toEqual(idle);
  });
});
