
set -euo pipefail

NAME="${CONTAINER:-streamz}"
PORT="${PORT:-3000}"

if ! docker image inspect streamz:previous >/dev/null 2>&1; then
  echo "No 'streamz:previous' image exists — nothing to roll back to."
  exit 1
fi

echo "==> Rolling back to streamz:previous"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -p "${PORT}:3000" streamz:previous >/dev/null

for i in $(seq 1 60); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$NAME" 2>/dev/null || echo missing)"
  case "$status" in
    healthy)   echo "    rollback healthy after ${i}s  [OK]"; exit 0 ;;
    unhealthy) echo "    rollback container UNHEALTHY  [X]"; exit 1 ;;
    *)         sleep 1 ;;
  esac
done
echo "    rollback timed out waiting for health  [X]"
exit 1
