import { boardBoxes, type Board } from './model';

/** Screen-pixel overscan; this selects DOM views, never changes the board data. */
export function visibleModuleIds(
  board: Board,
  viewport: { width: number; height: number },
  keep: ReadonlySet<string> = new Set(),
  margin = 200,
) {
  const { x, y, scale } = board.camera;
  const left = (-margin - x) / scale,
    top = (-margin - y) / scale;
  const right = (viewport.width + margin - x) / scale,
    bottom = (viewport.height + margin - y) / scale;
  const ids = new Set(keep);
  for (const box of boardBoxes(board))
    if (box.x < right && box.x + box.width > left && box.y < bottom && box.y + box.height > top)
      ids.add(box.id);
  return ids;
}

/** A live camera remains inside the last rendered overscan until another publish is needed. */
export function cameraCovered(
  rendered: Board['camera'],
  next: Board['camera'],
  viewport: { width: number; height: number },
  margin = 100,
) {
  const oldLeft = (-margin - rendered.x) / rendered.scale,
    oldTop = (-margin - rendered.y) / rendered.scale;
  return (
    -next.x / next.scale >= oldLeft &&
    -next.y / next.scale >= oldTop &&
    (viewport.width - next.x) / next.scale <=
      (viewport.width + margin - rendered.x) / rendered.scale &&
    (viewport.height - next.y) / next.scale <=
      (viewport.height + margin - rendered.y) / rendered.scale
  );
}
