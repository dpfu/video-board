import { defineConfig, devices } from '@playwright/test';
import { testAppURL, testViewport } from './e2e/test-settings';

// A separate origin and disposable contexts protect the working board on 5193.
// Exercise the same repository subpath used by GitHub Pages, including workers.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  outputDir: 'tmp/playwright/results',
  reporter: [['list'], ['html', { outputFolder: 'tmp/playwright/report', open: 'never' }]],
  use: {
    baseURL: testAppURL,
    viewport: testViewport,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: testViewport },
    },
  ],
  webServer: {
    command:
      'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4193 --strictPort --base /video-board/',
    url: testAppURL,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
