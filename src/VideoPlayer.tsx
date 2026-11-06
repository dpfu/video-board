import { forwardRef, useImperativeHandle, useState } from 'react';
import {
  BookOpen,
  Camera,
  Clapperboard,
  Film,
  Layers,
  Pause,
  Play,
  Repeat2,
  ScanLine,
  Scissors,
  X,
  Volume2,
  VolumeX,
  AudioLines,
} from 'lucide-react';
import { IconButton } from './Icons';
import { Timeline } from './Timeline';
import {
  timecode,
  videoImageHeight,
  type Code,
  type Quotation,
  type TrackKind,
  type VideoCard,
} from './model';
import { CodeChips } from './Coding';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { publishTime } from './transport';
import { usePlayback } from './usePlayback';

export type PlayerHandle = {
  seek: (time: number) => void;
  element: () => HTMLVideoElement | null;
  time: () => number;
};

export const VideoPlayer = forwardRef<
  PlayerHandle,
  {
    video: VideoCard;
    quotation?: Quotation;
    codes: Code[];
    url: string;
    urls: Record<string, string>;
    stillTimes: number[];
    busy: boolean;
    onPatch: (patch: Partial<VideoCard>) => void;
    onCapture: (time: number) => void;
    onDelete: () => void;
    onError: (message: string) => void;
    onDrag: (event: React.PointerEvent) => void;
    dockControls: DockControls;
    onAddTrack: (kind: TrackKind) => void;
    onClip: (time: number) => void;
    onAllShots: () => void;
    onSegment: (time: number) => void;
    onCode: () => void;
  }
>(function VideoPlayer(
  {
    video,
    quotation,
    codes,
    url,
    urls,
    stillTimes,
    busy,
    onPatch,
    onCapture,
    onDelete,
    onError,
    onDrag,
    dockControls,
    onAddTrack,
    onClip,
    onAllShots,
    onSegment,
    onCode,
  },
  ref,
) {
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [speed, setSpeed] = useState(1);
  const playback = usePlayback({
    url,
    end: video.duration,
    initial: video.time,
    rate: speed,
    coalesce: true,
    onTime: (time) => publishTime(video.id, time),
    onPersist: (time) => onPatch({ time }),
    onError: (kind) =>
      onError(
        kind === 'play'
          ? 'Playback could not start. This browser may not support the file’s audio or video codec.'
          : `The browser could not play ${video.name}. Try an H.264 MP4 or WebM file.`,
      ),
  });
  const {
    element,
    time: desiredTime,
    actions: { seek, toggle: togglePlay },
  } = playback;
  const { time } = playback.state;
  const playing = playback.state.phase === 'playing';
  useImperativeHandle(ref, () => ({
    seek,
    element: () => element.current,
    time: () => desiredTime.current,
  }));
  return (
    <>
      <header className="card-header" onPointerDown={onDrag}>
        <ModuleGrip onPeel={dockControls.onPeel} />
        <Film size={12} className="card-kind" />
        <span className="card-title" title={video.name}>
          {video.name}
        </span>
        <span className="control-spacer" />
        <IconButton
          icon={Clapperboard}
          label="Create clip at playhead"
          onClick={() => onClip(desiredTime.current)}
        />
        <IconButton
          icon={Layers}
          label="Create clips from all shots"
          disabled={!video.scenes}
          onClick={onAllShots}
        />
        <IconButton icon={BookOpen} label="Code whole video" onClick={onCode} />
        <UndockButton {...dockControls} />
        <IconButton icon={X} label="Hide source player" onClick={onDelete} />
      </header>
      <div className="video-image" style={{ height: videoImageHeight(video) }}>
        <video
          ref={element}
          src={url}
          playsInline
          preload="auto"
          muted={muted}
          loop={loop}
          onClick={togglePlay}
        />
        {!playing && (
          <button
            type="button"
            className="video-play"
            aria-label={`Play ${video.name}`}
            onClick={() => void togglePlay()}
          >
            <Play size={25} fill="currentColor" />
          </button>
        )}
        {!!quotation?.codeIds.length && (
          <div className="media-codes" aria-label="Whole video codes">
            <CodeChips quotation={quotation} codes={codes} />
          </div>
        )}
      </div>
      <div className="player-controls">
        <IconButton
          icon={playing ? Pause : Play}
          label={playing ? 'Pause' : 'Play'}
          onClick={() => void togglePlay()}
        />
        <span className="player-time">{timecode(time)}</span>
        <select
          className="speed"
          aria-label="Playback speed"
          title="Playback speed"
          value={speed}
          onChange={(event) => {
            const rate = Number(event.target.value);
            setSpeed(rate);
          }}
        >
          {[0.25, 0.5, 1, 1.5, 2].map((rate) => (
            <option key={rate} value={rate}>
              {rate}×
            </option>
          ))}
        </select>
        <IconButton
          icon={muted ? VolumeX : Volume2}
          label={muted ? 'Unmute' : 'Mute'}
          onClick={() => setMuted(!muted)}
        />
        <IconButton
          icon={Repeat2}
          label="Loop video"
          aria-pressed={loop}
          onClick={() => setLoop(!loop)}
        />
        <IconButton
          icon={ScanLine}
          label="Select video segment"
          onClick={() => onSegment(desiredTime.current)}
        />
        <span className="control-spacer" />
        <IconButton
          icon={Film}
          label="Add thumbnail scrubber"
          onClick={() => onAddTrack('filmstrip')}
        />
        <IconButton
          icon={AudioLines}
          label="Add audio scrubber"
          onClick={() => onAddTrack('waveform')}
        />
        <IconButton icon={Scissors} label="Add cuts scrubber" onClick={() => onAddTrack('cuts')} />
        <IconButton
          className="capture"
          icon={Camera}
          label="Capture still"
          disabled={busy}
          onClick={() => {
            element.current?.pause();
            onCapture(desiredTime.current);
          }}
        />
      </div>
      <Timeline
        video={video}
        time={time}
        mode="position"
        urls={urls}
        stillTimes={stillTimes}
        onSeek={seek}
      />
    </>
  );
});
