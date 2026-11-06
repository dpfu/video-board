import { useEffect, useRef } from 'react';
import { ArrowUpRight, GripVertical, Link2, Pause, Play, Tags, VolumeX, X } from 'lucide-react';
import { CodeChips } from './Coding';
import { IconButton } from './Icons';
import {
  timecode,
  type Code,
  type Point,
  type Quotation,
  type SpaceItem,
  type VideoCard,
} from './model';
import { evidenceLabel, QUOTATION_DRAG } from './spaces';

export function EvidenceTile({
  item,
  spaceId,
  source,
  quotation: q,
  codes,
  image,
  url,
  active,
  pinned,
  selected,
  removeLabel,
  onEditStart,
  onMove,
  onSelect,
  onCode,
  onReveal,
  onRemove,
  onPreview,
  onStop,
}: {
  item: SpaceItem;
  spaceId: string;
  source: VideoCard;
  quotation: Quotation;
  codes: Code[];
  image?: string;
  url?: string;
  active: boolean;
  pinned: boolean;
  selected: boolean;
  removeLabel: string;
  onEditStart: () => void;
  onMove: (point: Point) => void;
  onSelect: () => void;
  onCode: () => void;
  onReveal: () => void;
  onRemove: () => void;
  onPreview: (hover: boolean, pin?: boolean) => void;
  onStop: () => void;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const temporal = q.kind === 'range' || q.kind === 'video';
  const label = evidenceLabel(q);
  const scope =
    q.kind === 'region'
      ? 'Region'
      : q.kind === 'frame'
        ? 'Still'
        : q.kind === 'video'
          ? 'Video'
          : 'Segment';
  const aspect = source.sourceWidth / source.sourceHeight;
  useEffect(() => {
    const video = player.current;
    if (!video) return;
    function start() {
      if (!video) return;
      video.currentTime = q.start;
      void video.play().catch(() => {});
    }
    if (video.readyState >= 1) start();
    else video.addEventListener('loadedmetadata', start, { once: true });
    return () => {
      video.removeEventListener('loadedmetadata', start);
      video.pause();
    };
  }, [active, q.start, q.end, url]);
  function loop() {
    const video = player.current;
    if (
      video &&
      (video.ended || video.currentTime >= q.end - 0.025 || video.currentTime < q.start)
    ) {
      video.currentTime = q.start;
      void video.play().catch(() => {});
    }
  }
  return (
    <article
      className={`evidence-tile ${selected ? 'is-active' : ''}`}
      data-evidence-id={q.id}
      style={{ left: item.x, top: item.y }}
      onPointerDown={onSelect}
      onFocus={onSelect}
    >
      <div className="evidence-heading">
        <button
          type="button"
          className="evidence-grip"
          draggable
          aria-label={`Move ${label}`}
          title="Drag to arrange or move to another group · arrow keys to nudge · Shift for larger steps"
          onDragStart={(event) => {
            event.dataTransfer.setData(
              QUOTATION_DRAG,
              JSON.stringify({ quotationId: q.id, spaceId }),
            );
            event.dataTransfer.effectAllowed = 'copyMove';
            onStop();
          }}
          onKeyDown={(event) => {
            const direction = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            }[event.key];
            if (!direction) return;
            event.preventDefault();
            event.stopPropagation();
            if (!event.repeat) onEditStart();
            const step = event.shiftKey ? 10 : 1;
            onMove({ x: item.x + direction[0] * step, y: item.y + direction[1] * step });
          }}
        >
          <GripVertical size={12} />
        </button>
        <span>{scope}</span>
        <span title="Linked quotation · coding and frame changes are shared">
          <Link2 size={10} aria-hidden="true" />
        </span>
        <span className="control-spacer" />
        <IconButton icon={X} label={removeLabel} onClick={onRemove} />
      </div>
      <div
        className="evidence-image"
        onMouseEnter={() => temporal && onPreview(true)}
        onMouseLeave={() => temporal && onPreview(false)}
      >
        <div
          className="evidence-frame"
          style={{ width: Math.min(192, 106 * aspect), height: Math.min(106, 192 / aspect) }}
        >
          {image ? (
            <img src={image} alt={`${scope}: ${label}`} draggable={false} />
          ) : (
            <span className="evidence-loading">Loading frame…</span>
          )}
          {q.rect && (
            <span
              className="evidence-region"
              style={{
                left: `${q.rect.x * 100}%`,
                top: `${q.rect.y * 100}%`,
                width: `${q.rect.width * 100}%`,
                height: `${q.rect.height * 100}%`,
              }}
            />
          )}
          {temporal && active && url && (
            <video
              ref={player}
              src={url}
              muted
              playsInline
              preload="auto"
              aria-label={`Muted preview: ${label}`}
              onTimeUpdate={loop}
              onEnded={loop}
            />
          )}
        </div>
        {temporal && (
          <IconButton
            className="evidence-play"
            icon={pinned ? Pause : Play}
            label={`${pinned ? 'Stop' : 'Play'} preview: ${label}`}
            onClick={() => (pinned ? onStop() : onPreview(true, true))}
          />
        )}
        {active && temporal && (
          <span className="evidence-muted" title="Muted preview">
            <VolumeX size={11} />
          </span>
        )}
      </div>
      <button type="button" className="evidence-title" title={q.title || label} onClick={onCode}>
        {label}
      </button>
      <div className="evidence-source" title={source.name}>
        {source.name} · {timecode(q.start)}
        {temporal ? `–${timecode(q.end)}` : ''}
      </div>
      <div className="evidence-footer">
        <CodeChips quotation={q} codes={codes} />
        <span className="control-spacer" />
        <IconButton icon={Tags} label={`Code ${label}`} onClick={onCode} />
        <IconButton icon={ArrowUpRight} label={`Reveal ${label} in source`} onClick={onReveal} />
      </div>
    </article>
  );
}
