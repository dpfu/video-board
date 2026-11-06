import {
  clamp,
  type Board,
  type Point,
  type Quotation,
  type SpaceCard,
  type SpaceItem,
} from './model';

export const evidenceLabel = (q: Quotation) =>
  q.title ||
  (q.kind === 'video'
    ? 'Whole video'
    : q.kind === 'range'
      ? 'Segment'
      : q.kind === 'frame'
        ? 'Still'
        : 'Region');

export const EVIDENCE_WIDTH = 192;
export const EVIDENCE_HEIGHT = 196;
export const EVIDENCE_GAP = 12;
export const SPACE_INSET = 12;
export const CODE_DRAG = 'application/x-video-board-code';
export const QUOTATION_DRAG = 'application/x-video-board-quotation';
export type EvidenceDrag = { quotationId: string; spaceId?: string };

export function readEvidenceDrag(transfer: DataTransfer): EvidenceDrag | null {
  try {
    const value: unknown = JSON.parse(transfer.getData(QUOTATION_DRAG));
    if (typeof value !== 'object' || !value || !('quotationId' in value)) return null;
    const { quotationId, spaceId } = value as Record<string, unknown>;
    return typeof quotationId === 'string' && (spaceId === undefined || typeof spaceId === 'string')
      ? { quotationId, spaceId }
      : null;
  } catch {
    return null;
  }
}

/** Preserve arranged positions. New matches fill unoccupied grid cells in linear time. */
function reconcileItems(space: SpaceCard, ids: ReadonlySet<string>): SpaceItem[] {
  const items = space.items.filter((item) => ids.has(item.quotationId));
  const present = new Set(items.map((item) => item.quotationId));
  if (items.length === space.items.length && present.size === ids.size) return space.items;
  const columns = Math.max(1, Math.floor((space.width - 12) / (EVIDENCE_WIDTH + EVIDENCE_GAP)));
  const cellWidth = EVIDENCE_WIDTH + EVIDENCE_GAP;
  const cellHeight = EVIDENCE_HEIGHT + EVIDENCE_GAP;
  const occupied = new Set<string>();
  for (const item of items) {
    const left = Math.floor((item.x - SPACE_INSET) / cellWidth);
    const top = Math.floor((item.y - SPACE_INSET) / cellHeight);
    const right = Math.floor((item.x + EVIDENCE_WIDTH - SPACE_INSET - 1) / cellWidth);
    const bottom = Math.floor((item.y + EVIDENCE_HEIGHT - SPACE_INSET - 1) / cellHeight);
    for (let y = top; y <= bottom; y++)
      for (let x = left; x <= right; x++) occupied.add(`${x}:${y}`);
  }
  let cursor = 0;
  for (const quotationId of ids) {
    if (present.has(quotationId)) continue;
    while (occupied.has(`${cursor % columns}:${Math.floor(cursor / columns)}`)) cursor++;
    const col = cursor % columns,
      row = Math.floor(cursor / columns);
    items.push({
      quotationId,
      x: SPACE_INSET + col * cellWidth,
      y: SPACE_INSET + row * cellHeight,
    });
    occupied.add(`${col}:${row}`);
    cursor++;
  }
  return items;
}

/** Live membership is a projection of assignments, never a second quotation store. */
export function reconcileSpaces(board: Board): Board {
  if (!board.spaces.length) return board;
  const quotes = new Map(board.quotations.map((q) => [q.id, q]));
  const codes = new Set(board.codes.map((code) => code.id));
  const byCode = new Map<string, Set<string>>();
  for (const q of board.quotations)
    for (const id of q.codeIds) {
      if (!byCode.has(id)) byCode.set(id, new Set());
      byCode.get(id)!.add(q.id);
    }
  let changed = false;
  const spaces = board.spaces.map((space) => {
    const codeId = space.codeId && codes.has(space.codeId) ? space.codeId : undefined;
    const ids = codeId
      ? byCode.get(codeId) || new Set<string>()
      : new Set(
          space.items
            .filter((item) => quotes.has(item.quotationId))
            .map((item) => item.quotationId),
        );
    const items = reconcileItems(space, ids);
    if (items === space.items && codeId === space.codeId) return space;
    changed = true;
    return { ...space, codeId, items };
  });
  return changed ? { ...board, spaces } : board;
}

export function moveEvidence(
  board: Board,
  spaceId: string,
  quotationId: string,
  point: Point,
): Board {
  return {
    ...board,
    spaces: board.spaces.map((space) =>
      space.id !== spaceId
        ? space
        : {
            ...space,
            items: space.items.map((item) =>
              item.quotationId !== quotationId
                ? item
                : {
                    ...item,
                    x: clamp(point.x, 8, 1e7),
                    y: clamp(point.y, 8, 1e7),
                  },
            ),
          },
    ),
  };
}

export function addEvidence(
  board: Board,
  spaceId: string,
  quotationId: string,
  point?: Point,
  fromSpaceId?: string,
): Board {
  const target = board.spaces.find((space) => space.id === spaceId);
  const q = board.quotations.find((q) => q.id === quotationId);
  if (!target || !q) return board;
  const from = board.spaces.find((space) => space.id === fromSpaceId);
  const already = target.items.some((item) => item.quotationId === quotationId);
  let next = board;
  if (target.codeId && !q.codeIds.includes(target.codeId))
    next = {
      ...next,
      quotations: next.quotations.map((item) =>
        item.id !== q.id
          ? item
          : {
              ...item,
              codeIds: [...item.codeIds, target.codeId!],
              updatedAt: new Date().toISOString(),
            },
      ),
    };
  next = {
    ...next,
    spaces: next.spaces.map((space) => {
      if (space.id === target.id && !already) {
        const ids = new Set([...space.items.map((item) => item.quotationId), quotationId]);
        return { ...space, items: reconcileItems(space, ids) };
      }
      if (space.id === from?.id && from.id !== target.id && !from.codeId)
        return { ...space, items: space.items.filter((item) => item.quotationId !== quotationId) };
      return space;
    }),
  };
  next = reconcileSpaces(next);
  return point ? moveEvidence(next, spaceId, quotationId, point) : next;
}

export function removeEvidence(board: Board, spaceId: string, quotationId: string): Board {
  const space = board.spaces.find((space) => space.id === spaceId);
  if (!space) return board;
  return reconcileSpaces({
    ...board,
    quotations: space.codeId
      ? board.quotations.map((q) =>
          q.id !== quotationId
            ? q
            : {
                ...q,
                codeIds: q.codeIds.filter((id) => id !== space.codeId),
                updatedAt: new Date().toISOString(),
              },
        )
      : board.quotations,
    spaces: board.spaces.map((s) =>
      s.id !== spaceId
        ? s
        : {
            ...s,
            items: s.items.filter((item) => item.quotationId !== quotationId),
          },
    ),
  });
}

export function promoteGroup(board: Board, spaceId: string): Board {
  const space = board.spaces.find((space) => space.id === spaceId);
  const name = space?.name.trim();
  if (!space || space.codeId || !name || !space.items.length) return board;
  const existing = board.codes.find(
    (code) => code.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  const code = existing || { id: crypto.randomUUID(), name, color: '#b7cde5', definition: '' };
  const members = new Set(space.items.map((item) => item.quotationId));
  const stamp = new Date().toISOString();
  return reconcileSpaces({
    ...board,
    codes: existing ? board.codes : [...board.codes, code],
    spaces: board.spaces.map((s) => (s.id === spaceId ? { ...s, name, codeId: code.id } : s)),
    quotations: board.quotations.map((q) =>
      members.has(q.id) && !q.codeIds.includes(code.id)
        ? { ...q, codeIds: [...q.codeIds, code.id], updatedAt: stamp }
        : q,
    ),
  });
}

/** Placement for new spaces only; existing board geometry is never rearranged. */
export function freeSpacePosition(
  boxes: (Point & { width: number; height: number })[],
  point: Point,
  width: number,
  height: number,
): Point {
  for (let ring = 0; ring < 100; ring++)
    for (let col = 0; col <= ring; col++) {
      const candidates = [
        { x: point.x + col * 48, y: point.y + ring * 48 },
        { x: point.x + ring * 48, y: point.y + col * 48 },
      ];
      for (const candidate of candidates)
        if (
          !boxes.some(
            (box) =>
              candidate.x < box.x + box.width + 24 &&
              candidate.x + width + 24 > box.x &&
              candidate.y < box.y + box.height + 24 &&
              candidate.y + height + 24 > box.y,
          )
        )
          return candidate;
    }
  return { x: Math.max(point.x, ...boxes.map((box) => box.x + box.width + 32)), y: point.y };
}
