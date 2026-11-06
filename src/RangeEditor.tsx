import { useEffect, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useTimecode } from './useTimecode';
import { usePointerGesture } from './pointer';
import { clamp, timecode } from './model';

function TimeField({
  label,
  value,
  onValue,
  onValidity,
}: {
  label: string;
  value: number;
  onValue: (value: number) => void;
  onValidity: (valid: boolean) => void;
}) {
  const field = useTimecode(value, { onCommit: onValue, onValidity });
  return (
    <label>
      <span>{label}</span>
      <input aria-label={label} className="range-time" spellCheck={false} {...field} />
    </label>
  );
}

export function RangeEditor({
  start,
  end,
  min = 0,
  max,
  frames,
  onChange,
  onEditStart,
  onValidityChange,
  label = 'Range',
}: {
  start: number;
  end: number;
  min?: number;
  max: number;
  frames: number[];
  onChange: (start: number, end: number) => void;
  onEditStart: () => void;
  label?: string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const { active, finish } = usePointerGesture<{ pointer: number; edge: 'start' | 'end' }>();
  const [validStart, setValidStart] = useState(true),
    [validEnd, setValidEnd] = useState(true);
  useEffect(() => {
    onValidityChange?.(validStart && validEnd);
  }, [validStart, validEnd, onValidityChange]);
  const gap = Math.min(0.001, (max - min) / 2),
    span = max - min || 1;
  const snap = (value: number, edge: 'start' | 'end') => {
    const candidates = frames.filter(
      (t) => t >= min && t <= max && (edge === 'start' ? t < end - 0.000001 : t > start + 0.000001),
    );
    if (edge === 'end') candidates.push(max);
    return candidates.length
      ? candidates.reduce((best, next) =>
          Math.abs(value - next) < Math.abs(value - best) ? next : best,
        )
      : value;
  };
  const update = (edge: 'start' | 'end', value: number) =>
    edge === 'start'
      ? onChange(clamp(value, min, end - gap), end)
      : onChange(start, clamp(value, start + gap, max));
  const pointer = (e: PointerEvent<HTMLDivElement>, final = false) => {
    if (e.pointerId !== active.current?.pointer) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const value = min + clamp((e.clientX - rect.left) / rect.width, 0, 1) * span;
    update(active.current.edge, final ? snap(value, active.current.edge) : value);
  };
  const key = (e: KeyboardEvent, edge: 'start' | 'end') => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    onEditStart();
    const time = edge === 'start' ? start : end;
    const next =
      e.key === 'Home'
        ? min
        : e.key === 'End'
          ? max
          : e.shiftKey
            ? time + (e.key === 'ArrowRight' ? 1 : -1)
            : e.key === 'ArrowRight'
              ? (frames.find((t) => t > time + 0.00001) ?? time + 0.04)
              : ([...frames].reverse().find((t) => t < time - 0.00001) ?? time - 0.04);
    update(edge, next);
  };
  return (
    <div className="range-editor" onPointerDown={(e) => e.stopPropagation()}>
      <div className="range-fields">
        <TimeField
          label={`${label} in`}
          value={start}
          onValidity={setValidStart}
          onValue={(value) => {
            onEditStart();
            update('start', snap(value, 'start'));
          }}
        />
        <span className="range-duration">{timecode(end - start)} long</span>
        <TimeField
          label={`${label} out`}
          value={end}
          onValidity={setValidEnd}
          onValue={(value) => {
            onEditStart();
            update('end', snap(value, 'end'));
          }}
        />
      </div>
      <div
        className="range-track"
        onPointerDown={(e) => {
          if (e.button !== 0 || active.current) return;
          e.preventDefault();
          e.stopPropagation();
          const rect = e.currentTarget.getBoundingClientRect(),
            at = min + ((e.clientX - rect.left) / rect.width) * span;
          const edge = (e.target as HTMLElement).dataset.edge as 'start' | 'end' | undefined;
          active.current = {
            pointer: e.pointerId,
            edge: edge || (Math.abs(at - start) <= Math.abs(at - end) ? 'start' : 'end'),
          };
          onEditStart();
          e.currentTarget.setPointerCapture(e.pointerId);
          pointer(e);
        }}
        onPointerMove={(e) => pointer(e)}
        onPointerUp={(e) => {
          pointer(e, true);
          finish(e.pointerId);
        }}
        onPointerCancel={(e) => {
          finish(e.pointerId);
        }}
        onLostPointerCapture={(e) => {
          finish(e.pointerId);
        }}
      >
        <span
          className="range-extent"
          style={{
            left: `${((start - min) / span) * 100}%`,
            width: `${((end - start) / span) * 100}%`,
          }}
        />
        {(['start', 'end'] as const).map((edge) => (
          <span
            key={edge}
            data-edge={edge}
            className={`range-handle range-handle--${edge}`}
            role="slider"
            tabIndex={0}
            aria-label={`${label} ${edge}`}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={edge === 'start' ? start : end}
            aria-valuetext={timecode(edge === 'start' ? start : end)}
            style={{ left: `${(((edge === 'start' ? start : end) - min) / span) * 100}%` }}
            onKeyDown={(e) => key(e, edge)}
          />
        ))}
      </div>
    </div>
  );
}
