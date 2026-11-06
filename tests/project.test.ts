import { describe, expect, it } from 'vitest';
import { projectTransition as send, type ProjectState } from '../src/project';

const ready: ProjectState = { kind: 'ready' };
const phases = ['archiveRead', 'recoveryCreated', 'jobsDrained', 'storageCommitted'] as const;

describe('project operation ownership', () => {
  it('waits for hydration and rejects competing file operations or skipped phases', () => {
    const loading: ProjectState = { kind: 'loading' };
    expect(send(loading, { type: 'open' })).toBe(loading);
    const state = send(send(loading, { type: 'loaded' }), { type: 'open' });
    expect(send(state, { type: 'export', format: 'png' })).toBe(state);
    expect(send(state, { type: 'open' })).toBe(state);
    expect(send(state, { type: 'storageCommitted' })).toBe(state);
    expect(send(state, { type: 'finished' })).toBe(state);
    let next = state;
    for (const type of phases) next = send(next, { type });
    expect(next).toMatchObject({ kind: 'opening', phase: 'installing' });
    expect(send(next, { type: 'finished' })).toEqual(ready);
  });

  it.each([0, 1, 2, 3])(
    'returns to the original project when restore fails before commit (phase %s)',
    (count) => {
      let state = send(ready, { type: 'open' });
      for (const type of phases.slice(0, count)) state = send(state, { type });
      expect(send(state, { type: 'failed', message: 'Storage failed' })).toBe(ready);
    },
  );

  it('retains an unavailable startup on rejected recovery, and treats post-commit failure as a saved project needing reopen', () => {
    const unavailable = send({ kind: 'loading' }, { type: 'loadFailed', message: 'Missing media' });
    expect(send(send(unavailable, { type: 'open' }), { type: 'failed', message: 'Bad ZIP' })).toBe(
      unavailable,
    );
    let state = send(ready, { type: 'open' });
    for (const type of phases) state = send(state, { type });
    expect(send(state, { type: 'failed', message: 'Image URLs failed' })).toMatchObject({
      kind: 'unavailable',
      message: expect.stringContaining('restored project was saved'),
    });
  });

  it.each(['png', 'zip'] as const)(
    'releases %s export ownership after success or failure',
    (format) => {
      const state = send(ready, { type: 'export', format });
      expect(send(state, { type: 'open' })).toBe(state);
      expect(send(state, { type: 'failed', message: 'Export failed' })).toEqual(ready);
      expect(send(state, { type: 'finished' })).toEqual(ready);
    },
  );
});
