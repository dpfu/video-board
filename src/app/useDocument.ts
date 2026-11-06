import { useLifetime } from '../lifetime';
import { useEffect, useRef, useState } from 'react';
import { Autosave, type SaveState } from '../autosave';
import { emptyBoard, type Board } from '../model';
import { reconcileSpaces } from '../spaces';
import { saveBoard } from '../store';
import { useActions } from '../useActions';
import { restoreEdit } from '../history';

export function useDocument(ready: boolean, notify: (message: string) => void) {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const current = useRef(board);
  const history = useRef<Board[]>([]);
  const previewTimer = useRef<ReturnType<typeof setTimeout>>();
  const [undoCount, setUndoCount] = useState(0);
  const [removed, setRemoved] = useState(false);
  const [saving, setSaving] = useState<SaveState>('saved');
  function update(update: (board: Board) => Board) {
    let next = update(current.current);
    if (next === current.current) return false;
    if (next.quotations !== current.current.quotations || next.codes !== current.current.codes)
      next = reconcileSpaces(next);
    current.current = next;
    return true;
  }
  const actions = useActions({
    change(updateBoard: (board: Board) => Board) {
      if (update(updateBoard)) actions.publish();
    },
    preview(updateBoard: (board: Board) => Board) {
      if (!update(updateBoard)) return;
      autosave.cancelPending();
      setSaving('waiting');
      clearTimeout(previewTimer.current);
      previewTimer.current = setTimeout(() => actions.publish(), 120);
    },
    publish() {
      clearTimeout(previewTimer.current);
      if (current.current === board) return;
      setSaving('waiting');
      setBoard(current.current);
    },
    checkpoint() {
      history.current = [...history.current.slice(-29), current.current];
      setUndoCount(history.current.length);
      setRemoved(false);
    },
    undo() {
      const previous = history.current.pop();
      if (!previous) return false;
      actions.change(() => restoreEdit(previous, current.current));
      setUndoCount(history.current.length);
      setRemoved(false);
      return true;
    },
    replace(next: Board) {
      clearTimeout(previewTimer.current);
      autosave.cancelPending();
      current.current = next;
      setBoard(next);
      history.current = [];
      setUndoCount(0);
      setRemoved(false);
    },
    markRemoved() {
      setRemoved(true);
    },
    saveChanged(state: SaveState, error?: unknown) {
      setSaving(state);
      if (state === 'error')
        notify(
          `Could not save locally: ${error instanceof Error ? error.message : 'Storage failed'}. Download a project backup to keep this board.`,
        );
    },
  });
  const [autosave] = useState(() => new Autosave(saveBoard, actions.saveChanged));
  useEffect(() => {
    if (ready) autosave.schedule(board);
    return () => autosave.cancelPending();
  }, [board, ready, autosave]);
  useLifetime(() => {
    clearTimeout(previewTimer.current);
    autosave.dispose();
  });
  return { board, current, undoCount, removed, saving, actions, autosave };
}
export type BoardDocument = ReturnType<typeof useDocument>;
