# ADR 0021: Honest author-scoped counts — paginate past the relay's 500-event cap

**Status:** Proposed
**Date:** 2026-05-30
**Story:** `engineering-team/stories/21-honest-author-scoped-counts.md`

## Context

Story 20 made "honest counts" the founding rule of public profiles: a count is the true value or it is omitted, never fabricated. Verifying it live surfaced a third, illegal state — **silently capped**. Every author-scoped read in the API issues a single strfry `REQ` (`apps/api/src/nostr/query.ts` → `queryEvents` → `queryRelayUrl`) and stops at EOSE. strfry caps any one filter at `maxFilterLimit` (default **500**). So an author with more than 500 matching events of a kind is counted as exactly 500: a real-looking, wrong, un-flagged number.

**Live proof:** the Librarian's public profile reports `tagsApplied: 500`; the true count is ~1,960 (one baseline genre assertion per seeded book). The marquee "judge a curator on real activity" surface (Story 20 AC-4) is the most visible victim, and the bug worsens as the catalog and active curators grow.

The four affected reads all feed author-scoped filters into the single-REQ `query` and then count/group:

- `countOwnRatings` (`apps/api/src/ratings/summary.ts`) → `booksRated`, `reviews` — via `statsFor` in `apps/api/src/routes/profile-stats.ts`.
- `countOwnAppliedTags` (`apps/api/src/tags/aggregate.ts`) → `tagsApplied` — via `statsFor`.
- `groupOwnShelves` (`apps/api/src/shelves/aggregate.ts`) → shelves — via `enrichedShelvesFor` in `apps/api/src/routes/shelves.ts`.

Surfaced by `/api/profile/me/stats`, `/api/profile/:npub/stats`, `/api/shelves/mine`, `/api/profile/:npub/shelves`.

**Constraints carried in:**

- **Honest-counts invariant (Story 19/20):** a count is exact-present, omitted-on-throw (`undefined`), or — newly — an explicit capped signal. Never a wrong exact number. A true 0 is a present 0.
- **No new infra** (Story 21 out-of-scope): rides the existing 60s TTL cache (ADR 0020 Decision 4); no new caching/rate-limiting/pre-aggregation.
- **No new tooling, no hand-rolled relay logic** (CLAUDE.md house rule): mirror the indexer's proven paginator, do not add a lib.
- **POV-first does not apply:** these are single-author reads (Stories 19/20). Unchanged.
- **Security:** `/:npub/stats` and `/:npub/shelves` are unauthenticated public endpoints keyed by any npub. An unbounded multi-page walk is a relay-amplification surface; the 60s cache only protects repeat hits on the *same* npub, so the per-read bound is the real cap on fan-out.

**Prior art — already in this repo.** `apps/indexer/src/relay.ts` `queryAllPages` solves this exact cap: an `until`-cursor paginator that walks backwards by `created_at`, dedups by id across the boundary second, stops on a short page or a no-new-events plateau, and takes an **injected `fetchPage`** for testability. The indexer reads the full catalog this way (`apps/indexer/src/index.ts` L44–46). This is a read-path correctness fix on existing kinds (39999 under the `book-ratings` / `book-tag-assertions` / `book-shelves` headers); **no new DList shape**.

## Options considered

### Option A — Mirror the indexer's paginator into `apps/api/src/nostr/query.ts`, add a parallel `capped` signal to the stats shape, chunk the `#d` enrichment read

Add a `queryAllPages`-shaped author-scoped read next to `queryEvents`, mirroring `apps/indexer/src/relay.ts` (until-cursor, page size = the cap, dedup by id, stop on short page / plateau, injectable per-page fetch). Add a **max-pages guard** producing an honest "N+" via a parallel `capped: string[]` field on the stats response. Fold in the `#d` catalog-enrichment fix by chunking that fixed id-set read into ≤cap slices. Point the routes' injected `query` at the paginating read so the count/group helpers and route signatures don't churn.

- **Pros:** smallest correct fix; reuses the proven pattern verbatim; one read swap fixes all four surfaces; the helpers are untouched; the `capped` array is additive (existing `stats.X !== undefined` checks and `countOwnRatings`'s return type are unchanged); honest under a bounded, security-relevant ceiling.
- **Cons:** duplicates the indexer paginator (~25 lines) until a third consumer justifies extraction; the stats response grows a field the web must learn to render.

### Option B — Extract a shared `packages/relay-paginator` consumed by both indexer and API

Lift `queryAllPages` into a workspace package; both apps import it.

- **Pros:** no duplication; single home for the pagination contract.
- **Cons:** new package surface, new build/typecheck target, more than this bug needs. PO leans against it; CLAUDE.md says don't add tooling without cause. A two-consumer duplication is cheaper than a premature abstraction; defer to a refactor story if a third consumer appears.

### Option C — No guard: full pagination, exact count at all volumes (drop AC-6)

Walk every page to exhaustion, no ceiling.

- **Pros:** always exact; simplest mental model; AC-6 disappears.
- **Cons:** an unauthenticated `/:npub/stats` for a 100k-event spammer fans out 200 sequential REQs per cold-cache hit — a relay-amplification lever on a public endpoint. The cache only collapses repeats on the same npub; an attacker rotates npubs. The cost of a bounded ceiling with an honest "N+" is one integer comparison and one boolean. Not worth the exposure.

## Decision

We chose **Option A**.

It is the smallest fix that restores the honesty Stories 19/20 promised, reuses the indexer's proven paginator (house rule: mirror, don't reinvent), bounds the public relay-amplification surface, and stays additive to the existing response shape so the helpers and route signatures don't move. We accept ~25 lines of duplication with the indexer; a follow-up refactor story may extract a shared package if a third consumer appears (flagged in Consequences).

### Decision 1 — Paginating author read in `apps/api/src/nostr/query.ts`

Add a new function alongside `queryEvents` (do **not** change `queryEvents` — AC-2 demands the under-cap path stays byte-identical, and `aggregateBookTags` / per-book public reads still want the one-shot read):

```ts
const RELAY_PAGE_SIZE = 500;        // tracks strfry maxFilterLimit (indexer BATCH)
const MAX_PAGES = 20;               // ceiling: 20 × 500 = 10,000 events
const PAGE_TIMEOUT_MS = 8000;       // per-REQ budget (indexer uses 20s; 8s is ample on the local relay)
const TOTAL_BUDGET_MS = 25000;      // overall wall-clock budget across all pages

export type PagedResult = {
  readonly events: SignedNostrEvent[];
  readonly capped: boolean;         // true iff we stopped at MAX_PAGES with a still-full last page
};

/**
 * Read ALL of an author's matching events, paging past the relay's per-REQ cap.
 * Mirrors apps/indexer/src/relay.ts queryAllPages: until-cursor on created_at,
 * page size = the cap, dedup by id across the boundary second, stop on a short
 * page or a no-new-events plateau. Bounded at MAX_PAGES; `capped` is true when
 * the bound (not exhaustion) stopped the walk, so callers can surface "N+".
 * `fetchPage` is injected so tests never touch a real relay.
 */
export async function queryAllPages(
  fetchPage: (cursor: { until?: number; limit: number }) => Promise<SignedNostrEvent[]>,
  opts?: { pageSize?: number; maxPages?: number; totalBudgetMs?: number; now?: () => number },
): Promise<PagedResult> { /* … */ }

/** Author-scoped paginating read against config.strfryUrl — the drop-in for the
 *  helpers' injected `query`. Wires queryAllPages to queryRelayUrl with the
 *  per-page timeout, returning PagedResult. */
export function queryEventsPaged(
  config: Config,
  filter: NostrFilter,
): Promise<PagedResult> { /* fetchPage = (cursor) => queryRelayUrl(config.strfryUrl, { ...filter, ...cursor }, PAGE_TIMEOUT_MS) */ }
```

- **Loop body mirrors the indexer exactly:** dedup by id into a `Map`, track the oldest `created_at`, stop when `page.length < pageSize` (exhausted) or `added === 0` (plateau), else set `until = oldest`. The boundary-second overlap is absorbed by id dedup (AC-3).
- **Cap semantics:** if the loop reaches `maxPages` with the last page still full (`page.length === pageSize` and `added > 0`), set `capped = true` and stop. Reaching the bound exactly on exhaustion (short final page) is **not** capped — it is exact.
- **Timeouts (Q4):** per-page `PAGE_TIMEOUT_MS = 8s` (the API's 5s single-read budget is too tight for a 4+ page walk; the librarian's ~4 pages must complete). An overall `TOTAL_BUDGET_MS = 25s` wall-clock guard: if the budget is exhausted mid-walk, **throw** (do not return a partial as exact). A throw at the route layer omits the field (Story 19/20 omit-on-throw) rather than silently undercounting — honest by construction. `now` is injectable for budget tests.
- `queryEvents` is unchanged; `queryEventsPaged` is the new read the stats/shelves routes inject.

### Decision 2 — The bound + honest "N+" (the one decision that ripples to the web)

**Cap value: `MAX_PAGES = 20` → a 10,000-event ceiling.** Justification: the most active known author (the Librarian, ~1,960) is 4 pages; 10,000 is ~5× the worst legitimate case, so no real user hits it (AC-1 stays exact for everyone real). It bounds the unauthenticated public read at 20 sequential REQs per cold-cache miss, capping the relay-amplification surface (security rationale above). The page size stays `500` to track `maxFilterLimit` (no new magic number — same source the indexer's `BATCH` uses).

**Response-shape change (minimal, additive).** The current `Stats` shape encodes two states per field: present `number` (exact, including a true 0) and `undefined` (omit-on-throw). We add a **third** state — capped — without disturbing the first two, via a parallel `capped` key listing which stat keys hit the ceiling:

```ts
// apps/api/src/routes/profile-stats.ts
type Stats = {
  booksRated?: number;
  reviews?: number;
  tagsApplied?: number;
  /** Keys whose underlying read hit MAX_PAGES; their number is a floor ("N+"),
   *  not exact. Absent/empty ⇒ nothing capped. */
  capped?: ("booksRated" | "reviews" | "tagsApplied")[];
};
```

- Why a parallel array, not `{ value, capped }` per field: it is purely additive. Existing `statsFor` logic, the `countOwnRatings`/`countOwnAppliedTags` return types, the cache value type, and the web's `stats.booksRated !== undefined` present-checks all keep working unchanged. The three states compose cleanly: omit (`undefined`) > capped-floor (number + key in `capped`) > exact (number, key absent from `capped`). A 0 is never capped (the walk would have exhausted long before page 20), so present-0 is unambiguous.
- `statsFor` sets `capped` from the `PagedResult.capped` flags: `booksRated`/`reviews` are capped together (one ratings read), `tagsApplied` from the tags read. The omit-on-throw `Promise` wrapper is unchanged — a thrown read still omits its field(s) and contributes nothing to `capped`.
- **Web rendering** (`apps/web/src/lib/api.ts` `ProfileStatsResponse` gains `capped?: string[]`; `statCells` in both `ProfileMe.tsx` and `Profile.tsx`; `ProfileStats.tsx`): a capped cell renders the value with a trailing `+` (e.g. `10,000+`). `ProfileStats`'s `Stat` grows an optional `capped?: boolean`; `fmt` appends `+` when set. No "N+" wording in body copy, no new token, no icon — just the numeral plus `+`. Honest: it reads as a floor, never as an exact total.
- **Shelves surfaces** do not carry a `capped` field in the response: a capped shelf-membership read would mean >10,000 shelf assertions for one author, which is not a realistic MVP volume, and the shelf view renders book grids (not a headline count) so a floor indicator has no natural home. The `groupOwnShelves` read uses `queryEventsPaged` for completeness (AC-4) but the route discards the `capped` flag. (If a shelf count indicator is wanted later, it reuses this same parallel-key pattern — flagged, not built.)

### Decision 3 — `#d` catalog-enrichment chunking (Q3, folded in)

`enrichedShelvesFor` (`apps/api/src/routes/shelves.ts` L82) does a second read keyed by `"#d": distinctSlugs` — a **fixed id-set** read, not an author walk. A user with >500 distinct shelved books exceeds the cap here too, dropping books from the rendered shelves. This is the same class of bug (a single REQ capped at 500), so we fold it in.

Because it is a fixed id set with no `created_at` author-ordering, the until-cursor walk does **not** apply. Instead **chunk the slug list into ≤`RELAY_PAGE_SIZE` slices, issue one `queryEvents` (one-shot) per slice, and merge the results into `bySlug`**:

```ts
// inside enrichedShelvesFor, replacing the single #d read:
const bookEvents: SignedNostrEvent[] = [];
for (let i = 0; i < distinctSlugs.length; i += RELAY_PAGE_SIZE) {
  const slice = distinctSlugs.slice(i, i + RELAY_PAGE_SIZE);
  bookEvents.push(...(await deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": slice })));
}
```

Each slice is ≤500 `#d` filter values and the catalog has one current book event per slug, so each slice's result is itself ≤500 and never hits the cap. No ceiling needed here (the id set is finite and known). The merge into `bySlug` already dedups by slug. This read stays on the one-shot `queryEvents`, not `queryEventsPaged`.

### Decision 4 — Wiring (no route-signature churn)

The shelf-**membership** read inside `enrichedShelvesFor` (L70, the author-scoped `"#z": [shelvesConcept()], authors:[author]` read) and the two reads in `statsFor` swap from `deps.query` (one-shot) to the paginating read. The cleanest wiring honoring the injected-deps pattern:

- In `apps/api/src/index.ts`, the shared `userEventDeps.query` stays `queryEvents` (one-shot) — it backs per-book public reads, `aggregateBookTags`, and the `#d` enrichment chunks, all of which want the one-shot read. Add a sibling injected dep **`queryPaged: (filter) => queryEventsPaged(config, filter)`** passed to `buildProfileStatsRouter` and `buildShelvesRouter`.
- `statsFor` calls `deps.queryPaged(...)` for the ratings and tags reads, reading `.events` for the helpers and `.capped` for the new field. `enrichedShelvesFor` calls `deps.queryPaged(...)` for the membership read (uses `.events`, discards `.capped`) and keeps `deps.query` for the `#d` chunks.
- Helper signatures (`countOwnRatings`, `countOwnAppliedTags`, `groupOwnShelves`) are **unchanged** — they still take `SignedNostrEvent[]`; we just hand them the full paged `.events`.
- All four surfaces are fixed by these two read swaps + the `#d` chunking (AC-5). The 60s TTL cache (ADR 0020 Decision 4) sits in front, unchanged, so the multi-page walk runs at most once per TTL per target (AC-7) — the cache value type now also carries the `capped` info because it caches the whole `Stats`/`EnrichedShelf[]` result.

### Decision 5 — Invariants honored

- **Honest counts:** exact-present / omit-on-throw / explicit capped-floor; never a wrong exact number. The total-budget timeout throws rather than returning a partial as exact (AC-6).
- **npub-display / hex-internal:** unchanged; this touches only how many events the read sees, not identity handling.
- **No new tooling / no hand-rolled relay logic:** mirrors the indexer paginator; no lib, no dependency.
- **No provider-seam impact:** strfry reads only; the search provider and trust provider seams are untouched.
- **POV-first N/A:** single-author reads, per Stories 19/20.

## Consequences

- **Enables:** true author-scoped counts at all realistic volumes; the Librarian's marquee profile shows ~1,960, not 500; complete shelf grids for power-curators; an honest, bounded public read.
- **Constrains / debt:** ~25 lines of paginator duplication between `apps/indexer/src/relay.ts` and `apps/api/src/nostr/query.ts` — flagged for a future `packages/*` extraction story if a third consumer appears (Q1: mirror now, extract later). The stats response carries a new optional `capped` array the web must render.
- **Affects existing fixtures?** No data fixtures. Test fixtures: the Test Design phase adds a fake pager (mirroring the indexer's `fetchPage` injection) for the new `queryAllPages`/`queryEventsPaged` unit tests and over-cap route tests; that is the Tester's artifact, not this ADR's.
- **New dependency?** No.
- **PRD section change required?** No. This restores behavior Stories 19/20 already promised (honest-counts under phase2-prd §2.4 / §11.1); it does not expand scope (no §11.3 surfaces touched).

## Implementation notes

- File: `apps/api/src/nostr/query.ts` — add `RELAY_PAGE_SIZE = 500`, `MAX_PAGES = 20`, `PAGE_TIMEOUT_MS = 8000`, `TOTAL_BUDGET_MS = 25000`; add `PagedResult`, `queryAllPages(fetchPage, opts?)` (mirror `apps/indexer/src/relay.ts` loop, plus the max-pages ceiling, the `capped` flag, and the total-budget throw), and `queryEventsPaged(config, filter)`. Do **not** modify `queryEvents` or `queryRelayUrl` (AC-2).
- File: `apps/api/src/routes/profile-stats.ts` — add `queryPaged` to `ProfileStatsDeps`; in `statsFor`, swap the two reads to `deps.queryPaged`, read `.events` into the helpers and set `Stats.capped` from `.capped`. Add `capped?` to the `Stats` type and the cache value.
- File: `apps/api/src/routes/shelves.ts` — add `queryPaged` to `ShelvesDeps`; in `enrichedShelvesFor`, swap the membership read (L70) to `deps.queryPaged` (use `.events`); replace the single `#d` read (L82) with the chunked loop over `RELAY_PAGE_SIZE` slices on `deps.query`.
- File: `apps/api/src/index.ts` — add `queryPaged: (filter) => queryEventsPaged(config, filter)` to the deps passed to `buildProfileStatsRouter` and `buildShelvesRouter`. Leave `userEventDeps.query` (one-shot) for everything else.
- File: `apps/web/src/lib/api.ts` — add `capped?: ("booksRated" | "reviews" | "tagsApplied")[]` to `ProfileStatsResponse`.
- File: `apps/web/src/routes/ProfileMe.tsx` and `apps/web/src/routes/Profile.tsx` — `statCells` carries an optional `capped: boolean` per cell, set from `stats.capped?.includes(key)`.
- File: `apps/web/src/components/ProfileStats.tsx` — `Stat` gains `capped?: boolean`; `fmt` appends `+` when capped (`10,000+`). No new token, no icon, no body-copy string (so no copy-review trigger).
- DList: no new shape. Reads existing kind 39999 under `39998:<librarian>:book-ratings`, `…:book-tag-assertions`, `…:book-shelves`, author-scoped to the target hex. Librarian pubkey resolved at runtime via `config.librarianPubkey` (unchanged).

## Out of scope

- Extracting a shared `packages/relay-paginator` (deferred to a refactor story; mirror now).
- A `capped` indicator on the shelves response (the membership read paginates for completeness, but no realistic author exceeds 10,000 shelf assertions; pattern is reusable if wanted later).
- New caching, rate-limiting, or pre-aggregation (Story 21 out-of-scope; rides ADR 0020's 60s TTL).
- Changing count *definitions* (fixed by Stories 19/20, reused verbatim).
- Indexer changes (it already paginates correctly; read-only as the pattern source).
