#!/usr/bin/env bash
# ============================================================================
# deploy.sh <image:tag>  —  "Execute" step: run the image as the live container.
# ----------------------------------------------------------------------------
# Before swapping, it remembers the currently-running image as `streamz:previous`
# so a failed deploy can be rolled back (see rollback.sh). After starting the new
# container it waits for the container's built-in HEALTHCHECK to report healthy.
#
# Health is read via `docker inspect`, NOT `curl localhost` — so this works the
# same whether the script runs on the host or inside a Jenkins container talking
# to the host's Docker daemon (the new container is a sibling, not on localhost).
# ============================================================================
set -euo pipefail

IMAGE="${1:?usage: deploy.sh <image:tag>}"
NAME="${CONTAINER:-streamz}"
PORT="${PORT:-3000}"

echo "==> Deploying '$IMAGE' as container '$NAME' on host port $PORT"

# 1) Save the currently-running image as the rollback target.
if docker ps -a --format '{{.Names}}' | grep -qx "$NAME"; then
  CURRENT_IMG="$(docker inspect --format '{{.Config.Image}}' "$NAME" 2>/dev/null || true)"
  if [ -n "${CURRENT_IMG:-}" ]; then
    docker tag "$CURRENT_IMG" streamz:previous
    echo "    saved rollback point -> streamz:previous ($CURRENT_IMG)"
  fi
  docker rm -f "$NAME" >/dev/null 2>&1 || true
fi

# 2) Start the new container, publishing to the host so you can browse it.
docker run -d --name "$NAME" -p "${PORT}:3000" "$IMAGE" >/dev/null

# 3) Wait for the container HEALTHCHECK to flip to "healthy".
echo "==> Waiting for '$NAME' to become healthy"
for i in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo missing)"
  case "$status" in
    healthy)   echo "    healthy after ${i}s  [OK]"; exit 0 ;;
    unhealthy) echo "    container reported UNHEALTHY  [X]"; exit 1 ;;
    *)         sleep 1 ;;   # "starting" / "missing" -> keep waiting
  esac
done

echo "    timed out waiting for health  [X]"
exit 1
