import { BoxIndex, overlaps } from './spatial';
import {
  allCards,
  boardBoxes,
  DOCK_GAP,
  mapCards,
  type Board,
  type Dock,
  type ModuleCard,
  type Point,
} from './model';

export type Snap = { id: string; dock: Dock; x: number; y: number; width: number; height: number };

/** Resolve the forest once, rather than rebuilding it for every card's controls. */
export function dockIndex(board: Board) {
  const cards = new Map(allCards(board).map((c) => [c.id, c]));
  const roots = new Map<string, string>(),
    groups = new Map<string, Set<string>>();
  for (const id of cards.keys()) {
    const path: string[] = [],
      seen = new Set<string>();
    let cursor = id;
    while (!roots.has(cursor) && cards.get(cursor)?.dock && !seen.has(cursor)) {
      path.push(cursor);
      seen.add(cursor);
      cursor = cards.get(cursor)!.dock!.to;
    }
    const root = roots.get(cursor) || cursor;
    roots.set(id, root);
    for (const member of path) roots.set(member, root);
    let group = groups.get(root);
    if (!group) {
      group = new Set();
      groups.set(root, group);
    }
    group.add(id);
  }
  const byId = new Map<string, Set<string>>();
  for (const [id, root] of roots) byId.set(id, groups.get(root)!);
  return { roots, groups: byId };
}

export function rootId(board: Board, id: string) {
  return dockIndex(board).roots.get(id) || id;
}

export function groupIds(board: Board, id: string) {
  return new Set(dockIndex(board).groups.get(id) || [id]);
}

/** Detach just this module, leaving its former neighbours in their current places. */
export function detachModule(board: Board, id: string) {
  return mapCards(board, (c) => (c.id === id || c.dock?.to === id ? { ...c, dock: undefined } : c));
}

/** Resolve the dock tree after a resize or a new connection. Widths remain independent. */
export function reflow(board: Board): Board {
  const boxes = new Map(boardBoxes(board).map((c) => [c.id, c]));
  const done = new Set<string>();
  function resolve(id: string, visiting = new Set<string>()) {
    if (done.has(id) || visiting.has(id)) return;
    visiting.add(id);
    const card = boxes.get(id),
      dock = card?.dock;
    if (card && dock) {
      resolve(dock.to, visiting);
      const parent = boxes.get(dock.to);
      if (parent) {
        if (dock.side === 'bottom') {
          card.x = parent.x + dock.offset;
          card.y = parent.y + parent.height + DOCK_GAP;
        }
        if (dock.side === 'top') {
          card.x = parent.x + dock.offset;
          card.y = parent.y - card.height - DOCK_GAP;
        }
        if (dock.side === 'right') {
          card.x = parent.x + parent.width + DOCK_GAP;
          card.y = parent.y + dock.offset;
        }
        if (dock.side === 'left') {
          card.x = parent.x - card.width - DOCK_GAP;
          card.y = parent.y + dock.offset;
        }
      }
    }
    done.add(id);
  }
  for (const id of boxes.keys()) resolve(id);
  return mapCards(board, (c) => {
    const box = boxes.get(c.id);
    return box ? { ...c, x: box.x, y: box.y } : c;
  });
}

export function translate(board: Board, originals: Map<string, ModuleCard>, delta: Point) {
  return mapCards(board, (c) => {
    const origin = originals.get(c.id);
    return origin ? { ...c, x: origin.x + delta.x, y: origin.y + delta.y } : c;
  });
}

/** Compare screen-space edge distance; a zoomed-out board should not over-snap. */
export function findSnap(board: Board, moving: Set<string>, root: string): Snap | null {
  const boxes = boardBoxes(board),
    card = boxes.find((c) => c.id === root);
  if (!card) return null;
  return scoreSnap(
    card,
    boxes.filter((c) => !moving.has(c.id)),
    board.camera.scale,
    (dx, dy) =>
      boxes.some(
        (a) =>
          moving.has(a.id) &&
          boxes.some(
            (b) => !moving.has(b.id) && overlaps({ ...a, x: a.x + dx, y: a.y + dy }, b, 1),
          ),
      ),
  );
}

type Box = ReturnType<typeof boardBoxes>[number];
function scoreSnap(
  card: Box,
  targets: readonly Box[],
  scale: number,
  collides: (dx: number, dy: number) => boolean,
): Snap | null {
  const threshold = 16 / scale;
  let best: (Snap & { score: number }) | null = null;
  const aligned = (offset: number, parentSize: number, ownSize: number) => {
    const anchors = [0, (parentSize - ownSize) / 2, parentSize - ownSize];
    const nearest = anchors.sort((a, b) => Math.abs(a - offset) - Math.abs(b - offset))[0];
    return Math.abs(nearest - offset) < threshold ? nearest : offset;
  };
  for (const target of targets) {
    for (const side of ['bottom', 'top', 'right', 'left'] as const) {
      const vertical = side === 'bottom' || side === 'top';
      const overlap = vertical
        ? Math.min(card.x + card.width, target.x + target.width) - Math.max(card.x, target.x)
        : Math.min(card.y + card.height, target.y + target.height) - Math.max(card.y, target.y);
      if (overlap < Math.min(50, (vertical ? card.width : card.height) / 3)) continue;
      const offset = vertical
        ? aligned(card.x - target.x, target.width, card.width)
        : aligned(card.y - target.y, target.height, card.height);
      const x =
        side === 'right'
          ? target.x + target.width + DOCK_GAP
          : side === 'left'
            ? target.x - card.width - DOCK_GAP
            : target.x + offset;
      const y =
        side === 'bottom'
          ? target.y + target.height + DOCK_GAP
          : side === 'top'
            ? target.y - card.height - DOCK_GAP
            : target.y + offset;
      const distance = Math.abs(vertical ? y - card.y : x - card.x);
      if (distance > threshold) continue;
      const dx = x - card.x,
        dy = y - card.y;
      if (collides(dx, dy)) continue;
      const score = distance + Math.abs(vertical ? dx : dy) * 0.05;
      if (!best || score < best.score)
        best = {
          id: card.id,
          dock: { to: target.id, side, offset },
          x,
          y,
          width: card.width,
          height: card.height,
          score,
        };
    }
  }
  return best;
}

/** Cache static geometry once per move; query only nearby anchors/collisions. */
export function createSnapSearch(
  board: Board,
  moving: Set<string>,
  root: string,
  originals?: Map<string, ModuleCard>,
) {
  const boxes = boardBoxes(board);
  const own = boxes
    .filter((box) => moving.has(box.id))
    .map((box) => {
      const origin = originals?.get(box.id);
      return origin ? { ...box, x: origin.x, y: origin.y } : box;
    });
  const origin = own.find((box) => box.id === root);
  const index = new BoxIndex(boxes.filter((box) => !moving.has(box.id)));
  return (delta: Point, scale: number): Snap | null => {
    if (!origin) return null;
    const card = { ...origin, x: origin.x + delta.x, y: origin.y + delta.y };
    const reach = 16 / scale + DOCK_GAP + 1;
    const targets = index.query({
      x: card.x - reach,
      y: card.y - reach,
      width: card.width + reach * 2,
      height: card.height + reach * 2,
    });
    return scoreSnap(card, targets, scale, (dx, dy) =>
      own.some((box) => {
        const placed = { ...box, x: box.x + delta.x + dx, y: box.y + delta.y + dy };
        return index.query(placed).some((target) => overlaps(placed, target, 1));
      }),
    );
  };
}

export function applySnap(board: Board, snap: Snap) {
  return reflow(mapCards(board, (c) => (c.id === snap.id ? { ...c, dock: snap.dock } : c)));
}
