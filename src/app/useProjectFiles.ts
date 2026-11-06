import { useLifetime } from '../lifetime';
import { useEffect, useState } from 'react';
import { backupBoard, restoreArchive } from '../archive';
import { download, safeFilename } from '../download';
import { exportBoard } from '../export';
import { csvExport } from '../analysis';
import { loadBoard, replaceBoard } from '../store';
import { resetPlayheads } from '../transport';
import { Tasks, type OwnedTask } from '../tasks';
import type { JobRequest } from '../jobs';
import type { BoardDocument } from './useDocument';
import type { Assets } from './useAssets';
import type { Analysis } from './useAnalysis';
import type { Editing } from './useEditing';
import type { Interaction } from './useInteraction';
import type { Previews } from './usePreviews';
import type { Media } from './useMedia';
import type { Players } from './usePlayers';
import type { Project } from './useProjectState';
import { useActions } from '../useActions';

export function useProjectFiles(
  document: BoardDocument,
  assets: Assets,
  analysis: Analysis,
  editing: Editing,
  interaction: Interaction,
  previews: Previews,
  media: Media,
  players: Players,
  project: Project,
  notify: (message: string) => void,
) {
  const { current } = document;
  const [tasks] = useState(() => new Tasks());
  useLifetime(() => tasks.dispose());
  const actions = useActions({
    start(event: { type: 'open' } | { type: 'export'; format: 'png' | 'zip' }): OwnedTask | null {
      const task = tasks.begin('file');
      if (!task) return null;
      if (media.actions.pending() || !project.send(event)) {
        task.finish();
        return null;
      }
      interaction.actions.finishGesture(false);
      previews.actions.stop();
      return task;
    },
    async exportImage() {
      const task = actions.start({ type: 'export', format: 'png' });
      if (!task) return;
      notify('');
      try {
        const elements = players.actions.pausedElements();
        const snapshot = current.current;
        const image = await exportBoard(snapshot, assets.library.blobs, elements);
        if (!task.current()) return;
        download(image, `${safeFilename(snapshot.name)}.png`);
        project.send({ type: 'finished' });
      } catch (error) {
        if (task.current()) actions.failed(error, 'Image export failed.');
      } finally {
        task.finish();
      }
    },
    async exportProject() {
      const task = actions.start({ type: 'export', format: 'zip' });
      if (!task) return;
      try {
        const backup = await backupBoard(current.current, assets.library.blobs);
        if (!task.current()) return;
        download(backup, `${safeFilename(current.current.name)}.videoboard.zip`);
        project.send({ type: 'finished' });
      } catch (error) {
        if (task.current()) actions.failed(error, 'Project backup failed.');
      } finally {
        task.finish();
      }
    },
    async openProject(file: File) {
      const task = actions.start({ type: 'open' });
      if (!task) return;
      notify('');
      let interrupted: JobRequest[] = [];
      try {
        const restored = await restoreArchive(file);
        if (!task.current()) return;
        project.send({ type: 'archiveRead' });
        if (current.current.videos.length) {
          const backup = await backupBoard(current.current, assets.library.blobs);
          if (!task.current()) return;
          download(backup, `${safeFilename(current.current.name)}-before-open.videoboard.zip`);
        }
        project.send({ type: 'recoveryCreated' });
        await document.autosave.drain();
        if (!task.current()) return;
        interrupted = await analysis.background.cancelAll();
        if (!task.current()) return;
        project.send({ type: 'jobsDrained' });
        await replaceBoard(restored.board, restored.assets);
        if (!task.current()) return;
        project.send({ type: 'storageCommitted' });
        assets.library.replace(restored.assets);
        document.actions.replace(restored.board);
        resetPlayheads(restored.board.videos);
        editing.actions.reset();
        project.send({ type: 'finished' });
        analysis.actions.resumeJobs();
      } catch (error) {
        if (!task.current()) return;
        const message =
          error instanceof Error ? error.message : 'Project backup could not be opened.';
        const state = project.current.current;
        const committed = state.kind === 'opening' && state.phase === 'installing';
        project.send({ type: 'failed', message });
        notify(
          committed && project.current.current.kind === 'unavailable'
            ? project.current.current.message
            : message,
        );
        if (!committed) analysis.actions.resumeJobs(interrupted);
      } finally {
        task.finish();
      }
    },
    failed(error: unknown, fallback: string) {
      const message = error instanceof Error ? error.message : fallback;
      notify(message);
      project.send({ type: 'failed', message });
    },
    exportCsv() {
      download(
        new Blob([csvExport(current.current)], { type: 'text/csv;charset=utf-8' }),
        `${safeFilename(current.current.name)}-quotations.csv`,
      );
    },
  });
  useEffect(() => {
    let disposed = false;
    void loadBoard()
      .then(({ board, assets: stored }) => {
        if (disposed || project.current.current.kind !== 'loading') return;
        assets.library.install(stored);
        resetPlayheads(board?.videos || []);
        if (board) document.actions.replace(board);
        project.send({ type: 'loaded' });
        analysis.actions.resumeJobs();
      })
      .catch((error) => {
        if (!disposed)
          project.send({
            type: 'loadFailed',
            message: `The local board could not be opened: ${error.message}`,
          });
      });
    return () => {
      disposed = true;
    };
  }, []);
  return actions;
}
export type ProjectFiles = ReturnType<typeof useProjectFiles>;
