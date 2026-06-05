# ADR 0060: Persist `UNBND_IMAGE_TAG` on deploy so profile workers pin to the deployed SHA

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/done/61-image-tag-pinning.md`

**Accepted 2026-06-05.** The staging deploy (`.github/workflows/staging.yml`) persists `UNBND_IMAGE_TAG=<DEPLOY_SHA>` into `/opt/unbnd/.env` (idempotent single-line upsert, no other line touched), so every later `docker compose` invocation — including a by-hand `--profile <p> run --rm <svc>` for a profile-gated worker — resolves `image: …unbnd-<svc>:${UNBND_IMAGE_TAG:-latest}` to the **deployed SHA** instead of a stale `:latest`. The always-on deploy is otherwise unchanged. Runbooks drop the manual `pull <svc>` / `export UNBND_IMAGE_TAG` steps. A compose-consistency guard locks "every `ghcr.io/aburra16/unbnd-*` service uses the `${UNBND_IMAGE_TAG…}` variable" so the drift can't recur. Block E / PRD §2.11.

## Context

`docker-compose.prod.yml` tags all app images `${UNBND_IMAGE_TAG:-latest}`. The deploy step does `git reset --hard <SHA>`, `export UNBND_IMAGE_TAG=<SHA>`, `docker compose pull && up -d` — but the `export` is transient (script-shell only) and never written to disk. The always-on services are fine (they're pulled/upped inside that same shell at the SHA). The profile-gated workers (`seeder`/`promoter`/`indexer`/`shelves`/`librarian`) are NOT pulled by the deploy, so when the operator runs one later in a fresh shell, `UNBND_IMAGE_TAG` is unset → `:latest` → a stale image (nothing keeps the workers' `:latest` current with the SHA-pinned deploy). Observed repeatedly this session (manual `pull seeder`, the librarian "no such service" timing, `export UNBND_IMAGE_TAG=$(git rev-parse HEAD)` in the swap runbook).

## Decision

1. **Persist the tag in the deploy script.** In `staging.yml`'s deploy `script:`, after `git reset --hard <SHA>`, write the tag to `.env` idempotently, e.g.:
   ```sh
   # persist the deployed tag so profile-worker `run`s use this SHA, not stale :latest
   if grep -q '^UNBND_IMAGE_TAG=' .env; then
     sed -i "s|^UNBND_IMAGE_TAG=.*|UNBND_IMAGE_TAG=${DEPLOY_SHA}|" .env
   else
     printf '\nUNBND_IMAGE_TAG=%s\n' "${DEPLOY_SHA}" >> .env
   fi
   ```
   `.env` is gitignored, so `git reset --hard` does not clobber it; the upsert touches only the `UNBND_IMAGE_TAG` line, leaving the operator's `SEED_CURATORS`/`HOUSE_OBSERVER_PUBKEY`/secrets intact. The existing `export` + `pull && up -d` stay (belt-and-suspenders; compose also now reads the same value from `.env`).

2. **Runbooks.** `docs/DEPLOY.md` (and the librarian/seeder/indexer/shelves sections) drop the manual `docker compose … pull <svc>` and `export UNBND_IMAGE_TAG=$(git rev-parse HEAD)` steps, replaced by a one-line note that the deploy persists `UNBND_IMAGE_TAG` in `.env`, so a bare `--profile <p> run --rm <svc>` already targets the deployed SHA. (An operator who wants the very latest can still re-run a deploy or set the var explicitly.)

3. **Compose-consistency guard.** A small test parses `docker-compose.prod.yml` and asserts every service whose image is `ghcr.io/aburra16/unbnd-*` uses `${UNBND_IMAGE_TAG` in its tag (the external `tapestry-data-layer`/`postgres`/`meilisearch` images are excluded — they carry their own pinned versions). Implementer places it in the cleanest existing vitest suite; if none fits cleanly, skip it and the Reviewer verifies the invariant by inspection (documented).

## Consequences

- A by-hand profile-worker run after a deploy uses the deployed SHA by default — no stale-`:latest`, no manual pull/export. The operator runbooks shorten.
- The data-layer/postgres/meili images keep their externally-pinned tags (out of scope), so the guard scopes to the `unbnd-*` images only.
- The deploy gains one idempotent `.env` write; the always-on rollout is otherwise identical. No app code or worker behavior changes.
- This does not auto-run the profile workers (still manual/profile-gated by design) — it only fixes the *tag* they resolve to.

## Risks

- The `.env` upsert must not corrupt the file. Mitigated: anchored `^UNBND_IMAGE_TAG=` match, single-line `sed` replace or append, verified by the Reviewer reading the script; `.env` already exists on every deployed droplet.
- `staging.yml` runs only on the droplet (no CI unit coverage for the script itself) — the Reviewer validates the script logic by inspection; the compose-consistency guard covers the static invariant.
