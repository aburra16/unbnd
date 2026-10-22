# Review: Story 112 — Retire Meilisearch

**Reviewer:** independent reviewer
**Date:** 2026-10-22

## Round 1: PASS, no blocking findings
Verified in a separate worktree: frozen-lockfile install, typecheck, every test suite, the API and web builds, and the build and bundle of every worker whose Dockerfile runs them; both compose files resolve, and no Dockerfile refers to the indexer. The new retirement test fails 6 of 6 on main. `appliedTags` is unchanged; reader search, the trust re-rank, `/health/data`, duplicate checks on submit, the labels pass, catalog paging and the promotion, demotion and reveal cycles differ only by the removed index writes. The deploy leaves the old `unbnd-search` container running until `retire-meilisearch` removes it; the 04:20 cron line fails harmlessly until `install-cron` replaces the crontab; the leftover `.env` keys reach no container. The task is safe under `set -euo pipefail`, and `unbnd_search` is the volume's name for the project at /opt/unbnd.

Non-blocking, fixed after the verdict:
- Without `LIBRARIAN_PUBKEY` the API queried the relay for an empty author. The relay provider now refuses a key that is not hex, and the API, as it does for ratings, starts with search reporting itself unavailable and why (`/health/data`, a 503 from `/api/search`). Tests for both.
- Stale mentions of Meilisearch and the indexer removed from the data-layer doc, the test-plan and build-audit templates, the product role, and code comments in the API, the shelves worker and the relay package.
- The ops task lists any remaining search volume by pattern rather than one exact name; DEPLOY.md adds the old image and the dead `.env` keys, and warns that `SEARCH_URL` must not still point at Meilisearch.
- ADR 0013 is marked superseded in part (its provider interface remains, narrowed).

Accepted and recorded: no architecture guard replaces the old one; with one provider, its query details live in `nip50.ts`, and the `include:spam` token it uses also appears legitimately in the reviews relay sync, so a token guard would misfire.

## Quality gates (at HEAD)
- [x] typecheck, build and tests clean: api 1046 + 13 skipped, search 21, promoter 47, shelves 36, web 462, all other packages unchanged.

## Verdict
**PASS.** After merge and deploy: run `retire-meilisearch`, then `install-cron`; the operator removes the `unbnd_search` volume.
