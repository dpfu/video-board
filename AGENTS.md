# Video Board

Small exploratory prototype, started with Daniel on 4 November 2026.
Keep changes focused on player interaction and linked stills; iterate in the
browser with him. Daniel requested a small automated suite on 4 November 2026,
superseding the initial no-tests prototype instruction. Use focused Vitest
behavior/storage checks and real-media Playwright workflows. Run `npm run check`.
Browser tests use their own origin on port 4193 and fresh contexts; never point
them at Daniel's working board on port 5193 or use private research media.
Source, styles, tests and build scripts use pinned Prettier formatting:
`npm run format`; `npm run check` includes its verification. Do not reformat the
pinned LGPL port or generated fixtures; `.prettierignore` preserves them.

`App.tsx` composes the focused controllers in `src/app/`; put behavior in its
existing owner and keep the shell/module views concerned with rendering.
`useActions` keeps fixed controller action names stable while reading current
dependencies. Preserve the memoized media boundary when adding camera/status UI.
See `docs/DEVELOPMENT.md` for ownership and verification evidence.

Keep Daniel's product discussion and decisions in `SPEC.md` as the single working
spec. Update it when the discussion changes an agreement, preserve superseded
decisions briefly with their rationale, and distinguish implemented behavior,
accepted direction and proposals. Keep README minimal; detailed run/verification,
performance and recovery evidence lives in `docs/DEVELOPMENT.md`. Link the spec
rather than starting parallel plan files. In particular, coded still
regions remain retimeable with geometry fixed relative to the image; the earlier
freeze-after-coding suggestion was rejected by Daniel.
Region selection starts with manual rectangles; model segmentation is deferred.
Daniel prioritized the browser workflow without LLMs on 8 November 2026;
Electron/model integration is deferred. The optional FFmpeg/Wasm experiment
starts with explicit clip downloads; keep normal playback, capture and the
TypeScript shot detector independent of it. See the current plan in `SPEC.md`.
Daniel added live code collections and provisional spatial groups on 6 November
2026. Keep their members as shared quotation references, promotion explicit and
undoable, and schema v4 migration/backup coverage intact. See `SPEC.md`.

Preserve local-first behavior and the separate `video-board` IndexedDB database.
Use the compact graphite/grey modular design requested by Daniel, with Lucide
icons. The earlier green Folder Sort palette is superseded. Do not change Folder Sort as
part of this experiment. Research media and private data must not enter Git.
Keep disposable QA clips, screenshots and other intermediates in ignored `tmp/`.
The generated, nonprivate regression fixture in `e2e/fixtures/` is versioned;
it must stay reproducible without private media or external downloads.

Daniel authorized a public GitHub repository and GitHub Pages on 4 November
2026. The publication target is `dpfu/video-board`; use it as the single `origin`.
GitHub Pages serves the tested `dist/` from `main`; PR checks must not deploy.
The first published version is `0.0.1`, tagged `v0.0.1`, explicitly experimental.
Keep the first prototype's implementation choices simple;
rewriting application logic in Rust/Wasm remains a future option. Daniel chose a
TypeScript port of FFmpeg's scdet on 4 November 2026. Keep the port in `src/scdet.ts` under its upstream
LGPL-2.1-or-later terms, with the pinned revision, notices, license text and
build-emitted source intact. Daniel chose GPL-3.0-only for the application/UI on
8 November 2026 to share under ELAN's terms when learning from its code. Retain
the original MIT notice and separate third-party terms; keep the hosted source
and license links intact. ELAN source, tools and reference probes stay outside
this Git directory and UNIverse. This port adds cut
scoring, not FFmpeg codecs. Keep its native-reference fixtures and real-media
browser checks; never regenerate expected scores with the port itself.
