import { useMachine } from '../useMachine';
import { projectTransition, type ProjectState, type ProjectEvent } from '../project';

export function useProjectState() {
  const machine = useMachine<ProjectState, ProjectEvent>(projectTransition, { kind: 'loading' });
  const { state } = machine;
  return {
    ...machine,
    loaded:
      state.kind === 'ready' ||
      state.kind === 'exporting' ||
      (state.kind === 'opening' && state.fallback.kind === 'ready'),
    fatal: state.kind === 'unavailable' ? state.message : '',
    locked: state.kind !== 'ready',
    operation: state.kind === 'opening' || state.kind === 'exporting',
  };
}
export type Project = ReturnType<typeof useProjectState>;
