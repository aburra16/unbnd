# Test Plan: Story 21 — Honest author-scoped counts (paginate past the 500-event cap)

**Story:** `engineering-team/stories/21-honest-author-scoped-counts.md`
**ADR:** `engineering-team/decisions/0021-honest-author-scoped-counts.md`
**Date:** 2026-05-30

## Scope of these tests
The fix is a read-path correctness change. The behavior contract from the ADR:

- A new paginating read in `apps/api/src/nostr/query.ts`: `queryAllPages(fetchPage, opts?)` and `queryEventsPaged(config, filter)`, both returning `PagedResult = { events, capped }`. Until-cursor on `created_at`, page size 500, dedup by id across the boundary second, stop on short-page / plateau, `MAX_PAGES = 20` (→ `capped:true` at 10,000), per-page 8s / overall 25s budget that THROWS when exhausted, injectable `fetchPage` and `now`.
- The stats response gains an additive `capped?: ("booksRated"|"reviews"|"tagsApplied")[]` array (not per-field objects). Omit-on-throw and present-0 semantics are unchanged. Web renders a capped cell with a trailing `+` ("10,000+").
- The `#d` shelves enrichment read chunks `distinctSlugs` into ≤500 one-shot slices and merges; the shelf-membership read uses the paged variant.

All reads are exercised through an injected `fetchPage` / `query` / `queryPaged`. **No test touches a real relay.**

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (over-cap → true count) | `returns the TRUE booksRated/reviews/tagsApplied for an author with >500 events of a kind` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-1 | `uses the paginating read (queryPaged), not the one-shot query, for the counts` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-1 (public twin) | `returns the TRUE count for an over-cap public target via the paged read` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-1 (paginator unit) | `pages backwards by until until a short page, deduping by id, capped:false` | `apps/api/test/nostr/query-paged.test.ts` | unit |
| AC-2 (under-cap unchanged) | `a ≤500 author yields the same numbers as the single-page count, capped absent` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-2 (no regression) | full existing suites stay green (`profile-stats.test.ts`, `profile-stats-public.test.ts`, `ratings/own-counts`, `tags/own-counts`, `shelves-enriched`, `profile-shelves-public`) — see Verification | route/unit |
| AC-3 (dedup by id) | `dedups an event repeated across the boundary created_at second (counted once)` | `apps/api/test/nostr/query-paged.test.ts` | unit |
| AC-3 | `advances the until cursor to the oldest created_at of the page` | `apps/api/test/nostr/query-paged.test.ts` | unit |
| AC-4 (shelves membership paginates) | `public: feeds groupOwnShelves ALL membership events via the paged read, author-scoped` | `apps/api/test/routes/shelves-paged.test.ts` | route |
| AC-4 | `/mine: uses the paged read for the signed-in user's membership` | `apps/api/test/routes/shelves-paged.test.ts` | route |
| AC-4 (`#d` chunking) | `renders a >500-book shelf in full by chunking the #d catalog read into ≤500 slices` | `apps/api/test/routes/shelves-paged.test.ts` | route |
| AC-5 (all four surfaces) | `/me/stats` + `/:npub/stats` over-cap tests, `/shelves/mine` + `/:npub/shelves` membership + chunking tests | `profile-stats-paged.test.ts`, `shelves-paged.test.ts` | route |
| AC-6 (guard + honest N+) | `lists the over-the-ceiling stat key in \`capped\` and returns the floor, never a wrong exact` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-6 | `capped is absent (or empty) when no read hit the ceiling` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-6 | `booksRated and reviews are capped together when the ratings read hits the ceiling` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-6 (public twin) | `surfaces the capped key on the public twin too` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| AC-6 (paginator unit) | `stops at MAX_PAGES with a still-full last page and reports capped:true` | `apps/api/test/nostr/query-paged.test.ts` | unit |
| AC-6 (paginator unit) | `reaching the bound on a short final page is exact (capped:false), not capped` | `apps/api/test/nostr/query-paged.test.ts` | unit |
| AC-6 (web "10,000+") | `renders a capped value with a trailing + (the floored 'N+')` | `apps/web/test/components/profile-stats-capped.test.tsx` | component |
| AC-6 (web wiring) | `renders a capped stat key as the floored value with a trailing +` | `apps/web/test/routes/profile-me-capped.test.tsx` | component |
| AC-7 (cache amortizes) | `runs the multi-page paged read at most once per TTL window per target` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |
| Timeout → omit | `THROWS when the total wall-clock budget is exhausted mid-walk (never a partial)` | `apps/api/test/nostr/query-paged.test.ts` | unit |
| Timeout → omit (route) | `OMITS the field whose paged read throws (never a partial as exact)` | `apps/api/test/routes/profile-stats-paged.test.ts` | route |

## Edge cases covered
- Empty / short first page → exhausted, `capped:false` (`stops on a short first page`).
- Full page of pure duplicates → plateau stop, no infinite loop (`stops when a full page yields only duplicates`).
- Cursor advance to the oldest `created_at` of the page (`advances the until cursor`).
- A non-capped read never appears in `capped`; an un-capped stat renders a plain numeral with no `+` (web guard tests — these pass now and must stay passing).
- A thrown read contributes nothing to `capped` (Timeout → omit route test).
- Large-shelf wire boundary: no librarian or target hex, no `parentHeader` leaks at 600 books.

## Edge cases deliberately NOT tested (out of scope per ADR)
- A `capped` field on the **shelves** response. ADR Decision 2: the membership read paginates for completeness but the route discards `.capped` (no realistic author exceeds 10,000 shelf assertions, and the shelf view has no headline count). Not asserted, so the implementer is free to discard the flag.
- Real relay round-trip / WebSocket behavior of `queryRelayUrl` — unchanged by this story (`queryEvents` stays byte-identical, AC-2). `queryEventsPaged`'s shape is asserted via the no-relay-reachable path only.

## Test infrastructure
- Runner: Vitest (workspace default). API tests under `apps/api/test/`; web under `apps/web/test/`.
- Component tests: Vitest + Testing Library.
- **No relay / no crypto-from-scratch.** The paginator unit tests inject a fake `fetchPage`. The route tests inject `query` / `queryPaged` (and `now` for the cache). Fixtures sign with a deterministic `nostr-tools` test keypair via the existing `_fixtures` / wire-template helpers; no hand-rolled crypto.
- Fixtures introduced (the Tester's artifact, per ADR Consequences): in-file `manyRatings(pubkey, n)` / `manyTags(pubkey, n)` generators (`profile-stats-paged.test.ts`) and a `queryPaged`-returning-`PagedResult` mock routed by `#z`; a capped-aware fake `#d` catalog read in `shelves-paged.test.ts` that truncates any single slice at 500 (so an un-chunked read drops books — exactly the AC-4 failure mode). The paginator unit tests reuse the indexer's `ev(id, created_at)` pattern.
- No `docker compose` dependency for any test in this plan.

## How to run
```
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/web test
pnpm -r test
```

## Verification — tests fail with current code, for the right reason

Confirmed 2026-05-30 at commit `3f51bd5` (branch `feat/honest-counts`).

The paginator unit tests fail at the missing exports (`queryAllPages` / `queryEventsPaged` are not implemented). The route tests fail because `statsFor` / `enrichedShelvesFor` still call the one-shot `deps.query` (no `queryPaged` dep), so over-cap authors return 0/no events and the `capped` field is absent. The web tests fail because `fmt` does not append `+` and `ProfileStatsResponse`/`statCells` have no `capped`. **No failure is an import error in the test itself or a typo** — every red is "the new function/field is not implemented yet." The full pre-existing suites (330 API + 100 web) stay green, proving no regression and no collateral damage (AC-2 baseline).

### API (`pnpm --filter @unbnd/api test`)
```
 ❯ test/nostr/query-paged.test.ts (9 tests | 9 failed)
   × queryAllPages — paging + dedup (AC-1, AC-3) > pages backwards by until until a short page, deduping by id, capped:false
     → queryAllPages is not a function
   × queryAllPages — paging + dedup (AC-1, AC-3) > dedups an event repeated across the boundary created_at second (counted once) (AC-3)
     → queryAllPages is not a function
   × queryAllPages — paging + dedup (AC-1, AC-3) > advances the until cursor to the oldest created_at of the page
     → queryAllPages is not a function
   × queryAllPages — stop conditions > stops on a short first page (capped:false)
     → queryAllPages is not a function
   × queryAllPages — stop conditions > stops when a full page yields only duplicates (boundary plateau)
     → queryAllPages is not a function
   × queryAllPages — MAX_PAGES guard (AC-6) > stops at MAX_PAGES with a still-full last page and reports capped:true
     → queryAllPages is not a function
   × queryAllPages — MAX_PAGES guard (AC-6) > reaching the bound on a short final page is exact (capped:false), not capped
     → queryAllPages is not a function
   × queryAllPages — overall budget throws (Timeout → omit) > THROWS when the total wall-clock budget is exhausted mid-walk (never a partial)
     → queryAllPages is not a function
   × queryEventsPaged — wires queryAllPages to the relay read > returns a PagedResult shape ({ events, capped }) for an author-scoped filter
     → queryEventsPaged is not a function

 ❯ test/routes/profile-stats-paged.test.ts (10 tests | 10 failed)
   × over-cap author, true count (AC-1, AC-5) > returns the TRUE booksRated/reviews/tagsApplied for an author with >500 events of a kind
   × over-cap author, true count (AC-1, AC-5) > uses the paginating read (queryPaged), not the one-shot query, for the counts
   × under-cap unchanged (AC-2) > a ≤500 author yields the same numbers as the single-page count, capped absent
   × honest N+ under the guard (AC-6) > lists the over-the-ceiling stat key in `capped` and returns the floor, never a wrong exact
   × honest N+ under the guard (AC-6) > capped is absent (or empty) when no read hit the ceiling
   × honest N+ under the guard (AC-6) > booksRated and reviews are capped together when the ratings read hits the ceiling
   × overall-budget throw omits the field (Timeout → omit) > OMITS the field whose paged read throws (never a partial as exact)
   × public over-cap surface (AC-1, AC-5, AC-6) > returns the TRUE count for an over-cap public target via the paged read
   × public over-cap surface (AC-1, AC-5, AC-6) > surfaces the capped key on the public twin too
   × pagination amortized by the 60s cache (AC-7) > runs the multi-page paged read at most once per TTL window per target

 ❯ test/routes/shelves-paged.test.ts (4 tests | 4 failed)
   × membership read paginates (AC-4) > public: feeds groupOwnShelves ALL membership events via the paged read, author-scoped
   × membership read paginates (AC-4) > /mine: uses the paged read for the signed-in user's membership
   × #d enrichment chunks >500 distinct slugs (AC-4, AC-5) > renders a >500-book shelf in full by chunking the #d catalog read into ≤500 slices
   × #d enrichment chunks >500 distinct slugs (AC-4, AC-5) > does not leak the target or librarian hex on the wire for a large shelf

 Test Files  3 failed | 45 passed | 2 skipped (50)
      Tests  23 failed | 330 passed | 10 skipped (363)
```

### Web (`pnpm --filter @unbnd/web test`)
```
 ❯ test/components/profile-stats-capped.test.tsx
   × ProfileStats — honest capped cell (AC-6) > renders a capped value with a trailing + (the floored 'N+')
     → Unable to find an element with the text: 10,000+  (fmt does not append +)
 ❯ test/routes/profile-me-capped.test.tsx
   × ProfileMe — capped stat renders an honest N+ (AC-6) > renders a capped stat key as the floored value with a trailing +
     → Unable to find an element with the text: 10,000+

 Test Files  2 failed | 22 passed (24)
      Tests  2 failed | 100 passed (102)
```

## Fixture / fallout notes for the Implementer
1. **`queryAllPages` signature changed from the indexer's.** The indexer's is `queryAllPages(fetchPage, pageSize = 500): SignedNostrEvent[]`. The ADR's API version is `queryAllPages(fetchPage, opts?): PagedResult`, where `opts` is `{ pageSize?, maxPages?, totalBudgetMs?, now? }` and the return is `{ events, capped }`. The unit tests call the **opts form** (`{ pageSize: 3 }`, `{ pageSize, maxPages }`, `{ totalBudgetMs, now }`). Mirror the indexer's loop body but keep this opts/PagedResult shape.
2. **`capped` is computed from the still-full-last-page condition**, not from reaching `maxPages` alone. The test `reaching the bound on a short final page is exact` pins `capped:false` when the bound coincides with exhaustion (short final page). Only a full last page at the bound is `capped:true`.
3. **Total-budget throw must reject, not resolve.** The budget test asserts `rejects.toThrow()`. A partial result returned as if exact would re-introduce the very bug. Check the budget against the injected `now` after each page.
4. **`queryPaged` is a new dep on both `ProfileStatsDeps` and `ShelvesDeps`** (sibling to `query`), wired in `apps/api/src/index.ts` as `queryPaged: (filter) => queryEventsPaged(config, filter)`. `statsFor` reads `.events` into `countOwnRatings`/`countOwnAppliedTags` and `.capped` into the new array; `enrichedShelvesFor` uses `.events` for the membership read and discards `.capped`. Helper signatures (`countOwnRatings`, `countOwnAppliedTags`, `groupOwnShelves`) are unchanged — they still take `SignedNostrEvent[]`.
5. **`capped` array semantics:** `booksRated` and `reviews` are capped together (one ratings read); `tagsApplied` from the tags read. A thrown read omits its field(s) and adds nothing to `capped`. Absent or empty `capped` ⇒ nothing capped. The route tests assert exactly this composition.
6. **`#d` chunking is on the one-shot `deps.query`, not `queryPaged`.** The fake catalog read in `shelves-paged.test.ts` truncates any single `#d` slice to 500 entries; chunking into ≤500 slices is what makes the 1200-book shelf render in full. The slice size must be `RELAY_PAGE_SIZE` (500) and each `#d` array passed to `query` must be ≤500. The merge into `bySlug` already dedups.
7. **Web:** `ProfileStatsResponse` (`apps/web/src/lib/api.ts`) gains `capped?: ("booksRated"|"reviews"|"tagsApplied")[]`; `statCells` in `ProfileMe.tsx` (and `Profile.tsx`) sets each cell's `capped` from `stats.capped?.includes(key)`; `ProfileStats`'s `Stat` gains `capped?: boolean` and `fmt` appends `+` when set. The companion "no `+` when uncapped" web tests already pass and must keep passing (no spurious `+`).
8. **Library policy:** all event signing in fixtures goes through `nostr-tools` (`finalizeEvent` / `getPublicKey`) via the existing helpers — no hand-rolled crypto was added.
```
