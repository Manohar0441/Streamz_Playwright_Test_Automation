# ============================================================================
# Dockerfile — the Streamz app image (production-style)
# ----------------------------------------------------------------------------
# The app has ZERO runtime dependencies (it uses only Node's built-ins), so this
# image is tiny: just Node + the source. Playwright/browsers are NOT installed
# here — E2E runs in a separate Playwright image in CI (see the Jenkinsfile).
# ============================================================================
FROM node:20-alpine

# A tiny init so Ctrl+C / container stop is handled cleanly.
RUN apk add --no-cache tini curl

WORKDIR /app

# Copy manifests first for better layer caching. --omit=dev skips Playwright,
# which the running app never needs.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app.
COPY . .

ENV PORT=3000
EXPOSE 3000

# Container-level health check the orchestrator (and our deploy script) can read.
# Short interval so a deploy reports healthy within a few seconds.
HEALTHCHECK --interval=5s --timeout=3s --start-period=2s --retries=5 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
