# Video Board

An early experimental build of what could become a **local-first workbench for
qualitative video analysis**.

[Try it on GitHub Pages](https://dpfu.github.io/video-board/)
· [Experimental v0.0.2](https://github.com/dpfu/video-board/releases/tag/v0.0.2)
· [Changelog](CHANGELOG.md)

Arrange videos, clips and linked stills on a spatial board. Scrub synchronized
thumbnail, audio and shot-detection tracks; mark segments and rectangular image
regions; add codes and memos; retrieve quotations and export PNG, CSV or a
restorable project ZIP. Clip views share the original video data.

Gather quotations into spatial groups, write a memo, and turn a group into a
code. Live code collections follow its assignments while keeping your arrangement.

Videos and analysis stay in your browser. This prototype is still changing;
use ZIP backups for work you want to keep. Storage is specific to the site's
origin and browser profile. Currently tested in Chromium.

## Run locally

With Node.js 24 or newer:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5193/>. Use a project ZIP to transfer a board between the
local and hosted versions.

## Tests

```sh
npm run test:e2e:install # Install Chromium once
npm run check           # Formatting, unit/storage tests, build, browser tests
```

The suite has **116 Vitest checks and 38 Playwright workflows**, using generated
media and disposable browser storage. GitHub Actions runs it on pushes and pull
requests; passing builds of `main` deploy to Pages. `npm run benchmark` measures
board interactions separately.

See the [working spec](SPEC.md) and [development notes](docs/DEVELOPMENT.md) for
behavior, verification, performance measurements and limitations.

Application: [MIT](LICENSE). The TypeScript port of FFmpeg's `scdet` scorer:
[LGPL-2.1-or-later](public/licenses/ffmpeg/COPYING.LGPLv2.1), with its
[source notice](public/licenses/ffmpeg/NOTICE.txt). It does not add FFmpeg codecs.
