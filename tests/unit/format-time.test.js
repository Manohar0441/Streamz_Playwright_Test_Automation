// One more unit test, but this one exercises a client-side function -
// formatTime() lives in public/assets/api.js and runs in the browser, not
// in Node. page.evaluate() lets us import the real module and call it
// in-page rather than copy/pasting the implementation into the test.
//
// It's a nice contrast with streamz-core.test.js next door: same "pure
// function in, value out" shape, but this one actually needs a browser to
// run, so its screenshot/trace are of an actual rendered page rather than
// a blank one.

const { test, expect } = require('../fixtures');

test('formatTime turns seconds into an m:ss string', async ({ page }) => {
  // The autouse fixture already navigated somewhere in this origin, so the
  // ES module is reachable via an absolute path import.
  const results = await page.evaluate(async () => {
    const { formatTime } = await import('/assets/api.js');
    return [formatTime(0), formatTime(5), formatTime(65), formatTime(142)];
  });

  expect(results).toEqual(['0:00', '0:05', '1:05', '2:22']);
});
