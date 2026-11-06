import { useMemo, useRef, useState } from 'react';
import { useClipPosters } from '../posters';
import { visibleModuleIds } from '../viewport';
import type { BoardDocument } from './useDocument';
import type { Assets } from './useAssets';
import type { Editing } from './useEditing';
import type { Interaction } from './useInteraction';
import type { Previews } from './usePreviews';
import type { Viewport } from './useViewport';
import { useActions } from '../useActions';

export function useBoardView(
  document: BoardDocument,
  assets: Assets,
  editing: Editing,
  interaction: Interaction,
  previews: Previews,
  viewport: Viewport,
) {
  const { board } = document;
  const { selected } = editing;
  const { docks, moving } = interaction;
  const preview = previews.view;
  const [spaceEvidence, setSpaceEvidence] = useState<Record<string, string[]>>({});
  const actions = useActions({
    reportEvidence(spaceId: string, ids: string[]) {
      setSpaceEvidence((previous) => {
        const previousIds = previous[spaceId] || [];
        if (
          previousIds.length === ids.length &&
          previousIds.every((id, index) => id === ids[index])
        )
          return previous;
        const next = { ...previous };
        if (ids.length) next[spaceId] = ids;
        else delete next[spaceId];
        return next;
      });
    },
  });
  const evidenceIds = useMemo(
    () => [...new Set(Object.values(spaceEvidence).flat())],
    [spaceEvidence],
  );
  const posters = useClipPosters(
    board,
    assets.library.blobs,
    viewport.size,
    assets.generation,
    evidenceIds,
  );
  const selectedGroup = useMemo(
    () => (selected && docks.groups.get(selected)) || new Set<string>(),
    [selected, docks],
  );
  const focusedModule = globalThis.document.activeElement
    ?.closest('[data-module-id]')
    ?.getAttribute('data-module-id');
  const visibleIds = useMemo(() => {
    const keep = new Set(moving);
    if (selected) keep.add(selected);
    if (preview) keep.add(preview.id);
    if (preview?.moduleId) keep.add(preview.moduleId);
    if (focusedModule) keep.add(focusedModule);
    return visibleModuleIds(board, viewport.size, keep);
  }, [
    board.videos,
    board.stills,
    board.tracks,
    board.clips,
    board.panels,
    board.spaces,
    board.camera,
    viewport.size,
    selected,
    moving,
    preview?.id,
    preview?.moduleId,
    focusedModule,
  ]);
  const visible = useRef(new Set<string>());
  if (
    visible.current.size !== visibleIds.size ||
    [...visibleIds].some((id) => !visible.current.has(id))
  )
    visible.current = visibleIds;
  const content = useMemo(
    () => ({
      videos: board.videos,
      stills: board.stills,
      tracks: board.tracks,
      clips: board.clips,
      panels: board.panels,
      spaces: board.spaces,
      quotations: board.quotations,
      codes: board.codes,
    }),
    [
      board.videos,
      board.stills,
      board.tracks,
      board.clips,
      board.panels,
      board.spaces,
      board.quotations,
      board.codes,
    ],
  );
  return { content, posters, visible: visible.current, selectedGroup, actions };
}
