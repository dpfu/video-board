import type { Board, Point } from './model';

export type RangeDraft = {
  id: string;
  sourceId: string;
  parentId: string;
  start: number;
  end: number;
  min: number;
  max: number;
};
export type EditingState =
  | { kind: 'idle' }
  | { kind: 'quotation'; id: string; popover?: Point }
  | { kind: 'drawing'; stillId: string; frameId: string; id: string }
  | { kind: 'segment'; draft: RangeDraft; valid: boolean; returnTo: string | null };
export type EditingEvent =
  | { type: 'selectView' | 'selectQuotation'; id: string }
  | { type: 'code'; id: string; at: Point }
  | { type: 'draw'; stillId: string; frameId: string }
  | { type: 'regionCreated'; stillId: string; id: string }
  | { type: 'startSegment'; draft: RangeDraft }
  | { type: 'changeDraft'; draft: RangeDraft }
  | { type: 'draftValidity'; id: string; valid: boolean }
  | { type: 'segmentSaved'; id: string; draftId: string }
  | { type: 'closePopover' | 'escape' | 'reset' }
  | { type: 'reconcile' | 'undo'; board: Board };

export const activeQuotationId = (state: EditingState) =>
  state.kind === 'idle' ? null : state.kind === 'segment' ? state.draft.parentId : state.id;

function focus(id: string | null): EditingState {
  return id ? { kind: 'quotation', id } : { kind: 'idle' };
}

export function canSaveSegment(state: EditingState) {
  if (state.kind !== 'segment' || !state.valid) return false;
  const { start, end, min, max } = state.draft;
  return (
    Number.isFinite(start) && Number.isFinite(end) && start >= min && end <= max && end > start
  );
}

export function editingTransition(state: EditingState, event: EditingEvent): EditingState {
  switch (event.type) {
    case 'reset':
      return state.kind === 'idle' ? state : { kind: 'idle' };
    case 'selectView':
      return state.kind === 'segment' || state.kind === 'drawing' ? state : focus(event.id);
    case 'selectQuotation':
      return focus(event.id);
    case 'code':
      return { kind: 'quotation', id: event.id, popover: event.at };
    case 'closePopover':
      return state.kind === 'quotation' && state.popover ? focus(state.id) : state;
    case 'draw':
      return state.kind === 'drawing' && state.stillId === event.stillId
        ? focus(event.frameId)
        : { kind: 'drawing', stillId: event.stillId, frameId: event.frameId, id: event.frameId };
    case 'regionCreated':
      return state.kind === 'drawing' && state.stillId === event.stillId
        ? { ...state, id: event.id }
        : state;
    case 'startSegment':
      return {
        kind: 'segment',
        draft: event.draft,
        valid: true,
        returnTo: activeQuotationId(state),
      };
    case 'changeDraft':
      return state.kind === 'segment' && state.draft.id === event.draft.id
        ? { ...state, draft: { ...state.draft, start: event.draft.start, end: event.draft.end } }
        : state;
    case 'draftValidity':
      return state.kind === 'segment' && state.draft.id === event.id && state.valid !== event.valid
        ? { ...state, valid: event.valid }
        : state;
    case 'segmentSaved':
      return state.kind === 'segment' && state.draft.id === event.draftId && canSaveSegment(state)
        ? focus(event.id)
        : state;
    case 'escape':
      return focus(state.kind === 'segment' ? state.returnTo : activeQuotationId(state));
    case 'undo': {
      const id = state.kind === 'segment' ? state.returnTo : activeQuotationId(state);
      return focus(event.board.quotations.some((q) => q.id === id) ? id : null);
    }
    case 'reconcile': {
      const has = (id: string) => event.board.quotations.some((q) => q.id === id);
      if (state.kind === 'idle') return state;
      if (state.kind === 'segment') return has(state.draft.parentId) ? state : focus(null);
      if (!has(state.id)) return focus(null);
      if (
        state.kind === 'drawing' &&
        !event.board.stills.some((still) => still.id === state.stillId)
      )
        return focus(state.id);
      return state;
    }
  }
}
