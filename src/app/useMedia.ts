import { useLifetime } from '../lifetime';
import { useState } from 'react';
import { captureFrame, probeVideo } from '../media';
import { saveAssets } from '../store';
import { editQuotation, quotation } from '../analysis';
import {
  boardBoxes,
  DOCK_GAP,
  sourceQuotationId,
  topZ,
  type Point,
  type StillCard,
  type TrackCard,
  type TrackKind,
  type VideoCard,
} from '../model';
import { groupIds } from '../docking';
import { Tasks } from '../tasks';
import type { BoardDocument } from './useDocument';
import type { Assets } from './useAssets';
import type { Editing } from './useEditing';
import type { Analysis } from './useAnalysis';
import type { Project } from './useProjectState';
import { useActions } from '../useActions';

export function useMedia(
  document: BoardDocument,
  assets: Assets,
  editing: Editing,
  analysis: Analysis,
  project: Project,
  setNotice: React.Dispatch<React.SetStateAction<string>>,
) {
  const {
    current,
    actions: { change, checkpoint },
  } = document;
  const {
    actions: { selectModule, select: setSelected },
  } = editing;
  const {
    actions: { processVideo, scanScenes },
  } = analysis;
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [imports] = useState(() => new Tasks());
  const [captures] = useState(() => new Tasks());
  const installAssets = (additions: Map<string, Blob>) => assets.library.install(additions);
  function markBusy(id: string, active: boolean) {
    setBusy((previous) => {
      const next = new Set(previous);
      if (active) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  async function importVideos(files: File[], point?: Point) {
    if (project.current.current.kind !== 'ready') return;
    const task = imports.begin('import');
    if (!task) return;
    setImporting(true);
    setNotice('');
    void navigator.storage?.persist?.().catch(() => {});
    let failures = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(file.name)) {
        failures++;
        continue;
      }
      try {
        const metadata = await probeVideo(file, task.signal);
        if (!task.current()) return;
        const id = crypto.randomUUID();
        const additions = new Map([[id, file as Blob]]);
        await saveAssets(additions);
        if (!task.current()) return;
        installAssets(additions);
        const camera = current.current.camera;
        const offset = (current.current.videos.length % 8) * 40;
        const origin = point || {
          x: (90 - camera.x) / camera.scale + offset,
          y: (70 - camera.y) / camera.scale + offset,
        };
        const video: VideoCard = {
          ...metadata,
          id,
          name: file.name,
          width: 440,
          x: origin.x + i * 35,
          y: origin.y + i * 35,
          z: topZ(current.current),
          time: 0,
          thumbnails: [],
          peaks: [],
          frameTimes: [],
          analysis: 'pending',
          showFilmstrip: true,
          showWaveform: true,
        };
        checkpoint();
        const q = {
          ...quotation(id, 'video', 0, video.duration),
          id: sourceQuotationId(id),
          title: file.name,
        };
        change((b) => ({ ...b, videos: [...b.videos, video], quotations: [...b.quotations, q] }));
        addTrack(id, 'filmstrip');
        addTrack(id, 'waveform');
        selectModule(id);
        processVideo(id, file);
      } catch (error) {
        if (!task.current()) return;
        failures++;
        setNotice(error instanceof Error ? error.message : 'The video could not be imported.');
      }
    }
    if (failures)
      setNotice(
        (previous) =>
          previous ||
          `${failures} file${failures === 1 ? '' : 's'} could not be imported. Add a playable video file.`,
      );
    task.finish();
    setImporting(false);
  }
  function addTrack(videoId: string, kind: TrackKind, duplicate?: TrackCard) {
    change((b) => {
      const video = b.videos.find((v) => v.id === videoId);
      if (!video) return b;
      const group = groupIds(b, videoId);
      const parent = boardBoxes(b)
        .filter((c) => group.has(c.id))
        .sort((a, c) => c.y + c.height - a.y - a.height)[0];
      const track: TrackCard = duplicate
        ? {
            ...duplicate,
            id: crypto.randomUUID(),
            x: duplicate.x + 28,
            y: duplicate.y + 28,
            dock: undefined,
            z: topZ(b),
          }
        : {
            id: crypto.randomUUID(),
            videoId,
            kind,
            x: parent.x,
            y: parent.y + parent.height + DOCK_GAP,
            width: video.width,
            height: kind === 'filmstrip' ? 104 : kind === 'cuts' ? 116 : 88,
            z: topZ(b),
            dock: { to: parent.id, side: 'bottom', offset: 0 },
          };
      setSelected(track.id);
      return { ...b, tracks: [...b.tracks, track] };
    });
    if (kind === 'cuts') scanScenes(videoId);
  }
  async function makeStill(
    videoId: string,
    requested: number,
    existingId?: string,
    frameQuotationId?: string,
  ) {
    const video = current.current.videos.find((v) => v.id === videoId),
      blob = assets.library.blobs.get(videoId);
    if (project.current.current.kind !== 'ready' || !video || !blob) return;
    const id = existingId || crypto.randomUUID(),
      generation = assets.library.generation;
    const existing = current.current.stills.find((s) => s.id === existingId);
    const qid = existing?.quotationId || frameQuotationId || `frame-${id}`,
      busyKey = existing ? qid : videoId;
    const task = captures.begin(busyKey);
    if (!task) return;
    markBusy(busyKey, true);
    try {
      const frame = await captureFrame(blob, requested, { signal: task.signal });
      if (
        !task.current() ||
        generation !== assets.library.generation ||
        !current.current.videos.some((v) => v.id === videoId) ||
        (existingId && !current.current.stills.some((s) => s.id === existingId))
      )
        return;
      const assetId = existingId ? crypto.randomUUID() : id;
      const additions = new Map([[assetId, frame.blob]]);
      await saveAssets(additions);
      if (
        !task.current() ||
        generation !== assets.library.generation ||
        !current.current.videos.some((v) => v.id === videoId) ||
        (existingId && !current.current.stills.some((s) => s.id === existingId))
      )
        return;
      installAssets(additions);
      checkpoint();
      change((b) => {
        const end = Math.min(video.duration, frame.time + frame.duration);
        if (existingId)
          return editQuotation(
            {
              ...b,
              stills: b.stills.map((s) =>
                s.quotationId === qid
                  ? { ...s, assetId, time: frame.time, duration: frame.duration }
                  : s,
              ),
            },
            qid,
            { start: frame.time, end },
          );
        const source = b.videos.find((v) => v.id === videoId)!;
        const count =
          b.stills.filter((s) => s.videoId === videoId).length +
          b.clips.filter((c) => c.videoId === videoId).length;
        const width = 280,
          height = (width * source.sourceHeight) / source.sourceWidth + 100;
        const still: StillCard = {
          id,
          videoId,
          quotationId: qid,
          assetId,
          time: frame.time,
          duration: frame.duration,
          width,
          x: source.x + source.width + 64 + Math.floor(count / 3) * 320,
          y: source.y + (count % 3) * height,
          z: topZ(b),
        };
        return {
          ...b,
          stills: [...b.stills, still],
          quotations: b.quotations.some((q) => q.id === qid)
            ? b.quotations
            : [...b.quotations, { ...quotation(videoId, 'frame', frame.time, end), id: qid }],
        };
      });
      setSelected(id);
      if (!existingId && !frameQuotationId) editing.actions.send({ type: 'selectView', id: qid });
    } catch (error) {
      if (task.current())
        setNotice(error instanceof Error ? error.message : 'The still could not be created.');
    } finally {
      if (task.current()) markBusy(busyKey, false);
      task.finish();
    }
  }
  const actions = useActions({
    importVideos,
    addTrack,
    makeStill,
    pending() {
      return imports.size > 0 || captures.size > 0;
    },
  });
  useLifetime(() => {
    imports.dispose();
    captures.dispose();
  });
  return { importing, busy, actions };
}
export type Media = ReturnType<typeof useMedia>;
