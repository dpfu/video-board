import { useMemo, type PointerEvent } from 'react';
import {
  ArrowUpLeft,
  AudioLines,
  Camera,
  CopyPlus,
  Film,
  RefreshCw,
  Scissors,
  X,
} from 'lucide-react';
import { IconButton } from './Icons';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { Timeline } from './Timeline';
import { usePlayhead } from './transport';
import { timecode, type TrackCard, type VideoCard } from './model';
import { shotAt, shotRanges } from './scenes';

export function Track({
  track,
  video,
  urls,
  stillTimes,
  dockControls,
  busy,
  sceneBusy,
  onRetryScenes,
  onThreshold,
  onDrag,
  onSeek,
  onCapture,
  onDuplicate,
  onDelete,
  onJump,
}: {
  track: TrackCard;
  video: VideoCard;
  urls: Record<string, string>;
  stillTimes: number[];
  dockControls: DockControls;
  busy: boolean;
  onDrag: (event: PointerEvent) => void;
  sceneBusy: boolean;
  onRetryScenes: () => void;
  onThreshold: (value: number) => void;
  onSeek: (time: number) => void;
  onCapture: (time: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onJump: () => void;
}) {
  const time = usePlayhead(video.id, video.time);
  const Icon = track.kind === 'filmstrip' ? Film : track.kind === 'cuts' ? Scissors : AudioLines;
  const name = track.kind === 'filmstrip' ? 'Frames' : track.kind === 'cuts' ? 'Cuts' : 'Audio';
  const shots = useMemo(
    () => shotRanges(video.scenes, video.duration, video.start),
    [video.scenes, video.duration, video.start],
  );
  const activeShot = shots[shotAt(shots, time)];
  return (
    <>
      <header className="card-header track-header" onPointerDown={onDrag}>
        <ModuleGrip onPeel={dockControls.onPeel} />
        <Icon size={12} className="card-kind" />
        <span className="track-title">{name}</span>
        <span className="track-source" title={video.name}>
          {video.name}
        </span>
        <span className="control-spacer" />
        <IconButton
          icon={CopyPlus}
          label={`Duplicate ${name.toLowerCase()} scrubber`}
          onClick={onDuplicate}
        />
        <IconButton
          icon={Camera}
          label={`Capture still from ${name.toLowerCase()}`}
          disabled={busy}
          onClick={() => onCapture(time)}
        />
        <IconButton icon={ArrowUpLeft} label="Show source video" onClick={onJump} />
        <UndockButton {...dockControls} />
        <IconButton icon={X} label={`Remove ${name.toLowerCase()} scrubber`} onClick={onDelete} />
      </header>
      <Timeline
        video={video}
        time={time}
        mode={track.kind}
        urls={urls}
        stillTimes={stillTimes}
        onSeek={onSeek}
      />
      {track.kind === 'cuts' && (
        <div className="cuts-options">
          <span className="cuts-summary" aria-live="polite">
            {video.scenes && activeShot
              ? `${shots.length} shot${shots.length === 1 ? '' : 's'} · ${timecode(activeShot.start)}–${timecode(activeShot.end)}`
              : sceneBusy
                ? 'Detecting cuts…'
                : 'Detection unavailable'}
          </span>
          {video.scenes ? (
            <label
              className="cut-threshold"
              title="Lower threshold finds more cuts; uses cached scores"
            >
              <span>Threshold</span>
              <input
                type="range"
                aria-label="Cut threshold"
                min={1}
                max={50}
                step={1}
                value={video.scenes.threshold}
                disabled={busy}
                onChange={(event) => onThreshold(Number(event.target.value))}
              />
              <output>{video.scenes.threshold}</output>
            </label>
          ) : (
            <IconButton
              icon={RefreshCw}
              label="Retry cut detection"
              disabled={busy || sceneBusy}
              onClick={onRetryScenes}
            />
          )}
        </div>
      )}
    </>
  );
}
