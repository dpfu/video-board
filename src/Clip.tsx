import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowUpLeft, BookOpen, Camera, CopyPlus, Pause, PinOff, Play, ScanLine, Scissors, Trash2, Volume2, VolumeX } from 'lucide-react';
import { IconButton } from './Icons';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { RangeEditor } from './RangeEditor';
import { clamp, timecode, type ClipCard, type Quotation, type VideoCard } from './model';

export function Clip({ clip, video, quotation, url, urls, poster, active, pinned, busy, dockControls, onHover, onPin, onDrag, onRange, onEditStart, onCapture, onSegment, onJump, onDuplicate, onDelete, onPlayer, onCode, onStop }: {
  clip: ClipCard; video: VideoCard; quotation: Quotation; url: string; urls: Record<string, string>; active: boolean; pinned: boolean; busy: boolean; dockControls: DockControls;
  onHover: (hover: boolean) => void; onPin: () => void; onDrag: (e: PointerEvent) => void; onRange: (start: number, end: number) => void; onEditStart: () => void;
  onCapture: (time: number) => void; onSegment: (time: number) => void; onJump: (time: number) => void; onDuplicate: () => void; onDelete: () => void; onPlayer: (el: HTMLVideoElement | null) => void;
  onCode: () => void; onStop: () => void;
  poster?: string;
}) {
  const element = useRef<HTMLVideoElement | null>(null), bounds = useRef(quotation); bounds.current = quotation;
  const pendingSeek = useRef<number | null>(null), scrubbing = useRef<number | null>(null);
  const [time, setTime] = useState(quotation.start), [muted, setMuted] = useState(true), [playing, setPlaying] = useState(false), [rate, setRate] = useState(1), [ready, setReady] = useState(false);
  const position = clamp((time - quotation.start) / (quotation.end - quotation.start), 0, 1);
  const imageHeight = clip.height ? clip.height - 28 - 94 : clamp((clip.width - 2) * video.sourceHeight / video.sourceWidth, 100, 320);
  const thumb = video.thumbnails[Math.min(video.thumbnails.length - 1, Math.floor(quotation.start / video.duration * video.thumbnails.length))];
  useEffect(() => {
    if (!pinned) setMuted(true);
  }, [pinned]);
  useEffect(() => {
    const player = element.current; if (!active || !player) { setPlaying(false); setReady(false); setTime(quotation.start); return; }
    let frame = 0, raf = 0;
    const sync = () => {
      const q = bounds.current;
      if (!player.seeking && (player.currentTime >= q.end || player.currentTime < q.start - .001)) player.currentTime = q.start;
      setTime(clamp(player.currentTime, q.start, q.end));
    };
    if ('requestVideoFrameCallback' in player) { const tick = () => { sync(); frame = player.requestVideoFrameCallback(tick); }; frame = player.requestVideoFrameCallback(tick); }
    else { const tick = () => { sync(); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); }
    return () => { if (frame) player.cancelVideoFrameCallback(frame); cancelAnimationFrame(raf); };
  }, [active]);
  useEffect(() => {
    const player = element.current;
    if (player && (player.currentTime < quotation.start || player.currentTime >= quotation.end)) player.currentTime = quotation.start;
    if (!active) setTime(quotation.start);
  }, [quotation.start, quotation.end, active]);
  function seek(value: number) {
    const next = clamp(value, quotation.start, quotation.end - .000001); setTime(next);
    const player = element.current;
    if (!active || !player) { pendingSeek.current = next; onPin(); }
    else { if (!pinned) onPin(); player.pause(); player.currentTime = next; }
  }
  function scrub(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect(); seek(quotation.start + clamp((e.clientX - r.left) / r.width, 0, 1) * (quotation.end - quotation.start));
  }
  return <>
    <header className="card-header clip-header" onPointerDown={onDrag}>
      <ModuleGrip onPeel={dockControls.onPeel} /><Scissors size={12} className="card-kind" />
      <span className="card-title" title={quotation.title || video.name}>{quotation.title || 'Clip'}</span><span className="control-spacer" />
      <IconButton icon={BookOpen} label="Code clip" onClick={onCode} /><IconButton icon={CopyPlus} label="Duplicate clip view" onClick={onDuplicate} /><IconButton icon={ArrowUpLeft} label="Show clip source" onClick={() => onJump(time)} /><UndockButton {...dockControls} /><IconButton icon={Trash2} label="Remove clip view" onClick={onDelete} />
    </header>
    <div className={`clip-media ${active ? 'is-previewing' : ''}`} style={{ height: imageHeight }} onPointerEnter={e => { if (e.pointerType !== 'touch') onHover(true); }} onPointerLeave={() => onHover(false)}>
      {(poster || thumb) && <img className="clip-poster" src={poster || urls[thumb]} data-cover-ready={!!poster} alt={`Clip cover from ${video.name}`} draggable={false} />}
      {active && <video className={ready ? 'is-ready' : ''} ref={el => { element.current = el; onPlayer(el); }} src={url} playsInline muted={muted} preload="auto"
        onLoadedMetadata={() => { const el = element.current; if (el) { el.currentTime = pendingSeek.current ?? bounds.current.start; el.playbackRate = rate; if (pendingSeek.current === null) void el.play().catch(() => setPlaying(false)); pendingSeek.current = null; } }}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { const el = element.current; if (el) { el.currentTime = bounds.current.start; void el.play().catch(() => {}); } }}
        onSeeked={() => setReady(true)}
        onTimeUpdate={() => { const el = element.current; if (el && el.currentTime >= bounds.current.end) el.currentTime = bounds.current.start; }} />}
      {!pinned && <span className="clip-hover-hint"><VolumeX size={11} /> hover to preview</span>}
    </div>
    <div className="clip-controls">
      <IconButton icon={playing ? Pause : Play} label={playing ? 'Pause clip' : 'Play clip'} aria-pressed={pinned} onClick={() => { if (!pinned) onPin(); else if (element.current?.paused) void element.current.play(); else element.current?.pause(); }} />
      <span className="player-time">{timecode(time)}</span>
      <select className="speed" aria-label="Clip playback speed" value={rate} onChange={e => { const value = Number(e.target.value); setRate(value); if (element.current) element.current.playbackRate = value; }}>{[.25, .5, 1, 1.5, 2].map(r => <option key={r} value={r}>{r}×</option>)}</select>
      <IconButton icon={muted ? VolumeX : Volume2} label={muted ? 'Unmute clip' : 'Mute clip'} disabled={!pinned} onClick={() => setMuted(!muted)} />
      {pinned && <IconButton icon={PinOff} label="Stop clip preview" onClick={onStop} />}
      <span className="control-spacer" /><IconButton icon={ScanLine} label="Select segment in clip" onClick={() => onSegment(time)} /><IconButton icon={Camera} label="Capture clip still" disabled={busy} onClick={() => onCapture(time)} />
    </div>
    <div className="clip-progress" role="slider" tabIndex={0} aria-label="Scrub clip" aria-valuemin={quotation.start} aria-valuemax={quotation.end} aria-valuenow={time} aria-valuetext={timecode(time)}
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); scrubbing.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }} onPointerMove={e => { if (scrubbing.current === e.pointerId) scrub(e); }} onPointerUp={() => { scrubbing.current = null; }} onPointerCancel={() => { scrubbing.current = null; }}
      onKeyDown={e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); seek(e.key === 'Home' ? quotation.start : e.key === 'End' ? quotation.end : time + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : .04)); } }}><span style={{ width: `${position * 100}%` }} /></div>
    <RangeEditor label="Clip" start={quotation.start} end={quotation.end} max={video.duration} frames={video.frameTimes} onChange={onRange} onEditStart={onEditStart} />
    <div className="clip-source" title={video.name}>{video.name} · source time</div>
  </>;
}
