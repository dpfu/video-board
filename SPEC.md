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
| Synchronized Frames/Audio scrubbers, waveform and thumbnail analysis | Implemented. |
| TypeScript port of FFmpeg scdet, cached threshold, dockable Cuts module | Implemented and compared with native references; see README and `src/scdet.ts`. |
| PNG board export, local persistence, atomic ZIP backup/restore | Implemented. |
| Linked clip cards with muted hover preview and editable ranges | Agreed direction; not implemented. |
| Free quotations, whole-video/clip/subsegment coding, region coding, memos and retrieval | Agreed conceptual model; not implemented. |
| Browser segmentation for proposing still regions | Requested exploration; documented candidate below, no model selected or integrated. |

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
current model uses a video card ID as its media reference and has no quotation
layer. Introducing quotations must separate their identity from their board
views without losing existing media IDs, still times, geometry or backups.

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

Proposed minimal rule: code assignments are explicit. Coding a whole clip does
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
- Begin with adjustable rectangles. For masks, the consistent proposed behavior
  is to keep the mask geometry through retiming too; offer an explicit
  re-segmentation action rather than silently generating a different shape.
- Retiming invalidates cached image embeddings and pending model requests for
  the previous frame. It does not invalidate the existing quotation's geometry.

Source ID, frame time/range and geometry provide the traceable evidence anchor.
Preserve access to the full frame and surrounding video. Keep explicit edits
undoable; simple created/updated metadata is sufficient initially. A full
revision-history or multi-coder audit system has not been requested.

### Minimal coding and retrieval interface

Proposed first implementation:

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
- Extend project ZIP metadata to include quotations, codes and notes. Add a plain
  CSV export containing stable quotation/source references, times or frame/region
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

Performance proposals to validate in the prototype: reuse one hover-preview
player across inactive clip cards; show cached posters elsewhere; load on demand;
use a brief hover-intent delay to avoid activation while crossing the board.
Suspend hover during board gestures, cancel obsolete requests and avoid layout
shifts/blank flashes. Do not save the transient hover playhead as an edit to the
source or quotation. The exact delay, explicit/pinned playback controls and
sound-on behavior remain open.

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
This is an exploration result, not an accepted model choice or completed feature.

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

Proposed KISS interaction: choose **Select object**, click a region, refine the
candidate with include/exclude clicks or a box, then accept it as a free region
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

Start with user-guided selection. Whole-image automatic region proposals can be
evaluated later if useful; generating every possible object on every still is
not the first milestone. Rectangles remain a usable alternative when the model
is unavailable or proposes an unsuitable shape. Larger SAM-family models are
possible alternatives, not current dependencies or promised quality upgrades.

## Proposed implementation sequence and review checks

1. Introduce stable source/quotation/view references and linked range players.
   Create, trim, hover-preview and reopen a clip without new video assets;
   default to a detected shot, while preserving manual range freedom.
2. Add manual region quotations plus a small shared coding/memo/retrieval layer.
   Exercise whole video, whole clip and nested segment coding; retime a still
   without moving its region or losing codes. Retrieve across both media forms.
3. Extend ZIP and CSV roundtrips for the actual analysis data, including duplicate
   views, overlapping ranges and code renaming. Keep context links usable.
4. Try segmentation as an optional region-selection aid on a small set of stills.
   Confirm entirely local inference, bounded memory, cancellation on retiming,
   saved masks independent of model availability, and responsive board gestures.

Keep checks focused on these behaviors and existing storage/interaction risks.
This sequence is a proposal for the next iterations, not an instruction to build
all four steps immediately. Transcripts, semantic/AI coding, automatic object
tracking through video, code hierarchies, collaboration, intercoder statistics,
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
  to keep the accumulated discussion in one maintained project spec. No model
  integration or new coding implementation has been requested in this last step.
