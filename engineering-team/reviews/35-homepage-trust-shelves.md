# Review: Story 35 — Homepage trust shelves + `@unbnd/trust` extraction

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-06-02
**Diff:** `git diff main...feat/homepage-shelves`
**Story:** `engineering-team/stories/done/35-homepage-trust-shelves.md` (8 ACs)
**ADR:** `engineering-team/decisions/0036-homepage-trust-shelves.md` (+ 2026-06-02 `@unbnd/trust` extraction amendment)
**Test plan:** `engineering-team/stories/done/35-homepage-trust-shelves.test-plan.md`

## Verdict: APPROVED (zero blocking)

## Quality gates (run by reviewer, not trusted)
- `pnpm -r typecheck` — PASS (10 projects, zero errors).
- `pnpm -r test` — PASS: trust 21, shelves 26, web 290, api 739/10-skip, schemas 112, search 11, indexer 6, promoter 28, seeder 12. No flake.
- `pnpm -r build` + `pnpm --filter @unbnd/shelves bundle` (dist/index.js 243 KB) + `@unbnd/trust` typecheck — PASS.
- `docker compose -f docker-compose.prod.yml config` — PASS; `shelves` service valid, `profiles:["shelves"]`, **NO `LIBRARIAN_NSEC`**.

## Extraction behavior-preserving (verified)
`packages/trust/src` — `dedupeRatings`/`weightedRatings` byte-identical to main; `types.ts`/`fixture.ts` byte-identical; `brainstorm.ts` only swaps the apps/api `query` import for a self-contained `ws` default (severs the Config edge). Deps: `@unbnd/schemas` + `nostr-tools` + `ws` only; no apps/api import, no cycle. The apps/api re-export shim keeps all 15 import sites working (full apps/api suite green); `summarizeRatings`/`rawFromParsed`/`countOwnRatings` stayed local. ADR-0014 guard relocated to `packages/trust/test/architecture.test.ts`, green + real (forbidden Brainstorm/NIP-85 specifics in exactly `packages/trust/src/brainstorm.ts`).

## Spec adherence (8 ACs) — all PASS
- AC-1 Trending (weighted sum of trusted ratings in window; spam/window/order tested) · AC-2 Favorites (`average` gated `trustedCount ≥ min`) · AC-3 Genre (top-per-genre capped, honest-empty) · AC-4 cached/scheduled, serve never computes (migration `0005`; serve test asserts no trust call + one `#d` hydrate) · AC-5 honest empty · AC-6 degrade-no-crash + atomic replace (relay-throw → writer never called) · AC-7 house-PoV, ONE batched `weights` (no fan-out) · AC-8 fixture-CI + guards green.

## Worker / serve / web
Least-privilege worker (no NSEC; librarian pubkey only), atomic `sql.begin` replace scoped per observer; serve reads cache + one batched hydrate, honest-empty `{computedAt:null,…}`, no trust score on the wire; `Home.tsx` renders trust shelves only when non-empty, always-present labeled non-trust fallback, degrades a failed fetch to fallback; no new hex; copy slop-free.

## Deviations adjudicated
- **BookCard cover title → CSS `content`** — a11y IMPROVEMENT, not a regression: the semantic title stays a real DOM node (the caption); only the decorative `aria-hidden` cover echo moved to CSS, removing a duplicate screen-reader announcement. No other BookCard consumer affected; 290 web tests pass.
- **Genre name title-cased from slug** — NON-BLOCKING cosmetic (below).

## Test integrity
Relocated trust/weighting/guard tests are pure moves (assertions verbatim). New worker/serve/web tests deterministic (fixture trust, injected `now`, fake relay/cache, no Date.now in asserted output, no intra-module vi.mock). The `ReplaceShelvesFn.mock.calls` recording seam is a clean production observability hook (no vitest in prod). Nothing weakened/skipped; red set typechecked mock-shape-clean.

## Findings
### Blocking
None.

### Non-blocking (follow-ups)
1. **Genre display name** (`apps/api/src/db/index.ts` `genreNameFromSlug`): title-casing the slug diverges from the sentence-case taxonomy names for multi-word genres ("Science Fiction" vs "Science fiction"). Not visible at v1 (genre shelves empty until the trust graph fills). Recommend hydrating the name from the taxonomy (`GET /api/tags`) before shelves populate with real data.
2. **Duplicated `DEFAULT_HOUSE_OBSERVER`** hex in `apps/shelves/src/main.ts` and `apps/api/src/config.ts` (identical today). A shared constant would prevent drift.

## Scope/firewall
House-PoV only (For-You = Story 36, OUT; must compute the per-user vantage at read time, NOT extend this house cache per-POV). Cache is the bounded invariant-3 exception (recorded). No NSEC in shelves/serve; no new crypto; no business/grant/community content; ADR/story consistent.
