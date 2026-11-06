# Video Board — development and verification

A small, local-first experiment for exploring short videos on a spatial board.
The first iteration focuses on mouse scrubbing and **linked stills**: independent
images whose source video and frame timestamp remain editable. The current
prototype also supports source-linked clip views, free quotations, manual image
regions, codes, memos, retrieval, live code collections and provisional spatial
groups.

Product decisions and the evolving plan live in [SPEC.md](../SPEC.md), including
linked clips, free quotations, coding, editable-frame rectangular regions and
deferred segmentation research. This document preserves implemented behavior,
verification, performance evidence and recovery notes. The short
[README](../README.md) is the public entrypoint.

## Run

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5193/>. Keep this address and browser profile stable:
browser storage belongs to that origin. `npm run build` checks TypeScript and
builds the app; `npm run preview` serves that build at the same address.
Reuse an already running preview. Cora's retained local dev server records its
PID and output in ignored `tmp/dev-server.pid` and `tmp/dev-server.log`.

## Checks

The small suite follows Folder Sort and SortBoard's split between Vitest behavior
checks and Playwright browser workflows. Daniel requested it after the initial
prototype's manual verification.

```sh
npm run test:e2e:install # Chromium setup, once after npm ci on a new machine
npm run check           # formatting, unit/storage tests, build, browser workflows
```

For a shorter iteration, use `npm test` or `npm run test:watch`; `npm run test:e2e`
builds and runs just the browser workflows. Browser tests start a separate server
on **4193** and use fresh contexts, leaving the working board on **5193** alone.

- **124 Vitest checks:** group movement, detaching, independent resizing, docking
  on four sides and at different zoom levels, legacy v1 migration, persistence
  and atomic rollback after a simulated storage failure; native FFmpeg score
  parity on 8/10-bit sequences, reusable buffers, geometry changes, 16-bit
  normalization, exact shot boundaries and browser luma preprocessing; retiming
  coded regions, parent trimming, shared media/quotations, CSV and v2 migration;
  deep mixed dock assemblies and viewport/zoom/overscan selection without edits
  to the underlying evidence; immutable Codes panel layout, typed archive shapes,
  byte-identical ZIP roundtrips without IndexedDB, shared frame/asset consistency,
  12,000-deep quotation chains/cycle rejection, worker construction/posting/error/
  progress/abort cleanup and native/fallback playback-clock disposal; v3-to-v4
  migration, live membership/placement, all four manual/live transfer combinations,
  same-space idempotence, promotion/reuse, independent view removal, space docking/
  visibility, stored-membership reconciliation and v1/v2/v3 ZIP migration;
  guarded project phases, pre/post-commit failure handling, serial job ownership,
  cancellation and restart, obsolete progress suppression, preview ownership,
  exclusive editing modes and draft-scoped validity/save callbacks; debounced
  serial save ordering/failure recovery, draining/disposal, transactional URL
  allocation/revocation, exclusive short tasks, Undo's analysis/camera policy,
  cancelled import probes, native playback seek/loop/promise/listener cleanup,
  effect replay and retained seek/playback intent; spatial-index parity at negative,
  cell-edge and oversized coordinates, cached snap/full-scan parity for assemblies
  and collisions across four zoom levels, stable ties and camera overscan bounds.
- **41 Chromium workflows:** real-media import and analysis; synchronized resized
  scrubbers and exact linked-still recapture; magnetic group interactions, Undo
  and reload; ZIP roundtrip, rejected incomplete backups and offscreen PNG export;
  known-cut detection, cached threshold adjustment, shot seeking and older boards;
  muted independent clip loops, precise range edits and explicit all-shot clips;
  compact coding popovers, source/clip/subsegment/frame/region coding, retrieval,
  code renaming, CSV and v3 ZIP validation/reopen; retiming, moving/resizing and
  duplicating coded regions; interrupting settling motion and reduced motion;
  offscreen culling while retaining pinned playback, speed, codes/memos and
  full-board PNG/ZIP export, restore and reload; stable region/range coding
  through transport and shared-view retiming, pending/invalid segment protection,
  case-insensitive code reuse, definition retrieval, action-button keyboard Undo,
  and covered/offscreen evidence/panel reveal; hidden-source clock reset after
  restore, unrelated pointer-event isolation, and editing after a corrupt ZIP;
  group arrangement/movement/resizing, keyboard placement, atomic promotion/Undo,
  native code dragging, assignment/rename updates, mixed clip/region collections,
  closing a still view and recovering its frame/source, fresh v4 ZIP restore and
  PNG, plus bounded rendering/one-preview playback in a 250-quotation collection;
  zoomed/scrolled native transfers and drag-out grouping, decoded PNG content for
  scrolled-out evidence, same-project restore with refreshed covers, and pinned
  preview cleanup after external coding/deletion; failed replacement recovery for
  interrupted analysis/cuts and successful retry of pending backups, file-boundary
  preview shutdown, retained editing context, exclusive drawing/segment modes,
  fresh draft validity and media capture, unfinished rectangle cancellation,
  foreign pointer releases, Escape, blur and lost capture; paused activation by
  inactive-clip scrubbing, edited-boundary playback, shared time-field rejection/
  Escape/retiming, autosave failure and next-edit recovery, and board capture loss;
  held movement with live connectors and bounded React commits, mid-gesture Undo,
  newly exposed evidence before pan release, grid/zoom alignment and immediate
  reset, native-scroll isolation, and backups of the latest live geometry.

The versioned [synthetic fixture](../e2e/fixtures/README.md) contains no private media.
Browser workflows use the actual decoder, workers and IndexedDB. The unit storage
checks use `fake-indexeddb`. Disposable reports, downloads and failure traces go
under ignored `tmp/playwright/`; open the HTML report with
`npx playwright show-report tmp/playwright/report`.
The development watcher excludes `tmp/`: generating HTML reports/traces there
must not reload an active demo or discard its transient selection/draft.

Verified on **bugglzwerg, 7 November 2026** after the interaction-speed pass:
`npm run check` passed formatting, **124 unit/storage checks, 41 Chromium workflows**,
TypeScript and the production build. Reviewed the generated-media coding screenshot;
the camera, fixed controls, linked stills and Codes panel remain aligned. The
12 affected coding/space/continuous-interaction workflows also passed separately.
Production measurements and their limits are recorded in the interaction-speed
section below.

Previously verified on **bugglzwerg, 7 November 2026** after the full application refactor:
`npm run check` passed formatting, **116 unit/storage checks, 38 Chromium workflows**
and the production build. The new inactive-clip scrub/loop workflow also passed
two consecutive repetitions. Reviewed generated-media board screenshots and
completed a separate Strict Mode/two-hot-refresh walkthrough. Production
interaction benchmarks and the small measured CPU overhead are recorded below.

Previously verified on **bugglzwerg, 6 November 2026** after the transition implementation:
`npm run check` passed formatting, **131 checks** and the production build. The
eight new transition workflows also passed two consecutive repetitions. Reports
and generated downloads use the usual ignored `tmp/playwright/` paths.

Previously verified on **bugglzwerg, 6 November 2026** after the test-suite refinement:
`npm run check` passed formatting, **104 checks** and the production build. The
five playback/new-regression workflows also passed two consecutive repetitions.
See the test-refinement section below for the assertions and their limits.

Previously verified on **bugglzwerg, 6 November 2026** after the evidence-space implementation:
`npm run check` passed formatting, **90 checks** and the production build. The
browser portion took about 66 seconds. See the evidence-space section below for
the workflow, manual QA and project-format compatibility.

Previously verified on **bugglzwerg, 5 November 2026** after the code quality pass:
`npm run check` passed formatting, **71 checks** and the production build.
The browser portion took about 54 seconds. See the quality section below for
the substantive refactoring and fixes; all earlier evidence remains historical.

Previously verified on **bugglzwerg, 5 November 2026** after the coding iteration:
`npm run check` passed all **45 checks** and the production build; the browser
portion took about **49 seconds**. A separate generated-media demo on 4393
verified overlapping coding, native memo Undo, trimming/deleting a coded parent
while retaining its child, visible PNG code labels and exact fresh-session ZIP
restore. Its CSV matched all 10 quotations/memos/assignments, and the two original
videos were stored once each with identical bytes. Demo artifacts are ignored
under `tmp/coding-pass-2026-11-05/`; research media and the working browser profile
were not used. See the [spec's coding iteration](../SPEC.md#coding-iteration--5-november-2026)
for implemented changes and remaining proposals.

Previously verified on **bugglzwerg, 4 November 2026** after the performance pass:
`npm run check` passed all **40 checks** and the production build. The browser
portion took about **37 seconds**. The preceding analysis-spec/motion pass
passed 36 checks in about 34 seconds; its visual inspection covered the
clip/coding board, retimed rectangular regions and their PNG exports.
The earlier shot-detector suite passed 28 checks in about 15 seconds; its visual
inspection covered the resized Cuts module and PNG export. The initial
pre-detector suite passed 18 checks in about 11 seconds after correcting a runner
viewport mismatch.
Automated coverage currently targets Chromium with VP9/Opus, not a codec/browser
compatibility matrix.

## Interaction speed · 7 November 2026

Against the completed refactor (`b7cce92`), dragging uses **13.5–14.8× less
JavaScript** and **2.3–3.1× less total main-thread task time** in the measured
120/240/2,400-clip workloads. Panning uses 5.5–9.2× less JavaScript and 1.3–1.6×
less task time. This meets the requested 10× target for dragging's JavaScript
work, not for overall elapsed interaction time or the whole app.

| Clips / gesture | Script ms, before → after | Script reduction | Main-thread task ms, before → after | Elapsed s, before → after | P95 frame ms, before → after |
| --- | --- | --- | --- | --- | --- |
| 120 / pan | 25.67 → 4.63 | 5.5× | 124.7 → 98.9 | 1.485 → 1.690 | 25.1 → 26.9 |
| 120 / drag | 93.35 → 6.90 | 13.5× | 201.6 → 88.5 | 1.527 → 1.507 | 26.6 → 25.9 |
| 240 / pan | 30.22 → 4.52 | 6.7× | 136.9 → 99.0 | 1.518 → 1.644 | 27.0 → 27.0 |
| 240 / drag | 98.99 → 7.10 | 13.9× | 205.4 → 90.1 | 1.546 → 1.506 | 27.0 → 25.6 |
| 2,400 / pan | 49.50 → 5.35 | 9.2× | 153.6 → 97.0 | 1.579 → 1.631 | 26.1 → 27.0 |
| 2,400 / drag | 158.53 → 10.71 | 14.8× | 273.5 → 87.4 | 1.490 → 1.545 | 26.6 → 26.9 |

Protocol: unchanged `scripts/benchmark.mjs`, production builds on bugglzwerg
(Apple M4/macOS arm64), Chromium **147.0.7727.15**, 1440×1000 viewport, reduced
motion, one warm-up plus three measured trials per gesture/size. Use the same
generated four-second video, original docked Frames/Audio tracks, 12-column clip
layout and four shared cover keys; 15 modules remain mounted. A trial sends 60
real pointer moves around an oval and awaits an animation frame after each;
timing includes release and two more frames, including final React publication.
The table reports medians of per-trial CDP `ScriptDuration`/`TaskDuration` deltas,
elapsed time and each trial's P95 frame interval. Tests and benchmarks ran
separately, with no concurrent build/test workload during these measurements.

The frame-paced driver workload remains around 1.5–1.7 seconds; P95 frames do
not improve materially, and pan elapsed time increased **3–14%**. The gain is less
JavaScript/main-thread work per interaction, not a demonstrated elapsed-time or
input-latency speedup. These warm, mostly offscreen synthetic boards do not
measure video decoding, cut detection, cold import, all-cards-visible rendering,
long research recordings or other browsers.

Raw local reports: ignored `tmp/performance/speed-baseline.json` and
`tmp/performance/speed-final.json`. The optimized build was measured before its
commit, so both reports carry parent revision `b7cce92`; bundle identity
distinguishes them. Baseline is `index-N3hlZVaI.js`, SHA-256
`846bd850cffb8496b55c39bb74514508d75e2ddd91441d0e34c89e470b6df829`.
Final is `index-4uoSVXC_.js`, SHA-256
`23b21c2a55ee5998ac593c1a74a8ad31ccc7292c1163bdcf6ef8d8b2382bf915`
(390.07 kB / 123.38 kB gzip, versus 385.03 / 121.66). CSS is
`index-DwBkubLe.css` (35.94 kB / 8.51 kB gzip); the media-worker bundle is unchanged.
Rerun separately from browser tests:

```sh
npm run benchmark -- --sizes 120,240,2400 --runs 3 --steps 60 --output tmp/performance/latest.json
```

The live document ref now receives every pan/move update, while React snapshots
publish on release, a 120 ms input idle, another document command, or a culling
boundary. Autosave keeps its 220 ms debounce after publication; pending older
saves cannot report a newer live edit as saved. File operations finish an active
gesture and read the latest geometry. This changes no project schema or media
identity.

`useViewport` paints the world and dotted grid on compositor layers. It publishes
before the current viewport leaves the last rendered frustum's 100-screen-pixel
margin, inside the existing 200-pixel culling overscan. Evidence becomes available
during a held pan. `MoveView` paints only the moving assembly and affected visible
connectors, then hands geometry back to React on publication. Final connector
paths are restored explicitly when Undo returns React props to their old values.
Only an owned global board move intercepts pointer events before React; native
media, range, region and evidence-tile interactions keep their handlers.

Docking builds static geometry and a spatial grid once per gesture/layout
publication, then queries nearby anchors and potential collisions. Candidate
ordering and the previous narrow-phase rules stay intact; large geometry uses
bounded full-scan fallbacks. Source lookup in `boardBoxes` is indexed once per
call. Resize continues through its existing layout/reflow path.

Regression coverage compares indexed snapping with full scans across four zoom
levels, collisions, assemblies and stable ties. A production React commit counter
observes startup commits, then limits a 40-step held drag to eight root commits
while checking actual card pixels, live connectors, Undo and persisted geometry.
Additional workflows cover held-pan reveal, anchored wheel zoom/grid phase,
same-batch zoom reset and a ZIP captured before pointer release. Focus/native drag
must not scroll the workspace independently of the camera; the workspace uses
`overflow: clip`, while scrollable evidence/coding interiors keep their scrolling.

## Application ownership refactor · 6–7 November 2026

Daniel requested the full application refactor after the focused transition pass.
`App.tsx` is now a 116-line composition, down from 2,098 lines. Controllers own
state and effects; the shell and board modules render their projections.

| Owner | Responsibility |
| --- | --- |
| `src/app/useDocument.ts`, `src/history.ts`, `src/autosave.ts` | Immutable document changes, shared-space reconciliation, 30-entry Undo and debounced serial persistence. Undo retains completed analysis and the current camera. Save status belongs to the latest revision; suspension drains I/O before atomic replacement. |
| `src/assets.ts`, `src/app/useAssets.ts` | Original/derived Blobs and their object URLs. Replacement allocates first, releases partial allocations on failure, and changes generation after storage commit. Retired revision URLs live for one second, then revoke; disposal releases every remaining URL. |
| `src/app/useAnalysis.ts`, `src/jobs.ts` | Serial analysis/cut jobs and progress. Disposal aborts running work, drops queued jobs and silences obsolete callbacks. |
| `src/app/useMedia.ts`, `src/tasks.ts` | Import/probe, track creation and still capture/retiming. Synchronous task ownership rejects duplicate capture/import requests; owner disposal cancels workers and rejects late commits. Original media remain shared. |
| `src/app/useEditing.ts`, `src/app/useEvidence.ts` | Analytical focus, drafts/regions, codes, linked quotation views and evidence-space commands. Visual selection remains separate from analytical editing modes. Actions read the current document and editing state. |
| `src/app/usePreviews.ts`, `src/preview.ts` | Hover delay, exclusive preview ownership, pinning, removal reconciliation and gesture/file boundaries. |
| `src/app/useViewport.ts`, `src/app/useInteraction.ts` | Camera, visible stage size, global pointer/keyboard/wheel listeners, magnetic movement/resizing, hand mode and motion interruption. Capture loss ends an owned board gesture. |
| `src/app/useProjectFiles.ts`, `src/project.ts` | Startup, exclusive file operations, recovery backup, drain/atomic replace/install, failed-open recovery and ignoring results after the file owner is disposed. |
| `src/app/useBoardView.ts`, `src/app/BoardModules.tsx`, `src/app/ModuleFrame.tsx`, `src/app/AppShell.tsx` | Culling/cover requests, memoized module data, shared module frame and shell UI. Camera/name/save/progress are outside the media-data projection. Stable membership sets and action objects preserve the existing fast camera path. |
| `src/lifetime.ts` | Preserve long-lived owners through immediate React effect replay (Strict Mode/hot refresh), and release them after actual unmount. Native player sessions retain position/intent across replay and reset for a new URL. |
| `src/playback.ts`, `src/usePlayback.ts`, `src/useTimecode.ts` | Owned native player listeners/frame observation, deferred/latest coalesced seeks, bounded loops, rate changes, stale play requests and cleanup; shared time-field validation, commit and Escape. |

`src/useActions.ts` gives each controller a fixed set of stable action identities
that call its current dependencies. The renderer receives explicit state props
and stable actions; it needs no hand-maintained dependency list that can omit
new editor state. Source playback alone publishes the shared source clock.
Clips/evidence remain independent views of the original Blob; hover/evidence
playback is muted, and explicit clip pinning keeps its existing audio controls.
Frame-relative coded rectangles remain retimeable.

The regression additions cover save ordering, stale completion, failure/recovery,
project drain/disposal, URL allocation failure and exactly-once release, task
ownership, retained analysis/camera through Undo, cancelled probes, and native
playback metadata/seek/loop/rate/error/disposal. Browser additions use real media
to activate an inactive clip by scrubbing without autoplay, loop edited bounds,
reject/reset invalid fields and retime linked still views, recover after an
injected autosave failure, and continue after losing board pointer capture.
Assertions use decoded source-frame boundaries; arbitrary millisecond targets
are not assumed to identify exact frames.

A production-build comparison used the existing benchmark on bugglzwerg with
120/240 clips, three measured runs after warm-up and 60 pointer steps per
interaction. Both builds used the same generated video, disposable Chromium,
1440×1000 viewport and reduced motion. Baseline is `bc512d7`; the refactor bundle
is `index-N3hlZVaI.js` (385.03 kB / 121.66 kB gzip, versus 374.03 / 117.66).
CSS and media-worker bundles are unchanged.

| Clips / interaction | Main-thread task ms, before → after | P95 frame ms, before → after |
| --- | --- | --- |
| 120 / pan | 125.9 → 133.5 | 26.9 → 25.7 |
| 120 / drag | 178.6 → 204.3 | 26.9 → 27.0 |
| 240 / pan | 116.2 → 128.9 | 27.0 → 26.7 |
| 240 / drag | 197.7 → 206.6 | 25.9 → 27.0 |

These are per-run medians, not per-frame CPU costs. End-to-end interaction medians
remain around 1.5 seconds, with measured task work increasing about 5–14%. This is a
small structural overhead, not a speedup claim; frame timing remains in the same
range and culling/memoization retain the previous fast path. Raw runs are local
ignored `tmp/performance/before-application-refactor.json` and
`tmp/performance/after-application-refactor.json`; the table preserves the result.

A separate disposable Vite/Chromium walkthrough mounted the app under React
Strict Mode, imported generated media and coded a region. Two actual hot refreshes
retained the unsaved time-field draft, source playback and original asset URLs
without navigation. Retiming the coded frame, capturing another still and
persisting a renamed board still worked afterward. No runtime/console errors.
Evidence is local ignored `tmp/refactor/strict-refresh.json` and
`tmp/refactor/strict-refresh-board.png`; the working origin on 5193 was untouched.

The existing `partial` analysis flag remains compatible; richer persisted outcome
reporting is deferred. This refactor changes no schema, dependency, codec support,
FFmpeg scorer/reference or CSS. Tests remain a Chromium/generated-media suite,
not a cross-browser/codec matrix.

## Explicit transitions · 6 November 2026

The source audit found a broken coordination transition: project opening
invalidated the old analysis generation before atomic replacement succeeded.
With a held analysis result and an injected storage failure, the original board
remained editable but retained `pending` analysis, zero jobs and a permanent
"Processing locally" indicator. Reloading resumed the job. The new regression
in `e2e/transitions.spec.ts` reproduces that interleaving and verifies recovery
without reload, for both full analysis and cut-only work.

| Owner | Responsibility |
| --- | --- |
| `src/project.ts` | Startup and exclusive PNG/ZIP/open operations. Restore phases are reading → backup → draining → committing → installing. Invalid phase jumps are ignored. Pre-commit failure restores the prior availability state; post-commit installation failure reports that the saved project needs reopening. |
| `src/jobs.ts` | Deduplicated serial analysis/cut jobs, queued/running snapshots and job-owned progress. Cancellation aborts workers, suppresses late results/progress, and drains outstanding I/O before replacement. Failed opens resume pending work; existing Cuts modules express detection intent on reopen. |
| `src/preview.ts` | Idle, pending hover, hovering and pinned ownership, with typed clip/evidence targets. File work stops ownership; stale elapsed callbacks cannot restore it. Reconciliation releases removed evidence. |
| `src/editing.ts` | Quotation focus, drawing and identified segment drafts. Visual module selection stays separate. Draft validity and completion belong to their draft ID; mode changes reject stale callbacks. Successful project open resets context; rejection preserves it. |
| `src/useMachine.ts` | One transition updates the synchronous handler ref and React view together, keeping delayed callbacks and renders consistent. |
| `src/pointer.ts` | Shared pointer ownership and finish handling for timelines, clip scrubbing, ranges and regions. Escape/blur/lost capture terminate the owned gesture; foreign pointers are ignored. |

The project/asset generation increments only after successful storage commit.
Cancelled old jobs finish before replacement, and restarted jobs have fresh
identities even for the same source. Cover generation therefore retains its old
project on failure and resets on successful replacement. Progress changes keep
the Cuts-membership set stable so they do not rebuild every memoized module.

Unfinished region rectangles are discarded on cancellation. Existing region
movement, module movement and range edits retain their most recently applied
value. Capturing or arranging media preserves an active draft; explicitly
selecting another analytical mode switches context. New draft/quotation editors
are keyed by their identity so invalid text cannot leak into a new selection.

The browser fixture wraps the worker boundary to hold the first actual decoded
result; the next worker decodes normally. A one-shot IndexedDB failure affects
only atomic project replacement. Tests check worker disposal/restart, retained
quotation identities and original bytes, plus successful retry of the same
pending backup. The remaining browser scenarios exercise the actual controls.
All use generated media, fresh contexts and port 4193. This is lifecycle
verification, not a new decoding-performance or codec-coverage claim.

Project schema remains **v4**; no dependency or FFmpeg scorer/reference change.
At that stage smaller cache/input/animation machines retained their existing
implementations except for shared pointer cleanup and editor identity. The later
application refactor above consolidates player/time-field ownership; the persisted
`partial` analysis outcome still covers both incomplete audio and analysis failure,
and richer persisted outcome reporting remains deferred.

## Test refinement · 6 November 2026

The suite now observes decoded preview frames advancing and wrapping to the clip
in-point. This replaces a fixed sleep that could pass without proving a loop.
It retains the existing 100 ms browser-transport tolerance; it does not assert
frame-exact playback. The PNG regression decodes the downloaded file and checks
for the generated fixture's saturated image pixels in upper and lower bands,
including a quotation whose tile is scrolled out of the DOM. This checks image
content without depending on platform fonts or a full-page pixel snapshot.

Native drag tests cover 60% and 130% board zoom with a destination scrolled on
both axes, then dragging out to a new group. They verify pointer placement and
unchanged quotation identities/coding. Same-session ZIP reopen uses identical
quotation/space IDs, checks refreshed exact-frame covers and unchanged original
bytes, and retains arrangements and memos. Removing coding through the shared
popover must release a pinned preview so another quotation can play; deleting a
quotation must leave no stale collection tile or player. Unit/storage checks
cover all four manual/live transfer combinations, duplicate same-space drops,
stored-membership reconciliation, and actual v1/v2/v3 ZIP migration.

All project pages, including fresh restore contexts, share runtime/console and
same-origin HTTP error monitoring. Extra contexts close through fixture cleanup.
Database read/seed helpers reject access outside the configured disposable app
URL on 4193, handle request/transaction failures, and wait for saved state before
reloading seeded metadata. Fixture builders retain the imported generated media.
No application code, dependencies or native FFmpeg reference scores changed.

For focused iteration after a build:

```sh
npx playwright test e2e/space-reliability.spec.ts
npx playwright test e2e/space-reliability.spec.ts --repeat-each=2
```

The complete suite remains `npm run check`. Browser coverage is Chromium with
generated WebM; these regressions do not establish codec coverage, decoding
throughput or a new performance benchmark.

## Evidence spaces · 6 November 2026

One `SpaceCard` model supports two states. A provisional group has explicit
quotation references and relative tile coordinates; a live collection has a
`codeId` and reconciles those references against actual assignments. The pure
helpers in `src/spaces.ts` retain existing positions, place new matches in free
cells, remove deleted evidence, and promote a group atomically. They do not
create quotations or media. A reused code also brings its previous matches into
the promoted group. Closing a space leaves its evidence and codes intact.

- Use **New evidence group**, name it, and **Add evidence** with optional uncoded
  filtering. Codes' quotation rows can also be dragged in. Tile grips arrange
  evidence; arrows nudge one board unit, Shift+arrows ten. A manual-to-manual drag
  moves membership. Dragging from a live collection copies its reference and
  retains coding. Dropping onto empty board space creates a new group.
- **Turn into code** requires a nonempty named group, creates/reuses a name, and
  assigns its code once to all members. Groups have their own memo. Collection
  title edits rename the shared code; its definition and quotation memos stay
  separate. Removing a live tile explicitly removes its code assignment.
- Drag a code onto the board, or use its collection icon. Opening an existing
  collection reveals it. Additional views created by promotion can follow the
  same code independently, with their own memo and arrangement.
- Evidence tiles edit the same quotation through the existing coding popover
  and reveal its source context. Region previews retain the whole frame with
  the selected rectangle outlined. Closing the standalone still view does not
  remove its quotation; its exact preview can be recaptured from the original,
  and source reveal creates a linked still view again.
- Tile virtualization keeps the scroll viewport, selected evidence and pinned
  preview mounted. Covers share the existing 48-image cache and one capture job
  at a time; only one clip/evidence preview is active. Camera motion and module
  geometry do not rebuild assignment indexes. This is bounded rendering, not a
  new decoding-throughput benchmark.
- Project schema **v4** adds `spaces`; v1–v3 migrate without changing their IDs,
  source bytes, region geometry or coding. ZIP validation rejects missing code/
  quotation references, duplicate members and invalid coordinates before storage
  replacement. **v4 backups require this build or later; v0.0.2 cannot read them.**
  CSV still exports quotations/assignments once. PNG paints all members of each
  collection, fitting the complete arrangement inside its frame.

The generated-media demo retained **one source, one clip, one still, one region,
four quotations and one code**, with two live collection views and a collection
memo. Native drag, retiming, removing/recovering a still view, shared preview,
code reuse, fresh-session ZIP restore and byte-identical source recovery passed.
PNG was visually inspected for arrangements, memo, region outlines and code
labels. A separate browser walkthrough verified quotation-list drag, manual
group transfer and drag-out grouping without changing assignments or creating
quotations. No browser/runtime errors were observed. Disposable evidence is in
ignored `tmp/evidence-spaces-2026-11-06/`; automated artifacts use the existing
`tmp/playwright/` paths. All media are generated; the working origin/profile on
5193 was left untouched. No dependency, FFmpeg-port or research-data change.

## Code quality · 5 November 2026

`npm run format` formats source, CSS, tests and build scripts with pinned Prettier;
`npm run format:check` is part of `npm run check` and CI. Markdown, generated
fixtures, lockfiles and the pinned LGPL port are excluded deliberately. This
keeps authored project history and native-reference provenance intact.

The review covered application components, model/layout, analysis/decoding,
persistence/archives, export, tests, fixture/benchmark scripts and build/CI.
The substantive changes are small boundaries rather than a new framework:

- `validation.ts` checks untrusted ZIP data before migration/storage replacement,
  with explicit shape guards, indexed links and iterative cycle detection.
  `archive.ts` owns only ZIP/Blob IO and clear parse errors. Asset keys live in
  the pure model, so archive tests need neither IndexedDB nor a FileReader mock.
- Layout boxes are copies for every module kind, including Codes panels. A
  frozen-snapshot regression reproduces the previous mutation that broke Undo.
- Media requests/replies carry explicit task tags. Each job releases its worker
  and AbortSignal listener on success, decoding/transport errors, failed posting
  and cancellation. Source and clip players share one disposable frame-clock
  implementation; seek RAF state is reset on cleanup.
- Opening a project resets the separate playback clock, including hidden source
  players. File operations hold the board inert and block global editing keys;
  asynchronous captures/save errors recheck the current generation/snapshot.
  Gesture variants encode their required fields; secondary pointer release or
  cancellation cannot finish the current gesture.

Vitest **5.0.3** is a focused development-dependency patch for the upstream
[manual-mock registration](https://github.com/vitest-dev/vitest/security/advisories/GHSA-qxg6-89mg-rqv8)
and [redirect allowlist](https://github.com/vitest-dev/vitest/security/advisories/GHSA-xp26-3454-mjgp)
advisories. `npm audit` reports zero known vulnerabilities after the patch.
Production dependencies, schema v3 and the FFmpeg source/license files are
unchanged. Chromium coverage is not a general browser/codec compatibility claim.
The earlier generated H.264/AAC + silent portrait coding demo restored exactly
in a separate production-preview context, retaining all 10 quotations and 3
codes. Its appearance and PNG export were checked with no console/runtime
errors. Local QA evidence is ignored under `tmp/code-quality-2026-11-05/`.

## Board performance · 4 November 2026

Daniel requested a **10× performance improvement**. Against the preceding
`c08fff4` build, the measured 240-clip pan/drag workloads improve **31–32× in
elapsed time**. At 120 clips, elapsed time improves **3.7–3.9×**; Chromium's
recorded main-thread task time improves **28–42×**. These measurements cover
board interaction, not video decoding or scene-detection throughput.

| Clips | Gesture | Elapsed before → after | Speedup | Main-thread task time before → after | Task-time reduction |
| --- | --- | --- | --- | --- | --- |
| 120 | Pan | 5.60 s → 1.51 s | 3.7× | 4,828 ms → 114 ms | 42.3× |
| 120 | Drag docked player/Frames/Audio | 6.07 s → 1.55 s | 3.9× | 4,931 ms → 178 ms | 27.8× |
| 240 | Pan | 47.70 s → 1.55 s | 30.8× | 47,308 ms → 118 ms | 399.9× |
| 240 | Drag docked player/Frames/Audio | 49.02 s → 1.53 s | 32.1× | 48,686 ms → 189 ms | 257.1× |

Protocol: **Apple M4**, macOS arm64, headless **Chromium 147.0.7727.15**,
production builds, 1440×1000 viewport and reduced motion. Each board has one
actual [synthetic source](../e2e/fixtures/README.md), its two original docked
scrubbers, and 120 or 240 distinct range quotations/clip views arranged in a
12-column grid. The clip views share the original video and four starting-frame
cover keys. Import/analysis and visible covers finish before timing. Each
gesture has one warm-up trial and three measured trials; the table reports
medians. A trial sends 60 real pointer moves around a small oval returning to
the starting position, awaiting an animation frame after each move. Elapsed
time includes those frame waits and browser-driver overhead; task time is the
delta of Chromium's `Performance.getMetrics` `TaskDuration`. This is a warm,
mostly offscreen board workload, not a long-video, cold-import or all-cards-
visible benchmark. Browser, hardware, layout and visible content affect gains.

The main bottleneck was rebuilding the dock graph for every card, including
offscreen cards, on every pointer update. The implementation now resolves dock
roots/groups once per board-layout change, reuses module elements during pure
camera updates and uses indexed source/quotation lookups. It renders still,
track and clip views plus their connectors only inside the viewport with
**200 screen pixels** of overscan. In these runs, mounted modules fall from
123/243 to **15**. Source players and Codes panels remain mounted; moving,
selected, focused and active-preview views also stay alive. Clip playback speed
is saved with its view so culling/reopening cannot reset it.

Cover selection is a linear scan with deduplication; unchanged cards skip
motion DOM queries and waveform geometry is reused during playback. These
changes do not remove board objects or copy media. PNG/ZIP export still reads
the complete board model, including offscreen quotations and assets.

Rerun independently of Daniel's working browser:

```sh
npm run benchmark -- --output tmp/performance/latest.json --sizes 120,240 --runs 3 --steps 60
```

[scripts/benchmark.mjs](../scripts/benchmark.mjs) starts its own production server
on **4193** and uses a disposable browser. Keep that port free and run it
separately from browser tests/builds. Raw baseline, intermediate and final
reports are retained locally under ignored `tmp/performance/`; this section
preserves the protocol and measured results. Reports record individual trials,
median task/script/layout time, frame intervals, browser and bundle identity.
The measured baseline bundle was `index-CbnMUxWt.js` (SHA-256
`ce6f2cda075e04c85bf2e30b09be4806833e3d6c64ced7be50968bc136840b80`);
the optimized bundle was `index-GG5xCu3a.js` (SHA-256
`11d43fb4acd8a6d598d24313a55c67071b307755751b85a9bb144e0a25200fb5`).

## Linked analysis and motion · 4 November 2026

This implements the three prototype slices in [SPEC.md](../SPEC.md). Browser model
segmentation and the other explicitly deferred features remain future work.

- **Create clip at playhead** in the source header creates a player view of the
  detected shot. While detection is absent, it falls back to up to three seconds.
  **Create clips from all shots** is an explicit batch action; automatic analysis
  itself adds no cards. Clip creation/trim never encodes or copies video files.
- Hover a clip's image for a **muted loop**; leaving returns to its cover. Its
  playhead is independent of the source player's. Explicit **Play clip**, or its
  small scrub bar, pins playback so it remains available when leaving the image.
  Pause, playback speed and explicit unmute are available. **Stop clip preview**
  or Escape releases it. One clip playback element is active at a time.
- Clip **in/out timecodes and handles** edit its source range. Final endpoints
  use known source frame timestamps; browser playback/scrubbing itself remains
  time-based. A source-link button reveals the original at the clip's current
  time. Clip cards move, dock, undock and resize like the other modules.
- **Duplicate clip view** and **Duplicate still view** create another display of
  the same quotation, sharing codes/memo and image assets. They do not create a
  second coded occurrence. New selections can overlap freely, even at identical
  coordinates. Frames/Audio/Cuts modules remain views of the original timeline;
  each clip also has its own compact scrub control.
- **Code whole video**, **Code clip**, and **Code still** open a compact assignment
  popover with search/create, multiple code toggles and a memo. The toolbar's
  **Open codes and quotations** opens a movable/resizable/dockable module for
  codes, quotation inspection, retrieval and the source catalog. Names stay
  visible with colours; definitions and renamed codes keep stable IDs.
- **Select video segment** or **Select segment in clip** opens an in/out editor.
  **Save free quotation** retains the selection without requiring a code or card.
  Assign codes/memos there; **Place clip view** displays that quotation on the
  board. Quotations can also be edited directly in the inspector. All timestamps
  are absolute in the original source. Trimming a whole clip changes that clip's
  coded extent while its subsegments retain their own boundaries and source
  context, even when they fall outside the newly trimmed parent.
- **Draw region** on a still enters rectangle mode; Escape exits. Drag a region
  to move it, or its corner handles to resize it. Enter selects a focused region;
  arrows move it, Alt+arrows resize it and Shift makes larger steps. Regions are
  free quotations and can overlap. Image coordinates exclude letterboxing.
  Retiming a still updates all its regions and duplicate views while preserving
  geometry, quotation IDs, codes and memos. There is no automatic object tracking.
- Code retrieval lists each quotation once across all sources. Revealing a result
  selects its frame/region or seeks its source; placing a clip view is explicit.
  Search/filtering does not rearrange the board or duplicate evidence.
- Removing a clip/still **view** keeps its quotation. **Hide source player** keeps
  the original and linked data; Sources/retrieval can reveal it again. **Delete
  quotation** is separate: deleting a frame also deletes its regions; temporal
  children of a deleted range keep their source boundaries. Session **Undo**
  retains 30 edits, including frame retiming and the prior cached image. It is
  not a durable revision history.

Motion uses 120ms control transitions, 180ms settling, 200ms card appearance and
brief source highlights. Magnetic previews mark the candidate edge before
release; dragging/resizing/scrubbing remain attached to input. Grabbing a module
during settling preserves its visible position. `prefers-reduced-motion` removes
the movement and transitions while retaining selection/focus feedback. Motion
state is transient and never changes exported or stored geometry.

Inactive clips use covers captured from the actual starting frame. A single
cancellable worker queue captures visible **320px** covers after a 100ms quiet
period; up to **48** shared images are cached. Hover intent is 120ms. Inactive
clip cards have no video decoder, and obsolete cover requests are terminated on
retiming. Covers regenerate after reload and are not added to project backups.
The board benchmark above covers 120/240 clip views of one synthetic source;
representative research media and cross-browser benchmarks remain to be done.
Native browser looping can have a short seek seam at its boundary.

Schema **v3** saves quotations, codes, memos, clip views and the Codes module.
v1/v2 projects migrate without replacing media IDs or still positions/times.
For compatibility, the `videos` catalog retains the stable original asset ID and
primary player geometry; quotation IDs and additional view IDs are independent.
Still retiming creates a new image asset reference shared by its views, keeping
the prior image available for session Undo. ZIP files include only currently
referenced assets, with each original/image asset stored once, and validate all
quotation/source/code/parent/geometry references before atomic replacement.

**Export quotations as CSV** writes uncoded and coded evidence with stable source
and quotation IDs, absolute seconds, normalized image fractions, titles, codes,
definitions, memos and created/updated timestamps. There is one row per code
assignment, or one blank-code row for uncoded material. ZIP is the editable
restore format. PNG includes source-linked clips, regions/code labels and a
codes legend at the saved board geometry; inactive clip frames are captured on
demand during export. PNG remains a presentation image.

## Current: local shot detection · 4 November 2026

Daniel chose to port FFmpeg's **scdet** scorer to TypeScript, keeping native
browser decoding through Mediabunny/WebCodecs. There is no FFmpeg binary/Wasm
dependency and this change does not extend the browser's codec support.

- New imports automatically scan consecutive frames in the analysis worker.
  The same sequential decode supplies frame timestamps and twelve thumbnails.
  Analysis uses 160px-wide canvases converted to 8-bit luma; only the previous
  luma plane and numeric scores/timestamps are retained, with no extra video file.
- Use the player's **scissors icon / Add cuts scrubber** to add a compact,
  dockable **Cuts** module. On an older video without cached detection, this
  performs the scan once without replacing its original, thumbnails or waveform.
- Each segment is a proposed shot. Click it to seek its source to the shot's
  first frame. The active range follows the shared playhead. Frames, Audio and
  the player's position bar also show cut markers.
- **Threshold** defaults to FFmpeg's 10; lower values find more cuts. Adjustment
  uses cached scores immediately, starting no decoder worker. Duplicate Cuts
  modules share their source's threshold. Their minimum height keeps the controls
  accessible while resizing.
- Scores, threshold and Cuts geometry persist through reload and v2 ZIP backups.
  PNG export includes the shot strip. Old v1/v2 projects without scene metadata
  still open normally.

The scorer preserves FFmpeg's mean absolute frame difference, change-of-difference
rule, `2^bitDepth` normalization and inclusive threshold. For identical sample
planes, tests compare every score and decision against native FFmpeg 8.1.2.
Browser downscaling and RGB-to-luma conversion are separate preprocessing, so
results need not equal FFmpeg run directly on the original YUV pixels.

These are visual **shot** proposals, not semantic scene labels. Gradual transitions,
similar-looking cuts, flashes and rapid edits can be missed or misclassified.
There is no extra adaptive filter or minimum-shot suppression layered onto this
port. `shotRanges`/`shotAt` expose source-linked, end-exclusive ranges for the
clip-card implementation above. Manual clip ranges can cross cuts; detector
boundaries themselves are still controlled by the cached threshold. Full scanning
adds decode work, while playback and frame captures remain independent of its worker.

### Port provenance and license

The numeric core in [src/scdet.ts](../src/scdet.ts) is a modified port of
`get_scene_score` and the scalar SAD loop from FFmpeg **n8.1.2**, revision
`38b88335f99e76ed89ff3c93f877fdefce736c13`. That file retains **LGPL-2.1-or-later**;
the original Video Board application, preprocessing and UI remain **MIT**.
The [notice](../public/licenses/ffmpeg/NOTICE.txt) links both upstream source files
and describes the modifications. The production build ships the LGPL text,
notice and complete port source under `licenses/ffmpeg/`; the repository contains
the build configuration and lockfile needed to rebuild it with a modified port.

The [native reference fixtures](../tests/fixtures/README.md) are generated with
FFmpeg, and the [browser fixture](../e2e/fixtures/README.md) has four known cuts.
Regeneration requires native FFmpeg; ordinary checks use the committed fixtures.

## Modular graphite interface · 4 November 2026

Daniel requested compact, tactile grey modules that magnetically dock and can
still be resized independently. The interface now uses shallow bevels, 28px
headers and small controls. This replaces the initial green workspace design.

- The **player**, **Frames** scrubber, **Audio** scrubber and each linked still are
  separate modules. Newly imported videos start with both scrubbers docked below.
- Drag an ordinary header to move its whole docked group. Pull the small dotted
  **grip** to detach and move just that module. **Undock module** releases a module
  with one click; its former neighbours remain in place. Alt-dragging a header
  also releases just that module. Hold Shift while dragging to suppress magnets.
- Bring a module or group near another module's top, bottom, left or right edge.
  A preview marks the destination; release to dock. Snap distance is measured in
  screen pixels so it feels consistent at different board zoom levels. Docking
  avoids overlapping other modules.
- Resize any module using its corner. Attached neighbours follow the resized
  edge, retaining their own widths and heights. A wide detached scrubber still
  represents the same full video duration and controls the original player.
- The player toolbar adds more Frames/Audio modules. A scrubber's duplicate
  button creates another independent view of that source. All views share one
  playhead; spatial docking is separate from which video a module controls.
- PNG export includes every module at its actual board position and size.
  ZIP backups retain module geometry and dock connections. Schema **v2** imports
  old v1 ZIPs and automatically turns their embedded tracks into docked modules.
  Existing video/still asset IDs and still timestamps are preserved.

This modular pass preceded the shot detector described above.
Timeline resizing currently changes the visual precision over the full duration;
it does not introduce a separately zoomed time interval.

Interactive verification covered v1 browser-state migration, moving a group from
the player and a scrubber header, pulling out and releasing the Audio module,
resizing it from 440px to about 796px, mouse scrubbing at its new size, redocking
it below Frames, resizing Frames with Audio following, docking a still to a
player, duplicated synchronized Audio views, playback, PNG export, ZIP reopening
and reload. Restored widths, heights and dock targets matched the saved v2 ZIP;
its original video matched the source bytes. The final browser console had no
errors. The production/TypeScript build passed. This interactive pass preceded
the automated suite documented above.

### Pre-migration recovery

Host **bugglzwerg**, source: the v1 board saved at `http://127.0.0.1:5193/` before
the modular update. Verified byte-identical export and ZIP integrity on
4 November 2026, containing one video and two linked stills:

`~/.local/share/cora-backups/video-board/2026-11-04-before-modular-ui.videoboard.zip`

Open this file using **Open project backup** to recover its content (the current
app converts its layout to modules). For the original application and embedded
layout, use a separate checkout of commit `e2c091b`, start it on the same local
address after stopping the current server, and open that ZIP. Do not overwrite a
working checkout or clear browser storage to perform recovery. This pinned
host-local copy is not an off-device backup.

## Historical first prototype · 4 November 2026

- Drop local video files anywhere on the board, or use **Add video**.
- Each video has its own playback, sound, speed and whole-video loop controls.
- Scrub by clicking or dragging the thumbnail strip or waveform. Both use one
  playhead. Scrubbing pauses playback and leaves the video at the selected time.
  The two tracks can be hidden independently.
- **Capture still** creates a linked image card. Edit its `mm:ss.mmm` label or
  use the previous/next frame buttons to adjust its time. Once frame metadata is
  available these buttons follow source timestamps, including variable timing.
- **Jump to video**, or double-click a still, seeks its source player. Each still
  retains its own time when the source video plays or another still is adjusted.
- Move video cards by their headers; stills can also be moved by their images.
  Resize with the bottom-right corner. Drag the empty board to pan; use the hand
  tool, Space-drag, trackpad scroll, pinch or zoom buttons as needed. **Fit board**
  brings all cards into view. Removal has one-step Undo.
- Originals, generated stills, thumbnails, waveform data, positions, sizes and
  camera view persist locally. The header reports whether the latest save has
  completed. No video is uploaded and there is no account or backend.
- **Export board as PNG** paints the entire arrangement, including offscreen
  cards, source names, timecodes, links and enabled timeline tracks. It pauses
  videos and uses their current displayed images. Export is bounded to an 8192px
  edge and 12 megapixels; player buttons are omitted from the exported image.
- **Download project backup** saves an editable ZIP including original files.
  **Open project backup** restores it atomically. Opening another project first
  downloads a recovery ZIP of the current nonempty board.

## Implementation

React + TypeScript + Vite; Lucide icons; IndexedDB through `idb`; JSZip for portable
projects. Mediabunny **1.65.1** reads containers and uses WebCodecs for decoding.
Metadata inspection, thumbnail/waveform analysis and individual frame captures
run in dedicated workers. Analysis jobs run sequentially; captures use their own
worker so they do not wait for a thumbnail batch. Decoders are disposed after use.

A linked still stores its source ID, actual decoded frame timestamp and frame
duration, alongside its PNG. Frame-boundary lookup accounts for the sub-microsecond
rounding of the browser player's `currentTime`. Waveforms combine channel peaks
and are scaled for visual navigation; they are not a calibrated audio measurement.

The language choice remains open for later work. Rust/Wasm can be considered for
a demonstrated computational bottleneck. The later TypeScript cut detector is
documented above. Linked clips, range loops and editable quotation boundaries are
now implemented; timeline zoom remains a later experiment.

### Reused from Folder Sort

Source: [/Users/daniel/Projects/FolderSort](/Users/daniel/Projects/FolderSort),
inspected read-only on 4 November 2026. Its existing working changes were preserved.

- `src/design-system.css`: workspace palette, focus colors, control radii and
  Lucide stroke conventions; adapted into `src/style.css`.
- `src/UiActions.tsx`: labelled icon-button pattern; adapted into `src/Icons.tsx`.
- `src/libraryDatabase.ts`: IndexedDB and transaction-abort pattern; adapted into
  `src/store.ts` with the separate database **video-board**.
- `src/download.ts`: download helper, with the filename fallback updated.
- `src/boardExport.ts`: model-based full-board export and canvas size limits;
  adapted to videos and linked stills in `src/export.ts`.

The minimal board and timeline are specific to this experiment. Folder sorting,
stashes, collaboration and content-similarity infrastructure were not copied.

## Verification and boundaries

The initial prototype followed Daniel's no-tests brief; the later suite is
documented under **Checks** above. Its initial `npm run build` passed.
Interactive checks in the ChatGPT in-app browser covered import, playback/pause, thumbnail and waveform
scrubbing, timecode editing, frame stepping, source seeking, independent stills,
card dragging/resizing, track toggles, fit/zoom, reload, PNG export and ZIP reopen.
Three generated clips exercised H.264/AAC landscape video, silent portrait video
and changing audio amplitude. A three-video/two-still ZIP contained all 41 expected
media assets; the three originals matched their source files byte for byte.
After restoration all three videos loaded and decoded; a subsequent reload kept
the revised card geometry and still timestamps. Browser console showed no errors.

This is a desktop prototype, checked in the in-app browser on bugglzwerg. Other browsers and codecs have not been
validated; available decoding depends on the browser/device. Browser storage can
be cleared, so use ZIP backups for work that should survive that. Deleted media
are retained in the local database for this prototype; exporting and reopening a
ZIP carries only the assets referenced by the board.

Source code stays outside UNIverse. Daniel selected public publication on
4 November 2026: [dpfu/video-board](https://github.com/dpfu/video-board), with
[GitHub Pages](https://dpfu.github.io/video-board/) as the app's deployment target.
This supersedes the earlier local-only status and default future Uni-GitLab
destination. Disposable QA media, downloads and screenshots belong in ignored
`tmp/`; the generated regression fixtures under `e2e/fixtures/` are versioned
deliberately. Research media stays in browser storage and project backups.

## Experimental release and CI

The latest tagged application release is **0.0.2**, tagged **v0.0.2**, also an
experimental GitHub prerelease. The [changelog](../CHANGELOG.md) records the coding
and reliability changes since 0.0.1. Its release checks cover formatting, the
production build, **53 Vitest checks and 18 Chromium workflows**.

The first published application version is **0.0.1**, tagged **v0.0.1** and
marked as an experimental GitHub prerelease. Version numbers describe the app;
both tagged releases use project schema **v3**. The current development build
uses schema **v4**, documented above and under **Unreleased** in the changelog.

The [Checks and Pages workflow](../.github/workflows/checks-and-pages.yml) installs
the lockfile dependencies and Chromium, then runs `npm run check` on Node.js 24
and Ubuntu for pushes to `main` and pull requests. It retains the browser report
and failure traces for seven days. Only a successful `main` build uploads its
tested `dist/` and deploys it to the `github-pages` environment. Pull requests
run checks without deploying. The browser suite serves the app under
`/video-board/` to exercise the same asset/worker paths as Pages. There is no
backend or video upload endpoint.

GitHub Pages and localhost have separate browser storage. To move a local board
to the hosted app, download its project ZIP locally and open it on Pages. Keep
the working localhost origin/profile intact; CI uses disposable contexts on
4193. All earlier implementation decisions and measured results above remain
historical evidence rather than compatibility guarantees.

Project context: [SortBoard dossier experiment register](</Users/daniel/UNIverse/41 WIP/41.018 klagenfurt vibe coding/experiments/README.md>).
