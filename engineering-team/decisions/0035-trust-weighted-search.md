# ADR 0035: Trust-weighted search re-ranking

**Status:** Proposed
**Date:** 2026-06-02
**Story:** `engineering-team/stories/34-trust-weighted-search.md`

## Context

Catalog search (Story 12 / ADR 0013) is trust-blind. `GET /api/search`
(`apps/api/src/routes/search.ts`) delegates to a provider-neutral `SearchProvider`
(`packages/search/src/types.ts`) and returns a `SearchResult` ordered by **text relevance
alone**. The Meili adapter (`packages/search/src/meili.ts`) requests `showRankingScore: true`
and maps Meili's `_rankingScore` onto the neutral `SearchHit.score` (`toHit`), so each hit
already carries a relevance score on the wire (`score?: number`, ~0..1). The route's contract
is fixed: `q` < `MIN_Q` (2) chars → empty result **HTTP 200**; a provider/backend failure →
**503** `search_unavailable`, never a 500. `DEFAULT_LIMIT = 20`, `MAX_LIMIT = 50`. The
ADR 0013 architecture guard (`apps/api/test/search/architecture.test.ts`) fails CI if any Meili
specific (`_rankingScore`, `searchableAttributes`, `/indexes/`, `MEILI_`, `estimatedTotalHits`,
etc.) appears outside `packages/search/src/meili.ts`.

PRD §2.9 (the SEARCH half) names the gap, verbatim: "after Meili returns by text relevance, the
API blends in trust-weighted rating from the observer's PoV (configurable blend) … **the blend
lives in the API, not in the search adapter**." Its acceptance bullet: "Search incorporates
trust-weighted rating as a configurable ranking signal, blended in the API (not the search
adapter)." Homepage shelves (Story 35) and the For-You shelf (Story 36) are explicitly OUT.

The trust machinery to reuse already exists and must not be reinvented (story "no new scoring
math"):

- **Observer resolution** — the ratings read (`GET /api/books/:slug/ratings`,
  `apps/api/src/routes/ratings.ts`): explicit `?observer=<npub|hex>` via `toObserverHex`
  (npub-or-hex → lowercase hex) else `config.houseObserverPubkey`; degrade-to-raw on any trust
  failure (`catch { weighted = null }`), never throw.
- **Trust weights** — `TrustProvider.weights(observerHex, raterHexes)`
  (`apps/api/src/trust/types.ts`): weights ∈ (0,1]; untrusted raters absent; **best-effort,
  never throws** (empty map on backend failure).
- **Trust-weighted average** — `weightedRatings(deduped, weights, observerNpub)`
  (`apps/api/src/ratings/summary.ts`): weighted mean over raters with weight > 0; returns
  **null** when no rater carries positive weight (the honest "no trusted signal from this view").
- **Fixture provider** — `apps/api/src/trust/fixture.ts` (`TRUST_PROVIDER=fixture` +
  deterministic `TRUST_FIXTURE`), per ADR 0017, gives a known observer known weights over a
  known rater set so the blend is CI-testable with no Brainstorm, relay, or human.

**Gate decisions made by the user (2026-06-02), baked into this ADR:**

1. Linear single-weight blend: env `SEARCH_TRUST_BLEND ∈ [0,1]`,
   `final = (1−w)·normText + w·normTrust`; `w=0` ⇒ pure text relevance (no-op).
2. Trust signal = the trust-weighted **average** rating (the same number the book page shows via
   `weightedRatings`), normalized 1..5 → 0..1; books with **no trusted signal get a neutral
   midpoint** (not 0, not fabricated).
3. **House-only vantage for v1** (`config.houseObserverPubkey`); the re-rank module signature
   takes an observer hex so `?observer=` (Yours) is a thin later add. Do NOT wire the query param
   or build the personalized search path / PoV UI now.
4. Thin-graph reality accepted: re-rank ≈ no-op until the graph fills; the fixture proves the
   blend works for when real signal arrives.

Architecture invariants (CLAUDE.md): POV-first (blend computed from the observer's vantage),
decentralized-first (signal emerges from GrapeRank weights, not an administered list),
filter-at-view-time (the blend is composed at read time over the adapter's results; nothing is
written back; no raw GrapeRank number is rendered — only the ORDER changes). No new crypto.

This is a read-time, page-bounded re-ranking of existing search results. No new DList shape, no
UI change, no new dependency.

## Options considered

### Option A — Linear single-weight blend in an `apps/api/src/search/` re-rank module, reusing `weightedRatings` + a single batched `weights` call (CHOSEN)

A new module `apps/api/src/search/rerank.ts` exports a pure function that takes the adapter's
text-relevance `SearchHit[]`, an observer hex, the blend weight `w`, and the trust/query/config
seams. It fetches the page's books' rating events, computes each book's trust-weighted average
via the shipped `weightedRatings`, normalizes both signals to 0..1, blends linearly, and
stable-sorts. The route resolves the house observer and calls it; on any trust failure it
returns the adapter's untouched order.

- **Pros.** One legible knob (`SEARCH_TRUST_BLEND`). Reuses `weightedRatings` /
  `TrustProvider.weights` / `toObserverHex` verbatim — no new scoring math. `w=0` is an exact
  no-op (pure text relevance), so the thin-graph default and the AC-3/AC-5 degrade are the same
  code path. Lives entirely in `apps/api`, reads only the neutral `SearchHit.score` → ADR 0013
  guard stays green. The module signature already takes an observer hex → `?observer=` is a thin
  future add (Story 36) with no reshape. Pure function + injected seams → fixture-verifiable
  without `vi.mock`.
- **Cons.** Linear is less expressive than a multiplicative or count-aware model (a single
  trusted 5-star and twenty trusted 4.5s contribute the same average). Accepted: count-awareness
  is a second tuning surface we explicitly defer (see Option C).

### Option B — Blend inside the search adapter (`packages/search`)

Push trust awareness into `MeiliProvider.search` so it returns already-blended order.

- **Pros.** One call site; the route stays thin.
- **Cons.** **Violates the ADR 0013 seam and the architecture guard** — the adapter would need
  trust knowledge and the route would lose the neutral text-relevance order it degrades to.
  `packages/search` would depend on `apps/api/src/trust` (a layering inversion). Directly
  contradicts PRD §2.9 ("the blend lives in the API, not in the search adapter"). Rejected.

### Option C — Count-aware / confidence-weighted trust signal

Blend in `trustedCount` (e.g. shrink the trust term toward neutral when few trusted raters back
a book) so thinly-rated books don't swing the order.

- **Pros.** More honest at the long tail; resists a lone 5-star.
- **Cons.** A second tuning surface (a shrinkage/confidence constant) on top of
  `SEARCH_TRUST_BLEND`, with no env story and no fixture precedent. The story's "no new scoring
  math" boundary and the user's gate both pick the average-plus-neutral model. `weightedRatings`
  already exposes `trustedCount`, so this remains a clean future ADR if the long tail misbehaves.
  Deferred, not rejected on merit.

## Decision

We chose **Option A**. It satisfies PRD §2.9 (blend in the API, configurable, observer-aware,
honest degrade), reuses the shipped trust read end-to-end, keeps the ADR 0013 seam intact, and
matches every gate decision. Below is the precise spec.

### The blend + normalization + neutral rule

A pure re-rank step over the page's hits:

```
normText(hit)  = clamp01(hit.score ?? 0)                  // Meili _rankingScore is ~0..1; clamp defensively
normTrust(book) = avg == null ? NEUTRAL : (avg − 1) / 4    // weightedRatings.average ∈ [1,5] → [0,1]
final(hit)     = (1 − w) · normText + w · normTrust
```

- **`w` = `config.searchTrustBlend`** (env `SEARCH_TRUST_BLEND`, see Config below). At `w = 0`
  the trust term vanishes and `final = normText` exactly — pure text relevance, the no-op
  (AC-3 text-only extreme, and the thin-graph default). At `w = 1` the trust signal drives the
  order among comparably-matching hits (AC-3 trust-dominant extreme).
- **`normText` = `clamp01(hit.score ?? 0)`.** Meili's `_rankingScore` already arrives as ~0..1
  on the neutral `SearchHit.score`. We clamp to [0,1] defensively (a missing score → 0; the
  module never reaches into a provider-specific field, only `SearchHit.score`). We do NOT
  re-min/max-normalize across the page — that would make order depend on the page's score spread
  and is unnecessary since the score is already a 0..1 relevance.
- **`normTrust` = `(avg − 1) / 4`** where `avg` is `weightedRatings(...).average` ∈ [1,5]. A
  trust-weighted 1.0 → 0.0, 3.0 → 0.5, 5.0 → 1.0.
- **Neutral midpoint `NEUTRAL = 0.5`** when `weightedRatings` returns **null** for a book (no
  trusted rater / empty weight map). Justification: 0.5 is exactly the normalized value of a
  3.0/5 average — the dead center of the rating scale. A no-signal book therefore contributes a
  trust term equal to a genuinely middling trusted book: it is **not sunk to 0** (which would
  bury a relevant-but-unrated book beneath a trusted-but-mediocre one — the AC-4 failure mode)
  and **not inflated to 1** (which would fabricate trust). At `w` ≤ 0.5 (our default region) a
  no-signal book keeps essentially its text standing, with at most a gentle pull toward the
  scale's center. This is a deliberate, documented constant — not a fabricated trust number, and
  no number is rendered on any surface.
- **Stable sort:** sort by `final` **descending**; ties preserve the adapter's incoming text
  order (a stable sort, or `final` desc with original index as the tiebreaker). So equal finals —
  including the all-neutral thin-graph case — exactly reproduce the text-relevance order
  (AC-1 / AC-5).

### Bounded + batched read (no N+1)

The re-rank reads ratings for **only the books on the returned page** (`hits`, already ≤ `limit`
≤ `MAX_LIMIT` = 50), and resolves weights in **one** `weights` call:

1. For each hit `slug`, build the book-address `39999:<config.librarianPubkey>:<slug>` (reuse the
   ratings route's `bookAddress` shape) and read its rating events:
   `query({ kinds: [39999], "#a": [addr] })` per book. This mirrors the per-book read the ratings
   route already does. Up to `limit` such reads (≤ 50); page-bounded, never the whole corpus.
   *(The reads MAY be issued concurrently via `Promise.all`; whether to batch them into a single
   multi-`#a` filter is an Implementer call — both are page-bounded. Keep the per-book shape if
   it lets `dedupeRatings` run cleanly per book.)*
2. `dedupeRatings` each book's events → that book's `ParsedRating[]`; collect the **union** of all
   rater hex pubkeys across the page into one set.
3. Resolve weights with **a single batched call**:
   `weights(observerHex, [...allRatersOnThePage])` — exactly the batching shape the ratings read
   uses (`deps.trust.weights(observerHex, deduped.map(r => r.pubkey))`), but unioned across the
   page so it is **one** call, not one-per-book. No per-book per-rater fan-out.
4. Per book, compute `weightedRatings(thatBooksDeduped, sharedWeightMap, observerNpub)` from the
   single shared weight map. `null` → `NEUTRAL`.

`limit`/`offset`/`total` are unchanged; re-ranking is confined to the returned page (AC-6).

### Honest degrade (never 500 on a trust failure)

The entire trust step is wrapped so a trust failure falls back to the adapter's pure
text-relevance order, identical to today's response:

- No `deps.trust` provider, or no resolvable observer hex, or `config.librarianPubkey` unset
  (no book-address) → skip the blend, return `result` as-is.
- `weights` resolves to an empty map / every book's `weightedRatings` is null → every `normTrust`
  is `NEUTRAL`; with a stable sort the order equals the text order (effective no-op).
- Any throw inside the trust step (`try { … } catch { return result }`) → return the adapter's
  order untouched. The trust layer **degrades silently to text-only**; it never throws and never
  500s.

The **existing route contract is preserved unchanged**: `q` < `MIN_Q` → empty 200 (the blend is
never reached); a **search provider/backend** error still throws out of `searchProvider.search`
and is caught by the route's existing `catch` → **503 `search_unavailable`**. Only the *trust*
layer degrades silently; the *search* layer keeps its 503. The re-rank wrapper must sit **after**
the awaited `searchProvider.search` so it cannot convert a search 503 into a trust no-op (i.e.
the trust try/catch wraps only the trust work, not the provider call).

### Observer seam (house-only v1; `?observer=` is a thin later add)

- v1 resolves **house-only**: `observerHex = config.houseObserverPubkey ?? null`. The route does
  **not** read `req.query.observer` and the web search page grows **no** PoV toggle (Story 36).
- The re-rank module signature takes `observerHex: string` (the vantage), so Story 36 adds the
  param by changing only the route's resolution line to mirror the ratings route
  (`observerParam ? toObserverHex(observerParam) : config.houseObserverPubkey`). The module is
  already observer-parametric (AC-2: two observers → two correct orderings). No reshape needed.

### Config

New env **`SEARCH_TRUST_BLEND`** on `Config` as `searchTrustBlend: number`, validated in
**[0,1]** in `loadConfig` (mirror the `CURATOR_THRESHOLD` validation block), **default `0.25`**.
Justification for 0.25: PRD §2.9 and the gate both call for a **conservative** default that
*nudges* rather than dominates. At `w = 0.25` text relevance keeps 75% of the weight, so trust
breaks ties and lifts strongly-trusted books a notch without letting a high trust score override
a clearly-better text match — and a no-signal book (NEUTRAL = 0.5) is pulled at most 0.125 toward
center, never buried. Distinct from `CURATOR_THRESHOLD` (a gate in (0,1]) and the other knobs;
this is a blend ratio in [0,1] where 0 is a meaningful no-op.

### Architecture-guard safety (ADR 0013 stays green)

The blend reads **only** the neutral `SearchHit.score`; it touches **no** Meili field
(`_rankingScore`, etc.) and adds **no** ranking logic to `packages/search`. The `SearchProvider`
interface and `MeiliProvider` are **unchanged** — the adapter still returns pure text-relevance.
All new code lives under `apps/api/src/search/` + the route + config, so the repo-wide guard
(`apps/api/test/search/architecture.test.ts`) and the ADR 0014 trust guard both stay green
(AC-7). No Meili token enters the new module.

## Consequences

- **Enables:** trust-weighted discovery via search (PRD §2.9), reusing the exact trust read that
  already powers the book page and genre consensus, with one legible env knob. POV-correct and
  ready for personalized search (Story 36) behind a one-line route change.
- **Constrains:** the trust signal is the weighted *average* only — count/confidence is not
  modeled (Option C deferred). The per-page trust read adds up to `limit` book-address reads plus
  one `weights` call per search request; bounded by `MAX_LIMIT` = 50, and skipped entirely when
  the blend is a no-op path. No caching is added in this story (a future ADR if the top of the
  page-size range proves hot).
- **Debt / follow-ups:** count-aware blending (Option C); `?observer=` + a search PoV toggle
  (Story 36); the homepage trust shelves (Story 35). On today's thin graph the re-rank is a no-op
  (house observer has no weights over our seeded raters) — search returns pure text relevance
  until the graph fills, which the fixture proves correct for when real signal arrives.
- **Affects existing fixtures?** No existing fixtures change. New fixture-mode test data
  (`TRUST_FIXTURE` weights + a fake search provider's known-scored hits + fake per-book rating
  reads) is authored in the new re-rank test and the search-route test (Test Design phase).
- **New dependency?** No.
- **PRD section change required?** No — this implements PRD §2.9's SEARCH half as written.

## Implementation notes

Concrete for the Implementer.

- **New file `apps/api/src/search/rerank.ts`** — exports a pure async function, e.g.
  `rerankByTrust(result: SearchResult, opts): Promise<SearchResult>` where
  `opts = { observerHex: string | null; blend: number; trust?: TrustProvider; query; config }`.
  - Guard: if `blend <= 0` or `!trust` or `!observerHex` or `!config.librarianPubkey` → return
    `result` unchanged (the no-op fast path).
  - Wrap the trust work in `try { … } catch { return result; }`.
  - Build per-book addresses (`39999:<librarianPubkey>:<slug>`), read events per book via
    `query({ kinds: [39999], "#a": [addr] })` (concurrently), `dedupeRatings` each, union the
    rater hexes, do **one** `trust.weights(observerHex, allRaters)`, then per book
    `weightedRatings(deduped, sharedWeights, npubEncode(observerHex))`.
  - `normText = clamp01(hit.score ?? 0)`; `normTrust = avg == null ? 0.5 : (avg − 1) / 4`;
    `final = (1 − blend) · normText + blend · normTrust`. Stable-sort hits by `final` desc,
    original index as tiebreaker. Return `{ ...result, hits: sorted }` (`total`/`offset`/`limit`
    untouched).
  - Reuse `toObserverHex` / `bookAddress` shapes from `apps/api/src/routes/ratings.ts` (extract a
    tiny shared helper if convenient, or inline the address builder — no new abstraction
    required).
- **File `apps/api/src/routes/search.ts`** — extend `SearchDeps` to
  `{ searchProvider; config: Config; query: (filter) => Promise<SignedNostrEvent[]>; trust?: TrustProvider }`.
  After `const result = await deps.searchProvider.search(...)` (still inside the route's existing
  try, so a provider error still 503s), resolve `observerHex = deps.config.houseObserverPubkey ?? null`
  and call `await rerankByTrust(result, { observerHex, blend: deps.config.searchTrustBlend, trust: deps.trust, query: deps.query, config: deps.config })`,
  then `res.json(...)`. Do **not** read `req.query.observer`.
- **File `apps/api/src/index.ts`** — change the wiring at the `buildSearchRouter` call (line ~425)
  from `{ searchProvider }` to
  `{ searchProvider, config, query: userEventDeps.query, trust }` (the same `query` and `trust`
  already injected into the ratings router via `userEventDeps`).
- **File `apps/api/src/config.ts`** — add `searchTrustBlend: number` to `Config`; in `loadConfig`
  parse `SEARCH_TRUST_BLEND` (default `"0.25"`), validate finite and in `[0,1]`, throwing the
  house-style `config: SEARCH_TRUST_BLEND must be a number in [0,1]; got …`.
- **No DList shape change.** Reads existing kind-39999 rating events; writes nothing.
- **No UI change, no copy.** Search results render the same fields in a new order; no trust
  number/tier/label is shown (CLAUDE.md). No `tokens.css` or icon change.
- **No new crypto, no new dependency, no new lint/build tooling.**

### Testable seams (fixture-verified; mirror the ratings/search route tests)

The re-rank function is a pure async function with **injected** `trust`, `query`, and `config` —
so tests construct a `FixtureTrustProvider` (known observer → known weights), a fake `query`
returning known rating events per book-address, and a fake `searchProvider` returning hits with
known `score`s, with **no intra-module `vi.mock`** (matching the dependency-injection style of
the ratings/search route tests). Seams to exercise each AC:

- **AC-1** — blend reorders: two hits of comparable `score`, one with higher trusted avg → it
  ranks higher than under text alone; assert the blend lives in `apps/api` (it does — new module).
- **AC-2** — house vantage: observer = `config.houseObserverPubkey` is what the module receives;
  swapping the fixture observer's weight row changes the order (proves observer-parametric).
- **AC-3** — both extremes: `blend = 0` → order == adapter text order; `blend = 1` → trusted avg
  drives order among comparable hits.
- **AC-4** — no-signal neutral: a fixture mixing trusted-rated and no-trusted-signal books; assert
  an unrated-but-relevant book keeps its text standing (NEUTRAL = 0.5), not sunk below a
  trusted-mediocre book.
- **AC-5** — honest degrade + preserved contract: trust absent / empty weight map / all-null
  `weightedRatings` → pure text order, no throw; `q` < 2 → empty 200; a thrown
  `searchProvider.search` → 503 `search_unavailable` (assert the trust catch does not swallow it).
- **AC-6** — bounded/batched: assert exactly **one** `weights` call per request over the page's
  union rater set, and that per-book reads are bounded by `limit` (≤ `MAX_LIMIT`).
- **AC-7** — guard green: the existing `apps/api/test/search/architecture.test.ts` stays green
  (new code carries no Meili token; reads only `SearchHit.score`).
- **AC-8** — all of the above run under `TRUST_PROVIDER=fixture` + deterministic `TRUST_FIXTURE`,
  no Brainstorm/relay/human; ADR 0014 + ADR 0013 guards stay green.

### Ripple / new files

- **New:** `apps/api/src/search/rerank.ts` (the blend module).
- **New (Test Design phase):** `apps/api/test/search/rerank.test.ts` (the blend unit/seam tests)
  and additions to the search-route test for the route-level degrade + contract.
- **Changed:** `apps/api/src/routes/search.ts` (extend `SearchDeps`, call the blend after the
  provider read); `apps/api/src/index.ts` (wire `config` + `query` + `trust` into
  `buildSearchRouter`); `apps/api/src/config.ts` + `apps/api/test/config.test.ts` (the new
  `SEARCH_TRUST_BLEND` env + validation).
- **Unchanged:** `packages/search/src/*` (the `SearchProvider` + `MeiliProvider` stay pure
  text-relevance); `apps/api/test/search/architecture.test.ts` (the guard, which must stay green);
  all web files (no UI/PoV change in this story).

## Out of scope

- Count-aware / confidence-weighted blending (Option C) — a future ADR if the long tail misbehaves.
- `?observer=` on `/api/search` and a search-page PoV toggle (Story 36 / personalized surfaces).
- Homepage trust shelves (Story 35); index-on-write (Block E); changing the `SearchProvider`
  interface, the Meili adapter, or the indexer; rendering any trust score on a search surface;
  caching the per-page trust read; new tooling.
