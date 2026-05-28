#!/usr/bin/env bash
# Builds the Tapestry data-layer image used by docker-compose.yml.
# Reads scripts/tapestry-version.txt for the upstream branch + commit SHA,
# clones (or refreshes) the upstream Tapestry repo, builds the image, and
# tags it as unbnd/tapestry-data-layer:latest plus a short-SHA variant.
#
# Override the clone destination with TAPESTRY_SRC, e.g.:
#   TAPESTRY_SRC=~/Documents/Tapestry/tapestry ./scripts/build-tapestry-image.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIN_FILE="${REPO_ROOT}/scripts/tapestry-version.txt"
SRC_DIR="${TAPESTRY_SRC:-${HOME}/.cache/unbnd/tapestry-src}"
REPO_URL="https://github.com/nous-clawds4/tapestry.git"

if [[ ! -f "${PIN_FILE}" ]]; then
  echo "error: pin file not found at ${PIN_FILE}" >&2
  exit 1
fi

# Parse pin file. Lines starting with `#` are comments; blank lines ignored.
mapfile -t LINES < <(grep -vE '^[[:space:]]*#' "${PIN_FILE}" | grep -vE '^[[:space:]]*$')
if [[ ${#LINES[@]} -lt 2 ]]; then
  echo "error: pin file must contain a branch line and a commit SHA line" >&2
  exit 1
fi
BRANCH="${LINES[0]}"
COMMIT="${LINES[1]}"
SHORT="${COMMIT:0:8}"

echo "→ Tapestry pin: ${BRANCH} @ ${COMMIT}"
echo "→ Source dir: ${SRC_DIR}"

if [[ -d "${SRC_DIR}/.git" ]]; then
  echo "→ Updating existing clone…"
  git -C "${SRC_DIR}" fetch origin "${BRANCH}" --depth=50
  git -C "${SRC_DIR}" reset --hard "${COMMIT}"
else
  echo "→ Cloning fresh…"
  mkdir -p "$(dirname "${SRC_DIR}")"
  git clone --branch "${BRANCH}" --depth=50 "${REPO_URL}" "${SRC_DIR}"
  git -C "${SRC_DIR}" reset --hard "${COMMIT}"
fi

echo "→ Building image…"
docker build \
  --label "org.unbnd.tapestry-commit=${COMMIT}" \
  --label "org.unbnd.tapestry-branch=${BRANCH}" \
  -t "unbnd/tapestry-data-layer:latest" \
  -t "unbnd/tapestry-data-layer:${SHORT}" \
  "${SRC_DIR}"

echo "✓ Built unbnd/tapestry-data-layer:latest (${SHORT})"
