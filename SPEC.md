# Video Board — working specification

Updated **4 November 2026**, from the discussion with Daniel. This is the single
home for product decisions, proposed behavior and open questions. Update it as
the discussion develops; preserve corrections and their rationale. The
[README](README.md) records how to run the app, implemented behavior, verification,
port provenance and recovery instructions. Use the status labels below when
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
- No account, cloud processing or research-media upload is needed. Source code
  remains in this local checkout outside UNIverse; the
  [dossier register](</Users/daniel/UNIverse/41 WIP/41.018 klagenfurt vibe coding/experiments/README.md>)
  points here. No deployment or shared remote has been created.
- Keep scope small. The original no-tests brief was superseded by Daniel's
  request for a focused suite. See [checks](README.md#checks); browser checks use
  disposable contexts on 4193, separate from the working board on 5193.

## Current state

| Area | Status |
| --- | --- |
| Local video import, source players, linked stills, frame adjustment | Implemented; see README and `src/VideoPlayer.tsx`, `src/Still.tsx`. |
| Compact grey modules, docking/undocking, group movement, independent resizing | Implemented. |
| Microanimations and tactile interaction feedback, with tldraw as reference | Implemented: pickup/drop, edge previews, settling, linked creation/reveal cues, controls/chips/popovers and reduced motion. |
| Synchronized Frames/Audio scrubbers, waveform and thumbnail analysis | Implemented. |
| TypeScript port of FFmpeg scdet, cached threshold, dockable Cuts module | Implemented and compared with native references; see README and `src/scdet.ts`. |
| PNG board export, local persistence, atomic ZIP backup/restore | Implemented. |
| Linked clip cards with muted hover preview and editable ranges | Implemented: shot default, independent scrub/playback, shared source data, duplicate views and explicit all-shots action. |
| Free quotations, whole-video/clip/subsegment coding, region coding, memos and retrieval | Implemented: flat codes, compact assignment popovers, dockable Codes/Quotations/Sources module, ZIP restore and CSV export. |
| Still-region selection | Implemented: manual, movable/resizable rectangles; retiming preserves geometry, identity, codes and memo across views. |
| Board performance | Implemented: cached dock index/module rendering, viewport culling and bounded covers. Measured 31–32× faster pan/drag elapsed time on a 240-clip synthetic board; full protocol and smaller-board limits in README. |
| Browser segmentation for proposing still regions | Deferred by Daniel for the first version; research retained below. |

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
The [README](README.md#board-performance--4-november-2026) preserves the benchmark
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

Implemented scope and evidence are in the [README](README.md#current-local-shot-detection--4-november-2026).
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
  prototype instruction. The README preserves the initial and expanded results.
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
  controls, storage migration and practical limits are recorded in the README.
- Daniel requested a 10× performance improvement. Repeated dock-graph work and
  offscreen rendering were the measured bottlenecks. Cached graph/module work,
  view/connector culling and smaller repeated rendering work are implemented;
  the README records before/after results and their workload limits. Browser
  checks cover offscreen playback, evidence and full-board export/restore.
