import { clamp, type Board, type Quotation, type Rect } from './model';

export function quotation(
  sourceId: string,
  kind: Quotation['kind'],
  start: number,
  end: number,
  parentId?: string,
): Quotation {
  const stamp = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    sourceId,
    kind,
    start,
    end,
    parentId,
    title: '',
    memo: '',
    codeIds: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function editQuotation(
  board: Board,
  id: string,
  patch: Partial<Pick<Quotation, 'title' | 'memo' | 'codeIds' | 'start' | 'end' | 'rect'>>,
): Board {
  const before = board.quotations.find((q) => q.id === id);
  if (!before) return board;
  const stamp = new Date().toISOString();
  const next = { ...before, ...patch, updatedAt: stamp };
  return {
    ...board,
    quotations: board.quotations.map((q) => {
      if (q.id === id) return next;
      // Regions share their frame's time, while temporal children always retain
      // their own absolute source boundaries when a parent clip is trimmed.
      if (
        before.kind === 'frame' &&
        q.kind === 'region' &&
        q.parentId === id &&
        (patch.start !== undefined || patch.end !== undefined)
      )
        return { ...q, start: next.start, end: next.end, updatedAt: stamp };
      return q;
    }),
  };
}

export function normalizedRect(rect: Rect): Rect {
  const x = clamp(rect.x, 0, 0.998),
    y = clamp(rect.y, 0, 0.998);
  return { x, y, width: clamp(rect.width, 0.002, 1 - x), height: clamp(rect.height, 0.002, 1 - y) };
}

export function csvExport(board: Board) {
  const columns = [
    'quotation_id',
    'source_id',
    'source_name',
    'kind',
    'parent_id',
    'start_seconds',
    'end_seconds',
    'region_x',
    'region_y',
    'region_width',
    'region_height',
    'title',
    'code_id',
    'code',
    'code_definition',
    'memo',
    'created_at',
    'updated_at',
  ];
  const rows: unknown[][] = [columns];
  for (const q of board.quotations)
    for (const codeId of q.codeIds.length ? q.codeIds : ['']) {
      const code = board.codes.find((c) => c.id === codeId);
      rows.push([
        q.id,
        q.sourceId,
        board.videos.find((v) => v.id === q.sourceId)?.name || '',
        q.kind,
        q.parentId || '',
        q.start,
        q.end,
        q.rect?.x ?? '',
        q.rect?.y ?? '',
        q.rect?.width ?? '',
        q.rect?.height ?? '',
        q.title,
        codeId,
        code?.name || '',
        code?.definition || '',
        q.memo,
        q.createdAt,
        q.updatedAt,
      ]);
    }
  // Neutralize spreadsheet formula interpretation while preserving plain text.
  const cell = (value: unknown) => {
    const text = String(value),
      safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return '\ufeff' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
