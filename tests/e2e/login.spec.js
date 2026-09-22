// E2E: the login screen, driven the way an actual user would - typing into
// fields and clicking a button, not calling the API directly. This is the
// top of the test pyramid here; everything below this level has already
// proven the API works, so this file is only about whether the UI wires up
// to that API correctly (right redirects, right error messages, right
// guard on protected pages).
//
// Locators use getByTestId / getByRole rather than CSS selectors - they're
// less likely to break if someone reshuffles a class name later, and they
// read closer to how a user would describe the element.
//
// This whole file needs to start logged OUT (it's testing the login
// screen itself), so it turns off the fixture's normal auto-login.
//
// Run just this file:  npm run test:e2e   (or  npx playwright test --project=e2e)

const { test, expect } = require('../fixtures');

test.use({ autoLogin: false });

const QA = { email: 'qa@streamz.test', password: 'Test@123' };

test('valid credentials log you in and land you on the browse page', async ({ page }) => {
  await page.goto('/login.html');

  await page.getByTestId('email').fill(QA.email);
  await page.getByTestId('password').fill(QA.password);
  await page.getByTestId('submit').click();

  await expect(page).toHaveURL(/\/browse\.html$/);
  await expect(page.getByTestId('catalog-grid')).toBeVisible();
});

test('a wrong password shows an error banner and keeps you on the login page', async ({ page }) => {
  await page.goto('/login.html');

  await page.getByTestId('email').fill(QA.email);
  await page.getByTestId('password').fill('wrong-password');
  await page.getByTestId('submit').click();

  await expect(page.getByTestId('login-error')).toBeVisible();
  await expect(page).toHaveURL(/\/login\.html$/); // should NOT have navigated away
});

test('visiting a protected page while logged out bounces you to login', async ({ page }) => {
  await page.goto('/browse.html');
  await expect(page).toHaveURL(/\/login\.html/);
});
