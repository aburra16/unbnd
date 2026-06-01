# Review: Story 30 — Trust-gated submission promotion (manual, with signals)

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-06-01
**Diff:** `git diff main...feat/submission-promotion`
**Story:** `engineering-team/stories/done/30-trust-gated-promotion.md` (8 ACs; promote-only, demotion→30b)
**ADR:** `engineering-team/decisions/0031-trust-gated-promotion.md` (+ the submitted-by/worker amendment + the 2026-06-01 §3b remediation amendment)
**Test plan:** `engineering-team/stories/done/30-trust-gated-promotion.test-plan.md`

## Outcome: BLOCKED (B1) → remediated → APPROVED

First review found one BLOCKING issue; the team amended the ADR, added failing real-contract tests, wired the fix, and the re-review confirmed it closed with no regressions.

### B1 (blocking, first pass) — the web feature was not wired end-to-end
`CommunitySubmissions.tsx` rendered `canPromote`/`promotionStatus`/`signals` per row, but the real `GET /api/submissions` never produced them and nothing called the per-slug `/signals` endpoint. The web tests passed only because they mocked pre-enriched rows — a contract the server didn't fulfill. So in production no curator would see a Promote button, every row read "no trusted signal yet", and status never reflected truth. AC-2/AC-3 unmet through the actual product.

### Remediation (verified closed)
- ADR 0031 §3b pinned the enriched list contract.
- The real `GET /api/submissions` handler now produces all three fields server-side: `canPromote` (gate-aware, computed ONCE per request via `houseWeightOf`, stamped per row; anon/degrade → false; route never 500s), `promotionStatus` (ONE batched `readPromotionStatuses` read via `inArray`; absent → null), `signals` (per-row honest compute, null on none/degrade, no raw GrapeRank weight leaked).
- The web masking gap is structurally closed: the web test types its mock to the real `SubmittedBook` with the three fields required, so a dropped server field now fails at `tsc`.
- New `submissions-list-enriched.test.ts` (14) asserts the real route produces the fields, with anti-fanout assertions (`weights` called once for the session user; `readPromotionStatuses` called once with the batch).

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r test` — schemas 78, api 598 (+10 skipped pre-existing infra-gated), promoter 11, seeder 12, indexer 6, search 11, web 239. Zero failures.
- [x] `pnpm -r typecheck` — all 7 projects clean.
- [x] `pnpm -r build` + `pnpm --filter @unbnd/promoter bundle` — green (promoter `dist/index.js`, 306 KB).
- [x] `docker compose -f docker-compose.prod.yml config` + `-f docker-compose.yml config` — valid.

## Spec adherence (8 ACs)
- AC-1 emergent curator gate (session house-PoV weight ≥ configurable threshold) — PASS (server-computed, fail-closed).
- AC-2 per-submission signals computed + displayed — PASS (after remediation; real list endpoint produces + web renders).
- AC-3 manual curator-only Promote, server-enforced — PASS (anon 401 / below 403 / above enqueue; UI gated on `canPromote`).
- AC-4 promoted → catalog under `39999:<librarian>:<slug>`, below-bar stays in /submissions — PASS (matches seeder record shape, no special-casing).
- AC-5 configurable threshold — PASS (`CURATOR_THRESHOLD` env, (0,1]).
- AC-6 honest degrade, no fabricated signals — PASS (gate closes + signals null on all 4 degrade modes, never 500).
- AC-7 idempotent double-promote — PASS (UNIQUE(slug) `already` + same-address replace).
- AC-8 fixture-verified, no Brainstorm leak — PASS (all green on fixture provider; ADR-0014 guard green).

## Security / correctness (regression sweep, all hold)
- **LIBRARIAN_NSEC isolation:** only in `apps/promoter` (worker + its compose block); zero occurrences under `apps/api/src`; the `no-librarian-nsec-in-api` guard walks all of apps/api/src and is real, not tautological. Green.
- **Curator promote gate:** server-enforced, fail-closed; no client weight/observer spoof; threshold from config not request.
- **Worker:** canonical record under the librarian namespace (d-tag=slug, source:community, submitted-by hex); `FOR UPDATE SKIP LOCKED`; `finalizeEvent` (no hand-rolled crypto); publish local+dcosl; idempotent replace; one job's failure never aborts the run.
- **submitted-by schema:** additive/optional, hex on wire, round-trips, seeded records unchanged.
- **Test integrity:** deterministic (injected clock/ids/signer/publisher/queue/readPromotionStatuses; no live relay/DB/key; no Date.now in asserted output; no intra-module vi.mock); the `vi.fn` type-fix + type-tied web mock are sound; no test weakened/skipped.

## Findings
### Blocking
None (B1 remediated).

### Non-blocking (recorded in ADR 0031 + runbook; not regressions)
1. `curatorTagCount` is honestly `0` — tag-assertion signals are a future extension (rating signals fully computed). Follow-up: wire the tag read (reuse `aggregateBookTagsWeighted`).
2. No worker stranded-job / `failed`-retry reaper — within the ADR's authorized shape; a crashed worker strands a job in `promoting` until manual intervention. Follow-up: a reaper or a runbook re-arm step.

## Operator notes (docs/DEPLOY.md "Promotion worker")
Promoter is cron-fired under the `promote` profile (not part of the normal `up`); holds `LIBRARIAN_NSEC` (already in `/opt/unbnd/.env` for the seeder); `CURATOR_THRESHOLD` tunable on the api service; migration `0003_promotions` runs via the embedded migration path. Calibrate `CURATOR_THRESHOLD` on staging (mirroring the `PERSONALIZE_MIN_FOLLOWS=1` calibration) so a test curator clears the gate.

## Verdict
**APPROVED**
