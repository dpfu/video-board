import { useEffect, useRef, useState } from 'react';
import { useLifetime } from '../lifetime';
import { clipFilename, validateExcerpt } from '../clipExport';
import { download } from '../download';
import { useActions } from '../useActions';
import type { BoardDocument } from './useDocument';
import type { Assets } from './useAssets';
import type { Project } from './useProjectState';

export function useClipExport(
  document: BoardDocument,
  assets: Assets,
  project: Project,
  notify: (message: string) => void,
) {
  const active = useRef<{
    controller: AbortController;
    id: string;
    generation: number;
  } | null>(null);
  const [status, setStatus] = useState('');
  const actions = useActions({
    cancel() {
      active.current?.controller.abort();
      active.current = null;
      setStatus('');
    },
    async start(id: string) {
      if (active.current || project.current.current.kind !== 'ready') return;
      const board = document.current.current,
        clip = board.clips.find((view) => view.id === id),
        quote = clip && board.quotations.find((q) => q.id === clip.quotationId),
        source = clip && board.videos.find((video) => video.id === clip.videoId),
        blob = source && assets.library.blobs.get(source.id);
      if (!source || !quote || !blob) return;
      const excerpt = { start: quote.start, end: quote.end, duration: source.duration };
      try {
        validateExcerpt(blob, excerpt);
      } catch (error) {
        notify((error as Error).message);
        return;
      }
      const job = {
        controller: new AbortController(),
        id,
        generation: assets.library.generation,
      };
      active.current = job;
      setStatus('Preparing clip export');
      notify('');
      try {
        const { exportClipMp4 } = await import('../ffmpeg');
        job.controller.signal.throwIfAborted();
        const result = await exportClipMp4(blob, excerpt, job.controller.signal, (label) => {
          if (active.current === job) setStatus(label);
        });
        if (
          active.current !== job ||
          job.controller.signal.aborted ||
          job.generation !== assets.library.generation ||
          project.current.current.kind !== 'ready'
        )
          return;
        download(result, clipFilename(quote.title || source.name, quote.start, quote.end));
      } catch (error) {
        if (active.current === job && !job.controller.signal.aborted)
          notify(`Clip export failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        if (active.current === job) {
          active.current = null;
          setStatus('');
        }
      }
    },
  });
  useEffect(() => {
    const job = active.current;
    if (
      job &&
      (project.locked ||
        job.generation !== assets.library.generation ||
        !document.board.clips.some((clip) => clip.id === job.id))
    )
      actions.cancel();
  }, [project.locked, assets.generation, document.board.clips]);
  useLifetime(actions.cancel);
  return { status, busy: !!status, actions };
}
export type ClipExport = ReturnType<typeof useClipExport>;
