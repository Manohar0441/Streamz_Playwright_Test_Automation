// API tests for the catalog and playback endpoints: browsing titles,
// opening a title's detail page, starting a playback session, and
// saving/reading resume progress.
//
// A beforeEach logs in once per test and stashes the token in module-level
// state, so every test in this file can just call auth() to get the header
// it needs instead of logging in over and over.
//
// Run just this file:  npm run test:api   (or  npx playwright test --project=api)

const { test, expect } = require('../fixtures');

let token;

test.beforeEach(async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { email: 'qa@streamz.test', password: 'Test@123' },
  });
  token = (await res.json()).token;
});

function auth() {
  return { Authorization: `Bearer ${token}` };
}

test.describe('browsing the catalog', () => {
  test('GET /api/content is public (no token needed) and returns titles', async ({ request }) => {
    const res = await request.get('/api/content');

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.count).toBeGreaterThan(0);
    expect(body.items).toHaveLength(body.count); // count should always match the array length
  });

  test('the ?search= query param filters by title/genre text', async ({ request }) => {
    // "pipeline" only shows up in one title in the seed data - tt-101,
    // "Pipeline of Dreams" - so this doubles as a check that search is
    // actually filtering and not just echoing the full list back.
    const body = await (await request.get('/api/content?search=pipeline')).json();
    expect(body.count).toBe(1);
    expect(body.items[0].id).toBe('tt-101');
  });
});

test.describe('title detail', () => {
  test('requires a token', async ({ request }) => {
    const res = await request.get('/api/content/tt-100');
    expect(res.status()).toBe(401);
  });

  test('with a token, returns the full detail including synopsis', async ({ request }) => {
    const res = await request.get('/api/content/tt-100', { headers: auth() });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('tt-100');
    expect(body.synopsis).toBeTruthy();
  });

  test('an id that does not exist returns 404 NOT_FOUND', async ({ request }) => {
    const res = await request.get('/api/content/tt-zzz', { headers: auth() });

    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  test('a title whose rights have expired returns 451 UNAVAILABLE', async ({ request }) => {
    // tt-900 is seeded with available: false specifically to exercise this path.
    const res = await request.get('/api/content/tt-900', { headers: auth() });

    expect(res.status()).toBe(451);
    expect((await res.json()).error.code).toBe('UNAVAILABLE');
  });
});

test.describe('playback and resume progress', () => {
  test('starting playback returns a session with a real duration', async ({ request }) => {
    const res = await request.post('/api/content/tt-100/playback', { headers: auth() });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.durationSec).toBeGreaterThan(0);
  });

  test('saving a position past the end of the title is rejected with 400', async ({ request }) => {
    const res = await request.post('/api/content/tt-100/progress', {
      headers: auth(),
      data: { positionSec: 999999 },
    });

    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_POSITION');
  });

  test('a saved position can be read straight back', async ({ request }) => {
    const saveRes = await request.post('/api/content/tt-103/progress', {
      headers: auth(),
      data: { positionSec: 30 },
    });
    expect(saveRes.status()).toBe(200);

    const body = await (await request.get('/api/content/tt-103/progress', { headers: auth() })).json();
    expect(body.positionSec).toBe(30);
  });
});

test('GET /api/debug/error always returns 500, for testing 5xx handling', async ({ request }) => {
  const res = await request.get('/api/debug/error');
  expect(res.status()).toBe(500);
});
