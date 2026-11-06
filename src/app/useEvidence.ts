import { quotation } from '../analysis';
import { shotAt, shotRanges } from '../scenes';
import {
  addEvidence,
  freeSpacePosition,
  moveEvidence,
  promoteGroup,
  reconcileSpaces,
  removeEvidence,
  type EvidenceDrag,
} from '../spaces';
import {
  boardBoxes,
  clamp,
  mapCards,
  sourceQuotationId,
  stillAssetId,
  topZ,
  type ClipCard,
  type Point,
  type Quotation,
  type SpaceCard,
  type StillCard,
  type VideoCard,
  type Code,
} from '../model';
import type { BoardDocument } from './useDocument';
import type { Editing } from './useEditing';
import type { Interaction } from './useInteraction';
import type { Previews } from './usePreviews';
import type { Viewport } from './useViewport';
import type { Media } from './useMedia';
import type { Players } from './usePlayers';
import type { Project } from './useProjectState';
import { useActions } from '../useActions';

export function useEvidence(
  document: BoardDocument,
  editing: Editing,
  interaction: Interaction,
  previews: Previews,
  viewport: Viewport,
  media: Media,
  registry: Players,
  project: Project,
) {
  const {
    current,
    actions: { change, checkpoint },
  } = document;
  const {
    actions: { exposeModule },
  } = viewport;
  const {
    actions: { select: setSelected },
  } = editing;
  const {
    actions: { makeStill },
  } = media;
  const { sources: players } = registry;
  const motion = { highlight: interaction.actions.highlight };
  const stopHover = previews.actions.interrupt;
  const editingLocked = project.locked;
  function patchVideo(id: string, patch: Partial<VideoCard>) {
    change((b) => ({ ...b, videos: b.videos.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  }
  function createSpace(codeId?: string, point?: Point, evidence?: EvidenceDrag) {
    if (editingLocked) return;
    const b = current.current;
    if (codeId && !b.codes.some((code) => code.id === codeId)) return;
    const existing = codeId && b.spaces.find((space) => space.codeId === codeId);
    if (existing) {
      setSelected(existing.id);
      exposeModule(existing.id, 1);
      return;
    }
    checkpoint();
    const width = 700,
      height = 540;
    const space: SpaceCard = {
      id: crypto.randomUUID(),
      kind: 'space',
      name: '',
      memo: '',
      codeId,
      items: [],
      width,
      height,
      ...freeSpacePosition(
        boardBoxes(b),
        point || {
          x: (80 - b.camera.x) / b.camera.scale,
          y: (50 - b.camera.y) / b.camera.scale,
        },
        width,
        height,
      ),
      z: topZ(b),
    };
    change((before) => {
      const next = { ...before, spaces: [...before.spaces, space] };
      return evidence
        ? addEvidence(next, space.id, evidence.quotationId, undefined, evidence.spaceId)
        : reconcileSpaces(next);
    });
    setSelected(space.id);
    editing.actions.send({ type: 'closePopover' });
    exposeModule(space.id, 1);
  }
  function patchSpace(id: string, patch: Partial<Pick<SpaceCard, 'name' | 'memo'>>) {
    change((b) => {
      const space = b.spaces.find((space) => space.id === id);
      if (space?.codeId && patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) return b;
        return {
          ...b,
          codes: b.codes.map((code) =>
            code.id === space.codeId ? { ...code, name: patch.name! } : code,
          ),
        };
      }
      return {
        ...b,
        spaces: b.spaces.map((space) => (space.id === id ? { ...space, ...patch } : space)),
      };
    });
  }
  function placeClip(q: Quotation, record = true) {
    const b = current.current,
      source = b.videos.find((v) => v.id === q.sourceId);
    if (!source || q.kind !== 'range') return;
    if (record) checkpoint();
    const count =
      b.clips.filter((c) => c.videoId === source.id).length +
      b.stills.filter((s) => s.videoId === source.id).length;
    const clip: ClipCard = {
      id: crypto.randomUUID(),
      videoId: source.id,
      quotationId: q.id,
      time: q.start,
      x: source.x + source.width + 64 + (count % 3) * 368,
      y: source.y + Math.floor(count / 3) * 360,
      width: 340,
      z: topZ(b),
    };
    change((b) => ({
      ...b,
      clips: [...b.clips, clip],
      quotations: b.quotations.some((old) => old.id === q.id) ? b.quotations : [...b.quotations, q],
    }));
    setSelected(clip.id);
    editing.actions.send({ type: 'selectView', id: q.id });
  }
  function createClip(sourceId: string, time: number) {
    const source = current.current.videos.find((v) => v.id === sourceId);
    if (!source) return;
    const shots = shotRanges(source.scenes, source.duration, source.start),
      shot = source.scenes ? shots[shotAt(shots, time)] : null;
    const start = shot?.start ?? clamp(time, 0, Math.max(0, source.duration - 0.001)),
      end = shot?.end ?? Math.min(source.duration, start + 3);
    placeClip(quotation(sourceId, 'range', start, end, sourceQuotationId(sourceId)));
  }
  function allShots(sourceId: string) {
    const source = current.current.videos.find((v) => v.id === sourceId);
    if (!source?.scenes) return;
    checkpoint();
    for (const shot of shotRanges(source.scenes, source.duration, source.start))
      placeClip(
        quotation(sourceId, 'range', shot.start, shot.end, sourceQuotationId(sourceId)),
        false,
      );
  }
  function deleteQuotation(q: Quotation) {
    if (q.kind === 'video') return;
    checkpoint();
    const ids = new Set([
      q.id,
      ...current.current.quotations
        .filter((child) => child.kind === 'region' && child.parentId === q.id)
        .map((child) => child.id),
    ]);
    const removedViews = new Set(
      [...current.current.clips, ...current.current.stills]
        .filter((c) => c.quotationId && ids.has(c.quotationId))
        .map((c) => c.id),
    );
    change((b) =>
      mapCards(
        {
          ...b,
          quotations: b.quotations
            .filter((q) => !ids.has(q.id))
            .map((q) => (q.parentId && ids.has(q.parentId) ? { ...q, parentId: undefined } : q)),
          clips: b.clips.filter((c) => !removedViews.has(c.id)),
          stills: b.stills.filter((s) => !removedViews.has(s.id)),
        },
        (c) => (c.dock && removedViews.has(c.dock.to) ? { ...c, dock: undefined } : c),
      ),
    );
    editing.actions.send({ type: 'escape' });
    editing.actions.send({ type: 'reconcile', board: current.current });
    previews.actions.reconcile();
    document.actions.markRemoved();
  }
  function reveal(q: Quotation) {
    editing.actions.send({ type: 'selectQuotation', id: q.id });
    if (q.kind === 'frame' || q.kind === 'region') {
      const frameId = q.kind === 'frame' ? q.id : q.parentId,
        still = current.current.stills.find((s) => s.quotationId === frameId);
      if (still) {
        motion.highlight(still.id);
        motion.highlight(q.sourceId);
        setSelected(still.id);
        exposeModule(still.id);
      } else void makeStill(q.sourceId, q.start, undefined, frameId);
    } else jump({ videoId: q.sourceId, time: q.start });
  }
  function duplicateStill(still: StillCard) {
    checkpoint();
    const copy = {
      ...still,
      id: crypto.randomUUID(),
      assetId: stillAssetId(still),
      x: still.x + 32,
      y: still.y + 32,
      dock: undefined,
      z: topZ(current.current),
    };
    change((b) => ({ ...b, stills: [...b.stills, copy] }));
    setSelected(copy.id);
    if (still.quotationId) editing.actions.send({ type: 'selectView', id: still.quotationId });
  }
  function remove(id: string) {
    checkpoint();
    stopHover();
    change((b) =>
      mapCards(
        {
          ...b,
          videos: b.videos.map((v) => (v.id === id ? { ...v, hidden: true, dock: undefined } : v)),
          stills: b.stills.filter((s) => s.id !== id),
          tracks: b.tracks.filter((t) => t.id !== id),
          clips: b.clips.filter((c) => c.id !== id),
          panels: b.panels.filter((p) => p.id !== id),
          spaces: b.spaces.filter((s) => s.id !== id),
        },
        (c) => (c.dock?.to === id ? { ...c, dock: undefined } : c),
      ),
    );
    setSelected(null);
    editing.actions.send({ type: 'closePopover' });
    editing.actions.send({ type: 'reconcile', board: current.current });
    previews.actions.reconcile();
    document.actions.markRemoved();
  }
  function jump(still: Pick<StillCard, 'videoId' | 'time'>) {
    if (current.current.videos.find((v) => v.id === still.videoId)?.hidden)
      patchVideo(still.videoId, { hidden: false, time: still.time });
    players.current.get(still.videoId)?.seek(still.time);
    setSelected(still.videoId);
    motion.highlight(still.videoId);
    exposeModule(still.videoId);
  }
  const actions = useActions({
    createSpace,
    patchSpace,
    placeClip,
    createClip,
    allShots,
    deleteQuotation,
    reveal,
    duplicateStill,
    remove,
    jump,
    patchVideo,
    patchCode(id: string, patch: Partial<Code>) {
      change((b) => ({ ...b, codes: b.codes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    },
    clipRate(id: string, rate: number) {
      change((b) => ({ ...b, clips: b.clips.map((c) => (c.id === id ? { ...c, rate } : c)) }));
    },
    promote(spaceId: string) {
      checkpoint();
      stopHover();
      change((b) => promoteGroup(b, spaceId));
      motion.highlight(spaceId);
    },
    add(spaceId: string, id: string, point?: Point, from?: string) {
      if (!current.current.quotations.some((q) => q.id === id)) return;
      checkpoint();
      stopHover();
      change((b) => addEvidence(b, spaceId, id, point, from));
      setSelected(spaceId);
    },
    removeEvidence(spaceId: string, id: string) {
      checkpoint();
      previews.actions.stop();
      change((b) => removeEvidence(b, spaceId, id));
    },
    move(spaceId: string, id: string, point: Point) {
      change((b) => moveEvidence(b, spaceId, id, point));
    },
    select(spaceId: string, id: string) {
      setSelected(spaceId);
      editing.actions.send({ type: 'selectQuotation', id });
    },
    revealId(id: string) {
      const q = current.current.quotations.find((q) => q.id === id);
      if (q) reveal(q);
    },
    source(id: string) {
      const q = current.current.quotations.find((q) => q.id === sourceQuotationId(id));
      if (q) reveal(q);
    },
  });
  return { actions };
}
export type Evidence = ReturnType<typeof useEvidence>;
