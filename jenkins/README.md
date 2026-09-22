# Run Jenkins locally (in Docker) for the Streamz pipeline

This spins up a local Jenkins that can build & run Docker images, so it can
execute the [`../Jenkinsfile`](../Jenkinsfile) end to end:
**push → Build → Test → Deploy**, with auto-rollback.

> For local practice only. The setup wizard is disabled and there is no login —
> don't expose this Jenkins to the internet.

---

## 0. Prerequisites

- **Docker Desktop** installed and running on Windows.
- Your project is already pushed to a **GitHub repo** (you said it is).

---

## 1. Start Jenkins

```bash
cd jenkins
docker compose up -d --build
```

The first build pulls the Jenkins image and installs plugins — a few minutes.
Then confirm Jenkins can talk to Docker:

```bash
docker exec streamz-jenkins docker version
```

You should see both a *Client* and a *Server* section. Open **http://localhost:8080**.

---

## 2. Create the pipeline job

1. **New Item** → name it `streamz` → choose **Pipeline** → **OK**.
2. Scroll to the **Pipeline** section:
   - **Definition:** *Pipeline script from SCM*
   - **SCM:** *Git*
   - **Repository URL:** your repo's HTTPS URL (e.g. `https://github.com/<you>/<repo>.git`)
   - If the repo is **private**, click **Add → Jenkins** under *Credentials* and add
     a GitHub username + a personal access token, then select it.
   - **Branch Specifier:** `*/main`
   - **Script Path:** `Jenkinsfile`
3. **Save**.

---

## 3. First run

Click **Build Now** once and watch **Console Output**.

> Why a manual first run? Triggers declared inside the `Jenkinsfile`
> (`pollSCM` / `githubPush`) only become active **after Jenkins has read the
> Jenkinsfile once** — i.e. after the first build.

When it finishes successfully, the app is deployed as a container on
**http://localhost:3001** — open it. (Host port 3001, not 3000 - the
`Jenkinsfile` sets `PORT=3001` for the deploy step specifically to dodge
whatever else might be sitting on 3000.) Each build's **Build Artifacts** contain
`playwright-report/` and `test-results/` (screenshots, videos, traces).

---

## 4. Trigger builds on every push

Two options:

### A) Poll (default, zero config)
The Jenkinsfile already declares `pollSCM('H/2 * * * *')`. After your first
build, Jenkins checks GitHub every ~2 minutes and builds when it sees a new
commit. Nothing else to do.

### B) Real webhooks (instant)
A local Jenkins isn't reachable from GitHub, so forward webhooks with **smee.io**:

```bash
# 1) Get a channel URL
#    open https://smee.io/new  and copy the URL, e.g. https://smee.io/AbCdEf

# 2) Forward it to your local Jenkins (needs Node)
npx smee-client --url https://smee.io/AbCdEf --target http://localhost:8080/github-webhook/
```

Then in GitHub: **Repo → Settings → Webhooks → Add webhook**
- **Payload URL:** the smee.io URL
- **Content type:** `application/json`
- **Events:** *Just the push event*

Now a `git push` triggers a build within seconds (via `githubPush()`).

---

## 5. See the rollback work

1. Let one build succeed (so `streamz:previous` exists and the app is live on :3001).
2. Break the app on purpose — e.g. make `/api/health` return 500 in `server.js` —
   commit and push.
3. The pipeline builds and tests; if it reaches **Deploy** and the new container
   never becomes healthy, `scripts/deploy.sh` fails and the Deploy stage runs
   `scripts/rollback.sh`, which restores the previous image. Check :3001 is still
   up on the old version.

> Note: if your change also breaks a **test**, the pipeline stops at the Test
> stage and never deploys — the previous deployment just keeps running. That's
> the intended safety net.

---

## 6. Troubleshooting & cleanup

| Symptom | Fix |
|---|---|
| `docker: not found` in the pipeline | Rebuild: `docker compose up -d --build`; verify `docker exec streamz-jenkins docker version` |
| `permission denied` on the Docker socket | Ensure `user: root` in `docker-compose.yml` (it is) and the socket mount is allowed in Docker Desktop |
| Port 3001 already in use | Stop whatever holds it, or change `PORT` in the `Jenkinsfile`'s `environment` block; the deploy publishes `3001:3000` |
| HTML report is just files | Optional: install the **HTML Publisher** plugin, or download `playwright-report/` and open `index.html` |

```bash
cd jenkins
docker compose down        # stop Jenkins, keep its data (jenkins_home volume)
docker compose down -v     # stop Jenkins and DELETE its data
```
