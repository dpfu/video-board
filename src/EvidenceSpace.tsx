import { useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { FolderPlus, LayoutGrid, Plus, Search, Tags, X } from 'lucide-react';
import { EvidenceTile } from './EvidenceTile';
import { IconButton } from './Icons';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { stillAssetId, timecode, type Board, type Point, type SpaceCard } from './model';
import { posterKey } from './posters';
import {
  evidenceLabel,
  EVIDENCE_HEIGHT,
  EVIDENCE_WIDTH,
  QUOTATION_DRAG,
  readEvidenceDrag,
} from './spaces';

export function EvidenceSpace({
  space,
  board,
  urls,
  posters,
  activeQuotation,
  preview,
  dockControls,
  onDrag,
  onClose,
  onEditStart,
  onPatch,
  onPromote,
  onAdd,
  onRemove,
  onMove,
  onSelect,
  onCode,
  onReveal,
  onPreview,
  onStop,
  onVisible,
}: {
  space: SpaceCard;
  board: Pick<Board, 'videos' | 'stills' | 'quotations' | 'codes'>;
  urls: Record<string, string>;
  posters: Record<string, string>;
  activeQuotation: string | null;
  preview: { id: string; pinned: boolean } | null;
  dockControls: DockControls;
  onDrag: (event: PointerEvent) => void;
  onClose: () => void;
  onEditStart: () => void;
  onPatch: (patch: Partial<Pick<SpaceCard, 'name' | 'memo'>>) => void;
  onPromote: () => void;
  onAdd: (id: string, point?: Point, fromSpaceId?: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, point: Point) => void;
  onSelect: (id: string) => void;
  onCode: (id: string) => void;
  onReveal: (id: string) => void;
  onPreview: (id: string, hover: boolean, pin?: boolean) => void;
  onStop: () => void;
  onVisible: (ids: string[]) => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const report = useRef(onVisible);
  report.current = onVisible;
  const [view, setView] = useState({ x: 0, y: 0, width: space.width, height: space.height });
  const [picker, setPicker] = useState(false);
  const [query, setQuery] = useState('');
  const [uncoded, setUncoded] = useState(false);
  const [drop, setDrop] = useState(false);
  const code = board.codes.find((c) => c.id === space.codeId);
  const members = useMemo(
    () => new Set(space.items.map((item) => item.quotationId)),
    [space.items],
  );
  const quotes = useMemo(() => new Map(board.quotations.map((q) => [q.id, q])), [board.quotations]);
  const sources = useMemo(() => new Map(board.videos.map((v) => [v.id, v])), [board.videos]);
  const visible = space.items.filter(
    (item) =>
      item.quotationId === activeQuotation ||
      (preview?.id === `${space.id}/${item.quotationId}` && preview.pinned) ||
      (item.x + EVIDENCE_WIDTH > view.x - 50 &&
        item.x < view.x + view.width + 50 &&
        item.y + EVIDENCE_HEIGHT > view.y - 50 &&
        item.y < view.y + view.height + 50),
  );
  const visibleKey = JSON.stringify(visible.map((item) => item.quotationId));
  useEffect(() => {
    report.current(JSON.parse(visibleKey) as string[]);
    return () => report.current([]);
  }, [visibleKey]);
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const update = () =>
      setView({
        x: element.scrollLeft,
        y: element.scrollTop,
        width: element.clientWidth,
        height: element.clientHeight,
      });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, []);
  const queryText = query.trim().toLocaleLowerCase();
  const matches = picker
    ? board.quotations.filter(
        (q) =>
          (!uncoded || q.codeIds.length === 0) &&
          (!queryText ||
            `${evidenceLabel(q)} ${q.memo} ${sources.get(q.sourceId)?.name || ''}`
              .toLocaleLowerCase()
              .includes(queryText)),
      )
    : [];
  function accept(event: DragEvent) {
    if (!event.dataTransfer.types.includes(QUOTATION_DRAG)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = event.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
    setDrop(true);
  }
  function receive(event: DragEvent) {
    const data = readEvidenceDrag(event.dataTransfer);
    if (!data) return;
    event.preventDefault();
    event.stopPropagation();
    setDrop(false);
    const viewport = scroll.current;
    if (!viewport) return;
    const box = viewport.getBoundingClientRect();
    const scale = box.width / viewport.offsetWidth || 1;
    onAdd(
      data.quotationId,
      {
        x: Math.max(8, (event.clientX - box.left) / scale + viewport.scrollLeft - 16),
        y: Math.max(8, (event.clientY - box.top) / scale + viewport.scrollTop - 12),
      },
      data.spaceId,
    );
  }
  return (
    <div
      className={`evidence-space ${code ? 'evidence-space--live' : ''} ${drop ? 'is-evidence-drop' : ''}`}
      style={{ '--space-color': code?.color || '#a8adb7' } as React.CSSProperties}
      onDragOver={accept}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(false);
      }}
      onDrop={receive}
    >
      <header className="card-header" onPointerDown={onDrag}>
        <ModuleGrip onPeel={dockControls.onPeel} />
        {code ? <LayoutGrid size={12} /> : <FolderPlus size={12} />}
        <input
          className="space-name"
          aria-label={code ? 'Collection code name' : 'Group name'}
          title={code ? 'Shared code name' : 'Provisional group name'}
          placeholder="Untitled group"
          value={code?.name ?? space.name}
          onFocus={onEditStart}
          onChange={(event) => onPatch({ name: event.target.value })}
          maxLength={200}
        />
        <span className="space-mode">{code ? 'LIVE' : 'GROUP'}</span>
        <UndockButton {...dockControls} />
        <IconButton
          icon={X}
          label={code ? 'Close live collection' : 'Remove group'}
          onClick={onClose}
        />
      </header>
      <div
        className="space-body"
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <textarea
          className="space-memo"
          aria-label={code ? 'Collection memo' : 'Group memo'}
          placeholder="What connects these moments? Write a memo…"
          value={space.memo}
          onFocus={onEditStart}
          onChange={(event) => onPatch({ memo: event.target.value })}
          rows={2}
        />
        <div className="space-actions">
          <span className="space-count" aria-live="polite">
            {space.items.length} quotation{space.items.length === 1 ? '' : 's'}
          </span>
          <span className="control-spacer" />
          {!code && (
            <button
              type="button"
              className="text-button space-promote"
              disabled={!space.name.trim() || !space.items.length}
              title="Assign this name as a code to every member, then follow its assignments live"
              onClick={onPromote}
            >
              <Tags size={12} /> Turn into code
            </button>
          )}
          <button
            type="button"
            className="text-button"
            aria-expanded={picker}
            onClick={() => setPicker(!picker)}
          >
            <Plus size={12} /> Add evidence
          </button>
        </div>
        {picker && (
          <div
            className="space-picker"
            role="dialog"
            aria-label="Add evidence to space"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                setPicker(false);
              }
            }}
          >
            <div className="space-picker-heading">
              <strong>{code ? `Assign ${code.name}` : 'Gather evidence'}</strong>
              <span className="control-spacer" />
              <IconButton icon={X} label="Close evidence picker" onClick={() => setPicker(false)} />
            </div>
            <label className="coding-search">
              <Search size={12} />
              <input
                autoFocus
                type="search"
                aria-label="Find evidence"
                placeholder="Title, source or memo…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="space-uncoded">
              <input
                type="checkbox"
                checked={uncoded}
                onChange={(event) => setUncoded(event.target.checked)}
              />{' '}
              Uncoded only <span>{matches.length} matches</span>
            </label>
            <div className="space-picker-results">
              {matches.slice(0, 100).map((q) => (
                <button
                  type="button"
                  key={q.id}
                  aria-pressed={members.has(q.id)}
                  aria-label={`${members.has(q.id) ? 'Remove' : 'Add'} ${evidenceLabel(q)} ${members.has(q.id) ? 'from' : 'to'} ${code ? 'collection' : 'group'}`}
                  onClick={() => (members.has(q.id) ? onRemove(q.id) : onAdd(q.id))}
                >
                  <span>{members.has(q.id) ? '✓' : '+'}</span>
                  <span>
                    {evidenceLabel(q)}
                    <small>
                      {sources.get(q.sourceId)?.name} · {timecode(q.start)} · {q.kind}
                    </small>
                  </span>
                </button>
              ))}
              {!matches.length && <p className="coding-hint">No matching evidence.</p>}
              {matches.length > 100 && (
                <p className="coding-hint">Showing 100 of {matches.length}. Narrow your search.</p>
              )}
            </div>
          </div>
        )}
        <div
          ref={scroll}
          className="space-viewport"
          onScroll={(event) => {
            const element = event.currentTarget;
            setView({
              x: element.scrollLeft,
              y: element.scrollTop,
              width: element.clientWidth,
              height: element.clientHeight,
            });
          }}
        >
          <div
            className="space-canvas"
            style={{
              minWidth: Math.max(0, ...space.items.map((item) => item.x + EVIDENCE_WIDTH + 12)),
              minHeight: Math.max(0, ...space.items.map((item) => item.y + EVIDENCE_HEIGHT + 12)),
            }}
          >
            {visible.map((item) => {
              const q = quotes.get(item.quotationId);
              const source = q && sources.get(q.sourceId);
              if (!q || !source) return null;
              const frame = board.stills.find(
                (s) => s.quotationId === (q.kind === 'region' ? q.parentId : q.id),
              );
              const exact =
                (frame && urls[stillAssetId(frame)]) || posters[posterKey(q.sourceId, q.start)];
              const image =
                exact ||
                (q.kind === 'range' || q.kind === 'video'
                  ? urls[
                      source.thumbnails[
                        Math.min(
                          source.thumbnails.length - 1,
                          Math.floor((q.start / source.duration) * source.thumbnails.length),
                        )
                      ]
                    ]
                  : undefined);
              const previewId = `${space.id}/${q.id}`;
              return (
                <EvidenceTile
                  key={q.id}
                  item={item}
                  spaceId={space.id}
                  source={source}
                  quotation={q}
                  codes={board.codes}
                  image={image}
                  url={urls[source.id]}
                  active={preview?.id === previewId}
                  pinned={preview?.id === previewId && preview.pinned}
                  selected={activeQuotation === q.id}
                  removeLabel={
                    code
                      ? `Remove ${code.name} from ${evidenceLabel(q)}`
                      : `Remove ${evidenceLabel(q)} from group`
                  }
                  onEditStart={onEditStart}
                  onMove={(point) => onMove(q.id, point)}
                  onSelect={() => onSelect(q.id)}
                  onCode={() => onCode(q.id)}
                  onReveal={() => onReveal(q.id)}
                  onRemove={() => onRemove(q.id)}
                  onPreview={(hover, pin) => onPreview(q.id, hover, pin)}
                  onStop={onStop}
                />
              );
            })}
            {!space.items.length && (
              <div className="space-empty">
                <LayoutGrid size={22} strokeWidth={1.2} />
                <strong>
                  {code
                    ? `Evidence coded “${code.name}” appears here`
                    : 'Give related moments a place'}
                </strong>
                <span>
                  {code
                    ? 'Drag evidence here to assign this code.'
                    : 'Drag quotations here or choose Add evidence.'}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="space-hint">
          {code
            ? 'Follows code assignments · drag a copy out to explore'
            : 'Drag handles to arrange · name the group when an idea emerges'}
        </div>
      </div>
    </div>
  );
}
