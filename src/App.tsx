import { useMemo, useState } from 'react';
import { AppShell } from './app/AppShell';
import { BoardModules, type ModuleActions } from './app/BoardModules';
import { useAnalysis } from './app/useAnalysis';
import { useAssets } from './app/useAssets';
import { useBoardView } from './app/useBoardView';
import { useDocument } from './app/useDocument';
import { useEditing } from './app/useEditing';
import { useEvidence } from './app/useEvidence';
import { useInteraction } from './app/useInteraction';
import { useMedia } from './app/useMedia';
import { usePlayers } from './app/usePlayers';
import { usePreviews } from './app/usePreviews';
import { useProjectFiles } from './app/useProjectFiles';
import { useProjectState } from './app/useProjectState';
import { useViewport } from './app/useViewport';
import { useClipExport } from './app/useClipExport';

/** Compose owners in dependency order; each owner exposes stable, current-state actions. */
export function App() {
  const [notice, setNotice] = useState('');
  const project = useProjectState();
  const document = useDocument(!project.locked, setNotice);
  const assets = useAssets();
  const clipExport = useClipExport(document, assets, project, setNotice);
  const viewport = useViewport(document);
  const editing = useEditing(document, viewport);
  const previews = usePreviews(document, project);
  const interaction = useInteraction(document, viewport, editing, previews, project);
  const analysis = useAnalysis(document, assets, setNotice);
  const media = useMedia(document, assets, editing, analysis, project, setNotice);
  const players = usePlayers();
  const evidence = useEvidence(
    document,
    editing,
    interaction,
    previews,
    viewport,
    media,
    players,
    project,
  );
  const files = useProjectFiles(
    document,
    assets,
    analysis,
    editing,
    interaction,
    previews,
    media,
    players,
    project,
    setNotice,
  );
  const view = useBoardView(document, assets, editing, interaction, previews, viewport);
  const actions: ModuleActions = useMemo(
    () => ({
      document: document.actions,
      editing: editing.actions,
      interaction: interaction.actions,
      previews: previews.actions,
      media: media.actions,
      analysis: analysis.actions,
      evidence: evidence.actions,
      registry: players.actions,
      reportEvidence: view.actions.reportEvidence,
      notice: setNotice,
      exportClip: clipExport.actions.start,
    }),
    [
      document.actions,
      editing.actions,
      interaction.actions,
      previews.actions,
      media.actions,
      analysis.actions,
      evidence.actions,
      players.actions,
      view.actions,
      clipExport.actions,
    ],
  );
  return (
    <AppShell
      {...{
        document,
        editing,
        interaction,
        viewport,
        media,
        analysis,
        evidence,
        project,
        files,
        clipExport,
        notice,
        setNotice,
      }}
    >
      <BoardModules
        board={view.content}
        urls={assets.urls}
        posters={view.posters}
        selected={editing.selected}
        selectedGroup={view.selectedGroup}
        moving={interaction.moving}
        snap={interaction.snap}
        sceneBusy={analysis.sceneBusy}
        busy={media.busy}
        editingLocked={project.locked}
        exportBusy={clipExport.busy}
        preview={previews.view}
        activeQuotation={editing.activeQuotation}
        drawing={editing.drawing}
        draft={editing.draft}
        draftValid={editing.draftValid}
        visible={view.visible}
        actions={actions}
      />
    </AppShell>
  );
}
