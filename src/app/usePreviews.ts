import { useEffect, useMemo, useRef } from 'react';
import { useMachine } from '../useMachine';
import {
  previewTransition,
  previewView,
  type PreviewState,
  type PreviewEvent,
  type PreviewTarget,
} from '../preview';
import type { BoardDocument } from './useDocument';
import type { Project } from './useProjectState';
import { useActions } from '../useActions';

export function usePreviews(document: BoardDocument, project: Project) {
  const machine = useMachine<PreviewState, PreviewEvent>(previewTransition, { kind: 'idle' });
  const blocked = useRef(false);
  const view = useMemo(() => previewView(machine.state), [machine.state]);
  const actions = useActions({
    hover(target: PreviewTarget, hover: boolean) {
      if (hover && (blocked.current || project.current.current.kind !== 'ready')) return;
      machine.send({ type: hover ? 'enter' : 'leave', target });
    },
    pin(target: PreviewTarget) {
      if (project.current.current.kind === 'ready') machine.send({ type: 'pin', target });
    },
    stop() {
      machine.send({ type: 'stop' });
    },
    interrupt() {
      machine.send({ type: 'interruptHover' });
    },
    blockHover(value: boolean) {
      blocked.current = value;
      if (value) machine.send({ type: 'interruptHover' });
    },
    reconcile() {
      machine.send({ type: 'reconcile', board: document.current.current });
    },
  });
  useEffect(() => {
    if (machine.state.kind !== 'pending') return;
    const target = machine.state.target;
    const timer = setTimeout(() => {
      machine.send(
        project.current.current.kind === 'ready' && !blocked.current
          ? { type: 'elapsed', target }
          : { type: 'interruptHover' },
      );
    }, 120);
    return () => clearTimeout(timer);
  }, [machine.state, project.current, machine.send]);
  useEffect(actions.reconcile, [document.board.spaces, document.board.clips, actions]);
  return { view, actions };
}
export type Previews = ReturnType<typeof usePreviews>;
