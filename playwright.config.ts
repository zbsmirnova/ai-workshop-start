import { defineConfig } from '@playwright/test';

// Deterministic by construction: pinned Chromium (scripts/e2e-browser.sh), fixed viewport, fixed
// fonts, the fixture staged at a fixed path with fixed mtimes (e2e/global-setup.ts), rendering
// flags that disable device-dependent text rasterization. Baselines live in e2e/screenshots and
// are made on Linux (this repo's cloud workspace), the same platform as CI.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  outputDir: './test-results',
  snapshotPathTemplate: '{testDir}/screenshots/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: { maxDiffPixels: 0, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: 'http://localhost:4174',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    video: 'on',
    launchOptions: {
      executablePath: process.env.CHROMIUM_BIN ?? '/opt/browsers/chrome-linux/chrome',
      args: [
        '--no-sandbox',
        '--force-color-profile=srgb',
        '--disable-lcd-text',
        '--font-render-hinting=none',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
      ],
    },
  },
  webServer: {
    command: 'node e2e/server.ts',
    url: 'http://localhost:4174',
    reuseExistingServer: false,
    stdout: 'ignore',
  },
});
