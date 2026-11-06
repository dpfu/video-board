# Changelog

Video Board is an early experimental build of a local-first workbench for
qualitative video analysis.

## Unreleased

### Added

- Live code collections: drag a code onto the board or open it from Codes to
  gather its videos, segments, stills and regions. New assignments appear
  automatically; existing evidence keeps its arranged position.
- Provisional spatial groups with names, memos, searchable evidence picking and
  free tile placement. Drag quotations between groups or onto empty board space;
  arrow keys provide precise placement. Moving/resizing a group preserves its
  contents' relative positions.
- **Turn into code** assigns a new or existing code to the group's members and
  turns it into a live collection in one undoable action. Extra views share
  quotations, frame changes, coding and original media.
- Compact evidence tiles with region outlines, source context, shared coding
  controls and one muted video preview at a time. Large collections render their
  visible tiles; covers share the existing bounded capture cache.
- Groups, collection memos and arrangements in local storage, Undo and project
  ZIPs. PNG export fits each complete arrangement into its frame, including
  scrolled-out items. Additional views do not duplicate CSV quotation rows.
- Expand coverage from 71 to **154 checks: 116 Vitest checks and 38 real-media
  Chromium workflows**. Include all manual/live transfer combinations, legacy
  ZIP migration, zoomed/scrolled drops, same-project restore, preview cleanup and
  decoded PNG content for scrolled-out evidence. Cover save ordering/recovery,
  asset/worker/playback disposal, inactive-clip scrubbing and shared time fields.

### Fixed

- Resume pending video analysis and interrupted cut detection after a failed
  project replacement, without reloading. Reopening a backup also resumes
  detection requested by an existing Cuts module.
- Stop pinned previews and pending hover activation when file work starts.
- Keep drawing and segment drafting exclusive, reset validity for each new
  draft, and reject late draft callbacks. Capturing media preserves an active
  draft; failed project opens preserve its editing context.
- Ignore unrelated pointers during range edits. Escape, blur and lost pointer
  capture end gestures; unfinished rectangles are discarded while applied
  movement and range edits remain.

### Changed

- Refactor the application into focused document/autosave, media/analysis,
  evidence/editing, preview, viewport/gesture and project-file controllers.
  Separate shell, memoized board modules and shared card frames. Keep current
  actions stable without rerendering the media tree for camera/save progress.
- Share native playback and timecode editing across source, clip, evidence and
  still views. Give Blob URLs, queued saves, short tasks and native player
  listeners/seek requests explicit owners and cleanup. Preserve resource owners,
  player position/intent and unsaved drafts through Strict Mode and hot refresh.
- Give project operations, preview ownership and evidence editing small typed
  transition models. A cancellable serial queue owns analysis progress and
  suppresses obsolete job results; project generations change after commit.
- Observe decoded preview frames advancing and looping instead of waiting a
  fixed time. Monitor runtime/console errors and failed app HTTP responses on
  every test page, close extra project contexts automatically, and restrict
  database helpers to the disposable test origin.

### Compatibility

The project format is now **schema v4**. Existing v1–v3 projects migrate without
changing their media or quotation identities. New v4 backups require this build
or later; the tagged 0.0.2 release cannot read them.

## [0.0.2](https://github.com/dpfu/video-board/releases/tag/v0.0.2) — 2026-11-05

### Fixed

- Keep the selected region or segment active through playback, scrubbing, frame
  stepping and linked-still retiming. Explicit whole-video, clip and still coding
  actions still select their named scope.
- Keep unfinished segments separate from saved quotations. Code assignment waits
  until the quotation is saved; invalid typed boundaries block saving. Escape in
  a time field restores its value without canceling the segment.
- Reuse existing code names regardless of surrounding spaces or letter case.
  Search includes code definitions and source names; following a code clears the
  previous search so its quotations are visible.
- Bring retrieved evidence and existing Codes panels into view, above overlapping
  cards. Selecting a region no longer shifts the camera during the gesture.
- Make keyboard Undo work after button actions while preserving native text Undo.
  Shift+Cmd/Ctrl+Z no longer mistakenly performs another Undo. Moving docked Codes
  panels preserves earlier Undo snapshots.
- Restore saved playback times for hidden sources. Ignore unrelated pointer
  releases during a drag, prevent edits during project file operations, and
  ignore stale captures and save errors after the project state changes.
- Show readable errors for corrupt ZIPs and invalid project manifests while
  preserving the current board.
- Prevent generated QA reports and traces from reloading the development app and
  interrupting active selections or drafts.

### Changed

- Show code chips on video and clip cards, identify linked duplicate views, and
  include clip codes and named-region codes in PNG exports.
- Strengthen project validation for shared frames/assets and deep or cyclic
  quotation contexts. Share playback-clock cleanup and release media workers on
  completion, failure and cancellation.
- Add pinned Prettier formatting and a formatting check to CI; update the Vitest
  development dependency to 5.0.3.
- Expand coverage from 40 to **71 checks: 53 Vitest checks and 18 real-media
  Chromium workflows**, including coding interactions, archive validation,
  worker cleanup, playback restoration and recovery after invalid imports.

### Compatibility

The project format remains **schema v3**; older v1/v2 backups still migrate.
Clips and duplicate views continue to share the original video data. Browser
coverage remains focused on Chromium. Use project ZIP backups for work to keep.

[Compare changes from 0.0.1](https://github.com/dpfu/video-board/compare/v0.0.1...v0.0.2).

## [0.0.1](https://github.com/dpfu/video-board/releases/tag/v0.0.1) — 2026-11-04

Initial experimental release:

- Compact spatial boards with resizable, magnetically dockable video players,
  linked clips and retimeable stills, plus tactile interaction feedback.
- Synchronized thumbnail, audio and cut tracks; local scene detection using a
  TypeScript port of FFmpeg's `scdet` scorer.
- Source-linked clips with muted hover playback, free quotations, video segments,
  editable rectangular image regions, flat codes, memos and retrieval.
- Local browser persistence, project ZIP backup/restore, and PNG/CSV export.
- Cached board layout and viewport culling for larger boards.
- 30 Vitest checks, 10 real-media Chromium workflows, and tested GitHub Pages
  deployment through GitHub Actions.
