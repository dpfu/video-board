import { useState, type PointerEvent } from 'react';
import { BookOpen, ChevronLeft, Film, LayoutGrid, Plus, Search, Scissors, X } from 'lucide-react';
import { CODE_DRAG, QUOTATION_DRAG } from './spaces';
import { IconButton } from './Icons';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { RangeEditor } from './RangeEditor';
import { timecode, type Board, type Code, type Quotation } from './model';
import type { RangeDraft } from './editing';
export function CodeChips({ quotation, codes }: { quotation?: Quotation; codes: Code[] }) {
  return quotation?.codeIds.length ? (
    <span className="code-chips">
      {quotation.codeIds.map((id) => {
        const code = codes.find((c) => c.id === id);
        return code ? (
          <span
            key={id}
            className="code-chip"
            style={{ '--code-color': code.color } as React.CSSProperties}
            title={code.definition || code.name}
          >
            {code.name}
          </span>
        ) : null;
      })}
    </span>
  ) : null;
}

export function Coding({
  board,
  target,
  draft,
  draftValid,
  dockControls,
  onDrag,
  onClose,
  onEditStart,
  onEditQuotation,
  onAddCode,
  onEditCode,
  onAssign,
  onReveal,
  onPlace,
  onCollection,
  onDeleteQuotation,
  onDraft,
  onDraftValidity,
  onSaveDraft,
  onCancelDraft,
  onSource,
}: {
  board: Pick<Board, 'videos' | 'quotations' | 'codes'>;
  target?: Quotation;
  draft: RangeDraft | null;
  draftValid: boolean;
  dockControls: DockControls;
  onDrag: (e: PointerEvent) => void;
  onClose: () => void;
  onEditStart: () => void;
  onEditQuotation: (id: string, patch: Partial<Quotation>) => void;
  onAddCode: (name: string) => void;
  onEditCode: (id: string, patch: Partial<Code>) => void;
  onAssign: (codeId: string) => void;
  onReveal: (q: Quotation) => void;
  onPlace: (q: Quotation) => void;
  onCollection: (codeId: string) => void;
  onDeleteQuotation: (q: Quotation) => void;
  onDraft: (draft: RangeDraft) => void;
  onDraftValidity: (id: string, valid: boolean) => void;
  onSaveDraft: () => void;
  onCancelDraft: () => void;
  onSource: (id: string) => void;
}) {
  const [search, setSearch] = useState(''),
    [newCode, setNewCode] = useState(''),
    [filter, setFilter] = useState<string | null>(null),
    [tab, setTab] = useState<'codes' | 'quotes' | 'sources'>('codes');
  const selectedCode = board.codes.find((c) => c.id === filter);
  const query = search.trim().toLocaleLowerCase();
  const results = board.quotations.filter(
    (q) =>
      (!filter || q.codeIds.includes(filter)) &&
      (!query ||
        [
          q.title,
          q.memo,
          board.videos.find((v) => v.id === q.sourceId)?.name,
          ...q.codeIds.map((id) => {
            const c = board.codes.find((c) => c.id === id);
            return c ? `${c.name} ${c.definition}` : '';
          }),
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)),
  );
  const canAssign = !!target && !draft;
  const source = board.videos.find((v) => v.id === target?.sourceId);
  const draftSource = board.videos.find((v) => v.id === draft?.sourceId);
  function createCode() {
    if (!newCode.trim()) return;
    onAddCode(newCode.trim());
    setNewCode('');
  }
  return (
    <>
      <header className="card-header" onPointerDown={onDrag}>
        <ModuleGrip onPeel={dockControls.onPeel} />
        <BookOpen size={12} />
        <span className="card-title">Codes & quotations</span>
        <span className="control-spacer" />
        <UndockButton {...dockControls} />
        <IconButton icon={X} label="Close codes module" onClick={onClose} />
      </header>
      <div
        className="coding-body"
        onPointerDown={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {draft && draftSource && (
          <section className="quotation-editor segment-editor" key={draft.id}>
            <div className="section-label">
              <Scissors size={11} /> New segment · not saved{' '}
              <IconButton icon={X} label="Cancel segment" onClick={onCancelDraft} />
            </div>
            <div className="source-caption">{draftSource.name} · source time</div>
            <RangeEditor
              label="Segment"
              start={draft.start}
              end={draft.end}
              min={draft.min}
              max={draft.max}
              frames={draftSource.frameTimes}
              onEditStart={() => {}}
              onValidityChange={(valid) => onDraftValidity(draft.id, valid)}
              onChange={(start, end) => onDraft({ ...draft, start, end })}
            />
            <button
              className="text-button primary-action"
              disabled={!draftValid}
              onClick={onSaveDraft}
            >
              Save free quotation
            </button>
            <p className="coding-hint">
              {draftValid
                ? 'Save this segment to assign codes or write a memo.'
                : 'Enter valid in and out times to save this segment.'}
            </p>
          </section>
        )}
        {target && !draft && (
          <section className="quotation-editor" data-editing-quotation={target.id} key={target.id}>
            <div className="section-label">
              <span>
                {target.kind === 'video'
                  ? 'Whole video'
                  : target.kind === 'frame'
                    ? 'Still frame'
                    : target.kind === 'region'
                      ? 'Image region'
                      : 'Video segment'}
              </span>
              <span className="control-spacer" />
              {target.kind !== 'video' && (
                <IconButton
                  icon={X}
                  label="Delete quotation"
                  onClick={() => onDeleteQuotation(target)}
                />
              )}
            </div>
            <div className="source-caption" title={source?.name}>
              {source?.name} ·{' '}
              {target.kind === 'video'
                ? 'full duration'
                : target.kind === 'frame' || target.kind === 'region'
                  ? timecode(target.start)
                  : `${timecode(target.start)}–${timecode(target.end)}`}
            </div>
            <input
              key={`title-${target.id}`}
              className="quotation-title"
              aria-label="Quotation title"
              placeholder="Give this selection a title…"
              value={target.title}
              onFocus={onEditStart}
              onChange={(e) => onEditQuotation(target.id, { title: e.target.value })}
            />
            <CodeChips quotation={target} codes={board.codes} />
            <textarea
              key={`memo-${target.id}`}
              aria-label="Quotation memo"
              placeholder="Memo…"
              value={target.memo}
              onFocus={onEditStart}
              onChange={(e) => onEditQuotation(target.id, { memo: e.target.value })}
              rows={2}
            />
            {target.kind === 'range' && source && (
              <RangeEditor
                label="Quotation"
                start={target.start}
                end={target.end}
                max={source.duration}
                frames={source.frameTimes}
                onEditStart={onEditStart}
                onChange={(start, end) => onEditQuotation(target.id, { start, end })}
              />
            )}
            <div className="quotation-actions">
              <button className="text-button" onClick={() => onReveal(target)}>
                Reveal source context
              </button>
              {target.kind === 'range' && (
                <button className="text-button" onClick={() => onPlace(target)}>
                  Place clip view
                </button>
              )}
            </div>
          </section>
        )}
        <div className="coding-tabs" role="tablist" aria-label="Analysis views">
          {(['codes', 'quotes', 'sources'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === 'quotes' ? 'Quotations' : t === 'codes' ? 'Codes' : 'Sources'}
            </button>
          ))}
        </div>
        <label className="coding-search">
          <Search size={12} />
          <input
            type="search"
            aria-label="Search codes and quotations"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {tab === 'sources' ? (
          <div className="source-list">
            {board.videos
              .filter((v) => v.name.toLocaleLowerCase().includes(query))
              .map((v) => (
                <button key={v.id} className="retrieval-result" onClick={() => onSource(v.id)}>
                  <Film size={12} />
                  <span>
                    {v.name}
                    <small>
                      {timecode(v.duration)}
                      {v.hidden ? ' · player hidden' : ''}
                    </small>
                  </span>
                </button>
              ))}
          </div>
        ) : (
          <>
            {tab === 'codes' && (
              <>
                <form
                  className="new-code"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!draft) createCode();
                  }}
                >
                  <input
                    aria-label="New code name"
                    placeholder={canAssign ? 'Create or reuse & assign a code…' : 'New code…'}
                    value={newCode}
                    disabled={!!draft}
                    onChange={(e) => setNewCode(e.target.value)}
                    maxLength={200}
                  />
                  <IconButton
                    icon={Plus}
                    label="Create code"
                    disabled={!!draft || !newCode.trim()}
                    onClick={createCode}
                  />
                </form>
                {!target && !draft && (
                  <p className="coding-hint">
                    Select a video, clip, still or region to assign codes.
                  </p>
                )}
                <div className="code-list">
                  {board.codes
                    .filter((c) => `${c.name} ${c.definition}`.toLocaleLowerCase().includes(query))
                    .map((code) => (
                      <div
                        key={code.id}
                        className={`code-row ${filter === code.id ? 'is-active' : ''}`}
                      >
                        <button
                          className="code-assign"
                          style={{ '--code-color': code.color } as React.CSSProperties}
                          aria-label={`Assign ${code.name}`}
                          aria-pressed={canAssign && target.codeIds.includes(code.id)}
                          disabled={!canAssign}
                          onClick={() => onAssign(code.id)}
                        >
                          <span>{canAssign && target.codeIds.includes(code.id) ? '✓' : '+'}</span>
                        </button>
                        <button
                          className="code-retrieve"
                          draggable
                          title="Drag onto the board to open a live collection"
                          onDragStart={(event) => {
                            event.dataTransfer.setData(CODE_DRAG, code.id);
                            event.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={() => {
                            setFilter(code.id);
                            setSearch('');
                            setTab('quotes');
                          }}
                        >
                          <span>{code.name}</span>
                          <small>
                            {board.quotations.filter((q) => q.codeIds.includes(code.id)).length}
                          </small>
                        </button>
                        <IconButton
                          icon={LayoutGrid}
                          label={`Open live collection for ${code.name}`}
                          onClick={() => onCollection(code.id)}
                        />
                      </div>
                    ))}
                </div>
              </>
            )}
            {tab === 'quotes' && (
              <>
                <div className="retrieval-heading">
                  <button className="text-button" onClick={() => setFilter(null)}>
                    {selectedCode ? (
                      <>
                        <ChevronLeft size={11} /> All quotations
                      </>
                    ) : (
                      'All quotations'
                    )}
                  </button>
                  <span>{results.length}</span>
                </div>
                {selectedCode && (
                  <div className="code-definition" key={selectedCode.id}>
                    <div>
                      <input
                        type="color"
                        aria-label="Code colour"
                        value={selectedCode.color}
                        onFocus={onEditStart}
                        onChange={(e) => onEditCode(selectedCode.id, { color: e.target.value })}
                      />
                      <input
                        aria-label="Code name"
                        value={selectedCode.name}
                        onFocus={onEditStart}
                        onChange={(e) => {
                          if (e.target.value.trim())
                            onEditCode(selectedCode.id, { name: e.target.value });
                        }}
                        maxLength={200}
                      />
                    </div>
                    <textarea
                      aria-label="Code definition"
                      placeholder="Code definition…"
                      value={selectedCode.definition}
                      onFocus={onEditStart}
                      onChange={(e) => onEditCode(selectedCode.id, { definition: e.target.value })}
                      rows={2}
                    />
                  </div>
                )}
                <div className="retrieval-list">
                  {results.map((q) => (
                    <button
                      key={q.id}
                      data-quotation-result={q.id}
                      draggable
                      title="Drag into a group or onto the board to gather evidence"
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          QUOTATION_DRAG,
                          JSON.stringify({ quotationId: q.id }),
                        );
                        event.dataTransfer.effectAllowed = 'copy';
                      }}
                      className={`retrieval-result ${target?.id === q.id ? 'is-active' : ''}`}
                      onClick={() => onReveal(q)}
                    >
                      <span className="quotation-kind">
                        {q.kind === 'region'
                          ? '▣'
                          : q.kind === 'range'
                            ? '↔'
                            : q.kind === 'frame'
                              ? '▧'
                              : '▷'}
                      </span>
                      <span>
                        {q.title ||
                          (q.kind === 'video'
                            ? 'Whole video'
                            : q.kind === 'region'
                              ? 'Region'
                              : q.kind === 'frame'
                                ? 'Still'
                                : 'Segment')}
                        <small>
                          {board.videos.find((v) => v.id === q.sourceId)?.name} ·{' '}
                          {timecode(q.start)}
                          {q.kind === 'range' ? `–${timecode(q.end)}` : ''}
                        </small>
                      </span>
                      <span className="quotation-count">{q.codeIds.length || ''}</span>
                    </button>
                  ))}
                </div>
                {!results.length && <p className="coding-hint">No quotations match yet.</p>}
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
