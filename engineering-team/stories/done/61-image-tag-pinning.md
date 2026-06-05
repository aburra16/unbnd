# Story 61: Pin profile-worker image tags to the deployed SHA

**Status:** Done
**Created:** 2026-06-05
**Type:** Hardening / Ops (Block E)

## Background

Block E hardening, PRD §2.11: "Seeder/indexer image freshness: pin profile-job `docker pull` to `$UNBND_IMAGE_TAG`."

Every app service in `docker-compose.prod.yml` uses `image: ghcr.io/aburra16/unbnd-<x>:${UNBND_IMAGE_TAG:-latest}`. The staging deploy (`.github/workflows/staging.yml`) `git reset --hard <SHA>` then **`export UNBND_IMAGE_TAG=<SHA>`** for the `docker compose pull && up -d` of the always-on services. But that `export` is **transient** — it lives only inside the deploy script's shell. It is never persisted to the droplet.

The consequence bites the profile-gated workers (`seeder`, `promoter`, `indexer`, `shelves`, `librarian`), which the normal deploy does **not** pull or start. When the operator later runs one by hand in a fresh shell:

```sh
docker compose -f docker-compose.prod.yml --profile seed run --rm seeder
```

`UNBND_IMAGE_TAG` is unset, so the tag resolves to `:latest` — which lags the deployed SHA (the deploy SHA-pins; nothing keeps the workers' `:latest` current). The operator gets a stale image and has to remember a manual `docker compose … pull <svc>` first, or `export UNBND_IMAGE_TAG=$(git rev-parse HEAD)`. This caused real friction during the catalog and librarian standups in this session (the "no such service" / stale-image gotchas).

The fix is to **persist** the deployed tag: the deploy writes `UNBND_IMAGE_TAG=<SHA>` into `/opt/unbnd/.env` (which `docker compose` auto-reads), so every subsequent compose command — including a profile-worker `run` in any shell — resolves to the same SHA the always-on stack is running. No manual pull, no manual export.

## User-facing description

No end-user-facing change. As the operator, I want a profile-gated worker (`seeder`/`promoter`/`indexer`/`shelves`/`librarian`) run by hand to use the **same image SHA as the deployed stack** by default, so I never run a stale `:latest` worker or have to remember a manual pull/export first.

## Acceptance criteria

- [ ] **The deploy persists the tag.** `.github/workflows/staging.yml`'s deploy step writes `UNBND_IMAGE_TAG=<DEPLOY_SHA>` into `/opt/unbnd/.env` idempotently (replace the existing line if present, else append) — **without disturbing any other `.env` line** (the operator's `SEED_CURATORS`, `HOUSE_OBSERVER_PUBKEY`, secrets, etc. are untouched). This happens after `git reset --hard` (which doesn't touch the gitignored `.env`) and before/around the `pull && up -d`.
- [ ] **Subsequent compose commands resolve to the deployed SHA.** After a deploy, a fresh-shell `docker compose -f docker-compose.prod.yml --profile <p> run --rm <svc>` uses `ghcr.io/aburra16/unbnd-<svc>:<DEPLOY_SHA>` (read from `.env`), not `:latest`. (Verified by the deploy-script logic + the runbook; operator-observable.)
- [ ] **Compose consistency guard.** A test (in a natural home) asserts every `ghcr.io/aburra16/unbnd-*` service image in `docker-compose.prod.yml` uses the `${UNBND_IMAGE_TAG...}` variable — so a future worker can't silently hardcode a tag and reintroduce the drift. (External pinned images — the data-layer, `postgres`, `meilisearch` — are excluded.) If no clean home exists, the Reviewer verifies by inspection and the guard is skipped (documented).
- [ ] **Runbooks updated.** `docs/DEPLOY.md` and the operator runbooks drop the now-unnecessary manual `docker compose … pull <svc>` / `export UNBND_IMAGE_TAG=$(git rev-parse HEAD)` steps, noting the deploy persists `UNBND_IMAGE_TAG` in `.env`. The librarian/seeder/indexer/shelves runbooks read cleanly without the manual pull.
- [ ] **No behavior change to the running stack.** The always-on services still deploy at the SHA exactly as today; the only addition is persisting the tag. `pnpm -r typecheck` / `pnpm -r test` / `Validate Caddyfile` stay green.

## DList shapes touched

None. CI/ops + docs only.

## Out of scope

- Auto-pulling/auto-running the profile workers on deploy (they remain manual, profile-gated — by design; this story only fixes the *tag* they resolve to).
- The data-layer / `postgres` / `meilisearch` images (externally pinned versions, not SHA-tagged).
- Any app code or worker behavior change.

## Open questions

- The home for the compose-consistency guard (a node/vitest test that parses `docker-compose.prod.yml`) — the Implementer picks the cleanest existing suite or skips with Reviewer inspection. Not load-bearing.

## Linked artifacts

- ADR: `engineering-team/decisions/0060-image-tag-pinning.md`
- Review: `engineering-team/reviews/61-image-tag-pinning.md` (PASS)
- Lean cycle (Implement → independent Review) — CI/ops change, no app logic to red→green.
