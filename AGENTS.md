# Video Board

Small exploratory prototype, started with Daniel on 4 November 2026.
Keep changes focused on player interaction and linked stills; iterate in the
browser with him. No test suite is requested at this stage. Run the TypeScript /
production build and check changed interactions directly in the browser.

Preserve local-first behavior and the separate `video-board` IndexedDB database.
Use Folder Sort's palette and Lucide conventions. Do not change Folder Sort as
part of this experiment. Research media and private data must not enter Git.
Keep QA clips, screenshots and other disposable material in ignored `tmp/`.

No deployment or shared remote exists yet. Default future internal/private
hosting is Uni-GitLab; do not create or publish a remote without task context
supporting that step. Keep the first prototype's implementation choices simple;
Rust/Wasm and automatic cut detection are open future options.
