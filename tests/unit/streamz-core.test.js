// Unit tests for lib/streamz-core.js.
//
// These are the fastest tests in the suite: plain function calls, no HTTP,
// no browser page involved in the actual assertions. They run through the
// Playwright runner like everything else here (so they still get a
// screenshot/trace in the report), but the logic under test never leaves
// the Node process.
//
// Run just this file:  npm run test:unit   (or  npx playwright test --project=unit)

const { test, expect } = require('../fixtures');
const {
  publicUser,
  catalogCard,
  filterTitles,
  resolveTitleAccess,
  validatePosition,
  parseBearer,
} = require('../../lib/streamz-core');

const SAMPLE_USER = { id: 'u_qa', email: 'qa@streamz.test', password: 'Test@123', name: 'Quinn Tester' };

const TITLES = [
  { id: 'tt-1', title: 'The Last Render', genres: ['Sci-Fi', 'Thriller'], durationSec: 142, available: true },
  { id: 'tt-2', title: 'Pipeline of Dreams', genres: ['Drama'], durationSec: 118, available: true },
  { id: 'tt-9', title: 'Rights Expired', genres: ['Mystery'], durationSec: 110, available: false },
];

test.describe('publicUser', () => {
  test('strips the password field before the user is sent anywhere', () => {
    const shaped = publicUser(SAMPLE_USER);
    expect(shaped).toEqual({ id: 'u_qa', email: 'qa@streamz.test', name: 'Quinn Tester' });
    expect(shaped.password).toBeUndefined();
  });
});

test.describe('catalogCard', () => {
  test('keeps the card fields and leaves synopsis out', () => {
    // synopsis is only needed on the detail page, not the browse grid, so
    // catalogCard should drop it even though the full title object has it.
    const card = catalogCard({ ...TITLES[0], synopsis: 'secret plot stuff', captions: true, poster: { bg: '#000' } });
    expect(card.id).toBe('tt-1');
    expect(card.synopsis).toBeUndefined();
    expect(card.captions).toBe(true);
  });
});

test.describe('filterTitles', () => {
  test('returns everything when called with no filters', () => {
    expect(filterTitles(TITLES)).toHaveLength(3);
  });

  test('matches on title text, case-insensitively', () => {
    const result = filterTitles(TITLES, { search: 'PIPELINE' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tt-2');
  });

  test('matches by genre', () => {
    const result = filterTitles(TITLES, { genre: 'sci-fi' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('tt-1');
  });

  test('does not mutate the array it was given', () => {
    // filterTitles does titles.slice() internally before filtering - this
    // test exists because that's exactly the kind of thing that's easy to
    // accidentally break with a well-meaning "optimization" later.
    const snapshot = TITLES.slice();
    filterTitles(TITLES, { search: 'render' });
    expect(TITLES).toEqual(snapshot);
  });
});

test.describe('resolveTitleAccess', () => {
  test('allows a title that exists and is available', () => {
    const result = resolveTitleAccess(TITLES, 'tt-1');
    expect(result.status).toBeUndefined();
    expect(result.title.id).toBe('tt-1');
  });

  test('returns a 404 shape for an id that does not exist', () => {
    expect(resolveTitleAccess(TITLES, 'tt-zzz').status).toBe(404);
  });

  test('returns a 451 shape for a title marked unavailable', () => {
    // 451 ("Unavailable For Legal Reasons") is a deliberate choice here to
    // model rights-expired content - see tt-9 / tt-900 in the catalog.
    expect(resolveTitleAccess(TITLES, 'tt-9').status).toBe(451);
  });
});

test.describe('validatePosition', () => {
  test('accepts an in-range number and rounds it', () => {
    const result = validatePosition(42.7, 142);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(43);
  });

  test('rejects negative numbers, out-of-range numbers, and non-numbers', () => {
    expect(validatePosition(-1, 142).ok).toBe(false);
    expect(validatePosition(999, 142).ok).toBe(false);
    expect(validatePosition('30', 142).ok).toBe(false); // string, even a numeric-looking one
    expect(validatePosition(NaN, 142).ok).toBe(false);
  });
});

test.describe('parseBearer', () => {
  test('pulls the token out of a well-formed Authorization header', () => {
    expect(parseBearer('Bearer abc123')).toBe('abc123');
    expect(parseBearer('bearer  spaced  ')).toBe('spaced');
  });

  test('returns null when the header is missing or the wrong scheme', () => {
    expect(parseBearer(undefined)).toBeNull();
    expect(parseBearer('')).toBeNull();
    expect(parseBearer('Basic abc')).toBeNull();
  });
});
