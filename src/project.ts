type RestingProject = { kind: 'ready' } | { kind: 'unavailable'; message: string };
export type ProjectState =
  | { kind: 'loading' }
  | RestingProject
  | { kind: 'exporting'; format: 'png' | 'zip' }
  | {
      kind: 'opening';
      phase: 'reading' | 'backup' | 'draining' | 'committing' | 'installing';
      fallback: RestingProject;
    };
export type ProjectEvent =
  | { type: 'loaded' }
  | { type: 'loadFailed'; message: string }
  | { type: 'open' }
  | { type: 'export'; format: 'png' | 'zip' }
  | { type: 'archiveRead' | 'recoveryCreated' | 'jobsDrained' | 'storageCommitted' | 'finished' }
  | { type: 'failed'; message: string };

export function projectTransition(state: ProjectState, event: ProjectEvent): ProjectState {
  switch (event.type) {
    case 'loaded':
      return state.kind === 'loading' ? { kind: 'ready' } : state;
    case 'loadFailed':
      return state.kind === 'loading' ? { kind: 'unavailable', message: event.message } : state;
    case 'open':
      return state.kind === 'ready' || state.kind === 'unavailable'
        ? { kind: 'opening', phase: 'reading', fallback: state }
        : state;
    case 'export':
      return state.kind === 'ready' ? { kind: 'exporting', format: event.format } : state;
    case 'archiveRead':
      return state.kind === 'opening' && state.phase === 'reading'
        ? { ...state, phase: 'backup' }
        : state;
    case 'recoveryCreated':
      return state.kind === 'opening' && state.phase === 'backup'
        ? { ...state, phase: 'draining' }
        : state;
    case 'jobsDrained':
      return state.kind === 'opening' && state.phase === 'draining'
        ? { ...state, phase: 'committing' }
        : state;
    case 'storageCommitted':
      return state.kind === 'opening' && state.phase === 'committing'
        ? { ...state, phase: 'installing' }
        : state;
    case 'finished':
      return state.kind === 'exporting' ||
        (state.kind === 'opening' && state.phase === 'installing')
        ? { kind: 'ready' }
        : state;
    case 'failed':
      if (state.kind === 'exporting') return { kind: 'ready' };
      if (state.kind !== 'opening') return state;
      return state.phase === 'installing'
        ? {
            kind: 'unavailable',
            message: `The restored project was saved but could not be opened: ${event.message}. Reload to reopen it.`,
          }
        : state.fallback;
  }
}

export function projectMessage(state: ProjectState) {
  if (state.kind === 'exporting')
    return state.format === 'png' ? 'Exporting board image…' : 'Creating project backup…';
  if (state.kind !== 'opening') return '';
  switch (state.phase) {
    case 'reading':
    case 'installing':
      return 'Opening project…';
    case 'backup':
      return 'Creating recovery backup…';
    case 'draining':
      return 'Preparing project…';
    case 'committing':
      return 'Restoring project…';
  }
}
