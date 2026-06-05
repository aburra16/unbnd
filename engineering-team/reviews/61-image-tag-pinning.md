# Review: Story 61 — Pin profile-worker image tags to the deployed SHA

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-05
**Diff:** `git diff origin/main...HEAD` (commit `96e149b`)
**Story:** `engineering-team/stories/done/61-image-tag-pinning.md`
**ADR:** `engineering-team/decisions/0060-image-tag-pinning.md`
**PR:** #106 (`story-61-image-tag-pinning`)
**Cycle:** Lean CI/ops (Implement → independent Review). No Tester phase — no app logic to red→green. Reviewed accordingly.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass**. All 11 packages/apps done, no errors.
- [x] `pnpm -r test` — **pass**. Every package green:
  - api: 799 passed | 10 skipped (92 files); web: 307; seeder: 121; schemas: 145; librarian: 40; promoter: 32; indexer: 26; shelves: 26; trust: 23; ui: 20; relay: 18; search: 11. The stderr lines (errorSanitizer leak test, fail-open trigger logs, "provider down") are deliberate negative-path test output, not failures.
  - Compose guard in isolation: `pnpm --filter @unbnd/api test compose-prod` → 1 passed.
- [x] `pnpm --filter @unbnd/web build` — **n/a**, no `apps/web` change.
- [x] `gh pr checks 106` — **all green**: Typecheck/test/build (2m5s), Validate Caddyfile (4s), Visual regression (1m0s).
- [ ] _Lint not configured — skipped._

## 1. Deploy-persist change (`.github/workflows/staging.yml`)

Verdict: **correct.** The persist block is inserted at lines 106–112, after `git reset --hard ${{ env.DEPLOY_SHA }}` (105) and before the byte-identical `export UNBND_IMAGE_TAG` (113) / `pull` (115) / `up -d` (116) / `prune` (117). Confirmed against `git show origin/main:.github/workflows/staging.yml`: on main, line 105 (`git reset --hard`) was immediately followed by `export UNBND_IMAGE_TAG`; the diff splices the block exactly between them and leaves the rest unchanged.

- **Idempotent upsert:** `if grep -q '^UNBND_IMAGE_TAG=' .env` → `sed` in-place replace; else `printf '\n...\n' >> .env`. Reproduced all cases against sample `.env` files:
  - Existing line → replaced in place, other lines untouched.
  - Missing line → appended (with leading newline).
  - Run twice → identical single line, no duplication (idempotent).
- **`^`-anchored:** `#UNBND_IMAGE_TAG=` and `XUNBND_IMAGE_TAG=` are correctly NOT matched (grep `^`-anchor); only a real top-level `UNBND_IMAGE_TAG=` line is rewritten. A neighbor line `SECRET="x=y|z"` (containing `=` and the `|` sed delimiter) was left byte-intact — confirms the `|` sed delimiter and line anchor protect every other line.
- **`set -euo pipefail` safety:** `grep -q` sits in the `if` condition, so a non-match (exit 1) does not abort under `set -e` — verified by running the exact snippet under `set -euo pipefail`; the else branch is reached and the script continues.
- **SHA interpolation:** `${{ env.DEPLOY_SHA }}` is a 40-char `[0-9a-f]` git SHA, expanded by GitHub Actions before the shell runs. It contains no sed replacement metacharacters (`&`, `|`, backslash) and no shell-special chars, so it is safe both in the `sed` RHS (with `|` delimiter) and in `printf %s`.
- **Indentation / YAML well-formedness:** the deploy step uses a `script: |` literal block scalar. All statement lines are at 12 spaces (uniform with the surrounding lines); the `if`/`else`/`fi` body lines (`sed`, `printf`) are at 14 (a 2-space shell nest), which is fine — block-scalar content is literal text, and indentation ≥ the block's base (12) is preserved as part of the string. No tabs anywhere in the block. No PyYAML/yq/js-yaml available in the review sandbox (`ModuleNotFoundError: No module named 'yaml'`), so YAML validity was confirmed by careful indentation inspection rather than a parser. Independent corroboration: the live PR's "Typecheck, test, build" and "Validate Caddyfile" jobs run this workflow file and are green.

## 2. Compose guard (`apps/api/test/infrastructure/compose-prod.test.ts`)

Verdict: **real, would-fail-on-drift, green.** It reads `docker-compose.prod.yml`, trims lines, keeps those starting `image: ghcr.io/aburra16/unbnd-`, then excludes `unbnd-tapestry-data-layer`. It asserts the matched set is non-empty (`toBeGreaterThan(0)` — "guard the guard" so a rename can't no-op it) and that each matched tag `.toContain("${UNBND_IMAGE_TAG")`.

- **Matched set:** 7 app images — web, api, seeder, promoter, indexer, shelves, librarian — all carrying `${UNBND_IMAGE_TAG:-latest}`. `postgres:16`, `getmeili/meilisearch:v1.10`, and `unbnd-tapestry-data-layer:latest` are correctly out (the first two don't match the `unbnd-` prefix; data-layer is the one explicit exclusion).
- **Fails on drift:** reproduced the guard logic in Node with a planted hardcoded `unbnd-seeder:abc123` line → one line fails `.toContain("${UNBND_IMAGE_TAG")` → assertion fails. Confirmed it catches the exact regression it's meant to.
- **Green:** passes in isolation and in the full suite.

## 3. Runbook accuracy (`docs/DEPLOY.md`)

Verdict: **accurate, no stale refs.** `grep -n "rev-parse HEAD\|export UNBND_IMAGE_TAG\|pull <svc>\|--profile.*pull"` over `docs/DEPLOY.md` returns nothing. The two operator procedures that previously carried a manual export/rev-parse are corrected:
- Shelves crontab: was `... UNBND_IMAGE_TAG=$(git -C /opt/unbnd rev-parse HEAD) docker compose ... run --rm shelves`; now a bare `docker compose ... --profile shelves run --rm shelves`, with a note that the deploy persists `UNBND_IMAGE_TAG` in `.env` (which compose auto-reads). Correct — compose reads `.env` from the project dir, so the bare run resolves to the deployed SHA.
- Librarian swap step 6: the `export UNBND_IMAGE_TAG=$(git rev-parse HEAD)` line is removed; the `up -d api` and `--profile shelves run --rm shelves` commands remain and now rely on the persisted `.env`. Correct and complete — both commands work without the removed export.
- The deploy summary (lines 91–92) accurately describes the new `.env` persist and its purpose (profile-worker `run` in a fresh shell resolves to the deployed SHA, not stale `:latest`).
- No AI-slop introduced: no em dashes in the added DEPLOY.md lines; prose is plain and declarative.

The seeder/indexer/librarian/shelves/swap procedures all read cleanly without the removed manual `pull`/`export`.

## 4. Scope + no behavior change

Verdict: **clean.** `git diff --stat origin/main...HEAD` = exactly staging.yml, the new test, DEPLOY.md, ADR 0060, story 61. `docker-compose.prod.yml` is unchanged (image lines already used the var; nothing for this story to edit there). No `apps/*/src` or `packages/*/src` files touched. The data-layer / postgres / meilisearch tags are untouched. The always-on rollout (export/pull/up -d/prune) is byte-identical; the only addition is the idempotent `.env` write.

## Things tests can't catch

- No secrets committed; the upsert deliberately preserves operator secrets in `.env` (only the `UNBND_IMAGE_TAG` line is touched).
- No leftover debug logging, no commented-out code.
- Edge cases handled: missing line (append), present line (replace), idempotent re-run, anchored match avoids false positives, pipefail-safe.
- Out-of-scope items (auto-running workers; data-layer/postgres/meili tags; app/worker behavior) correctly excluded.

## ADR adherence

Matches ADR 0060 in full: persist block placed after `git reset --hard`, idempotent single-line `^`-anchored upsert (matching the ADR's reference snippet), existing `export` + `pull && up -d` retained as belt-and-suspenders, runbooks drop manual `pull`/`export`, and the compose-consistency guard lives in a natural existing vitest home (`apps/api/test/infrastructure/`) with the data-layer/postgres/meili exclusions the ADR calls for. No new dependencies.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/api/test/infrastructure/compose-prod.test.ts:25`** — the data-layer exclusion is a substring check (`!line.includes("unbnd-tapestry-data-layer")`). Fine today and intentional. If a future SHA-tagged app image ever happened to contain that substring it would be wrongly excluded, but that's implausible given the naming scheme. No change required.

## Verdict
**PASS**
