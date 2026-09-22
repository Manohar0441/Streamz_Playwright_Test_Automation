# Streamz — Test Automation & CI/CD

Every test level runs on **Playwright**, and every test produces a **screenshot**
(always), a **video** (only on failure), and a **trace** (always). This doc shows
how to run it all locally, in Docker, and in Jenkins.

---

## 1. The test pyramid (all on the Playwright runner)

| Level | Folder | How it tests | Project name |
|---|---|---|---|
| **Unit** | `tests/unit/` | Calls pure functions in `lib/streamz-core.js`; one test runs the client-side `formatTime` in the browser | `unit` |
| **API** | `tests/api/` | Playwright `request` fixture → asserts status codes & JSON (200/400/401/404/451/500) | `api` |
| **Integration** | `tests/integration/` | `request` fixture → login → browse → playback → resume, as one flow | `integration` |
| **Smoke** | `tests/smoke/` | A few fast critical checks (health, catalog, login, login page) | `smoke` |
| **E2E** | `tests/e2e/` | Drives the real UI with `page` (login, play/pause, resume, error overlay) | `e2e` |

Each level is a **Playwright project** (see `playwright.config.js`), so you can run
one at a time or all together.

### How every test gets screenshots + traces

- `playwright.config.js` sets `screenshot: 'on'`, `video: 'retain-on-failure'`,
  `trace: 'on'`.
- `tests/fixtures.js` gives **every** test a browser page that lands on the app
  first (so even API/unit tests have a real screen behind their screenshot and a
  browser context for the trace), and attaches a full-page screenshot after each
  test.
- `tests/artifact-reporter.js` prints, after each test, the exact path of its
  screenshot / video / trace — so every test visibly **returns its tracer logs**.

Open artifacts with:

```bash
npx playwright show-report                 # the HTML report (screenshots, videos, traces inline)
npx playwright show-trace <path-to-trace.zip>   # the interactive trace viewer
```

---

## 2. Run locally

**One-time setup** (installs Playwright + its browsers - Chromium, Firefox and
WebKit, since plain `npm test` runs the e2e project on all three, not just
Chromium):

```bash
npm install
npx playwright install
```

**Run the tests** (Playwright starts the app itself via `webServer`):

```bash
npm test                  # every project: unit/api/integration/smoke/e2e (x3 engines)

npm run test:unit
npm run test:api
npm run test:integration
npm run test:smoke
npm run test:e2e

npm run test:report       # open the HTML report from the last run
```

Artifacts land in `test-results/` (per-test `trace.zip`, `*.png`, and `*.webm` on
failures) and the report in `playwright-report/`.

> Tests run **serially** (`workers: 1`) on purpose: the app keeps state in memory
> (tokens, resume points), so serial runs stay deterministic.

---

## 3. Run in Docker

### Just the app

```bash
docker compose up --build       # http://localhost:3100
docker compose down
```

### The full Playwright suite in Docker (app in one container, tests in another)

```bash
docker build -t streamz:dev .
docker network create streamz-net
docker run -d --name streamz-app --network streamz-net streamz:dev

docker run --rm --network streamz-net \
  -e BASE_URL=http://streamz-app:3000 -e CI=true \
  -v "$PWD":/work -w /work \
  mcr.microsoft.com/playwright:v1.61.0-jammy \
  bash -lc "npm install && npx playwright test"

docker rm -f streamz-app && docker network rm streamz-net
```

`BASE_URL` makes Playwright skip its own `webServer` and target the app
container. The Playwright image version (`v1.61.0`) matches `@playwright/test`
in `package.json`, so the browsers match the library.

---

## 4. The Jenkins pipeline

**Flow:** `GitHub push → Build → Test → Execute (deploy)`, with **auto-rollback**
if the deploy fails its health check. See [`Jenkinsfile`](Jenkinsfile).

### Stages

1. **Build** — `docker build -t streamz:build-<N> .` turns the pushed commit into
   a versioned image.
2. **Test (Playwright)** — starts that image as a container, then runs **all five
   projects** from the official `mcr.microsoft.com/playwright` image against it.
   The HTML report and raw artifacts (traces, videos, screenshots) are archived
   on the build via `archiveArtifacts`.
3. **Deploy (Execute)** — `scripts/deploy.sh` runs the image as the live
   `streamz` container and polls `/api/health`.

### How rollback works

- Before swapping containers, `deploy.sh` tags the **currently-running** image as
  `streamz:previous`.
- If the new container never becomes healthy, `deploy.sh` exits non-zero and the
  Deploy stage's `post { failure { … } }` runs `scripts/rollback.sh`, which
  restarts `streamz:previous` and health-checks it.
- A failure in an **earlier** stage (build or tests) means the broken commit never
  reaches deploy — the previous deployment keeps running untouched. Bad code can't
  go live.

### One-time Jenkins setup

1. Install Jenkins with the **Docker Pipeline** and **GitHub** plugins, on an
   agent where the `docker` CLI works and `bash` + `curl` exist (a Linux agent is
   simplest).
2. **New Item → Pipeline** (or *Multibranch Pipeline*).
3. Under **Pipeline**, choose *Pipeline script from SCM*, point it at your GitHub
   repo, and set **Script Path** = `Jenkinsfile`.
4. In GitHub: **Settings → Webhooks → Add webhook**, Payload URL
   `http://<your-jenkins>/github-webhook/`, content type `application/json`,
   event = *Just the push event*. (`triggers { githubPush() }` is already in the
   Jenkinsfile.)
5. Push a commit — the pipeline runs end to end. Open the build → **Artifacts** to
   download `playwright-report/` and `test-results/`.

> **Windows agents:** the deploy/rollback scripts are `bash`. If your Jenkins
> agent is Windows-only, run the agent under Git-Bash/WSL or translate the two
> scripts to PowerShell. A Linux (or Docker-based) agent avoids this.

---

## 5. Push it to GitHub

This folder isn't a git repo yet:

```bash
git init
git add .
git commit -m "Streamz: all-Playwright test suite + Docker + Jenkins pipeline"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Commit `package-lock.json` so CI installs the exact Playwright version.

---

## 6. Quick reference

| Command | What it does |
|---|---|
| `npm start` | Run the app on http://localhost:3100 |
| `npm test` | Everything - unit/api/integration/smoke/e2e, e2e on all 3 browser engines |
| `npm run test:unit` / `:api` / `:integration` / `:smoke` / `:e2e` | One level (Chromium) |
| `npm run test:unit:headed` / `:api:headed` / `:integration:headed` / `:smoke:headed` / `:e2e:headed` | One level, headed |
| `npm run test:report` | Open the HTML report |
| `npx playwright show-trace <trace.zip>` | Open a trace |
| `docker compose up --build` | Run the app in Docker |
| `bash scripts/deploy.sh streamz:build-1` | Deploy an image with health check |
| `bash scripts/rollback.sh` | Restore the previous deployment |
