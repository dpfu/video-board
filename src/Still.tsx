import { useEffect, useState } from 'react';
import { ArrowUpLeft, ChevronLeft, ChevronRight, Link2, Trash2 } from 'lucide-react';
import { IconButton } from './Icons';
import { clamp, parseTimecode, timecode, type StillCard, type VideoCard } from './model';

export function Still({ still, video, url, busy, onDrag, onTime, onJump, onDelete }: {
  still: StillCard; video: VideoCard; url: string; busy: boolean; onDrag: (event: React.PointerEvent) => void;
  onTime: (time: number) => void; onJump: () => void; onDelete: () => void;
}) {
  const [draft, setDraft] = useState(timecode(still.time));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(timecode(still.time)); setInvalid(false); }, [still.time]);
  const frameTimes = video.frameTimes;
  const previous = [...frameTimes].reverse().find(time => time < still.time - .00001);
  const next = frameTimes.find(time => time > still.time + .00001);
  function submit() {
    const time = parseTimecode(draft);
    if (!Number.isFinite(time) || time < 0 || time >= video.duration) { setInvalid(true); return; }
    setInvalid(false);
    if (Math.abs(time - still.time) > .0001) onTime(time);
  }
  return <>
    <header className="card-header still-header" onPointerDown={onDrag}>
      <Link2 size={14} className="card-kind" />
      <input className="still-time" aria-label={`Still timecode from ${video.name}`} aria-invalid={invalid} title="Edit timecode · mm:ss.mmm" value={draft} disabled={busy} spellCheck={false}
        onChange={event => { setDraft(event.target.value); setInvalid(false); }} onBlur={submit}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { setDraft(timecode(still.time)); setInvalid(false); }
        }} />
      <span className="control-spacer" />
      <IconButton icon={ChevronLeft} label={frameTimes.length ? 'Previous frame' : 'Earlier by 0.1 seconds'} disabled={busy || (frameTimes.length > 0 && previous === undefined)} onClick={() => onTime(previous ?? clamp(still.time - .1, 0, video.duration))} />
      <IconButton icon={ChevronRight} label={frameTimes.length ? 'Next frame' : 'Later by 0.1 seconds'} disabled={busy || (frameTimes.length > 0 && next === undefined)} onClick={() => onTime(next ?? clamp(still.time + .1, 0, video.duration - .001))} />
      <IconButton icon={ArrowUpLeft} label="Jump to video" onClick={onJump} />
      <IconButton icon={Trash2} label="Remove still" onClick={onDelete} />
    </header>
    <img className={`still-image ${busy ? 'is-busy' : ''}`} src={url} alt={`Still from ${video.name} at ${timecode(still.time)}`} draggable={false} onPointerDown={onDrag} onDoubleClick={onJump} />
    <footer className="still-footer"><Link2 size={10} /><span title={video.name}>{video.name}</span>{busy && <span>Updating…</span>}</footer>
  </>;
}
