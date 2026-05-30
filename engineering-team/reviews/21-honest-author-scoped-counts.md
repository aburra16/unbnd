# Review: Story 21 — Honest author-scoped counts (paginate past the relay's 500-event cap)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-30
**Diff:** `git diff main...feat/honest-counts` (merge-base `0e2d3ea`, head `09e191e`)
**Story:** `engineering-team/stories/done/21-honest-author-scoped-counts.md`
**ADR:** `engineering-team/decisions/0021-honest-author-scoped-counts.md`
**Test plan:** `engineering-team/stories/done/21-honest-author-scoped-counts.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (exit 0, all packages).
- [x] `pnpm -r test` — **pass** (exit 0). API: **353 passed | 10 skipped** (48 files passed | 2 skipped). Web: **102 passed** (24 files). schemas 72, search 11, seeder 12, indexer 6 — all green. Story-21 suites: `query-paged.test.ts` (9), `profile-stats-paged.test.ts` (10), `shelves-paged.test.ts` (4), `profile-stats-capped.test.tsx` (3), `profile-me-capped.test.tsx` (2) = 28 new tests, all green. Story-18/19/20 suites (`profile-stats.test.ts`, `profile-stats-public.test.ts`, `shelves.test.ts`, `shelves-enriched.test.ts`, `profile-shelves-public.test.ts`) green. Architecture guards `test/search/architecture.test.ts` and `test/trust/architecture.test.ts` green.
- [x] `pnpm --filter @unbnd/web build` — **pass** (exit 0, 425 modules, built in 547ms).
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] Every acceptance criterion has a passing test.
  - **AC-1** (over-cap → true count): `profile-stats-paged.test.ts` asserts `booksRated`/`tagsApplied` = 1960 not 500; the unit test pages 1200 events across 3 calls. PASS.
  - **AC-2** (under-cap unchanged): `profile-stats-paged.test.ts` "≤500 author yields the same numbers, capped absent"; and the full pre-existing suites stay green. `queryEvents`/`queryRelayUrl` are byte-identical (additive diff, zero removed lines). PASS.
  - **AC-3** (dedup by id): unit tests "dedups an event repeated across the boundary created_at second (counted once)" and "advances the until cursor to the oldest created_at". PASS.
  - **AC-4** (shelves paginate): `shelves-paged.test.ts` membership read via `queryPaged` (author-scoped, both `/mine` and public); the chunked `#d` test renders a full 1200-book shelf. PASS.
  - **AC-5** (all four surfaces): over-cap tests on `/me/stats`, `/:npub/stats`, `/shelves/mine`, `/:npub/shelves`. PASS.
  - **AC-6** (guard + honest N+): `capped` listed for over-ceiling key, floor returned, never a wrong exact; web renders `10,000+`. PASS.
  - **AC-7** (cache amortizes): "runs the multi-page paged read at most once per TTL window" with injected clock. PASS.
  - **Timeout → omit**: unit test `rejects.toThrow()` on budget exhaustion; route test omits the thrown field and adds nothing to `capped`. PASS.
- [x] No criterion silently dropped. AC-6 was kept (guard adopted), per ADR Decision 2.
- [x] No behavior added beyond the story.

## ADR adherence
- [x] Files changed match ADR Implementation notes exactly: `query.ts` (constants + `PagedResult` + `queryAllPages` + `queryEventsPaged`), `profile-stats.ts` (`queryPaged` dep, `.events`/`.capped` split, `capped` array), `shelves.ts` (`queryPaged` membership + chunked `#d`), `index.ts` (sibling `queryPaged` wiring), `api.ts` / `ProfileMe.tsx` / `Profile.tsx` / `ProfileStats.tsx` (web `capped` + trailing `+`).
- [x] Layering respected: web stays UI, api stays server, no cross-import.
- [x] No new dependencies. No new tooling. No new package surface (mirror-not-extract per Q1).
- [x] Helper signatures (`countOwnRatings`, `countOwnAppliedTags`, `groupOwnShelves`) unchanged — empty diff; still take `SignedNostrEvent[]`.

## DList integrity
- [x] No new DList shape. Reads existing kind 39999 under the `book-ratings` / `book-tag-assertions` / `book-shelves` headers, author-scoped to the target hex.
- [x] Librarian pubkey resolved at runtime via `config.librarianPubkey` (`lib()` closures); no hardcoded npub/hex in source. The `1".repeat(...)` literals are test fixtures only.

## UI integrity
- [x] No new hex literal, no new token. The web change adds only a trailing `+` (`fmt(n, capped)`), and a per-cell `capped` boolean wired from `stats.capped?.includes(key)`.
- [x] No icon library; no SVG added.
- [x] No new copy string. No "N+" wording in body copy — just the numeral plus `+`. No copy-review trigger.
- [x] Guards against a spurious `+`: `profile-stats-capped.test.tsx` and `profile-me-capped.test.tsx` assert uncapped/omitted cells render the plain numeral with no `+`. PASS.
- [x] Trust tiers / GrapeRank N/A (single-author reads).

## Things tests can't catch
- [x] No secrets, no debug logging, no commented-out code in source.
- [x] Boundary logic correct (flagged item a): in `queryAllPages`, the loop breaks `capped:false` on `page.length < pageSize || added === 0` (exhaustion/plateau) BEFORE the `pages === maxPages - 1` check sets `capped:true`. So a short final page at the bound is exact; only a still-full last page at the bound is capped. Pinned by the two unit tests "stops at MAX_PAGES … capped:true" and "reaching the bound on a short final page is exact (capped:false)".
- [x] Total-budget throw (flagged item b): the budget check `if (now() - start > totalBudgetMs) throw` runs after each page's fetch and rejects — never returns a partial. Pinned by `rejects.toThrow()` and the route omit test.
- [x] `#d` chunking (flagged item c): `enrichedShelvesFor` slices `distinctSlugs` into ≤`RELAY_PAGE_SIZE` one-shot `deps.query` reads merged into `bySlug` with no ceiling; a 1200-book shelf renders fully. The fake catalog read truncates any slice >500, so an un-chunked read would drop books — the test fails on the bug and passes on the fix.
- [x] Race/concurrency: the two stats reads run via `Promise.all` with independent omit-on-throw wrappers; one throw omits only its field. Unchanged from Story 19/20.
- [x] Security: the unauthenticated `/:npub/stats` and `/:npub/shelves` fan-out is bounded at `MAX_PAGES = 20` (20 sequential REQs) per cold-cache miss, per ADR security rationale.

## Honesty invariant (the whole point)
- [x] Count is the TRUE count when ≤ bound (AC-1 tests: 1960, 600, 30, 12).
- [x] At the bound it is an explicit floor + `capped` key; web renders `10,000+` (AC-6 tests).
- [x] A throw (incl. total-budget exhaustion) OMITS its stat, never a partial-as-exact (timeout route test; migrated `profile-stats.test.ts` omit tests still green via the throw-propagating `queryPaged` wrapper).
- [x] Verified end-to-end across `/me/stats` and `/:npub/stats` (and the shelves surfaces, which paginate for completeness and discard `.capped` per ADR Decision 2).

## Disclosed test-mock fixture migrations did NOT weaken coverage
The five route test files (`profile-stats.test.ts`, `profile-stats-public.test.ts`, `shelves.test.ts`, `shelves-enriched.test.ts`, `profile-shelves-public.test.ts`) each gained one line: a `queryPaged` mock that `await`s the same routed one-shot `query` and wraps the result in `{ events, capped: false }`.
- [x] The wrapper `await query(filter)` inside an async function **propagates throws** (they are not swallowed) — so the omit-on-throw assertions still genuinely exercise the new paged path. `profile-stats.test.ts:179` (tagsApplied absent on tag-read throw) and `:192-193` (booksRated+reviews absent on ratings-read throw) are intact and green.
- [x] All original assertions preserved verbatim (present-checks, leak guards `not.toContain(LIB/TARGET_HEX/parentHeader/bookAtag)`, ghost-record omission). No assertion was deleted or relaxed.
- [x] The `asHexPubkey` coercions in the new paged test's fixture builders are type coercions on test pubkeys, not coverage changes.

## House rules check
- [x] PRD scope discipline: no §11.3 surface touched. Correctness fix, restores Story 19/20 promises.
- [x] POV-first: N/A — single-author reads (Stories 19/20). Honored.
- [x] No new lint/typecheck/build tooling. Paginator mirrors the indexer's proven `queryAllPages` (no lib, no new dependency).
- [x] No provider-seam leak: strfry reads only; search/trust seams untouched (architecture guards green).
- [x] npub-display / hex-internal: unchanged.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/api/src/nostr/query.ts` ~25 lines duplicate `apps/indexer/src/relay.ts`** — already flagged in ADR Consequences (Q1: mirror now, extract a `packages/*` paginator if a third consumer appears). Acknowledged debt, not a blocker.

## Verdict
**PASS**
