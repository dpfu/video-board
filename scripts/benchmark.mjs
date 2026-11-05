import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

// Production app, real synthetic media, separate origin and disposable browser.
const args = process.argv.slice(2);
const option = (key, fallback) => (args.includes(key) ? args[args.indexOf(key) + 1] : fallback);
const sizes = option('--sizes', '120,240').split(',').map(Number);
const runs = Number(option('--runs', '3')),
  steps = Number(option('--steps', '60'));
if (
  !sizes.length ||
  [...sizes, runs, steps].some((value) => !Number.isSafeInteger(value) || value < 1)
)
  throw new Error('Sizes, runs and steps must be positive integers.');
const output = resolve(option('--output', 'tmp/performance/latest.json'));
const origin = 'http://127.0.0.1:4193';
const bundleFile = (await readFile('dist/index.html', 'utf8')).match(/src="\.\/([^\"]+)"/)[1];
const bundleHash = createHash('sha256')
  .update(await readFile(resolve('dist', bundleFile)))
  .digest('hex');
const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4193',
    '--strictPort',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverError = '';
server.stderr.on('data', (data) => {
  serverError += data;
});
let browser;
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const frames = (page) =>
  page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
try {
  browser = await chromium.launch();
  const report = {
    revision,
    bundleFile,
    bundleHash,
    browser: browser.version(),
    platform: process.platform,
    arch: process.arch,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: true,
    runs,
    steps,
    results: [],
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error(serverError || 'Benchmark server could not start');
    try {
      if ((await fetch(origin)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (attempt === 99) throw new Error('Benchmark server did not become ready');
  }
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') console.log(message.text());
    });
    page.on('crash', () => console.log('Benchmark page crashed'));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) console.log(`Benchmark page: ${size} clips · ${frame.url()}`);
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Add videos', exact: true }).waitFor();
    await page.waitForFunction(
      () => !document.querySelector('button[aria-label="Add videos"]').disabled,
    );
    await page
      .locator('input[type=file][accept^="video/"]')
      .setInputFiles(resolve('e2e/fixtures/synthetic.webm'));
    await page.locator('.waveform path').waitFor();
    await page.getByText('Saved locally', { exact: true }).waitFor();
    await page.evaluate(async (size) => {
      const request = indexedDB.open('video-board', 1),
        db = await new Promise((resolve) => {
          request.onsuccess = () => resolve(request.result);
        });
      const tx = db.transaction('boards', 'readwrite'),
        store = tx.objectStore('boards'),
        read = store.get('current');
      read.onsuccess = () => {
        const board = read.result,
          source = board.videos[0],
          stamp = '2026-11-04T00:00:00.000Z';
        for (let i = 0; i < size; i++) {
          const start = (i % 4) * 0.75,
            id = `bench-quote-${i}`;
          board.quotations.push({
            id,
            sourceId: source.id,
            parentId: `source-${source.id}`,
            kind: 'range',
            start,
            end: start + 0.5,
            title: `Clip ${i + 1}`,
            memo: '',
            codeIds: [],
            createdAt: stamp,
            updatedAt: stamp,
          });
          board.clips.push({
            id: `bench-clip-${i}`,
            videoId: source.id,
            quotationId: id,
            time: start,
            x: 600 + (i % 12) * 370,
            y: 70 + Math.floor(i / 12) * 350,
            width: 340,
            z: i + 5,
          });
        }
        store.put(board, 'current');
      };
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, size);
    await page.reload();
    await page.locator('.clip-card').first().waitFor();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.clip-card')]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > 0 && r.left < innerWidth && r.bottom > 48 && r.top < innerHeight;
          })
          .every((el) => el.querySelector('[data-cover-ready=true]')),
      undefined,
      { timeout: 90_000 },
    );
    await frames(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metric = async () =>
      Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
      );
    const timings = { pan: [], drag: [] };
    for (const kind of ['pan', 'drag']) {
      for (let run = -1; run < runs; run++) {
        const x = kind === 'pan' ? 30 : 205,
          y = kind === 'pan' ? 900 : 132;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await frames(page);
        const before = await metric(),
          started = performance.now();
        await page.evaluate(() => {
          const intervals = [];
          let previous = performance.now(),
            active = true;
          const tick = (now) => {
            if (!active) return;
            intervals.push(now - previous);
            previous = now;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
          window.__finishBenchmarkFrames = () => {
            active = false;
            return intervals;
          };
        });
        for (let step = 1; step <= steps; step++) {
          const angle = (step / steps) * 2 * Math.PI;
          await page.mouse.move(x + Math.sin(angle) * 18, y + (Math.cos(angle) - 1) * 10);
          await page.evaluate(() => new Promise(requestAnimationFrame));
        }
        await page.mouse.up();
        await frames(page);
        const elapsedMs = performance.now() - started,
          after = await metric();
        const intervals = await page.evaluate(() => window.__finishBenchmarkFrames());
        if (run >= 0) {
          const row = {
            elapsedMs,
            taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
            scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
            layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
            p95FrameMs: [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length * 0.95)],
          };
          timings[kind].push(row);
          console.log(JSON.stringify({ clips: size, kind, run: run + 1, ...row }));
        }
      }
    }
    if (errors.length) throw new Error(errors.join('\n'));
    const result = {
      clips: size,
      renderedModules: await page.locator('.board-card').count(),
      timings,
      median: Object.fromEntries(
        Object.entries(timings).map(([kind, rows]) => [
          kind,
          Object.fromEntries(
            Object.keys(rows[0]).map((key) => [key, median(rows.map((row) => row[key]))]),
          ),
        ]),
      ),
    };
    report.results.push(result);
    console.log(JSON.stringify({ summary: { clips: size, ...result.median } }));
    await context.close();
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved ${output}`);
} finally {
  try {
    await browser?.close();
  } finally {
    server.kill('SIGTERM');
  }
}
