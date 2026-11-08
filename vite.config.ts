import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Git checkouts identify the source for the deployed build. Downloaded source
// archives also build without Git, and link back to the public repository.
const repository = 'https://github.com/dpfu/video-board';
const root = fileURLToPath(new URL('.', import.meta.url));
const revision = existsSync(new URL('./.git', import.meta.url))
  ? execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  : '';
const source = revision ? `${repository}/tree/${revision}` : repository;
const archive = `${repository}/archive/${revision || 'refs/heads/main'}.zip`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'licenses-and-source',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'licenses/video-board-GPL-3.0.txt',
          source: readFileSync(new URL('./LICENSE', import.meta.url), 'utf8'),
        });
        this.emitFile({
          type: 'asset',
          fileName: 'licenses/index.html',
          source: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Video Board — license and source</title>
  <style>
    body { font: 15px/1.6 system-ui, sans-serif; max-width: 48rem; margin: 3rem auto; padding: 0 1rem; color: #eeeef0; background: #292b2e; }
    a { color: #cbd7e5; } pre { white-space: pre-wrap; font: inherit; }
  </style>
</head>
<body>
  <h1>Video Board — license and source</h1>
  <p><a href="${source}">Source for this build</a> · <a href="${archive}">Download source ZIP</a></p>
  <p>Build with Node.js 24 or newer: <code>npm ci</code>, then <code>npm run build</code>.
    See the source README and development notes for running and testing a modified copy.</p>
  <p><a href="video-board-GPL-3.0.txt">GNU General Public License, version 3</a></p>
  <pre>${readFileSync(new URL('./NOTICE', import.meta.url), 'utf8')}</pre>
  <ul>
    <li><a href="video-board-MIT.txt">Preserved original MIT notice</a></li>
    <li><a href="ffmpeg/NOTICE.txt">FFmpeg scdet notice</a>, <a href="ffmpeg/COPYING.LGPLv2.1">LGPL license</a>, <a href="ffmpeg/scdet.ts">port source</a></li>
    <li><a href="ffmpeg-wasm/NOTICE.txt">FFmpeg/Wasm notice</a> and <a href="ffmpeg-wasm/MIT.txt">wrapper license</a></li>
  </ul>
</body>
</html>
`,
        });
        this.emitFile({
          type: 'asset',
          fileName: 'licenses/ffmpeg/scdet.ts',
          source: readFileSync(new URL('./src/scdet.ts', import.meta.url), 'utf8'),
        });
      },
    },
  ],
  base: './',
  worker: { format: 'es' },
  server: { watch: { ignored: ['**/tmp/**'] } },
});
