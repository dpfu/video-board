# Video Board

Small exploratory prototype, started with Daniel on 4 November 2026.
Keep changes focused on player interaction and linked stills; iterate in the
browser with him. Daniel requested a small automated suite on 4 November 2026,
superseding the initial no-tests prototype instruction. Use focused Vitest
behavior/storage checks and real-media Playwright workflows. Run `npm run check`.
Browser tests use their own origin on port 4193 and fresh contexts; never point
them at Daniel's working board on port 5193 or use private research media.

Keep Daniel's product discussion and decisions in `SPEC.md` as the single working
spec. Update it when the discussion changes an agreement, preserve superseded
decisions briefly with their rationale, and distinguish implemented behavior,
accepted direction and proposals. README holds run/verification details; link
the spec rather than starting parallel plan files. In particular, coded still
regions remain retimeable with geometry fixed relative to the image; the earlier
freeze-after-coding suggestion was rejected by Daniel.
Region selection starts with manual rectangles; model segmentation is deferred.

Preserve local-first behavior and the separate `video-board` IndexedDB database.
Use the compact graphite/grey modular design requested by Daniel, with Lucide
icons. The earlier green Folder Sort palette is superseded. Do not change Folder Sort as
part of this experiment. Research media and private data must not enter Git.
Keep disposable QA clips, screenshots and other intermediates in ignored `tmp/`.
The generated, nonprivate regression fixture in `e2e/fixtures/` is versioned;
it must stay reproducible without private media or external downloads.

No deployment or shared remote exists yet. Default future internal/private
hosting is Uni-GitLab; do not create or publish a remote without task context
supporting that step. Keep the first prototype's implementation choices simple;
Rust/Wasm remains a future option. Daniel chose a TypeScript port of FFmpeg's
scdet on 4 November 2026. Keep the port in `src/scdet.ts` under its upstream
LGPL-2.1-or-later terms, with the pinned revision, notices, license text and
build-emitted source intact. The application/UI remain MIT. This port adds cut
scoring, not FFmpeg codecs. Keep its native-reference fixtures and real-media
browser checks; never regenerate expected scores with the port itself.
