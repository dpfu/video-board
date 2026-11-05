import { useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, X } from 'lucide-react';
import { IconButton } from './Icons';
import type { Code, Quotation } from './model';

export function CodePopover({
  target,
  codes,
  x,
  y,
  onClose,
  onAssign,
  onCreate,
  onMemo,
  onEditStart,
  onOpen,
}: {
  target: Quotation;
  codes: Code[];
  x: number;
  y: number;
  onClose: () => void;
  onAssign: (id: string) => void;
  onCreate: (name: string) => void;
  onMemo: (memo: string) => void;
  onEditStart: () => void;
  onOpen: () => void;
}) {
  const [query, setQuery] = useState(''),
    element = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    const outside = (e: globalThis.PointerEvent) => {
      if (!element.current?.contains(e.target as Node)) onClose();
    };
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, []);
  const matching = codes.filter((c) =>
    `${c.name} ${c.definition}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div
      ref={element}
      className="code-popover"
      role="dialog"
      aria-label="Code quotation"
      style={{ left: x, top: y }}
    >
      <div className="section-label">
        <BookOpen size={12} />
        <span>
          {target.kind === 'video'
            ? 'Code whole video'
            : target.kind === 'frame'
              ? 'Code still'
              : target.kind === 'region'
                ? 'Code region'
                : 'Code clip / segment'}
        </span>
        <span className="control-spacer" />
        <IconButton icon={X} label="Close coding popover" onClick={onClose} />
      </div>
      <form
        className="popover-create"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) {
            onCreate(query.trim());
            setQuery('');
          }
        }}
      >
        <input
          ref={input}
          aria-label="Find or create code"
          placeholder="Find or create a code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={200}
        />
        <button
          type="submit"
          className="icon-button"
          aria-label="Create and assign code"
          disabled={!query.trim()}
        >
          <Plus size={13} />
        </button>
      </form>
      <div className="popover-codes">
        {matching.map((code) => (
          <button
            key={code.id}
            aria-label={`Apply ${code.name}`}
            aria-pressed={target.codeIds.includes(code.id)}
            style={{ '--code-color': code.color } as React.CSSProperties}
            onClick={() => onAssign(code.id)}
          >
            <span>{target.codeIds.includes(code.id) ? '✓' : '+'}</span>
            {code.name}
          </button>
        ))}
        {!matching.length && (
          <p className="coding-hint">
            {query ? 'Enter creates this code.' : 'Create your first code above.'}
          </p>
        )}
      </div>
      <textarea
        aria-label="Selection memo"
        placeholder="Memo…"
        rows={2}
        value={target.memo}
        onFocus={onEditStart}
        onChange={(e) => onMemo(e.target.value)}
      />
      <button className="text-button" onClick={onOpen}>
        Open codes & quotations
      </button>
    </div>
  );
}
