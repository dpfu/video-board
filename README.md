# Video Board

A small, local-first experiment for exploring short videos on a spatial board.
The first iteration focuses on mouse scrubbing and **linked stills**: independent
images whose source video and frame timestamp remain editable.

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

- **15 Vitest checks:** group movement, detaching, independent resizing, docking
  on four sides and at different zoom levels, legacy v1 migration, persistence
  and atomic rollback after a simulated storage failure.
- **3 Chromium workflows:** real-media import and analysis; synchronized resized
  scrubbers and exact linked-still recapture; magnetic group interactions, Undo
  and reload; ZIP roundtrip, rejected incomplete backups and offscreen PNG export.

The versioned [synthetic fixture](e2e/fixtures/README.md) contains no private media.
Browser workflows use the actual decoder, workers and IndexedDB. The unit storage
checks use `fake-indexeddb`. Disposable reports, downloads and failure traces go
under ignored `tmp/playwright/`; open the HTML report with
`npx playwright show-report tmp/playwright/report`.

Verified on **bugglzwerg, 4 November 2026**: `npm run check` passed all 18 checks
and the production build. The browser portion took about 11 seconds. An initial
runner viewport mismatch was fixed; application code needed no changes.
Automated coverage currently targets Chromium with VP9/Opus, not a codec/browser
compatibility matrix.

## Current: modular graphite interface · 4 November 2026

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

Automatic cut detection and a cut-marker module remain future experiments.
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
a demonstrated computational bottleneck. Automatic cut suggestions, scene ranges,
range loops and timeline zoom remain later experiments.

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
