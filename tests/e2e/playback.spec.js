// E2E: the media player itself. Play/pause, an unavailable title showing
// its error state, and resume-after-reload - the three player behaviours
// most worth checking with a real browser rather than an API call, since
// they're driven by client-side JS reacting to clicks and to time passing.
//
// The fixture (tests/fixtures.js) logs in before each test here, so these
// just navigate straight to a player URL.
//
// A note on the play/pause locator: the control bar's button has
// data-testid="play-pause", and that's what these tests click - NOT
// getByRole('button', { name: 'Play' }). The reason is that when a title
// has no saved progress yet, the player also shows a big centered "start
// watching" overlay button, and that one is *also* labelled "Play" for
// accessibility. Two elements with the same accessible name makes the role
// locator ambiguous (Playwright would refuse to click, "strict mode
// violation"), so the test id is the one unambiguous way to hit the
// control-bar button specifically, in every player state.
//
// Run just this file:  npm run test:e2e   (or  npx playwright test --project=e2e)

const { test, expect } = require('../fixtures');

test('clicking play then pause toggles the player state both ways', async ({ page }) => {
  await page.goto('/player.html?id=tt-100');

  // Wait for the title to finish loading before touching any controls -
  // otherwise the first click can land before the player is ready for it.
  await expect(page.getByTestId('player')).not.toHaveAttribute('data-state', 'loading');

  await page.getByTestId('play-pause').click();
  await expect(page.getByTestId('player')).toHaveAttribute('data-state', 'playing');

  await page.getByTestId('play-pause').click();
  await expect(page.getByTestId('player')).toHaveAttribute('data-state', 'paused');
});

test('opening a title with expired rights shows the error overlay instead of playing', async ({ page }) => {
  // tt-900 is seeded as unavailable specifically for this case.
  await page.goto('/player.html?id=tt-900');

  await expect(page.getByTestId('player')).toHaveAttribute('data-state', 'error');
  await expect(page.getByTestId('error-overlay')).toBeVisible();
});

test('reloading the player resumes close to where playback left off', async ({ page }) => {
  await page.goto('/player.html?id=tt-101');
  await expect(page.getByTestId('player')).not.toHaveAttribute('data-state', 'loading');

  // Start playing and let the simulated clock run for a few seconds so
  // there's an actual position worth resuming from.
  await page.getByTestId('play-pause').click();
  await expect(page.getByTestId('player')).toHaveAttribute('data-state', 'playing');
  await page.waitForFunction(() => window.__player.currentTime > 4);
  const positionBeforeReload = await page.evaluate(() => window.__player.currentTime);

  // Progress gets saved on pagehide and read back in on the next load, so
  // a plain reload is enough to exercise the whole save/restore path.
  await page.reload();
  await page.waitForFunction(() => window.__player && window.__player.getState().titleId === 'tt-101');
  const positionAfterReload = await page.evaluate(() => window.__player.currentTime);

  expect(positionAfterReload).toBeGreaterThan(0);
  // "close to" rather than exact - some time passes between grabbing the
  // before-reload value and the save actually firing, so a tight equality
  // check here would be flaky.
  expect(Math.abs(positionAfterReload - positionBeforeReload)).toBeLessThan(8);
});
