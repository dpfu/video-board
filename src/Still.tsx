import { useEffect, useState } from 'react';
import { ArrowUpLeft, BookOpen, ChevronLeft, ChevronRight, CopyPlus, Link2, ScanLine, Trash2 } from 'lucide-react';
import { IconButton } from './Icons';
import { clamp, parseTimecode, stillImageHeight, timecode, type StillCard, type VideoCard } from './model';
import { ModuleGrip, UndockButton, type DockControls } from './ModuleGrip';
import { Regions } from './Regions';
import { CodeChips } from './Coding';
import type { Code, Quotation, Rect } from './model';

export function Still({ still, video, url, busy, onDrag, onTime, onJump, onDelete, dockControls, regions, codes, selectedRegion, drawing, onDraw, onSelectRegion, onCreateRegion, onChangeRegion, onEditStart, onDeleteRegion, onCode, onDuplicate, quotation }: {
  still: StillCard; video: VideoCard; url: string; busy: boolean; onDrag: (event: React.PointerEvent) => void;
  onTime: (time: number) => void; onJump: () => void; onDelete: () => void;
  dockControls: DockControls;
  regions: Quotation[]; codes: Code[]; selectedRegion: string | null; drawing: boolean; quotation?: Quotation;
  onDraw: () => void; onSelectRegion: (id: string) => void; onCreateRegion: (rect: Rect) => void;
  onChangeRegion: (id: string, rect: Rect) => void; onEditStart: () => void; onDeleteRegion: (id: string) => void;
  onCode: () => void; onDuplicate: () => void;
}) {
  const [draft, setDraft] = useState(timecode(still.time));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(timecode(still.time)); setInvalid(false); }, [still.time]);
  const frameTimes = video.frameTimes;
  const previous = [...frameTimes].reverse().find(time => time < still.time - .00001);
  const next = frameTimes.find(time => time > still.time + .00001);
  const imageHeight = stillImageHeight(still, video), contentWidth = still.width - 2;
  const ratio = Math.min(contentWidth / video.sourceWidth, imageHeight / video.sourceHeight);
  const imageWidth = ratio * video.sourceWidth, containedHeight = ratio * video.sourceHeight;
  function submit() {
    const time = parseTimecode(draft);
    if (!Number.isFinite(time) || time < 0 || time >= video.duration) { setInvalid(true); return; }
    setInvalid(false);
    if (Math.abs(time - still.time) > .0001) onTime(time);
  }
  return <>
    <header className="card-header still-header" onPointerDown={onDrag}>
      <ModuleGrip onPeel={dockControls.onPeel} />
      <Link2 size={14} className="card-kind" />
      <input className="still-time" aria-label={`Still timecode from ${video.name}`} aria-invalid={invalid} title="Edit timecode · mm:ss.mmm" value={draft} disabled={busy} spellCheck={false}
        onChange={event => { setDraft(event.target.value); setInvalid(false); }} onBlur={submit}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') { setDraft(timecode(still.time)); setInvalid(false); }
        }} />
      <span className="control-spacer" />
      <IconButton icon={ScanLine} label="Draw region" aria-pressed={drawing} onClick={onDraw} />
      <IconButton icon={BookOpen} label="Code still" onClick={onCode} />
      <IconButton icon={CopyPlus} label="Duplicate still view" onClick={onDuplicate} />
      <IconButton icon={ChevronLeft} label={frameTimes.length ? 'Previous frame' : 'Earlier by 0.1 seconds'} disabled={busy || (frameTimes.length > 0 && previous === undefined)} onClick={() => onTime(previous ?? clamp(still.time - .1, 0, video.duration))} />
      <IconButton icon={ChevronRight} label={frameTimes.length ? 'Next frame' : 'Later by 0.1 seconds'} disabled={busy || (frameTimes.length > 0 && next === undefined)} onClick={() => onTime(next ?? clamp(still.time + .1, 0, video.duration - .001))} />
      <IconButton icon={ArrowUpLeft} label="Jump to video" onClick={onJump} />
      <UndockButton {...dockControls} />
      <IconButton icon={Trash2} label="Remove still view" onClick={onDelete} />
    </header>
    <div className={`still-media ${drawing ? 'is-drawing' : ''}`} style={{ height: imageHeight }}>
      <img className={`still-image ${busy ? 'is-busy' : ''}`} src={url} style={{ height: imageHeight }} alt={`Still from ${video.name} at ${timecode(still.time)}`} draggable={false} onPointerDown={onDrag} onDoubleClick={onJump} />
      <div className="region-image-space" style={{ left: (contentWidth - imageWidth) / 2, top: (imageHeight - containedHeight) / 2, width: imageWidth, height: containedHeight }}>
        <Regions regions={regions} codes={codes} selected={selectedRegion} drawing={drawing} onSelect={onSelectRegion} onCreate={onCreateRegion} onChange={onChangeRegion} onEditStart={onEditStart} onDelete={onDeleteRegion} />
      </div>
      {drawing && <span className="region-draw-hint">Drag a rectangle · Esc to finish</span>}
    </div>
    <footer className="still-footer"><Link2 size={10} /><span title={video.name}>{video.name}</span><CodeChips quotation={quotation} codes={codes} />{busy && <span>Updating…</span>}</footer>
  </>;
}
