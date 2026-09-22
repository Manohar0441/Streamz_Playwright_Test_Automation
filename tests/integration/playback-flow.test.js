// Integration test: one whole user journey, several endpoints in sequence,
// the way a real client would actually call them - log in, browse, open a
// title, start watching, save progress, then come back and confirm it
// resumes from the right spot.
//
// Unlike the API tests (which check one endpoint's behaviour in isolation),
// this test cares about the endpoints working correctly *together*. It's
// written to be self-contained - it picks whatever title happens to be
// first in the catalog rather than hardcoding an id, and it saves a fresh
// position before checking it, so it doesn't depend on state any other
// test might have left behind.
//
// Run just this file:  npm run test:integration   (or  npx playwright test --project=integration)

const { test, expect } = require('../fixtures');

test('login, browse, start playback, save progress, and resume from it', async ({ request }) => {
  // Step 1: log in and get a token.
  const loginRes = await request.post('/api/auth/login', {
    data: { email: 'qa@streamz.test', password: 'Test@123' },
  });
  expect(loginRes.status()).toBe(200);
  const { token } = await loginRes.json();
  const headers = { Authorization: `Bearer ${token}` };

  // Step 2: browse the public catalog and grab whatever title is first.
  const catalog = await (await request.get('/api/content')).json();
  expect(catalog.count).toBeGreaterThan(0);
  const titleId = catalog.items[0].id;

  // Step 3: open that title's detail page (this route needs the token).
  const detailRes = await request.get(`/api/content/${titleId}`, { headers });
  expect(detailRes.status()).toBe(200);

  // Step 4: start a playback session and note how long the title runs.
  const session = await (await request.post(`/api/content/${titleId}/playback`, { headers })).json();
  const duration = session.durationSec;
  expect(duration).toBeGreaterThan(0);

  // Step 5: pretend we watched halfway through, then save that as the
  // resume point.
  const watchedTo = Math.floor(duration / 2);
  const saveRes = await request.post(`/api/content/${titleId}/progress`, {
    headers,
    data: { positionSec: watchedTo },
  });
  expect(saveRes.status()).toBe(200);

  // Step 6: come back later (a brand new playback call) and check it picks
  // up from exactly where step 5 left off.
  const resumed = await (await request.post(`/api/content/${titleId}/playback`, { headers })).json();
  expect(resumed.startPositionSec).toBe(watchedTo);
});
