import { useRef, type PointerEvent } from 'react';
import type { Code, Quotation, Rect } from './model';
import { clamp } from './model';
import { normalizedRect } from './analysis';

type Edit = { pointer: number; origin: { x: number; y: number }; rect?: Rect; id?: string; corner?: string };
export function Regions({ regions, codes, selected, drawing, onSelect, onCreate, onChange, onEditStart, onDelete }: {
  regions: Quotation[]; codes: Code[]; selected: string | null; drawing: boolean;
  onSelect: (id: string) => void; onCreate: (rect: Rect) => void; onChange: (id: string, rect: Rect) => void;
  onEditStart: () => void; onDelete: (id: string) => void;
}) {
  const active = useRef<Edit | null>(null), canvas = useRef<HTMLDivElement>(null), preview = useRef<HTMLDivElement>(null);
  const point = (e: PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) }; };
  function update(e: PointerEvent) {
    const a = active.current; if (!a || a.pointer !== e.pointerId) return;
    const p = point(e), dx = p.x - a.origin.x, dy = p.y - a.origin.y;
    if (!a.rect) {
      const rect = { x: Math.min(p.x, a.origin.x), y: Math.min(p.y, a.origin.y), width: Math.abs(dx), height: Math.abs(dy) };
      if (preview.current) Object.assign(preview.current.style, { display: 'block', left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` });
      return rect;
    }
    const r = a.rect;
    let next: Rect;
    if (!a.corner) next = { ...r, x: clamp(r.x + dx, 0, 1 - r.width), y: clamp(r.y + dy, 0, 1 - r.height) };
    else {
      const left = a.corner.includes('w') ? clamp(r.x + dx, 0, r.x + r.width - .005) : r.x;
      const top = a.corner.includes('n') ? clamp(r.y + dy, 0, r.y + r.height - .005) : r.y;
      const right = a.corner.includes('e') ? clamp(r.x + r.width + dx, r.x + .005, 1) : r.x + r.width;
      const bottom = a.corner.includes('s') ? clamp(r.y + r.height + dy, r.y + .005, 1) : r.y + r.height;
      next = { x: left, y: top, width: right - left, height: bottom - top };
    }
    onChange(a.id!, normalizedRect(next)); return next;
  }
  return <div ref={canvas} className={`regions ${drawing ? 'regions--draw' : ''}`} aria-label="Image regions"
    onPointerDown={e => {
      if (e.button !== 0 || !drawing || e.target !== e.currentTarget) return;
      e.preventDefault(); e.stopPropagation(); active.current = { pointer: e.pointerId, origin: point(e) }; e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={update} onPointerUp={e => {
      if (!active.current || active.current.pointer !== e.pointerId) return;
      e.stopPropagation(); const rect = update(e);
      if (!active.current.rect && rect && rect.width > .01 && rect.height > .01) onCreate(normalizedRect(rect));
      active.current = null; if (preview.current) preview.current.style.display = 'none';
    }} onPointerCancel={() => { active.current = null; if (preview.current) preview.current.style.display = 'none'; }}>
    {regions.map((q, i) => { const r = q.rect!, color = codes.find(c => q.codeIds.includes(c.id))?.color || '#b8cde5';
      return <div key={q.id} className={`region ${selected === q.id ? 'is-active' : ''}`} data-region-id={q.id} style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%`, borderColor: color, '--region-color': color } as React.CSSProperties}
        role="button" tabIndex={drawing ? -1 : 0} aria-label={`Region ${i + 1}${q.title ? ` · ${q.title}` : ''}`} aria-pressed={selected === q.id} title="Arrow keys move · Alt + arrows resize · Delete removes quotation"
        onPointerDown={e => {
          if (e.button !== 0 || drawing) return;
          e.preventDefault(); e.stopPropagation(); onSelect(q.id); onEditStart();
          active.current = { pointer: e.pointerId, origin: point(e), rect: r, id: q.id, corner: (e.target as HTMLElement).dataset.corner };
          canvas.current!.setPointerCapture(e.pointerId);
        }} onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(q.id); }
          else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDelete(q.id); }
          else if (e.key.startsWith('Arrow')) { e.preventDefault(); onEditStart(); const step = e.shiftKey ? .02 : .005, dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0, dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0; onChange(q.id, e.altKey ? { ...r, width: clamp(r.width + dx, .005, 1 - r.x), height: clamp(r.height + dy, .005, 1 - r.y) } : { ...r, x: clamp(r.x + dx, 0, 1 - r.width), y: clamp(r.y + dy, 0, 1 - r.height) }); }
        }}><span className="region-label">{q.title || `Region ${i + 1}`}{q.codeIds.length ? ` · ${q.codeIds.map(id => codes.find(c => c.id === id)?.name).filter(Boolean).join(', ')}` : ''}</span>
        {selected === q.id && ['nw', 'ne', 'sw', 'se'].map(corner => <span key={corner} className={`region-handle region-handle--${corner}`} data-corner={corner} />)}
      </div>;
    })}
    <div ref={preview} className="region region--preview" />
  </div>;
}
