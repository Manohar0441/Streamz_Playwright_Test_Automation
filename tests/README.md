# Reading this test suite

This folder is written so you can understand what it's testing just by
reading it - you shouldn't need to go trace through `server.js` first to
know what a test is checking. This file is the map: what each folder
covers, the app contract the tests are written against, and how the
pieces fit together.

## The demo account

There's exactly one login in this app (kept simple on purpose):

```
email:    qa@streamz.test
password: Test@123
```

Every test that needs to be logged in uses this account. It's hardcoded
in a couple of places (`tests/fixtures.js`, and again in a few spec files
for readability) rather than pulled from a shared constants file - for a
suite this small, duplicating one email/password pair is more readable
than adding an indirection layer for it.

## The five levels, and why they're split up this way

| Folder | What it's actually checking | Talks to the app via |
|---|---|---|
| `unit/` | Pure functions - `lib/streamz-core.js` (server-side) and `formatTime()` (client-side) | direct function calls / `page.evaluate` |
| `api/` | Individual endpoints - status codes, response shapes, auth enforcement | Playwright's `request` fixture |
| `integration/` | Several endpoints chained together as one real user flow | `request` fixture |
| `smoke/` | The handful of "is it even alive" checks you'd run right after a deploy | `request` + `page` |
| `e2e/` | The actual UI - clicking buttons, filling forms, reading the DOM | `page` |

Each folder is its own Playwright **project** (see `playwright.config.js`),
which is just Playwright's name for "a group of tests that can be run on
its own." That's the mechanism behind commands like
`npx playwright test --project=api` - see the root `README.md` for the
full command list.

They're kept in this order deliberately: unit tests catch a broken helper
function in milliseconds, long before you'd need to wait for a browser to
open. By the time you get to `e2e/`, you already know the underlying API
works, so those tests only have to worry about whether the UI is wired to
it correctly.

## Why every test gets a browser page, even API/unit tests

Open `tests/fixtures.js`. Every test in this project - including ones that
only use the `request` fixture - gets a real page navigated to the app
first, via an `autoLogin` fixture that's `auto: true`. Two reasons:

1. It means every test produces a meaningful screenshot and a trace with
   an actual rendered page behind it, not a blank tab. Useful when you're
   scanning the HTML report later.
2. A handful of tests genuinely need to be logged in already before their
   body runs (most of `api/`, `smoke/`'s non-UI tests, all of `e2e/playback.spec.js`),
   and doing that once in a shared fixture beats repeating a login POST at
   the top of every single test.

The tests that specifically need to start **logged out** - `e2e/login.spec.js`
and one test in `smoke/smoke.test.js` - opt out with `test.use({ autoLogin: false })`.

## Why the tests run one at a time (`workers: 1`)

The app's "database" is a couple of plain JavaScript `Map`s living in
server memory (see `server.js` / `lib/streamz-core.js`) - there's no real
database giving each test its own isolated slice of data. Login tokens and
resume-progress positions are shared state. Running tests in parallel
would mean two tests racing to log in or racing to write a progress value
for the same title, which is a recipe for a flaky suite. `fullyParallel: false`
and `workers: 1` in `playwright.config.js` trade some speed for not having
to think about that.

## API contract, condensed

Full detail (every field, every status code) is in `AUTOMATION.md` and in
`server.js` itself, which is commented route by route. This is just enough
to read the API tests without needing to jump over there.

| Route | Auth? | What can go wrong |
|---|---|---|
| `POST /api/auth/login` | no | 400 missing email/password, 401 wrong credentials |
| `POST /api/auth/logout` | yes | - |
| `GET /api/profile` | yes | 401 if the token is missing, made up, or already logged out |
| `GET /api/content` | no | supports `?search=` and `?genre=` |
| `GET /api/content/:id` | yes | 404 unknown id, 451 title unavailable (see `tt-900` in the catalog) |
| `POST /api/content/:id/playback` | yes | same 404/451 as above; returns where to resume from |
| `GET /api/content/:id/progress` | yes | 404 unknown id |
| `POST /api/content/:id/progress` | yes | 400 if `positionSec` is missing, negative, non-numeric, or past the title's duration |
| `GET /api/debug/error` | no | always 500, exists purely so there's something to test 5xx handling against |

Every error response has the same shape: `{ error: { code, message } }`.
That's why the tests check `.error.code` instead of parsing a message
string.

## UI selectors, condensed

The frontend tags every element the tests touch with a `data-testid`, so
locators don't depend on CSS classes or exact wording (both of which
change more often than test ids should). A few worth knowing going in:

- Login: `email`, `password`, `submit`, `login-error`, `login-form`
- Browse: `catalog-grid`, `continue-grid`, `search`, `empty-state`
- Player: `player` (has the `data-state` attribute - `loading` / `playing`
  / `paused` / `ended` / `error`), `play-pause`, `seek`, `error-overlay`,
  `start-overlay`

One thing worth flagging explicitly, because it's the kind of detail that
causes a confusing failure if you don't know it: the player's control-bar
play button and the big "start watching" overlay button are **both**
labelled "Play" for accessibility, so a role-based locator
(`getByRole('button', { name: 'Play' })`) is ambiguous between the two.
`tests/e2e/playback.spec.js` uses `getByTestId('play-pause')` specifically
to avoid that.

The player also exposes `window.__player` in the browser for tests that
need to read the simulated playback clock directly (see the resume test
in `e2e/playback.spec.js`) - it's not part of the real UI, just a test
hook.

## Artifacts

`playwright.config.js` turns on a screenshot for every test, a trace for
every test, and a video for failures only. `tests/artifact-reporter.js` is
a small custom reporter that prints the path to each of those after every
test finishes, so you don't have to go hunting through `test-results/` by
hand. Open the full report with `npx playwright show-report`, or a single
trace with `npx playwright show-trace <path>`.
