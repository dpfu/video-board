import {
  useEffect,
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { allCards, boardBoxes, clamp, mapCards, topZ, type ModuleCard, type Point } from '../model';
import {
  applySnap,
  detachModule,
  dockIndex,
  createSnapSearch,
  groupIds,
  reflow,
  rootId,
  translate,
  type Snap,
} from '../docking';
import { useBoardMotion } from '../motion';
import { MoveView, paintSnap } from '../gestureView';
import type { BoardDocument } from './useDocument';
import type { Viewport } from './useViewport';
import type { Editing } from './useEditing';
import type { Previews } from './usePreviews';
import type { Project } from './useProjectState';
import { useActions } from '../useActions';

type PointerOrigin = {
  pointer: number;
  x: number;
  y: number;
  scale: number;
};
type Gesture = PointerOrigin &
  (
    | { kind: 'pan'; origin: Point }
    | { kind: 'resize'; id: string; origin: Point & { width: number; height: number } }
    | {
        kind: 'move';
        id: string;
        origin: Point;
        originals: Map<string, ModuleCard>;
        moving: Set<string>;
        root: string;
        delta: Point;
        search: ReturnType<typeof createSnapSearch>;
        view: MoveView;
      }
  );

export function useInteraction(
  document: BoardDocument,
  viewport: Viewport,
  editing: Editing,
  previews: Previews,
  project: Project,
) {
  const {
    board,
    current,
    actions: { change, checkpoint },
  } = document;
  const {
    stage,
    actions: { zoom },
  } = viewport;
  const {
    actions: { selectModule, select: setSelected },
  } = editing;
  const stopHover = previews.actions.interrupt;
  const editingLocked = project.locked;
  const [hand, setHand] = useState(false);
  const [space, setSpace] = useState(false);
  const [snap, setSnap] = useState<Snap | null>(null);
  const snapRef = useRef<Snap | null>(null);
  const [moving, setMoving] = useState(new Set<string>());
  const gesture = useRef<Gesture | null>(null);
  const releasedView = useRef<MoveView | null>(null);
  const docks = useMemo(
    () => dockIndex(board),
    [board.videos, board.stills, board.tracks, board.clips, board.panels, board.spaces],
  );
  const motion = useBoardMotion(board, stage, project.loaded, () => !!gesture.current);
  function finishGesture(commit: boolean) {
    const g = gesture.current;
    if (g?.kind === 'move') {
      motion.remember(
        [...g.originals.values()].map((card) => ({
          id: card.id,
          x: card.x + g.delta.x,
          y: card.y + g.delta.y,
        })),
      );
      releasedView.current = g.view;
      if (commit && snapRef.current)
        document.actions.preview((b) => applySnap(b, snapRef.current!));
    }
    gesture.current = null;
    document.actions.publish();
    snapRef.current = null;
    setSnap(null);
    setMoving(new Set());
    globalThis.document.body.classList.remove('is-dragging');
    previews.actions.blockHover(false);
  }
  useLayoutEffect(() => {
    const g = gesture.current;
    if (g?.kind === 'move' && stage.current) {
      g.view = new MoveView(stage.current, board, g.originals);
      g.search = createSnapSearch(current.current, g.moving, g.root, g.originals);
      g.view.paint(g.delta);
      paintSnap(stage.current, snapRef.current);
    }
    if (!g) {
      releasedView.current?.clear(board);
      releasedView.current = null;
    }
  }, [board, snap, moving]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const g = gesture.current;
      if (!g || g.pointer !== event.pointerId || project.current.current.kind !== 'ready') return;
      const dx = (event.clientX - g.x) / g.scale,
        dy = (event.clientY - g.y) / g.scale;
      event.stopPropagation();
      if (g.kind === 'pan')
        viewport.actions.previewCamera({
          ...current.current.camera,
          x: g.origin.x + dx,
          y: g.origin.y + dy,
        });
      else if (g.kind === 'move') {
        g.delta = { x: dx, y: dy };
        document.actions.preview((b) => translate(b, g.originals, g.delta));
        g.view.paint(g.delta);
        const candidate = event.shiftKey ? null : g.search(g.delta, current.current.camera.scale);
        const previous = snapRef.current;
        snapRef.current = candidate;
        if (
          previous?.dock.to !== candidate?.dock.to ||
          previous?.dock.side !== candidate?.dock.side
        )
          setSnap(candidate);
        else paintSnap(stage.current, candidate);
      } else
        change((b) =>
          reflow(
            mapCards(b, (card) => {
              if (card.id !== g.id) return card;
              const track = b.tracks.find((t) => t.id === card.id),
                video = b.videos.some((v) => v.id === card.id),
                panel = b.panels.some((p) => p.id === card.id),
                evidenceSpace = b.spaces.some((s) => s.id === card.id),
                clip = b.clips.some((c) => c.id === card.id);
              return {
                ...card,
                width: clamp(
                  (g.origin.width || 300) + dx,
                  evidenceSpace ? 400 : track ? 240 : panel || video || clip ? 320 : 280,
                  1600,
                ),
                height: clamp(
                  (g.origin.height || 100) + dy,
                  evidenceSpace
                    ? 320
                    : track
                      ? track.kind === 'cuts'
                        ? 96
                        : 72
                      : panel
                        ? 280
                        : clip
                          ? 230
                          : video
                            ? 190
                            : 110,
                  track ? 600 : 1200,
                ),
              };
            }),
          ),
        );
    };
    const pointerUp = (event: PointerEvent) => {
      if (gesture.current?.pointer === event.pointerId) actions.finishGesture(!event.shiftKey);
    };
    const pointerCancel = (event: PointerEvent) => {
      if (gesture.current?.pointer === event.pointerId) actions.finishGesture(false);
    };
    const down = (event: KeyboardEvent) => {
      if (event.defaultPrevented || project.current.current.kind !== 'ready') return;
      if (event.key === 'Escape') {
        actions.finishGesture(false);
        setSelected(null);
        setHand(false);
        editing.actions.escape();
        previews.actions.stop();
        return;
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z' &&
        !(event.target as Element)?.closest('input, textarea, select, [contenteditable="true"]')
      ) {
        event.preventDefault();
        actions.undo();
        return;
      }
      if ((event.target as Element)?.closest('input, select, textarea, button, a')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpace(true);
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpace(false);
    };
    const blur = () => {
      setSpace(false);
      actions.finishGesture(false);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if (project.current.current.kind !== 'ready') return;
      if ((event.target as Element).closest('select, input')) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const box = element.getBoundingClientRect();
        zoom(
          Math.exp(-event.deltaY * 0.008),
          {
            x: event.clientX - box.left,
            y: event.clientY - box.top,
          },
          true,
        );
      } else
        viewport.actions.previewCamera({
          ...current.current.camera,
          x: current.current.camera.x - event.deltaX,
          y: current.current.camera.y - event.deltaY,
        });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, []);

  function begin(
    event: ReactPointerEvent,
    kind: 'move' | 'resize',
    id: string,
    independent = false,
  ) {
    if (
      editingLocked ||
      gesture.current ||
      event.button !== 0 ||
      (kind === 'move' &&
        !independent &&
        (event.target as Element).closest('button, input, select'))
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    checkpoint();
    previews.actions.blockHover(true);
    let base =
      kind === 'move' && (independent || event.altKey)
        ? detachModule(current.current, id)
        : current.current;
    const ids = kind === 'move' ? groupIds(base, id) : new Set([id]);
    const offsets = motion.interrupt(ids);
    base = mapCards(base, (card) => {
      const offset = offsets.get(card.id);
      return offset ? { ...card, x: card.x + offset.x, y: card.y + offset.y } : card;
    });
    const card = boardBoxes(base).find((c) => c.id === id);
    if (!card) return;
    const originals = new Map(
      allCards(base)
        .filter((c) => ids.has(c.id))
        .map((c) => [c.id, c]),
    );
    const origin = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      id,
      origin: { x: card.x, y: card.y, width: card.width, height: card.height },
      scale: base.camera.scale,
    };
    const root = rootId(base, id);
    gesture.current =
      kind === 'move' && stage.current
        ? {
            ...origin,
            kind,
            originals,
            moving: ids,
            root,
            delta: { x: 0, y: 0 },
            search: createSnapSearch(base, ids, root, originals),
            view: new MoveView(stage.current, board, originals),
          }
        : { ...origin, kind: 'resize' };
    event.currentTarget.setPointerCapture(event.pointerId);
    globalThis.document.body.classList.add('is-dragging');
    if (kind === 'move') selectModule(id);
    else setSelected(id);
    const z = topZ(base);
    setMoving(ids);
    change(() =>
      mapCards(base, (c) => (ids.has(c.id) ? { ...c, z: z + [...ids].indexOf(c.id) } : c)),
    );
  }
  function undock(id: string) {
    if (editingLocked) return;
    checkpoint();
    stopHover();
    change((b) =>
      mapCards(detachModule(b, id), (c) =>
        c.id === id ? { ...c, x: c.x + 22, y: c.y + 12, z: topZ(b) } : c,
      ),
    );
    setSelected(id);
  }
  function controlsFor(id: string) {
    return {
      docked: (docks.groups.get(id)?.size || 0) > 1,
      onPeel: (event: ReactPointerEvent) => actions.begin(event, 'move', id, true),
      onDetach: () => actions.undock(id),
    };
  }
  function pan(event: ReactPointerEvent) {
    if (editingLocked || gesture.current || ![0, 1].includes(event.button)) return;
    if ((event.target as Element).closest('.board-tools, .zoom-tools, .empty-board')) return;
    if (!hand && !space && event.button !== 1 && (event.target as Element).closest('.board-card'))
      return;
    event.preventDefault();
    event.stopPropagation();
    previews.actions.blockHover(true);
    const camera = current.current.camera;
    gesture.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      kind: 'pan',
      origin: { x: camera.x, y: camera.y },
      scale: 1,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    globalThis.document.body.classList.add('is-dragging');
    if (!hand && !space) setSelected(null);
  }

  function undo() {
    if (project.current.current.kind !== 'ready') return;
    if (gesture.current) finishGesture(false);
    if (!document.actions.undo()) return;
    editing.actions.undo();
    previews.actions.stop();
  }
  const actions = useActions({
    begin,
    pan,
    undock,
    controlsFor,
    finishGesture,
    undo,
    setHand,
    lostCapture(event: ReactPointerEvent) {
      if (gesture.current?.pointer === event.pointerId) finishGesture(false);
    },
    highlight: motion.highlight,
  });
  useEffect(() => {
    if (stage.current) stage.current.inert = project.locked;
  }, [project.locked, stage]);
  useEffect(
    () => () => {
      actions.finishGesture(false);
      releasedView.current?.clear(current.current);
      releasedView.current = null;
      documentBodyCleanup();
    },
    [],
  );
  return { hand, space, snap, moving, docks, actions };
}
function documentBodyCleanup() {
  globalThis.document.body.classList.remove('is-dragging');
}
export type Interaction = ReturnType<typeof useInteraction>;
