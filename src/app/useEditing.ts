import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useMachine } from '../useMachine';
import {
  editingTransition,
  activeQuotationId,
  canSaveSegment,
  type EditingState,
  type EditingEvent,
} from '../editing';
import { editQuotation, quotation } from '../analysis';
import {
  clamp,
  sourceQuotationId,
  topZ,
  type Code,
  type Quotation,
  type StillCard,
  type Rect,
} from '../model';
import type { BoardDocument } from './useDocument';
import type { Viewport } from './useViewport';
import { useActions } from '../useActions';

export function useEditing(document: BoardDocument, viewport: Viewport) {
  const {
    current,
    board,
    actions: { change, checkpoint },
  } = document;
  const {
    stage,
    actions: { exposeModule },
  } = viewport;
  const editing = useMachine<EditingState, EditingEvent>(editingTransition, { kind: 'idle' });
  const [selected, setSelected] = useState<string | null>(null);
  const activeQuotation = activeQuotationId(editing.state);
  const draft = editing.state.kind === 'segment' ? editing.state.draft : null;
  function openCodes(revealExisting = false) {
    const existing = current.current.panels[0];
    if (existing) {
      if (revealExisting) exposeModule(existing.id);
      return;
    }
    const c = current.current.camera,
      width = stage.current?.clientWidth || 1200;
    change((b) => ({
      ...b,
      panels: [
        {
          id: crypto.randomUUID(),
          kind: 'codes',
          x: (width - 352 - c.x) / c.scale,
          y: (22 - c.y) / c.scale,
          width: 326,
          height: 610,
          z: topZ(b),
        },
      ],
    }));
  }
  function showCoding(id: string) {
    const rect = globalThis.document.activeElement?.getBoundingClientRect();
    editing.send({
      type: 'code',
      id,
      at: {
        x: clamp((rect?.right || 300) - 260, 12, Math.max(12, window.innerWidth - 272)),
        y: clamp(rect?.bottom || 80, 60, Math.max(60, window.innerHeight - 370)),
      },
    });
  }
  function selectModule(id: string) {
    setSelected(id);
    const b = current.current;
    const trackSource = b.tracks.find((t) => t.id === id)?.videoId;
    const q =
      b.stills.find((s) => s.id === id)?.quotationId ||
      b.clips.find((c) => c.id === id)?.quotationId ||
      (b.videos.some((v) => v.id === id)
        ? sourceQuotationId(id)
        : trackSource
          ? sourceQuotationId(trackSource)
          : undefined);
    if (q) editing.send({ type: 'selectView', id: q });
  }
  function selectCard(event: ReactPointerEvent, id: string) {
    // Operating a view is separate from choosing evidence to code. In
    // particular, playback and frame controls must retain a selected child.
    if (
      (event.target as Element).closest(
        'button, input, select, textarea, [role="slider"], .video-image, .clip-media',
      )
    )
      setSelected(id);
    else selectModule(id);
  }
  function patchQuotation(id: string, patch: Partial<Quotation>) {
    change((b) => editQuotation(b, id, patch));
  }
  function addCode(name: string) {
    const trimmed = name.trim();
    if (!trimmed || editing.current.current.kind === 'segment') return;
    const existing = current.current.codes.find(
      (c) => c.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
    );
    const target = current.current.quotations.find(
      (q) => q.id === activeQuotationId(editing.current.current),
    );
    if (existing && (!target || target.codeIds.includes(existing.id))) return;
    checkpoint();
    const colors = ['#b7cde5', '#d9b5c8', '#b8ceb0', '#e1c496', '#c3b8de'];
    const code: Code = existing || {
      id: crypto.randomUUID(),
      name: trimmed,
      color: colors[current.current.codes.length % colors.length],
      definition: '',
    };
    change((b) => {
      const added = existing ? b : { ...b, codes: [...b.codes, code] };
      return target
        ? editQuotation(added, target.id, { codeIds: [...target.codeIds, code.id] })
        : added;
    });
  }
  function assignCode(codeId: string) {
    if (editing.current.current.kind === 'segment') return;
    const q = current.current.quotations.find(
      (q) => q.id === activeQuotationId(editing.current.current),
    );
    if (!q) return;
    checkpoint();
    patchQuotation(q.id, {
      codeIds: q.codeIds.includes(codeId)
        ? q.codeIds.filter((id) => id !== codeId)
        : [...q.codeIds, codeId],
    });
  }
  function segment(sourceId: string, parentId: string, time: number) {
    const q = current.current.quotations.find((q) => q.id === parentId);
    if (!q) return;
    const start = clamp(time, q.start, Math.max(q.start, q.end - 0.001));
    editing.send({
      type: 'startSegment',
      draft: {
        id: crypto.randomUUID(),
        sourceId,
        parentId,
        min: q.start,
        max: q.end,
        start,
        end: Math.min(q.end, start + 1),
      },
    });
    openCodes(true);
  }
  function saveSegment() {
    const state = editing.current.current;
    if (
      !canSaveSegment(state) ||
      state.kind !== 'segment' ||
      !current.current.quotations.some((q) => q.id === state.draft.parentId)
    )
      return;
    const draft = state.draft;
    checkpoint();
    const q = quotation(draft.sourceId, 'range', draft.start, draft.end, draft.parentId);
    change((b) => ({ ...b, quotations: [...b.quotations, q] }));
    editing.send({ type: 'segmentSaved', id: q.id, draftId: draft.id });
  }
  function createRegion(still: StillCard, rect: Rect) {
    const state = editing.current.current;
    if (state.kind !== 'drawing' || state.stillId !== still.id) return;
    checkpoint();
    const duration = current.current.videos.find((v) => v.id === still.videoId)!.duration;
    const q = {
      ...quotation(
        still.videoId,
        'region',
        still.time,
        Math.min(duration, still.time + still.duration),
        still.quotationId,
      ),
      rect,
    };
    change((b) => ({ ...b, quotations: [...b.quotations, q] }));
    editing.send({ type: 'regionCreated', stillId: still.id, id: q.id });
    openCodes();
  }
  const actions = useActions({
    openCodes,
    showCoding,
    selectModule,
    selectCard,
    patchQuotation,
    addCode,
    assignCode,
    segment,
    saveSegment,
    createRegion,
    select: setSelected,
    send: editing.send,
    reset() {
      setSelected(null);
      editing.send({ type: 'reset' });
    },
    escape() {
      setSelected(null);
      editing.send({ type: 'escape' });
    },
    undo() {
      editing.send({ type: 'undo', board: current.current });
    },
  });
  useEffect(() => {
    editing.send({ type: 'reconcile', board: current.current });
  }, [board.stills, board.quotations, editing.send, current]);
  return {
    selected,
    activeQuotation,
    draft,
    actions,
    drawing: editing.state.kind === 'drawing' ? editing.state.stillId : null,
    draftValid: canSaveSegment(editing.state),
    popover: editing.state.kind === 'quotation' ? editing.state.popover : undefined,
  };
}
export type Editing = ReturnType<typeof useEditing>;
