import { useRef, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Check,
  CircleAlert,
  Download,
  FileDown,
  Film,
  FolderOpen,
  Hand,
  FolderPlus,
  ImageDown,
  LoaderCircle,
  Minus,
  MousePointer2,
  Plus,
  Scan,
  Undo2,
  X,
} from 'lucide-react';
import { IconButton } from '../Icons';
import { CodePopover } from '../CodePopover';
import { projectMessage } from '../project';
import { CODE_DRAG, readEvidenceDrag } from '../spaces';
import type { BoardDocument } from './useDocument';
import type { Editing } from './useEditing';
import type { Interaction } from './useInteraction';
import type { Viewport } from './useViewport';
import type { Media } from './useMedia';
import type { Analysis } from './useAnalysis';
import type { Evidence } from './useEvidence';
import type { Project } from './useProjectState';
import type { ProjectFiles } from './useProjectFiles';

type Props = {
  document: BoardDocument;
  editing: Editing;
  interaction: Interaction;
  viewport: Viewport;
  media: Media;
  analysis: Analysis;
  evidence: Evidence;
  project: Project;
  files: ProjectFiles;
  notice: string;
  setNotice: (message: string) => void;
  children: ReactNode;
};

export function AppShell({
  document,
  editing,
  interaction,
  viewport,
  media,
  analysis,
  evidence,
  project,
  files,
  notice,
  setNotice,
  children,
}: Props) {
  const {
    board,
    current,
    saving,
    undoCount,
    removed,
    actions: { change, checkpoint },
  } = document;
  const {
    activeQuotation,
    popover,
    actions: { openCodes, assignCode, addCode, patchQuotation },
  } = editing;
  const {
    hand,
    space,
    actions: { pan, setHand, undo },
  } = interaction;
  const {
    stage,
    actions: { zoom, fit },
  } = viewport;
  const {
    importing,
    busy,
    actions: { importVideos },
  } = media;
  const { working } = analysis;
  const {
    actions: { createSpace },
  } = evidence;
  const { loaded, fatal, operation, locked: editingLocked } = project;
  const { exportProject, exportImage, openProject } = files;
  const videoInput = useRef<HTMLInputElement>(null);
  const archiveInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <span className="brand-icon">
            <Film size={21} />
          </span>
          <strong>Video Board</strong>
          <span className="prototype">prototype</span>
        </div>
        <span className="toolbar-divider" />
        <input
          className="board-name"
          aria-label="Board name"
          maxLength={100}
          value={board.name}
          onChange={(event) => change((b) => ({ ...b, name: event.target.value }))}
          disabled={editingLocked}
        />
        <div className="toolbar-actions">
          <span
            className={`save-state ${saving === 'error' ? 'save-state--error' : ''}`}
            title={
              working ||
              (saving === 'saved'
                ? 'Saved in this browser'
                : saving === 'error'
                  ? 'Local save failed'
                  : 'Saving in this browser')
            }
          >
            {saving === 'error' ? (
              <CircleAlert size={13} />
            ) : working || importing || saving === 'waiting' || saving === 'writing' ? (
              <LoaderCircle size={13} className="spin" />
            ) : (
              <Check size={13} />
            )}
            <span>
              {working
                ? 'Processing locally'
                : saving === 'saved'
                  ? 'Saved locally'
                  : saving === 'error'
                    ? 'Save failed'
                    : 'Saving…'}
            </span>
          </span>
          <IconButton
            icon={FolderOpen}
            label="Open project backup"
            disabled={project.state.kind === 'loading' || operation || importing || busy.size > 0}
            onClick={() => archiveInput.current?.click()}
          />
          <IconButton
            icon={Download}
            label="Download project backup"
            disabled={editingLocked || !board.videos.length || busy.size > 0}
            onClick={() => void exportProject()}
          />
          <IconButton
            icon={ImageDown}
            label="Export board as PNG"
            disabled={editingLocked || !board.videos.length || busy.size > 0}
            onClick={() => void exportImage()}
          />
          <IconButton
            icon={FileDown}
            label="Export quotations as CSV"
            disabled={editingLocked || !board.quotations.length}
            onClick={files.exportCsv}
          />
          <IconButton
            icon={BookOpen}
            label="Open codes and quotations"
            disabled={editingLocked}
            onClick={() => openCodes(true)}
          />
          <IconButton
            icon={FolderPlus}
            label="New evidence group"
            disabled={editingLocked}
            onClick={() => createSpace()}
          />
          <span className="toolbar-divider" />
          <IconButton
            className="add-video"
            icon={Plus}
            label="Add videos"
            disabled={editingLocked || importing}
            onClick={() => videoInput.current?.click()}
          >
            <span>Add video</span>
          </IconButton>
        </div>
      </header>
      <input
        ref={videoInput}
        className="file-input"
        type="file"
        multiple
        accept="video/*,.mp4,.m4v,.mov,.webm,.mkv"
        onChange={(event) => {
          void importVideos(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
      <input
        ref={archiveInput}
        className="file-input"
        type="file"
        accept=".zip"
        onChange={(event) => {
          if (event.target.files?.[0]) void openProject(event.target.files[0]);
          event.target.value = '';
        }}
      />
      <div
        ref={stage}
        onLostPointerCapture={interaction.actions.lostCapture}
        className={`board ${hand || space ? 'board--hand' : ''} ${dragOver ? 'board--drop' : ''}`}
        aria-label="Video board workspace"
        onPointerDownCapture={pan}
        onDragOver={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes('Files')) setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const box = event.currentTarget.getBoundingClientRect(),
            c = current.current.camera;
          const point = {
            x: (event.clientX - box.left - c.x) / c.scale,
            y: (event.clientY - box.top - c.y) / c.scale,
          };
          const codeId = event.dataTransfer.getData(CODE_DRAG);
          if (codeId) createSpace(codeId, point);
          else {
            const evidence = readEvidenceDrag(event.dataTransfer);
            if (evidence && current.current.quotations.some((q) => q.id === evidence.quotationId))
              createSpace(undefined, point, evidence);
            else if (event.dataTransfer.files.length)
              void importVideos(Array.from(event.dataTransfer.files), point);
          }
        }}
      >
        <div ref={viewport.grid} className="board-grid" aria-hidden="true" />
        <div
          className="board-world"
          ref={viewport.world}
          style={{
            transform: `translate(${board.camera.x}px, ${board.camera.y}px) scale(${board.camera.scale})`,
          }}
        >
          {children}
        </div>
        {!board.videos.length && !board.spaces.length && (
          <div className="empty-board">
            <div className="empty-board__icon">
              <Film size={34} strokeWidth={1.2} />
              <span>
                <Plus size={13} />
              </span>
            </div>
            <h1>
              {loaded
                ? 'Drop a video here'
                : fatal
                  ? 'Local storage unavailable'
                  : 'Opening your board…'}
            </h1>
            <p>{fatal || 'Watch, capture a moment, give it some space.'}</p>
            {loaded && (
              <button
                type="button"
                className="empty-add"
                onClick={() => videoInput.current?.click()}
                disabled={importing}
              >
                or choose a file
              </button>
            )}
            <span className="empty-board__local">Videos stay on your device.</span>
          </div>
        )}
        {dragOver && (
          <div className="drop-overlay">
            <Plus size={28} />
            <span>Drop to add videos</span>
          </div>
        )}
        <div className="board-tools" onPointerDown={(event) => event.stopPropagation()}>
          <div className="tool-group">
            <IconButton
              icon={MousePointer2}
              label="Select and move"
              aria-pressed={!hand}
              onClick={() => setHand(false)}
            />
            <IconButton
              icon={Hand}
              label="Pan board"
              aria-pressed={hand}
              onClick={() => setHand(!hand)}
            />
          </div>
          {undoCount > 0 && (
            <div className="tool-group">
              <IconButton
                icon={Undo2}
                label={removed ? 'Undo removal' : 'Undo last edit'}
                onClick={undo}
              />
            </div>
          )}
          <span className="board-hint">
            Header: move group <span>·</span> Grip: pull module free
          </span>
        </div>
        <div className="zoom-tools tool-group" onPointerDown={(event) => event.stopPropagation()}>
          <IconButton icon={Minus} label="Zoom out" onClick={() => zoom(1 / 1.2)} />
          <button
            className="zoom-value"
            ref={viewport.zoomValue}
            title="Reset zoom to 100%"
            onClick={() => zoom(1 / current.current.camera.scale)}
          >
            {Math.round(board.camera.scale * 100)}%
          </button>
          <IconButton icon={Plus} label="Zoom in" onClick={() => zoom(1.2)} />
          <span className="toolbar-divider" />
          <IconButton icon={Scan} label="Fit board" onClick={fit} />
        </div>
      </div>
      {!editingLocked && popover && board.quotations.find((q) => q.id === activeQuotation) && (
        <CodePopover
          key={activeQuotation}
          target={board.quotations.find((q) => q.id === activeQuotation)!}
          codes={board.codes}
          {...popover}
          onClose={() => editing.actions.send({ type: 'closePopover' })}
          onAssign={assignCode}
          onCreate={addCode}
          onMemo={(memo) => patchQuotation(activeQuotation!, { memo })}
          onEditStart={checkpoint}
          onOpen={() => {
            openCodes(true);
            editing.actions.send({ type: 'closePopover' });
          }}
        />
      )}
      {(notice || working || importing || operation) && (
        <div
          className={`notice ${notice ? 'notice--error' : ''}`}
          role={notice ? 'alert' : 'status'}
        >
          {notice ? <CircleAlert size={16} /> : <LoaderCircle size={16} className="spin" />}
          <span>
            {notice || projectMessage(project.state) || (importing ? 'Adding video…' : working)}
          </span>
          {notice && <IconButton icon={X} label="Dismiss message" onClick={() => setNotice('')} />}
        </div>
      )}
    </div>
  );
}
