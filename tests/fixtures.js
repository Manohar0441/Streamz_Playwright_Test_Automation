// Shared test setup, imported by every spec in this folder instead of
// '@playwright/test' directly. Two things live here:
//
//   1. An `autoLogin` fixture that signs in through the real login page
//      before each test body runs. Most tests want to start already
//      logged in (that's the common case for browse/player/API tests),
//      so this is on by default. The couple of specs that specifically
//      test the login screen itself turn it off with:
//        test.use({ autoLogin: false });
//
//   2. An afterEach hook that grabs a full-page screenshot no matter how
//      the test ends, so the HTML report always has something to look at
//      even for a test that only used the `request` fixture and never
//      touched the page on purpose.
//
// Every file under tests/ should do `const { test, expect } = require('../fixtures')`
// (adjust the relative path for nested folders) rather than pulling straight
// from '@playwright/test' - otherwise you lose the auto-login behaviour.

const base = require('@playwright/test');

const QA_EMAIL = 'qa@streamz.test';
const QA_PASSWORD = 'Test@123';

const test = base.test.extend({
  // "option" fixtures are the way Playwright lets a test file override a
  // default with test.use(). true here just means "logged in unless told
  // otherwise".
  autoLogin: [true, { option: true }],

  // Auto-used fixture - nobody has to ask for `_landing` in their test
  // signature, it just runs. Its whole job is making sure there's a real
  // page loaded before the test body starts, either the browse screen
  // (logged in) or the login screen (logged out).
  _landing: [
    async ({ page, autoLogin }, use) => {
      if (autoLogin) {
        await page.goto('/login.html');
        await page.getByTestId('email').fill(QA_EMAIL);
        await page.getByTestId('password').fill(QA_PASSWORD);
        await page.getByTestId('submit').click();
        // waitForURL rather than a fixed wait - the redirect only happens
        // after the login POST resolves, and that shouldn't take long but
        // we don't want a flaky test if the machine running this is slow.
        await page.waitForURL(/\/browse\.html$/);
      } else {
        await page.goto('/'); // server bounces unauthenticated '/' to login.html
      }
      await use(undefined);
    },
    { auto: true },
  ],
});

// Belt and suspenders: playwright.config.js already sets screenshot: 'on',
// but attaching one explicitly here gives it a predictable name in the
// report and means it still shows up even if someone flips that config
// setting off later without noticing this depends on it.
test.afterEach(async ({ page }, testInfo) => {
  try {
    const png = await page.screenshot({ fullPage: true });
    await testInfo.attach('final-state', { body: png, contentType: 'image/png' });
  } catch {
    // page can already be closed by the time afterEach runs (e.g. a test
    // that navigates away and the context tears down) - not worth failing
    // the test over a missing screenshot.
  }
});

module.exports = { test, expect: base.expect };
