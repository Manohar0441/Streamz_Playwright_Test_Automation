// Smoke tests: the handful of checks you'd run right after a deploy to
// answer "is this thing even up?" before spending time on the full suite.
// Deliberately small and fast - a few API pings plus one UI check, nothing
// that goes deep into edge cases.
//
// Run just this file:  npm run test:smoke   (or  npx playwright test --project=smoke)

const { test, expect } = require('../fixtures');

test('the health endpoint responds', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect((await res.json()).status).toBe('ok');
});

test('the catalog has titles in it', async ({ request }) => {
  const res = await request.get('/api/content');
  expect(res.status()).toBe(200);
  expect((await res.json()).count).toBeGreaterThan(0);
});

test('the demo account can log in', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { email: 'qa@streamz.test', password: 'Test@123' },
  });
  expect(res.status()).toBe(200);
  expect((await res.json()).token).toBeTruthy();
});

test.describe('logged out', () => {
  // Everything else in this file rides the default auto-login. This one
  // check specifically wants to land on the login screen, so it opts out.
  test.use({ autoLogin: false });

  test('the login page actually renders', async ({ page }) => {
    // The fixture already navigated to '/' for us (see tests/fixtures.js),
    // and the server redirects an unauthenticated '/' to /login.html.
    await expect(page).toHaveURL(/login\.html/);
    await expect(page.getByTestId('login-form')).toBeVisible();
  });
});
