# Video Board

A small, local-first experiment for exploring short videos on a spatial board.
The first iteration focuses on mouse scrubbing and **linked stills**: independent
images whose source video and frame timestamp remain editable.

Product decisions and the evolving plan live in [SPEC.md](SPEC.md), including
linked clips, free quotations, coding, editable-frame regions and the browser
segmentation option. This README records implemented behavior and verification.

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
npm run check           # unit/storage tests, TypeScript build, browser workflows
```

For a shorter iteration, use `npm test` or `npm run test:watch`; `npm run test:e2e`
builds and runs just the browser workflows. Browser tests start a separate server
on **4193** and use fresh contexts, leaving the working board on **5193** alone.

- **23 Vitest checks:** group movement, detaching, independent resizing, docking
  on four sides and at different zoom levels, legacy v1 migration, persistence
  and atomic rollback after a simulated storage failure; native FFmpeg score
  parity on 8/10-bit sequences, reusable buffers, geometry changes, 16-bit
  normalization, exact shot boundaries and browser luma preprocessing.
- **5 Chromium workflows:** real-media import and analysis; synchronized resized
  scrubbers and exact linked-still recapture; magnetic group interactions, Undo
  and reload; ZIP roundtrip, rejected incomplete backups and offscreen PNG export;
  known-cut detection, cached threshold adjustment, shot seeking and older boards.

The versioned [synthetic fixture](e2e/fixtures/README.md) contains no private media.
Browser workflows use the actual decoder, workers and IndexedDB. The unit storage
checks use `fake-indexeddb`. Disposable reports, downloads and failure traces go
under ignored `tmp/playwright/`; open the HTML report with
`npx playwright show-report tmp/playwright/report`.

Verified on **bugglzwerg, 4 November 2026** after adding shot detection:
`npm run check` passed all **28 checks** and the production build. The browser
portion took about 15 seconds. Visual inspection covered the resized Cuts module
and its PNG export. The initial pre-detector suite had passed 18 checks in about
11 seconds after correcting a runner viewport mismatch.
Automated coverage currently targets Chromium with VP9/Opus, not a codec/browser
compatibility matrix.

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
port. `shotRanges`/`shotAt` expose source-linked, end-exclusive ranges for the next
clip-card iteration; hover-playing clip cards and editable manual boundaries are
not implemented yet. Full scanning adds decode work, while playback and frame
captures remain independent of its worker.

### Port provenance and license

The numeric core in [src/scdet.ts](src/scdet.ts) is a modified port of
`get_scene_score` and the scalar SAD loop from FFmpeg **n8.1.2**, revision
`38b88335f99e76ed89ff3c93f877fdefce736c13`. That file retains **LGPL-2.1-or-later**;
the original Video Board application, preprocessing and UI remain **MIT**.
The [notice](public/licenses/ffmpeg/NOTICE.txt) links both upstream source files
and describes the modifications. The production build ships the LGPL text,
notice and complete port source under `licenses/ffmpeg/`; the repository contains
the build configuration and lockfile needed to rebuild it with a modified port.

The [native reference fixtures](tests/fixtures/README.md) are generated with
FFmpeg, and the [browser fixture](e2e/fixtures/README.md) has four known cuts.
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
documented above. Linked clip cards, range loops, manual boundary editing and
timeline zoom remain later experiments.

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

Source code stays outside UNIverse. This checkout is local, with no shared remote
or deployment created. The default destination for a future private/internal
remote is Uni-GitLab; publication or a different destination remains a separate
choice. Disposable QA media, downloads and screenshots belong in ignored `tmp/`;
the generated regression fixture under `e2e/fixtures/` is versioned deliberately.

Project context: [SortBoard dossier experiment register](</Users/daniel/UNIverse/41 WIP/41.018 klagenfurt vibe coding/experiments/README.md>).
