#!/usr/bin/env bash
# Safe manual (re)deploy on the droplet. Pins the app images (api, web/caddy) to
# an explicit commit SHA so a missing/empty UNBND_IMAGE_TAG can never silently
# fall back to :latest and run a different build than intended.
#
# Usage (from /opt/unbnd):
#   deploy/redeploy.sh            # uses the current checked-out commit (HEAD)
#   deploy/redeploy.sh <40-hex>   # pins to an explicit commit SHA
#
# This does NOT git-reset the repo (the CI deploy does that). It only pulls and
# (re)creates services at the given tag. Read-only commands like
# `docker compose ps` / `logs` are unaffected and need no tag.
set -euo pipefail

cd "$(dirname "$0")/.."

# The repo on the droplet is owned by the deploy user; allow root to read it.
git config --global --add safe.directory "$(pwd)" 2>/dev/null || true

TAG="${1:-$(git rev-parse HEAD 2>/dev/null || true)}"
if ! printf '%s' "$TAG" | grep -qE '^[0-9a-f]{40}$'; then
  echo "ERROR: image tag '${TAG}' is not a 40-char commit SHA." >&2
  echo "       Pass one explicitly:  deploy/redeploy.sh <sha>" >&2
  echo "       (Refusing to deploy rather than silently fall back to :latest.)" >&2
  exit 1
fi

export UNBND_IMAGE_TAG="$TAG"
echo "Deploying UNBND_IMAGE_TAG=${TAG}"
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
