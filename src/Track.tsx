import type { PointerEvent } from 'react';
import { ArrowUpLeft, AudioLines, Camera, CopyPlus, Film, X } from 'lucide-react';
import { IconButton } from './Icons';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { Timeline } from './Timeline';
import { usePlayhead } from './transport';
import type { TrackCard, VideoCard } from './model';

export function Track({ track, video, urls, stillTimes, dockControls, busy, onDrag, onSeek, onCapture, onDuplicate, onDelete, onJump }: {
  track: TrackCard; video: VideoCard; urls: Record<string, string>; stillTimes: number[];
  dockControls: DockControls; busy: boolean; onDrag: (event: PointerEvent) => void;
  onSeek: (time: number) => void; onCapture: (time: number) => void; onDuplicate: () => void; onDelete: () => void; onJump: () => void;
}) {
  const time = usePlayhead(video.id, video.time);
  const Icon = track.kind === 'filmstrip' ? Film : AudioLines;
  const name = track.kind === 'filmstrip' ? 'Frames' : 'Audio';
  return <>
    <header className="card-header track-header" onPointerDown={onDrag}>
      <ModuleGrip onPeel={dockControls.onPeel} /><Icon size={12} className="card-kind" />
      <span className="track-title">{name}</span><span className="track-source" title={video.name}>{video.name}</span>
      <span className="control-spacer" />
      <IconButton icon={CopyPlus} label={`Duplicate ${name.toLowerCase()} scrubber`} onClick={onDuplicate} />
      <IconButton icon={Camera} label={`Capture still from ${name.toLowerCase()}`} disabled={busy} onClick={() => onCapture(time)} />
      <IconButton icon={ArrowUpLeft} label="Show source video" onClick={onJump} />
      <UndockButton {...dockControls} />
      <IconButton icon={X} label={`Remove ${name.toLowerCase()} scrubber`} onClick={onDelete} />
    </header>
    <Timeline video={video} time={time} mode={track.kind} urls={urls} stillTimes={stillTimes} onSeek={onSeek} />
  </>;
}
