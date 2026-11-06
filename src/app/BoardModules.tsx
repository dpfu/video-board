import { ModuleFrame } from './ModuleFrame';
import { memo, useMemo } from 'react';
import { VideoPlayer } from '../VideoPlayer';
import { Still } from '../Still';
import { Track } from '../Track';
import { Clip } from '../Clip';
import { Coding } from '../Coding';
import { EvidenceSpace } from '../EvidenceSpace';
import { posterKey } from '../posters';
import { sourceQuotationId, stillAssetId, type Board } from '../model';
import type { Snap } from '../docking';
import type { RangeDraft } from '../editing';
import type { previewView, PreviewTarget } from '../preview';
import type { BoardDocument } from './useDocument';
import type { Editing } from './useEditing';
import type { Interaction } from './useInteraction';
import type { Previews } from './usePreviews';
import type { Media } from './useMedia';
import type { Analysis } from './useAnalysis';
import type { Evidence } from './useEvidence';
import type { Players } from './usePlayers';

export type ModuleActions = {
  document: BoardDocument['actions'];
  editing: Editing['actions'];
  interaction: Interaction['actions'];
  previews: Previews['actions'];
  media: Media['actions'];
  analysis: Analysis['actions'];
  evidence: Evidence['actions'];
  registry: Players['actions'];
  reportEvidence: (spaceId: string, ids: string[]) => void;
  notice: (message: string) => void;
};
export type ModuleData = Pick<
  Board,
  'videos' | 'stills' | 'tracks' | 'clips' | 'panels' | 'spaces' | 'quotations' | 'codes'
>;
export type BoardModulesProps = {
  board: ModuleData;
  urls: Record<string, string>;
  posters: Record<string, string>;
  selected: string | null;
  selectedGroup: Set<string>;
  moving: Set<string>;
  snap: Snap | null;
  sceneBusy: Set<string>;
  busy: Set<string>;
  editingLocked: boolean;
  preview: ReturnType<typeof previewView>;
  activeQuotation: string | null;
  drawing: string | null;
  draft: RangeDraft | null;
  draftValid: boolean;
  visible: Set<string>;
  actions: ModuleActions;
};

/** Camera and save/progress state live outside this memoized media/editor tree. */
export const BoardModules = memo(function BoardModules({
  board,
  urls,
  posters,
  selected,
  selectedGroup,
  moving,
  snap,
  sceneBusy,
  busy,
  editingLocked,
  preview,
  activeQuotation,
  drawing,
  draft,
  draftValid,
  visible,
  actions,
}: BoardModulesProps) {
  const { editing, previews, evidence, registry, reportEvidence, notice: setNotice } = actions;
  const { checkpoint } = actions.document;
  const { begin, controlsFor } = actions.interaction;
  const {
    selectCard,
    select: setSelected,
    openCodes,
    patchQuotation,
    createRegion,
    showCoding,
    segment,
    addCode,
    assignCode,
    saveSegment,
  } = editing;
  const {
    patchVideo,
    createClip,
    allShots,
    remove,
    jump,
    duplicateStill,
    deleteQuotation,
    placeClip,
    createSpace,
    patchSpace,
    reveal,
  } = evidence;
  const { addTrack, makeStill } = actions.media;
  const { scanScenes } = actions.analysis;
  const { hover: requestHover, interrupt: stopHover } = previews;
  const sourceById = useMemo(() => new Map(board.videos.map((v) => [v.id, v])), [board.videos]);
  const quoteById = useMemo(
    () => new Map(board.quotations.map((q) => [q.id, q])),
    [board.quotations],
  );
  const viewCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const view of [...board.stills, ...board.clips])
      if (view.quotationId) counts.set(view.quotationId, (counts.get(view.quotationId) || 0) + 1);
    return counts;
  }, [board.stills, board.clips]);
  const dockTarget = snap?.dock.to;
  const moduleClass = (id: string) =>
    `${selected === id ? 'is-selected' : ''} ${selectedGroup.size > 1 && selectedGroup.has(id) ? 'is-grouped' : ''} ${moving.has(id) ? 'is-moving' : ''} ${dockTarget === id ? `is-dock-target dock-${snap!.dock.side}` : ''}`;
  return (
    <>
      <svg className="board-links" aria-hidden="true">
        {[...board.stills, ...board.clips]
          .filter((view) => visible.has(view.id))
          .map((still) => {
            const source = sourceById.get(still.videoId);
            if (!source || source.hidden) return null;
            const x1 = source.x + source.width / 2,
              x2 = still.x + still.width / 2;
            return (
              <path
                key={still.id}
                className={selected === source.id || selected === still.id ? 'is-active' : ''}
                d={`M ${x1} ${source.y + 14} C ${x1} ${source.y - 40}, ${x2} ${still.y - 40}, ${x2} ${still.y + 14}`}
              />
            );
          })}
      </svg>
      {snap && (
        <div
          className="dock-preview"
          key={`${snap.dock.to}-${snap.dock.side}`}
          data-side={snap.dock.side}
          style={{ left: snap.x, top: snap.y, width: snap.width, height: snap.height }}
        >
          <span>
            Dock{' '}
            {snap.dock.side === 'bottom'
              ? 'below'
              : snap.dock.side === 'top'
                ? 'above'
                : snap.dock.side}
          </span>
        </div>
      )}
      {board.videos
        .filter((v) => !v.hidden)
        .map((video) => (
          <ModuleFrame
            card={video}
            kind="video"
            className={moduleClass(video.id)}
            key={video.id}
            data-video-id={video.id}
            onPointerDown={(event) => selectCard(event, video.id)}
            resizeLabel="Resize video card"
            onResize={(event) => begin(event, 'resize', video.id)}
          >
            <VideoPlayer
              ref={(handle) => registry.source(video.id, handle)}
              video={video}
              url={urls[video.id]}
              urls={urls}
              stillTimes={board.stills.filter((s) => s.videoId === video.id).map((s) => s.time)}
              busy={busy.has(video.id) || editingLocked}
              dockControls={controlsFor(video.id)}
              onAddTrack={(kind) => addTrack(video.id, kind)}
              onPatch={(patch) => patchVideo(video.id, patch)}
              onCapture={(time) => void makeStill(video.id, time)}
              onDelete={() => remove(video.id)}
              onError={setNotice}
              onDrag={(event) => begin(event, 'move', video.id)}
              quotation={quoteById.get(sourceQuotationId(video.id))}
              codes={board.codes}
              onClip={(time) => createClip(video.id, time)}
              onAllShots={() => allShots(video.id)}
              onSegment={(time) => segment(video.id, sourceQuotationId(video.id), time)}
              onCode={() => showCoding(sourceQuotationId(video.id))}
            />
          </ModuleFrame>
        ))}
      {board.stills
        .filter((still) => visible.has(still.id))
        .map((still) => {
          const video = sourceById.get(still.videoId);
          if (!video) return null;
          return (
            <ModuleFrame
              card={still}
              kind="still"
              className={moduleClass(still.id)}
              key={still.id}
              data-still-id={still.id}
              onPointerDown={(event) => selectCard(event, still.id)}
              resizeLabel="Resize still card"
              onResize={(event) => begin(event, 'resize', still.id)}
            >
              <Still
                still={still}
                video={video}
                url={urls[stillAssetId(still)]}
                dockControls={controlsFor(still.id)}
                busy={busy.has(still.quotationId || still.id) || editingLocked}
                onDrag={(event) => begin(event, 'move', still.id)}
                onTime={(time) => void makeStill(video.id, time, still.id)}
                onJump={() => jump(still)}
                onDelete={() => remove(still.id)}
                quotation={quoteById.get(still.quotationId || '')}
                sharedViews={viewCounts.get(still.quotationId || '') || 1}
                codes={board.codes}
                regions={board.quotations.filter(
                  (q) => q.kind === 'region' && q.parentId === still.quotationId,
                )}
                selectedRegion={activeQuotation}
                drawing={drawing === still.id}
                onDraw={() => {
                  if (still.quotationId)
                    editing.send({ type: 'draw', stillId: still.id, frameId: still.quotationId });
                }}
                onSelectRegion={(id) => {
                  editing.send({ type: 'selectQuotation', id });
                  setSelected(still.id);
                  openCodes();
                }}
                onCreateRegion={(rect) => createRegion(still, rect)}
                onChangeRegion={(id, rect) => patchQuotation(id, { rect })}
                onEditStart={checkpoint}
                onDeleteRegion={(id) => {
                  const q = board.quotations.find((q) => q.id === id);
                  if (q) deleteQuotation(q);
                }}
                onCode={() => showCoding(still.quotationId!)}
                onDuplicate={() => duplicateStill(still)}
              />
            </ModuleFrame>
          );
        })}
      {board.tracks
        .filter((track) => visible.has(track.id))
        .map((track) => {
          const video = sourceById.get(track.videoId);
          if (!video) return null;
          return (
            <ModuleFrame
              card={track}
              kind="track"
              className={moduleClass(track.id)}
              fixedHeight
              key={track.id}
              data-track-kind={track.kind}
              data-video-id={video.id}
              onPointerDown={() => setSelected(track.id)}
              resizeLabel={`Resize ${track.kind === 'filmstrip' ? 'frames' : track.kind === 'cuts' ? 'cuts' : 'audio'} scrubber`}
              onResize={(event) => begin(event, 'resize', track.id)}
            >
              <Track
                track={track}
                video={video}
                urls={urls}
                stillTimes={board.stills.filter((s) => s.videoId === video.id).map((s) => s.time)}
                dockControls={controlsFor(track.id)}
                busy={busy.has(video.id) || editingLocked}
                sceneBusy={sceneBusy.has(video.id) || video.analysis === 'pending'}
                onRetryScenes={() => scanScenes(video.id)}
                onThreshold={(threshold) => {
                  if (video.scenes)
                    patchVideo(video.id, { scenes: { ...video.scenes, threshold } });
                }}
                onDrag={(event) => begin(event, 'move', track.id)}
                onSeek={(time) => registry.seek(video.id, time)}
                onCapture={(time) => void makeStill(video.id, time)}
                onDuplicate={() => addTrack(video.id, track.kind, track)}
                onDelete={() => remove(track.id)}
                onJump={() =>
                  jump({
                    videoId: video.id,
                    time: registry.time(video.id, video.time),
                  })
                }
              />
            </ModuleFrame>
          );
        })}
      {board.clips
        .filter((clip) => visible.has(clip.id))
        .map((clip) => {
          const video = sourceById.get(clip.videoId),
            q = quoteById.get(clip.quotationId);
          if (!video || !q) return null;
          return (
            <ModuleFrame
              card={clip}
              kind="clip"
              className={moduleClass(clip.id)}
              key={clip.id}
              data-clip-id={clip.id}
              data-quotation-id={q.id}
              onPointerDown={(event) => selectCard(event, clip.id)}
              resizeLabel="Resize clip card"
              onResize={(e) => begin(e, 'resize', clip.id)}
            >
              <Clip
                clip={clip}
                video={video}
                quotation={q}
                codes={board.codes}
                sharedViews={viewCounts.get(q.id) || 1}
                url={urls[video.id]}
                urls={urls}
                poster={posters[posterKey(video.id, q.start)]}
                active={preview?.id === clip.id}
                pinned={preview?.id === clip.id && preview.pinned}
                busy={busy.has(video.id) || editingLocked}
                dockControls={controlsFor(clip.id)}
                onHover={(hover) => requestHover({ kind: 'clip', id: clip.id }, hover)}
                onPin={() => {
                  previews.pin({ kind: 'clip', id: clip.id });
                }}
                onDrag={(e) => begin(e, 'move', clip.id)}
                onRange={(start, end) => patchQuotation(q.id, { start, end })}
                onEditStart={() => {
                  checkpoint();
                  stopHover();
                  editing.send({ type: 'selectQuotation', id: q.id });
                }}
                onCapture={(time) => void makeStill(video.id, time)}
                onSegment={(time) => segment(video.id, q.id, time)}
                onJump={(time) => jump({ videoId: video.id, time })}
                onDuplicate={() => placeClip(q)}
                onDelete={() => remove(clip.id)}
                onPlayer={(el) => registry.clip(clip.id, el)}
                onCode={() => showCoding(q.id)}
                onStop={() => previews.stop()}
                onRate={(rate) => evidence.clipRate(clip.id, rate)}
              />
            </ModuleFrame>
          );
        })}
      {board.panels.map((panel) => (
        <ModuleFrame
          card={panel}
          kind="codes"
          className={moduleClass(panel.id)}
          fixedHeight
          key={panel.id}
          resizeLabel="Resize codes module"
          onResize={(e) => begin(e, 'resize', panel.id)}
        >
          <Coding
            board={board}
            target={board.quotations.find((q) => q.id === activeQuotation)}
            draft={draft}
            draftValid={draftValid}
            dockControls={controlsFor(panel.id)}
            onDrag={(e) => begin(e, 'move', panel.id)}
            onClose={() => remove(panel.id)}
            onEditStart={checkpoint}
            onEditQuotation={patchQuotation}
            onAddCode={addCode}
            onEditCode={evidence.patchCode}
            onAssign={assignCode}
            onReveal={reveal}
            onPlace={placeClip}
            onCollection={(codeId) => createSpace(codeId)}
            onDeleteQuotation={deleteQuotation}
            onDraft={(draft) => editing.send({ type: 'changeDraft', draft })}
            onDraftValidity={(id, valid) => editing.send({ type: 'draftValidity', id, valid })}
            onSaveDraft={saveSegment}
            onCancelDraft={() => editing.send({ type: 'escape' })}
            onSource={evidence.source}
          />
        </ModuleFrame>
      ))}
      {board.spaces
        .filter((space) => visible.has(space.id))
        .map((space) => (
          <ModuleFrame
            card={space}
            kind="space"
            className={moduleClass(space.id)}
            fixedHeight
            key={space.id}
            data-space-id={space.id}
            data-space-code={space.codeId}
            onPointerDown={() => setSelected(space.id)}
            resizeLabel="Resize evidence space"
            onResize={(event) => begin(event, 'resize', space.id)}
          >
            <EvidenceSpace
              space={space}
              board={board}
              urls={urls}
              posters={posters}
              activeQuotation={activeQuotation}
              preview={preview}
              dockControls={controlsFor(space.id)}
              onDrag={(event) => begin(event, 'move', space.id)}
              onClose={() => remove(space.id)}
              onEditStart={checkpoint}
              onPatch={(patch) => patchSpace(space.id, patch)}
              onPromote={() => evidence.promote(space.id)}
              onAdd={(id, point, from) => evidence.add(space.id, id, point, from)}
              onRemove={(id) => evidence.removeEvidence(space.id, id)}
              onMove={(id, point) => evidence.move(space.id, id, point)}
              onSelect={(id) => evidence.select(space.id, id)}
              onCode={showCoding}
              onReveal={evidence.revealId}
              onPreview={(id, hover, pin) => {
                const target: PreviewTarget = {
                  kind: 'evidence',
                  spaceId: space.id,
                  quotationId: id,
                };
                if (pin) {
                  previews.pin(target);
                } else requestHover(target, hover);
              }}
              onStop={() => {
                previews.stop();
              }}
              onVisible={(ids) => reportEvidence(space.id, ids)}
            />
          </ModuleFrame>
        ))}
    </>
  );
});
