# Video Board — working specification

Updated **7 November 2026**, preserving Daniel's 4 November decisions and the
5 November exploratory and comparative passes. This is the single
home for product decisions, proposed behavior and open questions. Update it as
the discussion develops; preserve corrections and their rationale. The
[README](README.md) is the minimal public entrypoint; the
[development notes](docs/DEVELOPMENT.md) preserve implemented behavior,
verification, port provenance and recovery instructions. Use the status labels below when
choosing the next small iteration.

## Purpose and constraints

A small, local-first experiment for qualitative analysis of short videos on a
spatial board. Iterate with Daniel on the actual player and selection controls.
Keep it compact, responsive and methodologically useful: **select → code → memo
→ retrieve**, while allowing uncoded selections to be useful in their own right.

- Use JavaScript/TypeScript initially. Rust/Wasm remains an option for a measured
  bottleneck; it is not a prerequisite for this prototype.
- Import and retain original videos locally. A clip references the original;
  creating, duplicating, trimming or coding clips must not create video copies.
  Small still images, thumbnails, region geometry and analysis caches are allowed.
- Preserve independent source references through board movement, resizing,
  docking, filtering, reload and project backup. Multiple views can reuse one
  quotation and one media asset.
- No account, cloud processing or research-media upload is needed. Daniel
  authorized the public [GitHub repository](https://github.com/dpfu/video-board)
  and [GitHub Pages](https://dpfu.github.io/video-board/) on 4 November 2026.
  The first application release is **0.0.1** / **v0.0.1**, explicitly experimental,
  using project schema v3. The current development build uses v4 for evidence
  spaces, with migration from v1–v3. Source code stays outside UNIverse; the local
  dossier pointer remains in the development notes.
- Keep scope small. The original no-tests brief was superseded by Daniel's
  request for a focused suite. See [checks](docs/DEVELOPMENT.md#checks); browser checks use
  disposable contexts on 4193, separate from the working board on 5193.

## Current state

Current release: **0.0.2** / **v0.0.2**, still experimental. It packages the
5 November coding and code-quality improvements below; see the
[changelog](CHANGELOG.md). The development build now includes evidence spaces
and project schema v4, with migration from v1–v3; shared original video data is
unchanged.

| Area | Status |
| --- | --- |
| Local video import, source players, linked stills, frame adjustment | Implemented; see development notes and `src/VideoPlayer.tsx`, `src/Still.tsx`. |
| Compact grey modules, docking/undocking, group movement, independent resizing | Implemented. |
| Microanimations and tactile interaction feedback, with tldraw as reference | Implemented: pickup/drop, edge previews, settling, linked creation/reveal cues, controls/chips/popovers and reduced motion. |
| Synchronized Frames/Audio scrubbers, waveform and thumbnail analysis | Implemented. |
| TypeScript port of FFmpeg scdet, cached threshold, dockable Cuts module | Implemented and compared with native references; see development notes and `src/scdet.ts`. |
| PNG board export, local persistence, atomic ZIP backup/restore | Implemented. |
| Linked clip cards with muted hover preview and editable ranges | Implemented: shot default, independent scrub/playback, shared source data, duplicate views and explicit all-shots action. |
| Free quotations, whole-video/clip/subsegment coding, region coding, memos and retrieval | Implemented: flat codes, compact assignment popovers, dockable Codes/Quotations/Sources module, ZIP restore and CSV export. |
| Still-region selection | Implemented: manual, movable/resizable rectangles; retiming preserves geometry, identity, codes and memo across views. |
| Board performance | Implemented: viewport culling, bounded covers, live gesture painting and indexed snapping. On 7 November, dragging used 13.5–14.8× less JavaScript and 2.3–3.1× less main-thread task time against the refactored build; elapsed/frame timing did not improve materially. The earlier 4 November result and both protocols remain in development notes. |
| Live code collections and provisional spatial groups | Implemented: linked mixed evidence, relative arrangement, memos, explicit promotion/reuse, virtualized previews and v4 ZIP/PNG support. |
| Browser segmentation for proposing still regions | Deferred by Daniel for the first version; research retained below. |
| Optional multimodal analysis companion | Proposed on 7 November: browser-side integration with a user-supplied API key. Gemini is a candidate; no provider integration or automatic coding is implemented. |

## Optional multimodal companion · 7 November 2026

Daniel proposed Gemini or another video-capable model as an analysis companion,
keeping the application in the client with a user-supplied API key. This is an
exploration, not an instruction to implement the following feature ideas.
The existing analysis workflow remains usable without an AI account or uploads.

**Direction from the discussion:** browser-to-provider requests without an app
backend. This is client-side integration with remote inference; submitted media
leaves the device. A user-entered key belongs in memory for the session, outside
project data, backups, source code and logs. Never ship a shared application key.
Google's [SDK supports browser API-key use](https://github.com/googleapis/js-genai#browser),
while its production guidance recommends keeping secrets server-side. Bring-your-own-key
mode must make that browser credential exposure clear; it does not turn a browser
into a secure key vault.

**Candidate uses, not yet selected:**

- Ask about a clip, still or rectangular region, retaining surrounding context.
  Separate visible/audible description from interpretation and uncertainty.
- Compare evidence in a group/collection, propose differences or alternative
  readings, and draft a memo with source/time references.
- Challenge a provisional code: identify a weak fit or counterexample among the
  submitted evidence and suggest clearer inclusion/exclusion boundaries.
- Find candidate moments matching a research question within explicitly submitted
  video, then review them as source-linked clip proposals.
- Draft timestamped speech/action notes or possible cluster names. Keep these
  distinct from analyst-accepted descriptions, codes and quotations.

**Recommended small experiment, awaiting selection:** a compact dockable companion
attached to the current evidence/group, with Ask and Compare actions. Show the
submitted scope before sending; return clickable evidence references and explicit
Save as memo / Create quotation actions. Suggestions do not silently modify codes,
regions or existing quotations. Keep source/range, prompt and model provenance
with accepted AI-assisted output, and retain normal Undo for accepted board edits.

Gemini supports [video/audio understanding and timestamped questions](https://ai.google.dev/gemini-api/docs/video-understanding).
Returned times and interpretations need review; sampled model input is not a
frame-exact observation record. Our clip views contain references, not independent
video files: sending only an excerpt requires extracting a temporary snippet or
selected frames. Processing offsets on an uploaded original are not a restriction
on which bytes were uploaded. No automatic whole-library upload, background model
analysis, new media copies in the board, model dependency or schema change is
introduced by this proposal. Full-video semantic indexing and continuous live
commentary remain later ideas. A small provider boundary can preserve future
choice without building a multi-provider framework first.

## Live collections and spatial coding · 6 November 2026

Daniel selected two directions for implementation: live collections of a code's
quotations, and developing codes by arranging evidence into provisional groups.
The implementation goal is a complete small workflow from uncoded evidence to
a named code and an automatically updated collection. These are linked views of
existing quotations; original media and analytical occurrences stay shared.

**Implemented plan:**

1. Add movable, resizable, dockable evidence spaces to the board. A provisional
   **group** has a name, memo and manually selected quotation references, each
   with a position relative to the group. Moving the group moves its contents;
   resizing preserves their arrangement. Groups can overlap in membership.
2. A **live collection** references one existing code. Its members are derived
   from current assignments across whole videos, ranges, stills and regions.
   Keep the positions of existing members; place new matches in free slots.
   Removing an assignment removes its view; code renaming/retiming is reflected
   immediately. A collection memo belongs to that collection, separate from the
   shared code definition and quotation memos.
3. Drag a code from Codes onto the board, or use its collection button. Create
   groups from a toolbar action. Add evidence through a searchable picker, by
   dragging quotation rows, or by dragging evidence between spaces. Arrange
   tiles with a drag handle; keyboard movement and buttons provide alternatives.
   Moving evidence between manual groups changes membership; dragging from a
   live collection keeps its original assignment. Dropping evidence into a live
   collection explicitly assigns its code. Mere overlap with a frame never codes.
4. **Turn into code** explicitly creates or reuses a trimmed, case-insensitive
   code name, assigns it once to every member, and turns that group into a live
   collection. Reusing a code also reveals its existing matches. This is one
   undoable action. Unnamed or empty groups cannot be promoted. Deleting a space
   never deletes quotations or codes; removing a tile from a live collection
   explicitly removes that code assignment, with a clearly labelled action.
5. Evidence tiles show the source, scope, source time and shared coding, with
   frame/region previews and one muted clip preview at a time. Selecting/coding
   a tile uses the existing quotation; source reveal opens its full context.
   Bound preview decoding and render only the visible portion of large spaces.
6. Introduce project schema v4 with an empty-space migration from v1–v3. Preserve
   IDs, media bytes, region geometry and historical assignments. Validate space
   references and coordinates before atomic ZIP restore. Include spaces, memos
   and arrangements in local persistence/Undo/ZIP and in the board PNG. CSV
   continues to export actual quotations and assignments, without duplicate rows
   for their additional views.
7. Verify membership reconciliation, promotion/reuse, layout, deletion and legacy
   migrations with focused tests. Exercise code drag, grouping, arranging,
   promotion, new/removing assignments, retimed regions, Undo, reload and fresh
   ZIP restore with generated video in isolated Chromium. Inspect the resulting
   board and PNG. Run the complete check suite and push to the existing GitHub
   repository; keep experimental release history intact.

This adds a shared evidence-space model rather than a second quotation store.
Nested groups, code hierarchies, automatic spatial inference, synchronized
comparison and segmentation are outside this iteration.

Initial verification: **68 unit/storage checks and 22 real-media Chromium workflows**.
The new workflows cover native code drag, manual arrangement, atomic promotion
and Undo, assignment/rename updates, closing collections without deleting data,
retimed regions, exact preview/source recovery after closing a still view,
code reuse, PNG and fresh-session ZIP restore. A 250-quotation collection keeps
fewer than 18 tiles mounted while scrolling, with one pinned preview. A separate
walkthrough verified quotation-list dragging, manual group transfers and
dragging evidence onto empty board space. Original video bytes and the four
analytical quotation identities survived. Detailed evidence and compatibility
limits live in the development notes; release history stays unchanged.

The earlier 6 November test refinement brought coverage to **78 unit/storage
checks and 26 Chromium workflows**. It adds all manual/live transfer combinations,
legacy ZIP recovery, native drag placement at different zoom/scroll positions,
same-project restore, preview cleanup after shared coding changes, and decoded
PNG content for scrolled-out evidence. Playback checks observe an actual loop.
See [test refinement](docs/DEVELOPMENT.md#test-refinement--6-november-2026) for
the assertions, test isolation and limits.

## Explicit transitions · 6 November 2026

Daniel requested implementation after the state-machine audit. The focused goal
is reliable coordination of project operations/background work, preview ownership,
and evidence editing. Keep the implementation small, in TypeScript, with no new
state-machine dependency or project-format change. Existing independent player,
layout, code and quotation data remain independent.

**Implemented plan:**

1. Give project startup and file operations named states and guarded transitions.
   Opening a ZIP progresses through reading, recovery backup, draining work,
   atomic storage replacement and installing the restored project. Lock editing
   during file work and show useful operation messages. A failed pre-commit
   restore returns to the previous project; a failure after commit reports that
   the saved restored project must be reopened.
2. Own queued/running analysis in one cancellable background-job coordinator.
   Progress belongs to its job. Drain cancelled work before replacing storage;
   resume pending analysis and interrupted cut detection when replacement fails.
   Change the project/asset generation only after successful storage replacement.
   This fixes the reproduced old-board `pending`/zero-jobs/phantom-processing state.
3. Represent preview ownership as idle, pending hover, hovering or pinned, with
   typed clip/evidence targets. File operations stop previews and pending hover;
   delayed callbacks cannot reactivate an obsolete owner. Reconcile removal and
   code-assignment changes through the same transition path.
4. Represent quotation focus, drawing and unsaved segment editing as explicit
   modes. Keep visual module selection separate. Layout/player controls preserve
   analytical focus; explicit evidence selection changes it. Drawing and segment
   creation are exclusive. Draft validity belongs to its identified draft, and
   stale callbacks cannot edit or save a later draft. Project replacement resets
   the editing context; failed replacement preserves it.
5. Finish owned pointer gestures consistently on release/cancellation, Escape,
   lost capture and blur. Ignore other pointers. Keep already-applied movement
   and range edits; discard an unfinished region rectangle. Guard late region
   creation after leaving drawing mode.
6. Add focused transition/job tests and real-media regressions for failed restore
   recovery, preview shutdown, editing-mode changes and pointer ownership. Run
   the full suite, inspect the diff, update development notes/changelog and push
   the verified result to the existing GitHub/Pages target.

For that focused pass, smaller field/cache/animation machines, broader player
unification and new analysis outcome formats were deferred. The application
refactor below subsequently consolidates player and time-field ownership while
retaining the existing persisted analysis format.

Verification: **97 unit/storage checks and 34 Chromium workflows**. New browser
cases hold real worker results and fail an atomic replacement to verify automatic
analysis/cut recovery, then successfully reopen the same pending backup. They
also cover file-operation preview shutdown, retained editing context after
rejection, fresh draft validity, capturing during a draft, unfinished rectangle
cancellation, foreign pointers, Escape, blur and lost capture. The eight new
workflows passed repeated runs. See [transition implementation](docs/DEVELOPMENT.md#explicit-transitions--6-november-2026)
for ownership, failure handling and verification limits.

## Application refactor · 6–7 November 2026

Daniel requested a full refactor after the focused transition pass. This expands
that earlier scope into the application's ownership and composition; it does not
change the research model, compact design or v4 project format.

**Implemented plan:**

1. Separate the board document, Undo and autosave from project files and media
   resources. Give queued saves, Blob URLs and asynchronous work explicit owners
   and cleanup. Preserve atomic replacement and recovery after failed opening.
2. Move import/analysis, still capture, evidence editing/commands, preview ownership,
   viewport/gestures and file operations into focused controllers with stable,
   current-state actions. Make App a composition of those owners and views.
3. Extract board modules and the application shell. Keep camera and job-progress
   updates from rebuilding every media/editor view; retain viewport culling,
   shared original media and quotation identities.
4. Consolidate native playback/seek and bounded preview behavior, plus editable
   timecode fields, while retaining independent source clocks, muted hover,
   explicit pinning and frame-relative region coordinates.
5. Add regression coverage for changed ownership, stale asynchronous results,
   resource disposal and editor/playback boundaries. Run the entire check suite,
   inspect actual generated-media workflows and measure board interactions.
6. Update development notes and the changelog, review the complete diff, then
   push the verified implementation and confirm GitHub Pages deployment.

`App.tsx` now composes focused controllers in `src/app/`, with separate shell,
module rendering and shared card frames. `Autosave`, `AssetLibrary`, `Tasks` and
`Playback` own their asynchronous/resource lifetimes. Stable action identities
read current dependencies, and the media tree receives only the data it renders;
camera, save and job-progress updates preserve its memoization.

Source players, clip views and evidence previews share native playback lifecycle,
bounded looping, deferred/coalesced seeking and stale-request cleanup. Their
controls remain independent: only source players publish the source clock;
hover/evidence previews remain muted and explicit clip pinning permits audio.
Timecode editors share draft/validation/Escape behavior. Pending import/capture
work and queued analysis are cancelled on owner disposal; file work rejects late
results after disposal. React effect replay preserves these owners through
Strict Mode/hot refresh; player sessions retain their position and intent. URL replacement keeps old revisions briefly for live
media, then revokes them; project replacement releases the old project.

The FFmpeg scorer, migration rules, v4 format and exports remain intact. No new
framework or dependency. Small presentation states remain local. The persisted
`partial` analysis flag retains its existing meaning; richer analysis reporting
is a separate product decision.

Verification on **7 November 2026**: `npm run check` passed formatting, TypeScript,
production build, **116 unit/storage checks and 38 Chromium workflows**. A separate
Strict Mode/two-hot-refresh walkthrough retained drafts, playback and original
URLs, then successfully recaptured coded frames and saved new work. Reviewed the
resulting board screenshots. Measured 120/240-clip interactions retain similar
frame timing with about 5–14% additional main-thread work; exact measurements and
ownership details are preserved in [development notes](docs/DEVELOPMENT.md).

## Interaction speed · 7 November 2026

Daniel requested another 10× speed improvement against the completed application
refactor (`b7cce92`). Target actual board interaction work, retaining shared media,
quotation identities, live docking feedback and local persistence.

**Implemented plan:**

1. Measure the current production build with the existing real-pointer benchmark
   at 120/240 clips and add a 2,400-clip stress case. Keep the same generated video,
   viewport, pointer steps and warm-up/measured-run protocol for both builds.
2. Remove full React/layout recomputation from pixel-by-pixel pan/group movement.
   Keep live geometry current, paint only affected DOM, and publish at meaningful
   boundaries. Newly exposed evidence must still appear during a held gesture.
3. Reuse geometry and docking indexes while the board structure is unchanged.
   Preserve resize, snap collision checks, group motion, code/region editing,
   preview retention, Undo and cancelled-gesture semantics.
4. Add regressions for continuous manipulation, culling/reveal, interrupted work
   and persistence. Run the complete suite and compare the exact final production
   bundle. Report measured gains and any limits to the 10× target honestly.
5. Update the spec/development notes/changelog, push and verify Pages deployment.

Live pan/group pixels now update the world/grid or only the moving modules and
their visible connectors. The current document receives every update; React
publishes on release, 120 ms idle, other document edits or before the viewport
leaves rendered overscan. Autosave and exports use current geometry. Cached
spatial queries preserve docking/collision order; resizing retains its existing
reflow. Undo ends a held drag, and native focus/drag scrolling cannot move the
workspace underneath its camera. Rapid zoom reset reads the live scale.

Verification: formatting, TypeScript/build, **124 Vitest checks and 41 Chromium
workflows** pass; reviewed the coding-board screenshot. The unchanged production
benchmark compared 120/240/2,400 source-linked clips against `b7cce92`, with one
warm-up and three measured runs of 60 real pointer steps per gesture. Dragging
uses **13.5–14.8× less JavaScript** and **2.3–3.1× less main-thread task time**;
panning uses 5.5–9.2× less JavaScript and 1.3–1.6× less task time. The frame-paced
elapsed/P95 timings do not establish a 10× overall-app speedup; pan elapsed time
was 3–14% higher. Exact bundle identities, measurements and limits are in
[development notes](docs/DEVELOPMENT.md#interaction-speed--7-november-2026).

## Exploratory pass · 5 November 2026

Reviewed the live **v0.0.1** build, commit **b923ee7**, in isolated Chromium
sessions. Used generated H.264/AAC landscape, silent H.264 portrait and VP9
known-cut videos. Built a board with **3 sources, 3 stills, 4 image regions,
7 clip views, 18 quotations and 3 codes**. No research media or existing working
browser storage was used. Disposable evidence is local under
`tmp/full-pass-2026-11-05/` (screenshots, CSV/PNG/ZIP, board snapshots and
`observations.json`).

The core loop worked: source playback/speed/mute/loop; Frames/Audio scrubbing;
still capture, frame stepping, duplicate views and shared retiming; drawing,
moving/resizing and keyboard editing regions; coding/memos and code retrieval;
independent muted clip hover and explicit playback; nested source-time segments;
shot-default and all-shot clips; cached threshold edits; magnetic detaching,
resizing and redocking; source hiding/reopening; and export/reload. Region
geometry/identity/codes/memos survived retiming. Trimming a parent retained its
subsegment's source boundaries. A fresh-session ZIP restore retained quotations,
codes, stills and clips exactly; CSV covered every quotation/assignment and the
ZIP original matched the input bytes. Invalid video/ZIP input preserved the
working board. No browser/runtime errors or failed HTTP responses were observed.

**Open findings, reproduced on that build.** These are proposed priorities for
the next implementation pass, not completed fixes or new scope agreements:

Status after the coding iteration below: findings **1–4 are addressed**;
**5 (default placement) remains open**. Retain these reproductions as evidence
of the original release's behavior.

1. **Keyboard Undo is inconsistent.** Duplicate a clip with its action button,
   then press Cmd+Z while the button retains focus: no Undo occurs. Move a
   module, focus an image region and press Cmd+Shift+Z: the supposed Redo
   shortcut instead undoes the move. The toolbar Undo works. Correct shortcut
   routing in `src/App.tsx`; preserve native text-field Undo and avoid treating
   Shift+Cmd/Ctrl+Z as another Undo. Add regressions for both focus contexts.
2. **Coding is not consistently visible.** Whole-video and clip assignments
   persist and appear in the inspector/CSV, but their cards show no code names.
   PNG export omits clip code names and, when a region has a title, exports only
   that title instead of its code names. The legend counts do not identify each
   assignment. Keep compact code feedback consistent across players, clips,
   stills and regions, including `src/export.ts` output.
3. **Reveal must make the target accessible.** Pan the existing Codes module
   offscreen and press **Open codes and quotations**: it remains offscreen.
   Retrieve a region whose still lies behind later cards: it selects/highlights
   that still without raising it, so another card still covers the region.
   Review `openCodes`, `reveal` and `jump` in `src/App.tsx` for appropriate focus,
   camera placement and stacking. A closed/reopened Codes module is accessible.
4. **Code creation behaves differently between entry points.** Enter an
   existing code name in the Codes module: it creates another ID with the same
   name and can assign both to one quotation. The compact coding popover reuses
   the existing code instead. Reuse that behavior for panel creation; preserve
   existing distinct code identities rather than merging historical data
   implicitly.
5. **Default placement obscures existing work.** Importing another video stacks
   it over earlier players/stills; creating clips and the all-shot batch can
   cover the Codes module and existing stills. Inspect `importVideos`,
   `placeClip` and `makeStill` in `src/App.tsx`. Prefer a nearby unoccupied area
   for new views while preserving every existing module's saved position.

Further polish observed: corrupt ZIP errors expose JSZip's internal message and
documentation URL; provide a clear backup error with reassurance that the board
is intact. Fixed quarter-position timeline ticks truncate fractional seconds
(for a 5-second video, positions 1.25/2.5/3.75 read 00:01/00:02/00:03); use clear
tick intervals or suitable precision. Review tiny labels/handles at board zoom
without expanding padding throughout the interface. This pass covers short
generated clips in Chromium, not a general browser/codec/long-video matrix.

## Comparative walkthrough · 5 November 2026

Reviewed the same live **v0.0.1 / b923ee7** in a second isolated Chromium
workflow: compare evidence across two sources, create overlapping regions,
reuse/rename a code, retrieve its occurrences and revise the selected evidence.
The references were ATLAS.ti 26 Mac's documented [multimedia quotations](https://manuals.atlasti.com/Mac/en/manual/Multimedia/MultimediaWorkingWith.html)
and [image quotations](https://manuals.atlasti.com/Mac/en/manual/Quotations/QuotationsImageCreating.html),
plus an operated [tldraw example](https://tldraw.dev/examples/basic). ATLAS.ti
itself was not run. This comparison concerns interaction and scope clarity,
not feature parity or a substantive analysis of research material.

Built a deliberate comparison strip with **2 sources, 2 stills, 3 image
regions, 1 free time range, 8 quotations and 1 shared code**. Docking, group
movement and resizing preserved evidence coordinates and assignments. Overlapping
regions remained independent. Renaming the shared code updated both sources'
region labels without changing quotation identities or assignments. Duplicating
a still view correctly retained one analytical occurrence and shared retiming;
removing that view preserved the quotation. A fresh-session ZIP restore matched
the saved board exactly, including hidden source players and docking. CSV had
all 8 quotation rows; each original video appeared once in the ZIP and matched
its input bytes. No runtime/console errors were observed in the main session.
Disposable evidence is in `tmp/comparison-pass-2026-11-05/`, including
`observations.json`, board/CSV/ZIP and comparison/reference screenshots.

**New reproduced findings; proposed priorities, not implemented fixes:**

1. **Transport actions replace the active coding target.** Select a coded
   image region, then click its still's **Next frame**: the inspector switches
   from Image region to Still frame. The region's geometry/codes/memo survive,
   but another code would now apply to the whole frame. Similarly, select a
   saved time quotation, reveal its source, then press the source's **Play**:
   the target changes to Whole video. Card-level `onPointerDown` calls
   `selectModule` in `src/App.tsx`, conflating board selection with evidence
   selection. Preserve the relevant active quotation during transport/retiming
   and make deliberate scope switches explicit.
2. **A draft segment leaves the previous quotation's coding controls active.**
   From a source, choose **Select video segment**, enter boundaries and assign
   a code before **Save free quotation**. The code is assigned to the whole
   video; the saved range has no code. Either let draft coding save/assign to
   that draft or disable the previous target's assignment controls while it is
   pending. The visible editing scope must agree with the actual assignment.
3. **Following a code found through its definition can hide all its matches.**
   Search `kinetic`, present only in the shared code's definition: Codes shows
   that code with 2 occurrences. Click it: Quotations retains the search and
   displays 0 results. Clearing the query reveals both. `src/Coding.tsx`
   searches definitions in Codes but excludes them from quotation matching.
   Clear the originating code query on retrieval or make search semantics
   consistent, with visible query/filter state.

**Design implications, preserving the agreed model:** the tldraw example makes
duplicate shapes independent and provides Zoom to selection. Video Board's
duplicate views intentionally share a quotation instead; show that relationship
clearly and distinguish **another view** from **a new independent capture**.
A compact active-scope indicator and focus-on-selection action would help
comparison and retrieval. ATLAS.ti's documented range/image quotation workflow
is a useful reference for keeping the selected evidence visible while editing
its boundaries. These are small interaction proposals, not a request for code
hierarchies, segmentation models or a new workspace architecture.

Minor boundary-editing friction: with a draft initially at 0–1 seconds,
entering an in-point of 1 before extending the out-point clamps to the preceding
frame to preserve a positive duration; extending the out-point does not revisit
that clamp. Re-entering the in-point gives the requested boundary. Make this
constraint visible or improve the marking flow; the observed source reveal
correctly sought the stored boundary.

## Coding iteration · 5 November 2026

Daniel requested implementation and further demo exploration after the reviews.
The following changes are **implemented and verified**, preserving schema v3,
shared quotations and the no-video-copy rule:

- Playback, scrubbing and still time controls retain the active region/range;
  an asynchronous still update also preserves that selection. Explicit whole
  video/still/clip coding actions continue to choose their named scope.
- A pending segment hides the previous quotation's editor and disables code
  assignment/creation until **Save free quotation**. Invalid typed boundaries
  block Save instead of silently saving the previous valid range. Escape in a
  time field restores that field without canceling the segment.
- Code creation from the panel and popover reuses an existing trimmed,
  case-insensitive name; assigning an already assigned code through creation
  is a no-op. Existing distinct code identities are not merged.
- Following a code clears the originating search. Quotation search includes
  assigned-code definitions; source search now filters source names too.
- Retrieved evidence is raised and brought into view. The toolbar/popover's
  **Open codes** action reveals the existing offscreen module. Region pointer
  selection does not move the camera mid-gesture.
- Video/clip cards display code chips, duplicate still/clip views show their
  shared relationship, and PNG includes clip codes plus named-region codes.
- Cmd/Ctrl+Z works after button actions and keeps native text editing Undo.
  Shift+Cmd/Ctrl+Z no longer consumes another Undo; app Redo is not implemented.

The local demo used generated landscape/audio and silent portrait videos,
overlapping coded regions, a coded clip and a coded nested segment. Trimming
and deleting the parent preserved the child's absolute boundaries and coding;
Undo restored the relationship. Final board: **2 sources, 2 stills, 3 regions,
1 clip view, 10 quotations and 3 codes**. CSV matched all quotations, memos and
assignments; a fresh-session ZIP restore matched the board exactly, with each
byte-identical original stored once. PNG labels were visually checked. Evidence
and the reusable demo ZIP are local in `tmp/coding-pass-2026-11-05/`.

`npm run check` passed **30 unit/storage checks and 15 Chromium workflows**.
The five new browser regressions cover selection through linked retiming,
draft/invalid-time safety, code reuse/definition retrieval, keyboard Undo, and
covered/offscreen retrieval. The earlier reviews' default placement, boundary
clamp feedback, fractional ticks, ZIP error wording and small-scale readability
remain proposals. A dedicated focus-selection action is still open.

## Code quality pass · 5 November 2026

Daniel requested a complete code review and quality improvements, followed by a
GitHub push. This pass preserves the current product scope, schema v3, source
identities, linked-view behavior and FFmpeg port/reference fixtures.

Implemented: readable formatting and a reproducible formatting check; a separate
typed validator for ZIP manifests with indexed, iterative parent-graph checks;
shared pure asset references; an explicitly tagged media-worker protocol with
cleanup on every completion/failure/abort path; a shared cancellable playback
clock; discriminated pointer gestures and source-seek parameters without fake
whole-card casts. Docked Codes layout no longer mutates Undo snapshots. Restore
resets hidden-source scrubbers to saved times. Unrelated pointer events cannot
finish another drag. File operations prevent concurrent board edits; save errors
and capture results recheck their snapshot/project generation before applying. Corrupt ZIP
and manifest errors are now readable; this addresses the earlier ZIP-wording
finding.

Verification: **53 unit/storage checks and 18 Chromium workflows**, including
real-media decoding, legacy migrations, shared frames, deep/cyclic contexts,
worker disposal, hidden-source restoration and post-error editing. The focused
dependency patch moves Vitest to 5.0.3; the dependency audit reports no known
vulnerabilities. No production dependency or research-media storage migration
is introduced. Detailed check commands and boundaries remain in the development
notes; earlier audit evidence and product proposals above are retained.

## Interface and interaction

Daniel requested a clean, compact, tactile **graphite/grey** interface with icons,
little padding and bounded module frames. The original suggestion to reuse
Folder Sort's green palette was superseded; its Lucide conventions and useful
persistence/export patterns were adapted. The existing Folder Sort project is
outside this experiment's editing scope.

Players, stills and scrubbers are separate board modules. Frames, Audio and Cuts
are different views of a video's timeline; more track types can be added only
when useful. All scrubbers for one player follow its playhead, regardless of
their width, position or docking. Enlarging a scrubber currently displays the
same full duration with more space; independently zoomed time windows remain open.

Docking is spatial organization, independent of media/quotation relationships:
header drag moves the docked assembly; the grip or Alt-drag releases one module;
Shift suppresses magnets. Detached modules retain their source. Resizing preserves
neighbours' independent dimensions and moves them with their attached edges.
Preserve this behavior for future clip and coding modules.

### Performance and offscreen views

Daniel requested a **10× improvement** after the spec implementation. Measure
against the preceding production build with repeatable real-media workloads;
do not treat a board-interaction result as a promise about decoding or analysis.
The [development notes](docs/DEVELOPMENT.md#board-performance--4-november-2026) preserve the benchmark
protocol and measured results: 31–32× faster elapsed time at 240 clips, with
smaller elapsed gains but more than 10× less main-thread task time at 120 clips.

Offscreen still, track and clip DOM views and their connectors may be culled,
using **200 screen pixels** of overscan. Their evidence, geometry, source links,
quotations and export membership remain in the complete board model. Preserve
source transports, Codes panel state, moving/selected/focused modules and active
clip playback while panning. Clip speed belongs to its view and survives culling
and reload. Keep the one-active-clip budget and shared-source/no-video-copy rule.
Viewport culling must not change docking, source timing or full-board PNG/ZIP
output. Cached layout/group work and waveform geometry should not be rebuilt
just because the camera or playback clock moves.

### Microanimations and tactile feedback

**Agreed direction:** use **tldraw** as the reference for fluid, direct board
interaction. Small animations should make picking up, connecting and editing
objects feel tangible while preserving the compact grey interface. Reference:
[snapping feedback](https://tldraw.dev/sdk-features/snapping) and
[animation and reduced motion](https://tldraw.dev/sdk-features/animation).

First implementation, to tune together in the browser:

- **Pick up / put down:** a small shadow and outline change acknowledge grabbing
  a module or assembly; release settles it back into the board.
- **Dock / undock:** show the candidate edge and attachment before release. A
  short settling motion confirms docking; a seam/outline change acknowledges
  detaching. Keep the existing gesture and modifier behavior.
- **Create a linked object:** a new still or clip appears with a quick fade and
  small settling movement. Briefly highlight its source and the new view so the
  relationship is easy to follow.
- **Hover, focus and selection:** controls and handles fade in quickly, with clear
  pressed/selected states. Keyboard focus and touch expose the same actions.
- **Scrub, trim and mark regions:** playheads, timecodes, handles and rectangles
  follow input immediately. Keep the last decoded frame visible until the new
  one is ready; cancel stale requests. Motion must preserve selection accuracy.
- **Code and retrieve:** a code chip's arrival acknowledges assignment; revealing
  a quotation briefly highlights the relevant card/region and source context.

Initial timing proposal was **100–150 ms** for control feedback and
**150–220 ms** for settling/appearance. The implementation uses **120 ms** control
feedback, **180 ms** settling, **200 ms** creation and **420 ms** source highlights,
with restrained ease-out. Dragging and resizing stay attached to the pointer;
decorative motion is interruptible by
the next gesture. Respect `prefers-reduced-motion` with immediate placement and
clear static feedback. Keep animation state transient, separate from saved
geometry and exports, and keep playback/board gestures responsive during motion.

## Sources, quotations, codes and views

**Agreed with Daniel:** use the free-quotation model he likes in ATLAS.ti.
A quotation identifies material worth working with; coding is optional.

| Concept | Minimum meaning |
| --- | --- |
| Source | The original media asset and its stable identity/metadata. |
| Quotation | A whole video, a source-linked time range, or a region in a frame. It may have a short title, zero or more codes and a memo. |
| Code | A stable ID and name; optional colour and short definition. Begin with a flat list. |
| View | A player, still or region display of a source/quotation, with board geometry and presentation/playback state. |

This is a small domain model, not a request for a new database framework. The
original model used a video card ID as its media reference and had no quotation
layer. Schema **v3** adds stable quotations, codes and separate clip/still views.
For backward compatibility, the `videos` catalog retains each original media ID
and its primary player's layout fields. Hiding that player retains the source,
quotations and linked views; retrieval can reveal it again. Clip/still view IDs
and quotation IDs are independent. v1/v2 migration preserves original media IDs,
still times and layout. A frame's multiple views share its cached image asset;
retiming replaces that reference together, retaining older images for session Undo.

### Coding scopes

- Code an entire source video.
- Code an entire clip quotation.
- Select and code a segment inside either the original video or a clip.
- Code a whole still/frame selection or a region within it; multiple regions
  may coexist and overlap.
- A quotation can have several codes; temporal quotations can overlap and cross
  detected cuts. Codes can be created while exploring or supplied beforehand.
- Multiple views of the same quotation share its coding/memo. Displaying that
  quotation twice must not create two coded occurrences. A deliberately new
  quotation is a distinct selection, even if its coordinates happen to match.

**Time references are always in the original video's coordinates.** Selecting
clip-local 2–5 seconds within a source range of 10–20 seconds gives a quotation
at source 12–15 seconds. Retain enough context to reveal the parent view and
original source, without nesting relative offsets as the authoritative time.

Explicitly adjusting a clip's boundaries changes the extent of coding attached
to that whole clip quotation. Subsegment quotations retain their own source
boundaries; trimming a parent must not silently clamp or delete them. If a
subsegment lies outside the current parent view, its source remains reachable.

Implemented minimal rule: code assignments are explicit. Coding a whole clip does
not generate duplicate assignments on every subsegment or image region inside
it. A code's retrieval view still reveals the full extent of that coded clip.

### Stills and regions: corrected agreement

**Daniel explicitly rejected freezing a still once its region is coded.**

- The frame time remains adjustable, including frame stepping.
- The region stays in the same position and size **relative to the image** as
  the frame beneath it changes. It does not automatically follow an object.
- Keep quotation identity, code assignments and memo attached through retiming.
  This is an intentional edit to the quotation, not automatic creation of a
  replacement still/quotation.
- Store geometry in source-image coordinates (for example normalized fractions),
  excluding letterboxing and card controls. Resizing or moving a board view must
  not move the selection within the image.
- **First version: manually draw a rectangle, then move or resize it as needed.**
  It becomes a free region quotation and can receive codes and a memo. Model
  segmentation and masks are deferred; no model setup is needed for this scope.

Source ID, frame time/range and geometry provide the traceable evidence anchor.
Preserve access to the full frame and surrounding video. Keep explicit edits
undoable; simple created/updated metadata is sufficient initially. A full
revision-history or multi-coder audit system has not been requested.

### Minimal coding and retrieval interface

First implementation:

- A dockable **Codes** module with search and create/rename actions. Names remain
  visible alongside colour; code IDs remain stable through renaming.
- Select a range, clip, still or region and assign existing/new codes in a compact
  popover. A dedicated region-selection mode avoids confusing image marking with
  moving/resizing a board card. Provide a manual selection path throughout.
- Optional short memos on quotations and definitions on codes; leave interpretive
  notes as text rather than imposing a methodological template.
- Select a code to retrieve its quotations across sources. Results reveal/play
  their source with context and can be compared on the board. Filtering must not
  rewrite saved layout or duplicate evidence records.
- Project ZIP metadata includes quotations, codes and notes. A plain CSV export
  contains stable quotation/source references, times or frame/region
  coordinates, code assignments and memos. PNG remains a presentation export.

## Linked clips and player behavior

**Agreed direction:** a clip is another player view of a range quotation in the
original video, with its own local playback state. It is not a newly encoded file.
Its semantic source link survives detaching, resizing and moving on the board.

- Hovering previews the clip automatically **with sound off**. Loop only within
  the clip range. Leaving stops the preview; the preferred resting state is its
  cover frame. Keep an explicit Play control for keyboard/touch/fallback use.
- Previewing a clip should leave the main source player's position alone. A
  deliberate source-link action reveals/seeks the source.
- Show compact editable in/out timecodes, duration, and draggable trim handles.
  Use known source frame times when finalizing precise boundaries.
- Default **Create clip** to the detected shot around the playhead once analysis
  is available. An initial arbitrary three-second default was discussed before
  this preference; it is now only a possible fallback while detection is absent.
- A separate explicit action may create all shot quotations/cards. Automatic
  analysis should not flood the board with cards.
- Manual quotations may span multiple shots. Detection produces useful
  proposals, not obligatory analytical units or automatic research codes.

Performance proposals called for one shared preview budget, cached posters and
hover intent. The first implementation allows **one active clip video element**
at a time, across hover and explicit playback. Inactive cards display a cached
cover. Hover intent is **120 ms** and pauses during board gestures. Explicit Play
or scrubbing pins that clip; Stop clip preview or Escape releases it. Sound can
be enabled explicitly on pinned playback; a later hover starts muted. Hover
playheads do not edit source/quotation timestamps.

Visible clip covers use a single cancellable capture queue, with **320px** source
frames and at most **48** shared cached images. Captures wait for a **100 ms** quiet
period during range edits; obsolete requests are terminated. Covers are transient
and regenerate after reopening, with no extra video assets or per-card decoder.
An existing thumbnail is a temporary fallback while the precise cover loads.
These are prototype defaults to review on Daniel's actual examples, rather than
measured guarantees for every browser or large project.

Native playback can have a seek pause at a loop boundary. Source-linked timing
and cached metadata do not guarantee seamless, frame-exact browser loop rendering.
Measure interaction latency on actual short-video examples before adding a new
playback engine. Keep decoded-frame/image caches bounded, never one decoder or
full embedding set per inactive card.

## Shot detection and the media-engine decision

Daniel chose a **TypeScript port of FFmpeg scdet** on 4 November 2026 after the
discussion of a custom adaptive detector and FFmpeg/Wasm/native alternatives.
The implemented port takes priority over the earlier adaptive-detector proposal.

Implemented scope and evidence are in the [development notes](docs/DEVELOPMENT.md#current-local-shot-detection--4-november-2026).
The numeric core is pinned to FFmpeg n8.1.2 and keeps its LGPL terms. Browser
decoding stays with Mediabunny/WebCodecs. This choice adds cut scoring, not codec
coverage. Sensitivity uses cached per-frame scores; new detection settings must
not retroactively change manually created/coded quotations.

FFmpeg remains a possible later processing backend for unusual codecs,
waveform/silence/freeze analysis, explicit clip-file export and compatibility
proxies. Native FFmpeg offers a different deployment/file-access tradeoff from
FFmpeg.wasm. A single shared proxy per original would still be an additional
video derivative; it needs a deliberate decision under the no-copy preference.
No FFmpeg processing engine, native helper or automatic proxy pipeline has been
selected for this prototype. The interface can remain TypeScript either way.

## Segmentation-assisted still regions: researched option

Daniel asked whether a model can propose regions for coding **inside the browser**.
Yes: **SlimSAM through Transformers.js/ONNX Runtime Web** is a documented candidate.
After this exploration, Daniel chose **simple manual regions first**. Keep the
research here for possible later use; segmentation is outside the first version.

- [Model and point-prompt example](https://huggingface.co/Xenova/slimsam-77-uniform).
- [Browser demo](https://huggingface.co/spaces/Xenova/segment-anything-web).
- [Model files](https://huggingface.co/Xenova/slimsam-77-uniform/tree/main/onnx):
  quantized encoder about 8.88 MB + decoder about 4.9 MB, **about 14 MB of model
  weights**, plus runtime/configuration. Runtime memory is larger than downloads.
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/) supports local
  inference with WASM and GPU execution options. Compatibility/performance of
  the chosen model/backend must be checked in our actual browser.
- [Local asset configuration](https://huggingface.co/docs/transformers.js/custom_usage)
  allows shipping model/runtime files locally and disabling remote model loads.
  A first download/setup can be cached; research images need not be uploaded.

If revisited, the proposed interaction is: choose **Select object**, click a
region, refine the candidate with include/exclude clicks or a box, then accept it as a free region
quotation. Assign codes/memos separately. A mask proposes **pixel geometry**; it
does not determine the analytical meaning or invent a qualitative code.

Load the model lazily in a worker, keep one model instance, and cache reusable
image features for a small number of frames so repeated prompts do not repeat
the full image encoding. Keys must include source/frame, model revision and
preprocessing. Retiming cancels obsolete results and computes new features only
when needed. Test first-load time, later-click latency, memory and useful region
quality on representative stills before committing to this model.

Keep accepted mask geometry in the project, not a requirement to rerun inference
when opening it. Record lightweight model/revision and generation-frame metadata
for machine proposals. Retiming preserves the accepted shape; generating a new
proposal is explicit. A model change must not silently alter saved quotations.
Weights/runtime belong to the application cache rather than each project ZIP.

A later model experiment would start with user-guided selection. Whole-image
automatic proposals can be evaluated only if useful. Manual rectangles remain
the baseline. Larger SAM-family models are possible alternatives, not current
dependencies or promised quality upgrades.

## Implementation sequence and review checks

The agreed three slices are implemented:

1. Introduce stable source/quotation/view references and linked range players.
   Create, trim, hover-preview and reopen a clip without new video assets;
   default to a detected shot, while preserving manual range freedom.
2. Add manual rectangular region quotations plus a small shared coding/memo/
   retrieval layer. Exercise whole video, whole clip and nested segment coding; retime a still
   without moving its region or losing codes. Retrieve across both media forms.
3. Extend ZIP roundtrips and CSV exports for the actual analysis data, including
   duplicate views, overlapping ranges and code renaming. ZIP is the editable
   recovery format; CSV is a tabular analysis export.

Include microanimation feedback in each interaction slice. Review rapid repeated
drag/dock/undock gestures, precise scrubbing and region edits, keyboard/touch
access, and reduced motion; interrupting an animation must leave correct geometry.

Session Undo retains up to **30** edits, including frame asset references, region
geometry and quotation/code changes. It does not persist an audit history.
Removing a view preserves its quotation; deleting a quotation is a separate
explicit action. Deleting a frame quotation also deletes its image regions;
temporal children retain absolute ranges if their parent quotation is deleted.

Segmentation is deferred from this sequence. If revisited as a separate small
experiment, check local inference, bounded memory, cancellation on retiming,
saved masks independent of model availability, and responsive board gestures.

Keep checks focused on these behaviors and existing storage/interaction risks.
Use one small complete iteration at a time. Transcripts, semantic/AI coding,
automatic object tracking through video, code hierarchies, collaboration, intercoder statistics,
full audit histories, spectrograms, source-player A/B loop controls and timeline
zoom remain later options requiring their own use case. Avoid choosing a full
qualitative-analysis suite architecture before the first source-linked coding
loop is useful.

## Decision history — 4 November 2026

- Started as a minimal local-first Video Board, drawing useful patterns from
  SortBoard/Folder Sort/Collab Sort while focusing on player controls and linked
  stills. TypeScript first; broader language/runtime choice left open.
- Daniel requested modular synchronized scrubbers, then compact grey magnetic
  modules with group movement, detaching and independent resizing. This
  superseded the initial green Folder Sort aesthetic.
- Daniel requested a small suite and test run, superseding the original no-tests
  prototype instruction. The development notes preserve the initial and expanded results.
- Linked clips were discussed as source-referencing, muted hover-playing cards,
  with no copied video data. Detected shots became the preferred default extent.
- Compared local frame comparison, FFmpeg and learned detection. After also
  considering the codec/export opportunities of FFmpeg, Daniel explicitly chose
  the TypeScript port of scdet; that choice is implemented.
- Daniel accepted the free-quotation model and clarified the scopes: whole video,
  whole clip, and subsegments of either. Clips are player views of source ranges.
- Daniel corrected the proposed freeze-after-coding rule: a still remains
  retimeable and its region stays in the same image-relative place. This
  supersedes the earlier freezing/new-still suggestion.
- Daniel asked about browser-local segmentation for still regions, then asked
  to keep the accumulated discussion in one maintained project spec.
- Daniel then chose simple manual regions for the first version: draw, move and
  resize a rectangle, keeping the agreed retiming behavior. Browser segmentation
  research is retained as a deferred option rather than a current milestone.
- Daniel requested polished microanimations with tldraw as the interaction
  reference. Motion should communicate manipulation and relationships; concrete
  timings and effects remain proposals to tune in the prototype.
- Daniel then requested implementation of the complete agreed spec in goal mode.
  The three slices and motion pass are implemented; segmentation and the other
  explicitly deferred features remain outside this prototype. Current checks,
  controls, storage migration and practical limits are recorded in the development notes.
- Daniel requested a 10× performance improvement. Repeated dock-graph work and
  offscreen rendering were the measured bottlenecks. Cached graph/module work,
  view/connector culling and smaller repeated rendering work are implemented;
  the development notes record before/after results and their workload limits. Browser
  checks cover offscreen playback, evidence and full-board export/restore.
- Daniel requested a test suite, minimal public README and a first semantic
  version, then explicitly chose a public GitHub repository and GitHub Pages.
  Keep **0.0.1** visibly experimental: a possible future video-analysis workbench.
  The existing 30 unit/storage checks and 10 real-media browser workflows form
  the release suite; GitHub Actions runs them before deploying the tested build
  from `main`. Detailed implementation/evidence/recovery notes moved intact from
  the growing README to `docs/DEVELOPMENT.md`; this spec remains the single plan.
