import type { Board } from './model';

export type PreviewTarget =
  { kind: 'clip'; id: string } | { kind: 'evidence'; spaceId: string; quotationId: string };
export type PreviewState =
  { kind: 'idle' } | { kind: 'pending' | 'hovering' | 'pinned'; target: PreviewTarget };
export type PreviewEvent =
  | { type: 'enter' | 'leave' | 'elapsed' | 'pin'; target: PreviewTarget }
  | { type: 'interruptHover' | 'stop' }
  | { type: 'reconcile'; board: Board };

export const previewId = (target: PreviewTarget) =>
  target.kind === 'clip' ? target.id : `${target.spaceId}/${target.quotationId}`;

export function previewTransition(state: PreviewState, event: PreviewEvent): PreviewState {
  switch (event.type) {
    case 'stop':
      return state.kind === 'idle' ? state : { kind: 'idle' };
    case 'interruptHover':
      return state.kind === 'pinned' || state.kind === 'idle' ? state : { kind: 'idle' };
    case 'pin':
      return { kind: 'pinned', target: event.target };
    case 'enter':
      return state.kind === 'pinned' ? state : { kind: 'pending', target: event.target };
    case 'leave':
      return state.kind !== 'idle' &&
        state.kind !== 'pinned' &&
        previewId(state.target) === previewId(event.target)
        ? { kind: 'idle' }
        : state;
    case 'elapsed':
      return state.kind === 'pending' && previewId(state.target) === previewId(event.target)
        ? { kind: 'hovering', target: event.target }
        : state;
    case 'reconcile': {
      if (state.kind === 'idle') return state;
      const target = state.target;
      const present =
        target.kind === 'clip'
          ? event.board.clips.some((clip) => clip.id === target.id)
          : event.board.spaces.some(
              (space) =>
                space.id === target.spaceId &&
                space.items.some((item) => item.quotationId === target.quotationId),
            );
      return present ? state : { kind: 'idle' };
    }
  }
}

export function previewView(state: PreviewState) {
  if (state.kind === 'idle' || state.kind === 'pending') return null;
  return {
    id: previewId(state.target),
    pinned: state.kind === 'pinned',
    moduleId: state.target.kind === 'evidence' ? state.target.spaceId : undefined,
  };
}
