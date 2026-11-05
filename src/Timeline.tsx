import { memo, useMemo, useRef } from 'react';
import type { CSSProperties, PointerEvent, KeyboardEvent } from 'react';
import { clamp, timecode, type TrackKind, type VideoCard } from './model';
import { shotAt, shotRanges } from './scenes';

export const Waveform = memo(function Waveform({ peaks }: { peaks: number[] }) {
  const maximum = Math.max(0.001, ...peaks);
  const top = peaks.map(
    (v, i) => `${(i / (peaks.length - 1)) * 1000},${20 - Math.sqrt(v / maximum) * 17}`,
  );
  const bottom = peaks
    .map((v, i) => `${(i / (peaks.length - 1)) * 1000},${20 + Math.sqrt(v / maximum) * 17}`)
    .reverse();
  return (
    <svg className="waveform" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
      <path d={`M${[...top, ...bottom].join('L')}Z`} fill="currentColor" />
    </svg>
  );
});

export function Timeline({
  video,
  time,
  urls,
  stillTimes,
  mode,
  onSeek,
}: {
  video: VideoCard;
  time: number;
  urls: Record<string, string>;
  stillTimes: number[];
  mode: TrackKind | 'position';
  onSeek: (time: number) => void;
}) {
  const active = useRef<number | null>(null);
  const position = clamp((time / video.duration) * 100, 0, 100);
  const shots = useMemo(
    () => shotRanges(video.scenes, video.duration, video.start),
    [video.scenes, video.duration, video.start],
  );
  const activeShot = shotAt(shots, time);
  const seekPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(clamp((event.clientX - box.left) / box.width, 0, 1) * video.duration);
  };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = time + (event.shiftKey ? 1 : 0.1);
    if (event.key === 'ArrowLeft') next = time - (event.shiftKey ? 1 : 0.1);
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = video.duration;
    if (next !== undefined) {
      event.preventDefault();
      onSeek(clamp(next, 0, video.duration));
    }
  };
  return (
    <div
      className={`timeline timeline--${mode}`}
      style={{ '--playhead': `${position}%` } as CSSProperties}
    >
      {mode !== 'position' && (
        <div className="timeline__ruler" aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <span key={t}>{timecode(video.duration * t, false)}</span>
          ))}
        </div>
      )}
      <div
        className="timeline__tracks"
        role={mode === 'cuts' ? 'group' : 'slider'}
        tabIndex={mode === 'cuts' ? undefined : 0}
        aria-label={
          mode === 'cuts'
            ? `Detected shots · ${video.name}`
            : `Scrub ${mode === 'position' ? '' : mode === 'filmstrip' ? 'frames · ' : 'audio · '}${video.name}`
        }
        aria-valuemin={mode === 'cuts' ? undefined : 0}
        aria-valuemax={mode === 'cuts' ? undefined : video.duration}
        aria-valuenow={mode === 'cuts' ? undefined : time}
        aria-valuetext={mode === 'cuts' ? undefined : timecode(time)}
        onKeyDown={keyboard}
        onPointerDown={(event) => {
          if (event.button !== 0 || mode === 'cuts') return;
          event.preventDefault();
          event.stopPropagation();
          active.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          seekPointer(event);
        }}
        onPointerMove={(event) => {
          if (active.current === event.pointerId) seekPointer(event);
        }}
        onPointerUp={(event) => {
          if (active.current === event.pointerId) {
            seekPointer(event);
            active.current = null;
          }
        }}
        onPointerCancel={() => {
          active.current = null;
        }}
      >
        {mode === 'filmstrip' && (
          <div className="timeline__filmstrip">
            {video.thumbnails.length ? (
              video.thumbnails.map((key) => (
                <img key={key} src={urls[key]} alt="" draggable={false} />
              ))
            ) : (
              <span className="track-message">
                {video.analysis === 'pending' ? 'Making thumbnails…' : 'Thumbnails unavailable'}
              </span>
            )}
          </div>
        )}
        {mode === 'waveform' && (
          <div className="timeline__audio">
            {video.peaks.length ? (
              <Waveform peaks={video.peaks} />
            ) : (
              <span className="track-message">
                {video.analysis === 'pending'
                  ? 'Reading audio…'
                  : video.analysisNote || 'Waveform unavailable'}
              </span>
            )}
          </div>
        )}
        {mode === 'position' && <div className="timeline__plain" />}
        {mode === 'cuts' && (
          <div className="timeline__cuts">
            {video.scenes ? (
              shots.map((shot, i) => (
                <button
                  type="button"
                  key={shot.start}
                  className={`shot-segment ${i === activeShot ? 'is-active' : ''}`}
                  style={{
                    left: `${(shot.start / video.duration) * 100}%`,
                    width: `${((shot.end - shot.start) / video.duration) * 100}%`,
                  }}
                  aria-label={`Shot ${i + 1} · ${timecode(shot.start)}–${timecode(shot.end)}`}
                  aria-pressed={i === activeShot}
                  title={`Shot ${i + 1} · ${timecode(shot.start)}–${timecode(shot.end)} · click to seek`}
                  data-start={shot.start}
                  data-end={shot.end}
                  onClick={() => onSeek(shot.start)}
                >
                  {(shot.end - shot.start) / video.duration > 0.04 && <span>{i + 1}</span>}
                </button>
              ))
            ) : (
              <span className="track-message">
                {video.analysis === 'pending' ? 'Detecting cuts…' : 'Waiting for cut detection…'}
              </span>
            )}
          </div>
        )}
        {mode !== 'cuts' &&
          video.scenes &&
          shots
            .slice(1)
            .map((shot) => (
              <span
                key={shot.start}
                className="timeline__cut"
                style={{ left: `${(shot.start / video.duration) * 100}%` }}
                aria-hidden="true"
              />
            ))}
        {stillTimes.map((t, i) => (
          <span
            key={i}
            className="timeline__marker"
            style={{ left: `${(t / video.duration) * 100}%` }}
          />
        ))}
        <span className="timeline__playhead" />
      </div>
    </div>
  );
}
