# Changelog

Video Board is an early experimental build of a local-first workbench for
qualitative video analysis.

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
