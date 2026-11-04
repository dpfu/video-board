import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Camera, Film, Pause, Play, Repeat2, Scissors, Trash2, Volume2, VolumeX, AudioLines } from 'lucide-react';
import { IconButton } from './Icons';
import { Timeline } from './Timeline';
import { clamp, timecode, videoImageHeight, type TrackKind, type VideoCard } from './model';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { publishTime } from './transport';

export type PlayerHandle = { seek: (time: number) => void; element: () => HTMLVideoElement | null; time: () => number };

export const VideoPlayer = forwardRef<PlayerHandle, {
  video: VideoCard; url: string; urls: Record<string, string>; stillTimes: number[]; busy: boolean;
  onPatch: (patch: Partial<VideoCard>) => void; onCapture: (time: number) => void; onDelete: () => void;
  onError: (message: string) => void; onDrag: (event: React.PointerEvent) => void;
  dockControls: DockControls; onAddTrack: (kind: TrackKind) => void;
}>(function VideoPlayer({ video, url, urls, stillTimes, busy, onPatch, onCapture, onDelete, onError, onDrag, dockControls, onAddTrack }, ref) {
  const element = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(video.time);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const desiredTime = useRef(video.time);
  const pendingSeek = useRef<number | null>(null);
  const animation = useRef(0);
  const patch = useRef(onPatch); patch.current = onPatch;

  function seek(value: number) {
    const next = clamp(value, 0, Math.max(0, video.duration - .000001));
    element.current?.pause();
    desiredTime.current = next; setTime(next); publishTime(video.id, next); pendingSeek.current = next;
    if (!animation.current) animation.current = requestAnimationFrame(() => {
      animation.current = 0;
      if (element.current && pendingSeek.current !== null) {
        element.current.currentTime = pendingSeek.current;
        patch.current({ time: pendingSeek.current }); pendingSeek.current = null;
      }
    });
  }
  useImperativeHandle(ref, () => ({ seek, element: () => element.current, time: () => desiredTime.current }));

  useEffect(() => {
    const player = element.current;
    if (!player) return;
    let callback = 0;
    let raf = 0;
    const sync = () => {
      if (!player.seeking && pendingSeek.current === null) { desiredTime.current = player.currentTime; setTime(player.currentTime); publishTime(video.id, player.currentTime); }
    };
    if ('requestVideoFrameCallback' in player) {
      const tick = () => { sync(); callback = player.requestVideoFrameCallback(tick); };
      callback = player.requestVideoFrameCallback(tick);
    } else {
      const tick = () => { sync(); raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick);
    }
    return () => { if (callback) player.cancelVideoFrameCallback(callback); cancelAnimationFrame(raf); cancelAnimationFrame(animation.current); };
  }, []);

  async function togglePlay() {
    const player = element.current;
    if (!player) return;
    if (!player.paused) player.pause();
    else { try { await player.play(); } catch { onError('Playback could not start. This browser may not support the file’s audio or video codec.'); } }
  }
  return <>
    <header className="card-header" onPointerDown={onDrag}>
      <ModuleGrip onPeel={dockControls.onPeel} /><Film size={12} className="card-kind" /><span className="card-title" title={video.name}>{video.name}</span><span className="control-spacer" />
      <UndockButton {...dockControls} />
      <IconButton icon={Trash2} label={`Remove ${video.name}`} onClick={onDelete} />
    </header>
    <div className="video-image" style={{ height: videoImageHeight(video) }}>
      <video ref={element} src={url} playsInline preload="auto" muted={muted} loop={loop}
        onLoadedMetadata={() => { if (element.current) { element.current.currentTime = video.time; publishTime(video.id, video.time); } }}
        onClick={() => void togglePlay()}
        onPlay={() => setPlaying(true)}
        onPause={() => { setPlaying(false); if (element.current) patch.current({ time: element.current.currentTime }); }}
        onEnded={() => {
          setPlaying(false);
          if (element.current) {
            const end = element.current.currentTime;
            desiredTime.current = end; setTime(end); publishTime(video.id, end); patch.current({ time: end });
          }
        }}
        onSeeked={() => { if (element.current && pendingSeek.current === null) { desiredTime.current = element.current.currentTime; setTime(element.current.currentTime); publishTime(video.id, element.current.currentTime); } }}
        onError={() => onError(`The browser could not play ${video.name}. Try an H.264 MP4 or WebM file.`)} />
      {!playing && <button type="button" className="video-play" aria-label={`Play ${video.name}`} onClick={() => void togglePlay()}><Play size={25} fill="currentColor" /></button>}
    </div>
    <div className="player-controls">
      <IconButton icon={playing ? Pause : Play} label={playing ? 'Pause' : 'Play'} onClick={() => void togglePlay()} />
      <span className="player-time">{timecode(time)}</span>
      <select className="speed" aria-label="Playback speed" title="Playback speed" value={speed} onChange={event => { const rate = Number(event.target.value); setSpeed(rate); if (element.current) element.current.playbackRate = rate; }}>{[.25, .5, 1, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}×</option>)}</select>
      <IconButton icon={muted ? VolumeX : Volume2} label={muted ? 'Unmute' : 'Mute'} onClick={() => setMuted(!muted)} />
      <IconButton icon={Repeat2} label="Loop video" aria-pressed={loop} onClick={() => setLoop(!loop)} />
      <span className="control-spacer" />
      <IconButton icon={Film} label="Add thumbnail scrubber" onClick={() => onAddTrack('filmstrip')} />
      <IconButton icon={AudioLines} label="Add audio scrubber" onClick={() => onAddTrack('waveform')} />
      <IconButton icon={Scissors} label="Add cuts scrubber" onClick={() => onAddTrack('cuts')} />
      <IconButton className="capture" icon={Camera} label="Capture still" disabled={busy} onClick={() => { element.current?.pause(); onCapture(desiredTime.current); }} />
    </div>
    <Timeline video={video} time={time} mode="position" urls={urls} stillTimes={stillTimes} onSeek={seek} />
  </>;
});
