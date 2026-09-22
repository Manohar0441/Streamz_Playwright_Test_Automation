// API tests for the auth endpoints: POST /api/auth/login, POST /api/auth/logout,
// and GET /api/profile (which is really just a "is my token still good?"
// check, but it's the easiest place to prove a token works or doesn't).
//
// These use Playwright's built-in `request` fixture instead of raw fetch()
// or a library like axios - it already knows the config's baseURL, and
// every call it makes shows up in the trace viewer, which is handy when a
// test fails and you want to see exactly what was sent.
//
// Run just this file:  npm run test:api   (or  npx playwright test --project=api)

const { test, expect } = require('../fixtures');

const VALID_LOGIN = { email: 'qa@streamz.test', password: 'Test@123' };

test('logging in with the right email/password returns a token and the user', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: VALID_LOGIN });

  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.token).toBeTruthy();
  expect(body.user.email).toBe(VALID_LOGIN.email);
  expect(body.user.password).toBeUndefined(); // password must never round-trip back to the client
});

test('logging in without a password returns 400 MISSING_FIELDS', async ({ request }) => {
  const res = await request.post('/api/auth/login', { data: { email: VALID_LOGIN.email } });

  expect(res.status()).toBe(400);
  expect((await res.json()).error.code).toBe('MISSING_FIELDS');
});

test('logging in with the wrong password returns 401 INVALID_CREDENTIALS', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { email: VALID_LOGIN.email, password: 'definitely-not-it' },
  });

  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe('INVALID_CREDENTIALS');
});

test('hitting a protected route with no Authorization header returns 401', async ({ request }) => {
  const res = await request.get('/api/profile');
  expect(res.status()).toBe(401);
});

test('a made-up bearer token is rejected just the same as a missing one', async ({ request }) => {
  const res = await request.get('/api/profile', {
    headers: { Authorization: 'Bearer this-token-does-not-exist' },
  });
  expect(res.status()).toBe(401);
});

test('a token from a real login is accepted', async ({ request }) => {
  const login = await (await request.post('/api/auth/login', { data: VALID_LOGIN })).json();

  const res = await request.get('/api/profile', {
    headers: { Authorization: `Bearer ${login.token}` },
  });

  expect(res.status()).toBe(200);
  expect((await res.json()).user.email).toBe(VALID_LOGIN.email);
});

test('logging out invalidates the token - reusing it afterwards fails', async ({ request }) => {
  const login = await (await request.post('/api/auth/login', { data: VALID_LOGIN })).json();
  const token = login.token;

  const logoutRes = await request.post('/api/auth/logout', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(logoutRes.status()).toBe(200);

  // Same token, same header, sent again right after logout - should now be
  // just as invalid as a token that was never real.
  const reuseRes = await request.get('/api/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(reuseRes.status()).toBe(401);
});
