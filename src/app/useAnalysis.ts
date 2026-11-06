import { useLifetime } from '../lifetime';
import { useMemo, useState } from 'react';
import { BackgroundJobs, type JobState, type JobRequest } from '../jobs';
import { analyzeVideo, detectScenes } from '../media';
import { saveAssets } from '../store';
import type { BoardDocument } from './useDocument';
import type { Assets } from './useAssets';
import { useActions } from '../useActions';

export function useAnalysis(
  document: BoardDocument,
  assets: Assets,
  notify: (message: string) => void,
) {
  const {
    current,
    actions: { change },
  } = document;
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [background] = useState(() => new BackgroundJobs(setJobs));
  const setNotice = notify;
  const installAssets = (additions: Map<string, Blob>) => assets.library.install(additions);
  const patchVideo = (id: string, patch: Partial<import('../model').VideoCard>) =>
    change((b) => ({ ...b, videos: b.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  function processVideo(id: string, blob: Blob) {
    background.enqueue(
      { sourceId: id, kind: 'analysis' },
      async (job) => {
        if (!current.current.videos.some((v) => v.id === id)) return;
        const result = await analyzeVideo(blob, job.progress, job.signal);
        if (!job.current() || !current.current.videos.some((v) => v.id === id)) return;
        const additions = new Map(
          result.thumbnails.map((thumb, index) => [`${id}-thumb-${index}`, thumb]),
        );
        await saveAssets(additions);
        if (!job.current() || !current.current.videos.some((v) => v.id === id)) return;
        installAssets(additions);
        patchVideo(id, {
          thumbnails: [...additions.keys()],
          peaks: result.peaks,
          frameTimes: result.frameTimes,
          scenes: result.scenes,
          analysis: result.note && result.note !== 'No audio track' ? 'partial' : 'ready',
          analysisNote: result.note,
        });
      },
      (error) => {
        if (!current.current.videos.some((v) => v.id === id)) return;
        patchVideo(id, {
          analysis: 'partial',
          analysisNote: error instanceof Error ? error.message : 'Media analysis failed',
        });
      },
    );
  }

  function scanScenes(id: string) {
    const video = current.current.videos.find((v) => v.id === id),
      blob = assets.library.blobs.get(id);
    if (!video || !blob || video.scenes || video.analysis === 'pending') return;
    background.enqueue(
      { sourceId: id, kind: 'scenes' },
      async (job) => {
        if (!current.current.videos.some((v) => v.id === id)) return;
        const scenes = await detectScenes(blob, job.progress, job.signal);
        if (job.current() && current.current.videos.some((v) => v.id === id))
          patchVideo(id, { scenes });
      },
      (error) => setNotice(error instanceof Error ? error.message : 'Cut detection failed.'),
    );
  }

  function resumeJobs(interrupted: JobRequest[] = []) {
    for (const video of current.current.videos) {
      const blob = assets.library.blobs.get(video.id);
      if (video.analysis === 'pending' && blob) processVideo(video.id, blob);
    }
    const requestedCuts = new Set([
      ...current.current.tracks
        .filter((track) => track.kind === 'cuts')
        .map((track) => track.videoId),
      ...interrupted.filter((job) => job.kind === 'scenes').map((job) => job.sourceId),
    ]);
    for (const id of requestedCuts) scanScenes(id);
  }

  const actions = useActions({ processVideo, scanScenes, resumeJobs });
  const sceneIds = jobs.filter((job) => job.kind === 'scenes').map((job) => job.sourceId);
  const sceneKey = JSON.stringify(sceneIds);
  const sceneBusy = useMemo(() => new Set(sceneIds), [sceneKey]);
  useLifetime(() => background.dispose());
  return {
    actions,
    background,
    sceneBusy,
    working: jobs.find((job) => job.phase === 'running')?.label || '',
  };
}
export type Analysis = ReturnType<typeof useAnalysis>;
