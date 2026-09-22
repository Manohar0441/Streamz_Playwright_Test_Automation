// @ts-check
//
// Playwright config for the Streamz test suite. Every test level - unit,
// api, integration, smoke, e2e - runs on the Playwright Test runner as its
// own "project", which is just Playwright's word for a named group of tests
// that can share (or override) settings. That's what lets you do either:
//
//   npx playwright test                     -> everything
//   npx playwright test --project=api       -> just the API tests
//
// See the bottom of this file for the project list, and tests/README.md for
// what each level actually covers.

const { defineConfig, devices } = require('@playwright/test');

// 3100 rather than the more obvious 3000 - just to sidestep the classic
// "something else on this machine is already on port 3000" problem.
const baseURL = process.env.BASE_URL || 'http://localhost:3100';

// When BASE_URL isn't set we're running locally, so Playwright should boot
// the app itself (see webServer below). In CI/Docker, BASE_URL points at an
// already-running container and we skip that step entirely.
const startAppLocally = !process.env.BASE_URL;

module.exports = defineConfig({
  testDir: './tests',

  // The app keeps its state (login tokens, resume positions) in a plain
  // in-memory Map - there's no database isolating one test's writes from
  // another's. Running in parallel would mean two tests racing to log in
  // or racing to save progress on the same title, so this suite trades
  // speed for not having to think about that: one worker, tests run in
  // the order they're defined.
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['./tests/artifact-reporter.js'],
  ],

  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    screenshot: 'on',           // capture one for every test, pass or fail
    video: 'retain-on-failure', // videos are heavy, only keep them when something broke
    trace: 'on',

    // Handy when you want to actually watch a headed run instead of it
    // flashing by: SLOWMO=500 npm run test:e2e:headed
    launchOptions: { slowMo: Number(process.env.SLOWMO) || 0 },
  },

  projects: [
    { name: 'unit', testDir: './tests/unit' },
    { name: 'api', testDir: './tests/api' },
    { name: 'integration', testDir: './tests/integration' },
    { name: 'smoke', testDir: './tests/smoke' },

    // E2E is the one level where the browser engine actually matters, so it
    // gets all three. `e2e` on its own stays Chromium so `--project=e2e`
    // does what you'd expect; the other two are opt-in.
    { name: 'e2e', testDir: './tests/e2e', use: { ...devices['Desktop Chrome'] } },
    { name: 'e2e-firefox', testDir: './tests/e2e', use: { ...devices['Desktop Firefox'] } },
    { name: 'e2e-webkit', testDir: './tests/e2e', use: { ...devices['Desktop Safari'] } },
  ],

  webServer: startAppLocally
    ? {
        command: 'node server.js',
        url: baseURL,
        timeout: 30_000,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
