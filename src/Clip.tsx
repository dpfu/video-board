import { useEffect, useState, type PointerEvent } from 'react';
import {
  ArrowUpLeft,
  BookOpen,
  Camera,
  CopyPlus,
  Pause,
  PinOff,
  Play,
  ScanLine,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { IconButton } from './Icons';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { RangeEditor } from './RangeEditor';
import { clamp, timecode, type ClipCard, type Code, type Quotation, type VideoCard } from './model';
import { CodeChips } from './Coding';
import { usePlayback } from './usePlayback';
import { usePointerGesture } from './pointer';

export function Clip({
  clip,
  video,
  quotation,
  codes,
  sharedViews,
  url,
  urls,
  poster,
  active,
  pinned,
  busy,
  dockControls,
  onHover,
  onPin,
  onDrag,
  onRange,
  onEditStart,
  onCapture,
  onSegment,
  onJump,
  onDuplicate,
  onDelete,
  onPlayer,
  onCode,
  onStop,
  onRate,
}: {
  clip: ClipCard;
  video: VideoCard;
  quotation: Quotation;
  codes: Code[];
  sharedViews: number;
  url: string;
  urls: Record<string, string>;
  active: boolean;
  pinned: boolean;
  busy: boolean;
  dockControls: DockControls;
  onHover: (hover: boolean) => void;
  onPin: () => void;
  onDrag: (e: PointerEvent) => void;
  onRange: (start: number, end: number) => void;
  onEditStart: () => void;
  onCapture: (time: number) => void;
  onSegment: (time: number) => void;
  onJump: (time: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onPlayer: (el: HTMLVideoElement | null) => void;
  onCode: () => void;
  onStop: () => void;
  onRate: (rate: number) => void;
  poster?: string;
}) {
  const { active: scrubbing, finish } = usePointerGesture<{ pointer: number }>();
  const [muted, setMuted] = useState(true);
  const rate = clip.rate || 1;
  const playback = usePlayback({
    active,
    url,
    start: quotation.start,
    end: quotation.end,
    initial: quotation.start,
    rate,
    bounded: true,
    autoplay: true,
    onActivate: () => {
      if (!pinned) onPin();
    },
  });
  const {
    element,
    actions: { seek },
  } = playback;
  const { time, ready } = playback.state;
  const playing = playback.state.phase === 'playing';
  const position = clamp((time - quotation.start) / (quotation.end - quotation.start), 0, 1);
  const imageHeight = clip.height
    ? clip.height - 28 - 94
    : clamp(((clip.width - 2) * video.sourceHeight) / video.sourceWidth, 100, 320);
  const thumb =
    video.thumbnails[
      Math.min(
        video.thumbnails.length - 1,
        Math.floor((quotation.start / video.duration) * video.thumbnails.length),
      )
    ];
  useEffect(() => {
    if (!pinned) setMuted(true);
  }, [pinned]);
  function scrub(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    seek(
      quotation.start +
        clamp((e.clientX - r.left) / r.width, 0, 1) * (quotation.end - quotation.start),
    );
  }
  return (
    <>
      <header className="card-header clip-header" onPointerDown={onDrag}>
        <ModuleGrip onPeel={dockControls.onPeel} />
        <Scissors size={12} className="card-kind" />
        <span className="card-title" title={quotation.title || video.name}>
          {quotation.title || 'Clip'}
        </span>
        <span className="control-spacer" />
        <IconButton icon={BookOpen} label="Code clip" onClick={onCode} />
        <IconButton icon={CopyPlus} label="Duplicate clip view" onClick={onDuplicate} />
        <IconButton icon={ArrowUpLeft} label="Show clip source" onClick={() => onJump(time)} />
        <UndockButton {...dockControls} />
        <IconButton icon={Trash2} label="Remove clip view" onClick={onDelete} />
      </header>
      <div
        className={`clip-media ${active ? 'is-previewing' : ''}`}
        style={{ height: imageHeight }}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'touch') onHover(true);
        }}
        onPointerLeave={() => onHover(false)}
      >
        {(poster || thumb) && (
          <img
            className="clip-poster"
            src={poster || urls[thumb]}
            data-cover-ready={!!poster}
            alt={`Clip cover from ${video.name}`}
            draggable={false}
          />
        )}
        {active && (
          <video
            className={ready ? 'is-ready' : ''}
            ref={(el) => {
              element.current = el;
              onPlayer(el);
            }}
            src={url}
            playsInline
            muted={muted}
            preload="auto"
          />
        )}
        {!pinned && (
          <span className="clip-hover-hint">
            <VolumeX size={11} /> hover to preview
          </span>
        )}
        {!!quotation.codeIds.length && (
          <div className="media-codes" aria-label="Clip codes">
            <CodeChips quotation={quotation} codes={codes} />
          </div>
        )}
      </div>
      <div className="clip-controls">
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? 'Pause clip' : 'Play clip'}
          aria-pressed={pinned}
          onClick={() => {
            if (!pinned) onPin();
            else playback.actions.toggle();
          }}
        />
        <span className="player-time">{timecode(time)}</span>
        <select
          className="speed"
          aria-label="Clip playback speed"
          value={rate}
          onChange={(e) => {
            const value = Number(e.target.value);
            onRate(value);
          }}
        >
          {[0.25, 0.5, 1, 1.5, 2].map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
        <IconButton
          icon={muted ? VolumeX : Volume2}
          label={muted ? 'Unmute clip' : 'Mute clip'}
          disabled={!pinned}
          onClick={() => setMuted(!muted)}
        />
        {pinned && <IconButton icon={PinOff} label="Stop clip preview" onClick={onStop} />}
        <span className="control-spacer" />
        <IconButton
          icon={ScanLine}
          label="Select segment in clip"
          onClick={() => onSegment(time)}
        />
        <IconButton
          icon={Camera}
          label="Capture clip still"
          disabled={busy}
          onClick={() => onCapture(time)}
        />
      </div>
      <div
        className="clip-progress"
        role="slider"
        tabIndex={0}
        aria-label="Scrub clip"
        aria-valuemin={quotation.start}
        aria-valuemax={quotation.end}
        aria-valuenow={time}
        aria-valuetext={timecode(time)}
        onPointerDown={(e) => {
          if (e.button !== 0 || scrubbing.current) return;
          e.preventDefault();
          e.stopPropagation();
          scrubbing.current = { pointer: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub(e);
        }}
        onPointerMove={(e) => {
          if (scrubbing.current?.pointer === e.pointerId) scrub(e);
        }}
        onPointerUp={(e) => {
          finish(e.pointerId);
        }}
        onPointerCancel={(e) => {
          finish(e.pointerId);
        }}
        onLostPointerCapture={(e) => {
          finish(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            seek(
              e.key === 'Home'
                ? quotation.start
                : e.key === 'End'
                  ? quotation.end
                  : time + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.04),
            );
          }
        }}
      >
        <span style={{ width: `${position * 100}%` }} />
      </div>
      <RangeEditor
        label="Clip"
        start={quotation.start}
        end={quotation.end}
        max={video.duration}
        frames={video.frameTimes}
        onChange={onRange}
        onEditStart={onEditStart}
      />
      <div className="clip-source">
        <span title={video.name}>{video.name} · source time</span>
        {sharedViews > 1 && (
          <span
            className="shared-views"
            title="Linked views share this segment's boundaries, codes and memo."
          >
            {sharedViews} linked views
          </span>
        )}
      </div>
    </>
  );
}
