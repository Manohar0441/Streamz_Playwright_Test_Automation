# Streamz - Playwright Test Automation & CI/CD

A small streaming-media-player web app built as a target for Playwright test
automation, plus a Docker + Jenkins pipeline that builds, tests, deploys, and
auto-rolls-back.

**Stack:** Node.js (zero-dependency backend) - Playwright Test - Docker - Jenkins

---

## 1. Run the app - one command

```bash
npm start
```

That's it - no build step, no external services, no database to spin up. The
backend is written against Node's built-in `http` module, so `npm install`
only pulls in Playwright (for the tests), never anything the running app
itself needs.

Open **http://localhost:3100** and log in with the one demo account:

| Email | Password |
|---|---|
| `qa@streamz.test` | `Test@123` |

(It listens on 3100 rather than the more usual 3000, on purpose - see the
note in `playwright.config.js` if you're curious why.)

Stop it with `Ctrl+C`.

---

## 2. Run the tests

First-time setup:

```bash
npm install
npx playwright install
```

`npx playwright install` grabs all three browser engines (Chromium, Firefox,
WebKit) - the e2e suite runs on all of them, not just Chromium. When you run
the tests, Playwright starts the app itself (see the `webServer` block in
`playwright.config.js`), so you don't need `npm start` running separately.

### Everything at once

```bash
npm test
```

### One level at a time

The suite is split into five levels - see [`tests/README.md`](tests/README.md)
for what each one actually covers and why they're organized this way.

```bash
npm run test:unit          # pure functions, no server, no browser needed
npm run test:api           # every endpoint's status codes and response shapes
npm run test:integration   # login -> browse -> play -> resume, as one flow
npm run test:smoke         # the "is it even alive" checks
npm run test:e2e           # the real UI, driven like a user would drive it
```

### Headed mode (watch it happen in a real browser window)

```bash
npm run test:headed             # everything, headed
npm run test:unit:headed
npm run test:api:headed
npm run test:integration:headed
npm run test:smoke:headed
npm run test:e2e:headed
```

Every level opens a real browser window in headed mode - even `unit` and
`api` - because `tests/fixtures.js` gives every single test a page to work
with (that's also what makes every test produce a meaningful screenshot).
Add `SLOWMO=500` (milliseconds) in front of any headed command if the run
goes by too fast to actually watch:

```bash
SLOWMO=500 npm run test:e2e:headed
```

### Other useful ones

```bash
npx playwright test --ui         # Playwright's interactive UI mode
npx playwright test --debug      # step through a test in the Playwright inspector
npm run test:report              # open the HTML report from the last run
npx playwright show-trace <path-to-trace.zip>   # inspect one test's trace
```

---

## 3. Docker

```bash
docker compose up --build      # http://localhost:3100
docker compose down
```

---

## 4. CI/CD (Jenkins)

`Jenkinsfile` builds the app, runs the full test suite against it in a
container, then deploys - with automatic rollback if the post-deploy health
check fails. See [`jenkins/README.md`](jenkins/README.md) to run Jenkins
itself locally in Docker.

---

## Project layout

```
server.js          backend - one file, routes at the bottom, commented route by route
lib/                pure helper functions the backend and the unit tests both use
data/               the in-memory "database" (one user, a handful of titles)
public/             frontend - login, browse, player pages + their JS
tests/              the test suite - see tests/README.md
Dockerfile          app image
Dockerfile.test     test image (Playwright + browsers baked in, for CI)
Jenkinsfile         CI/CD pipeline
scripts/            deploy.sh / rollback.sh, used by the Jenkins pipeline
```

For the full API reference, the UI selector contract, and how the Docker/
Jenkins pipeline works end to end, see [`AUTOMATION.md`](AUTOMATION.md). For
what the test suite itself is doing and why it's organized the way it is,
see [`tests/README.md`](tests/README.md).

---

*Manohar - Playwright test-automation and CI/CD practice project.*
