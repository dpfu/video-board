import { describe, expect, it } from 'vitest';
import {
  previewTransition as send,
  previewView,
  type PreviewState,
  type PreviewTarget,
} from '../src/preview';
import { boardFixture } from './board';

const idle: PreviewState = { kind: 'idle' };
const a: PreviewTarget = { kind: 'clip', id: 'a' },
  b: PreviewTarget = { kind: 'clip', id: 'b' };

describe('preview ownership', () => {
  it('rejects elapsed callbacks from superseded or stopped hover requests', () => {
    const pending = send(send(idle, { type: 'enter', target: a }), { type: 'enter', target: b });
    expect(previewView(pending)).toBeNull();
    expect(send(pending, { type: 'elapsed', target: a })).toBe(pending);
    expect(send(pending, { type: 'leave', target: a })).toBe(pending);
    expect(previewView(send(pending, { type: 'elapsed', target: b }))).toMatchObject({
      id: 'b',
      pinned: false,
    });
    const stopped = send(pending, { type: 'stop' });
    expect(send(stopped, { type: 'elapsed', target: b })).toBe(stopped);
  });

  it('preserves a pin during hover or layout activity, but stops it at a file-operation boundary', () => {
    const pinned = send(idle, { type: 'pin', target: a });
    for (const event of [
      { type: 'enter', target: b },
      { type: 'leave', target: a },
      { type: 'interruptHover' },
    ] as const)
      expect(send(pinned, event)).toBe(pinned);
    expect(previewView(send(pinned, { type: 'pin', target: b }))).toMatchObject({
      id: 'b',
      pinned: true,
    });
    expect(send(pinned, { type: 'stop' })).toEqual(idle);
  });

  it('releases pending and pinned evidence when its collection membership disappears', () => {
    const board = boardFixture();
    board.codes = [{ id: 'review', name: 'Review', color: '#b7cde5', definition: '' }];
    board.spaces = [
      {
        id: 'space',
        kind: 'space',
        codeId: 'review',
        name: '',
        memo: '',
        x: 0,
        y: 0,
        z: 1,
        width: 700,
        height: 540,
        items: [{ quotationId: 'source-video', x: 12, y: 12 }],
      },
    ];
    const target: PreviewTarget = {
      kind: 'evidence',
      spaceId: 'space',
      quotationId: 'source-video',
    };
    for (const type of ['enter', 'pin'] as const) {
      const state = send(idle, { type, target });
      expect(send(state, { type: 'reconcile', board })).toBe(state);
      expect(send(state, { type: 'reconcile', board: { ...board, spaces: [] } })).toEqual(idle);
    }
  });
});
