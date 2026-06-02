# Review: Story 34 — Trust-weighted search re-ranking

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-06-02
**Diff:** `git diff main...feat/search-rerank`
**Story:** `engineering-team/stories/done/34-trust-weighted-search.md` (8 ACs)
**ADR:** `engineering-team/decisions/0035-trust-weighted-search.md`
**Test plan:** `engineering-team/stories/done/34-trust-weighted-search.test-plan.md`

## Verdict: APPROVED (zero blocking)

## Quality gates (run by reviewer, not trusted)
- `pnpm -r typecheck` — PASS (all 7 projects).
- `pnpm -r test` — PASS: api 749 passed / 10 skipped (85 files); web 282; schemas 112; search 11; promoter 28; seeder 12; indexer 6. No regressions. rerank+route suite re-run 3× — deterministic, no flake.
- `pnpm -r build` — PASS (web vite clean).
- Architecture guards: ADR 0013 search guard + ADR 0014 trust guard both green (real repo-wide scans).

## Spec adherence (8 ACs) — all PASS
- AC-1 blend in API after text relevance (`rerank.ts`), reorder isolated by a `blend:0` companion on identical data.
- AC-2 observer-aware (`weights(observerHex, …)`; parametric — house-only v1 via `config.houseObserverPubkey`).
- AC-3 configurable `SEARCH_TRUST_BLEND` (default 0.25, [0,1] validated); `w=0` returns input text order EXACTLY; `w=1` trust-drives.
- AC-4 no-signal neutral 0.5 (not sunk, not inflated, not fabricated).
- AC-5 honest degrade: trust failure → pure text order, 200, never 500; provider error still 503 `search_unavailable`; `q<2` empty 200 with no trust read.
- AC-6 bounded page-scoped reads (≤ MAX_LIMIT) + ONE batched `weights` call over the rater union (no N+1; `toHaveBeenCalledTimes(1)` through the real path).
- AC-7 architecture guard green — blend reads only `SearchHit.score`, no Meili specifics, `packages/search` untouched.
- AC-8 fixture-verified in CI; no Brainstorm/relay/human.

## Targeted assessments
- **Blend math** verified by hand: `normTrust=(avg−1)/4` (5→1.0/3→0.5/1→0.0), neutral 0.5, `final=(1−w)·clamp01(score)+w·normTrust`, stable sort via explicit original-index tiebreaker. Response returns the original hit objects reordered — no `final`/`index`/trust number on the wire.
- **Degrade/contract:** every throw site (`npubEncode`/`query`/`weights`/`weightedRatings`) is inside the rerank try/catch → text order 200; the provider read is awaited in the route try BEFORE rerank, so a provider error still 503s (the trust catch can't swallow it); `q<2` returns before any read.
- **Batched-once / bounded:** single `weights` over the unioned rater set; per-book reads bounded by page size.
- **API-only:** blend wholly in apps/api; no `packages/search`/web/indexer change; no Meili token in the new files.
- **Observer/vantage:** `observerHex` sourced only from the validated `config.houseObserverPubkey`; route does not read `req.query.observer`; ranking is read-only ordering — no harmful client spoof.

## Findings
### Blocking
None.

### Non-blocking
1. Config deviation: `searchTrustBlend?` is optional-in-type vs the ADR's "required" — SOUND, matches the established `curatorThreshold`/`propagateWrites`/`profileRelays` convention (`loadConfig` always sets it; route reads `?? 0`; full [0,1] validation intact). Not a type-safety hole.
2. Cosmetic doc-drift: the test-plan estimated 24 `it()` in `rerank.test.ts`; the shipped file has 18 (aggregate "~36" still holds).

## Test integrity
DI-only (real `FixtureTrustProvider`, fake `query`, signed kind-39999 fixtures), no intra-module `vi.mock`, no `Date.now()` in asserted output; non-tautological (the `blend:0` companion isolates trust; the parametric observer test isolates vantage); the 4 migrated route tests preserve prior intent (trust off → no-op → identical). Nothing skipped or weakened. The red set typechecked clean of mock-shape errors.

## Scope/firewall
Search ranking only — no homepage shelves (Story 35), no For-You (Story 36), no adapter/indexer change, no rendered trust score; no business/grant/community content; ADR/story consistent.
