# Story 34: Trust-weighted search re-ranking (Block D — the §2.9 SEARCH half)

**Status:** Draft
**Created:** 2026-06-02
**Type:** Feature

> **Gate decisions (2026-06-02):** linear `SEARCH_TRUST_BLEND` (∈ [0,1], default 0.25,
> `final = (1−w)·normText + w·normTrust`); weighted-avg signal `(avg−1)/4` + neutral midpoint
> 0.5 for no trusted signal; house-only v1 (observer seam ready for `?observer=`); thin-graph
> no-op accepted. See ADR `engineering-team/decisions/0035-trust-weighted-search.md`.

## Background

Catalog search ships today (Story 12 / ADR 0013). `GET /api/search?q=&limit=&offset=&genre=`
(`apps/api/src/routes/search.ts`) delegates to a provider-neutral `SearchProvider`
(`packages/search/src/types.ts`) and returns a `SearchResult` of `SearchHit`s ordered by
**text relevance** alone. The only search-backend-aware file is the Meili adapter
(`packages/search/src/meili.ts`): it requests `showRankingScore: true` and maps Meili's
`_rankingScore` onto the neutral `SearchHit.score` field (`toHit`), so each hit already
carries a relevance score on the wire. The route's contract is fixed: `q` under 2 chars
returns an empty result (HTTP 200, not an error), and a provider/backend failure returns
**503** (`search_unavailable`), never a 500. A repo-wide **architecture guard**
(`apps/api/test/search/architecture.test.ts`, ADR 0013) fails CI if any Meili specific
(`_rankingScore`, `searchableAttributes`, `/indexes/`, `MEILI_`, `estimatedTotalHits`, etc.)
appears **outside** `packages/search/src/meili.ts`. That guard is the seam this story must
respect: the search adapter stays pure text-relevance, and any ranking blend must live in
`apps/api`, never in the adapter.

Search ranking is **trust-blind**. Two books equally matching a query are ordered by Meili's
text score and nothing else, even when the observer's web of trust rates one far above the
other. The rest of the app already respects trust on read: ratings are trust-weighted from an
observer's vantage (`weightedRatings`, `apps/api/src/ratings/summary.ts`, ADR 0014), tag/genre
consensus is trust-weighted (Story 25 / ADR 0025), and submission promotion is trust-gated
(Story 30 / ADR 0031). Search is the conspicuous gap, and PRD §2.9 names it.

This story builds the **search half of PRD §2.9** and nothing else. Per §2.9: "after Meili
returns by text relevance, the API blends in trust-weighted rating from the observer's PoV
(configurable blend). Personalized users get their personal graph; house-PoV users get house
trust. **The blend lives in the API, not in the search adapter** (keeps the provider seam
clean)." Its acceptance bullet, verbatim: **"Search incorporates trust-weighted rating as a
configurable ranking signal, blended in the API (not the search adapter)."** The homepage
shelves (Trending / Community Favorites / genre rows) and the For-You shelf are **separate
later Block-D stories** (Stories 35 and 36) and are explicitly OUT of this one.

**The trust machinery to reuse (no new scoring math).** The observer-resolution pattern is
established by the ratings read (`GET /api/books/:slug/ratings`,
`apps/api/src/routes/ratings.ts`): resolve the vantage as the explicit `?observer=<npub|hex>`
param (via `toObserverHex`, npub-or-hex → lowercase hex) else `config.houseObserverPubkey`;
fetch weights via `TrustProvider.weights(observerHex, raterHexes)`; compute the trust-weighted
average via `weightedRatings`, which returns **null** when no rater carries positive weight
(the honest "no trusted signal from this view" state). The `weights` seam **never throws**
(empty map on backend failure, per the `TrustProvider` contract,
`apps/api/src/trust/types.ts`), and the ratings read degrades to raw on any trust failure
(`catch { weighted = null }`). This story reuses that exact pattern: for the books on a search
result page, the API fetches each book's trust-weighted rating from the observer's vantage and
blends that signal with the text-relevance score the adapter already returned.

**Build/test isolation (§2.0 / ADR 0017).** As a trust-consuming feature, this is built and
verified against the **fixture `TrustProvider`** (`apps/api/src/trust/fixture.ts`, selected by
`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE`): a known observer with known
weights over a known set of rater keys, so the re-ranking is deterministic and CI-testable
with no Brainstorm, no relay, and no human, exactly as Stories 25 and 30 are.

**The web surface.** The `/search` results page (`apps/web/src/routes/Search.tsx`) and the
instant dropdown (`apps/web/src/components/SearchBox.tsx`) talk only to `/api/search` via
`api.search(q, { limit, offset, genre? })` (`apps/web/src/lib/api.ts`). Unlike BookDetail
(which carries a `PoVBar` House⇄Yours toggle and threads `?observer=` into the ratings/tags
reads), the search page **does not pass an observer today** — it calls `api.search` with no
vantage. Whether `/api/search` gains a `?observer=` (Yours) for v1 or stays house-only is a
gate decision (Flags below).

**Architecture invariants (CLAUDE.md).** POV-first (§1): re-ranking is computed from the
observer's vantage (house default; the user's personal graph when personalized). Decentralized-
first (§2): the trust signal emerges from the observer's GrapeRank weights, never an
administered list. Filter-at-view-time (§3): the blend is composed at **read time** in the API
over the adapter's results; nothing is written back, and no raw GrapeRank number is exposed on
any surface (the result ordering changes; no trust score is rendered). No new crypto: this
story reads weights and reorders results — it signs nothing (CLAUDE.md crypto policy).

This is Phase-2 / Block-D scope and touches **no** PRD §11.3 / §3-deferred "Out of Scope"
surface: no payments, no Blossom/file hosting, no ebook sales, no bounty marketplace, no
print-on-demand, no social feed, no reading progress, no federation, no email notifications,
no index-on-write (Block E), and no homepage shelves.

## User-facing description

As a **Reader** searching the catalog, I want results that match my query to be ordered so
that books the people I (or the house) trust have rated well rise toward the top, rather than
ordered by text match alone, so that a search for "victorian novels" surfaces the ones trusted
curators actually rate highly first. When no trusted signal exists for the matching books, I
still want full, honestly-ordered results by text relevance, never a blank page and never a
fabricated ranking.

As a **Curator** whose ratings carry trust weight from my own (or the house) vantage, I want
my judgments to shape search ordering the same way they already shape a book's rating average
and its genre consensus, so that careful rating improves discovery and not just the single
book page.

## Acceptance criteria

Testable from the outside. Each criterion is independently testable **against the fixture
`TrustProvider`** (`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE` giving a known
observer known weights over a known set of rater keys), with no Brainstorm call, no relay, and
no human, mirroring how the Story 25 and Story 30 trust tests are structured. The blend weight
is a **configurable** value; tests pin it to fixture values and assert ordering on both ends of
its range (text-only at one extreme, trust-dominant at the other). Any copy in these ACs is
illustrative and must pass the no-slop rule (`memory/feedback_unbnd_copy_and_visual.md`); final
strings are the Architect/Implementer's within that constraint. No raw GrapeRank number appears
on any search surface (the ordering changes; no trust score is rendered). No new crypto.

- [ ] **AC-1 — Search blends a trust-weighted rating signal into ranking, in the API, after
  the adapter's text relevance.** Given a query whose results include books with differing
  trust-weighted ratings from the active observer's vantage, when `GET /api/search` returns,
  then the final hit order reflects **both** the adapter's text-relevance score (the `score`
  the `SearchProvider` already returns, sourced from Meili's `_rankingScore`) **and** a
  trust-weighted rating signal for each result book, combined **in `apps/api`** (the route /
  a re-ranking module under `apps/api/src`), **not** in `packages/search`. Given two books of
  comparable text relevance, the one with the higher trust-weighted rating from the observer's
  vantage ranks higher than it would under text relevance alone. The `SearchProvider`
  interface and the Meili adapter are unchanged: the adapter still returns text-relevance-only
  results.

- [ ] **AC-2 — The blend is observer-aware: house by default, the observer's vantage when
  specified.** Given the active observer is the default house observer (`config.houseObserverPubkey`),
  when results are re-ranked, then the trust-weighted rating signal is computed from the **house**
  vantage. Given an explicit observer is supplied (the same `?observer=<npub|hex>` resolution
  the ratings read uses via `toObserverHex`, IF the gate adopts a personalized search vantage
  for v1 — see Flags), when results are re-ranked, then the signal is computed from **that**
  vantage, and two observers can see two different orderings for the same query, both correct
  (POV-first). The observer resolution mirrors the ratings path exactly (explicit param else the
  house observer); no other vantage source is introduced.

- [ ] **AC-3 — The blend weight is configurable (env), and the two extremes behave as
  specified.** Given the text-vs-trust blend is set by configuration (an env weight; the
  Architect pins the name and default per Flags), when it is changed, then the contribution of
  the trust signal to the final order shifts with no code change. At the **text-only** extreme
  the order equals the adapter's text-relevance order (trust has zero effect); at the
  **trust-dominant** extreme the trust-weighted rating drives the order among comparably-matching
  results. Tests pin the weight to fixture values and assert ordering on both ends.

- [ ] **AC-4 — A book with no trusted rating signal is not penalized to the bottom, and the
  no-signal behavior is defined.** Given a result book for which the observer has **no**
  trusted rating signal (no trusted rater, or `weightedRatings` returns null for it), when
  results are re-ranked, then that book is treated by the **defined neutral rule** (Open
  Question 2 / Flags — PO recommends a neutral midpoint / "absent signal" treatment, NOT a
  zero that sinks it below trusted-but-mediocre books, and NOT a fabricated trust number), so
  an unrated-but-relevant book keeps its text-relevance standing rather than being buried. The
  chosen no-signal rule is documented and tested with a fixture mixing trusted-rated and
  no-trusted-signal books.

- [ ] **AC-5 — Honest degrade: a trust failure falls back to pure text relevance and never
  500s.** Given trust is unavailable (no observer configured, the provider errors, the observer
  has no scores, or `weights` resolves to an empty map per the `TrustProvider` contract), when
  `GET /api/search` runs, then it returns the adapter's **pure text-relevance** order (the same
  results the route returns today), never throwing and never fabricating a trust number. A
  trust failure **degrades**; it does not error. The existing failure contract is preserved: a
  short query (<2 chars) still returns an empty 200, and a **search provider/backend** failure
  still returns **503** (`search_unavailable`) — only the *trust* layer degrades silently to
  text-only.

- [ ] **AC-6 — The blend respects the page boundary; the trust read is bounded and batched (no
  N+1).** Given a result page of up to the route's max page size (`limit`, capped at the
  route's `MAX_LIMIT`), when the API blends in the trust signal, then it fetches the
  trust-weighted rating for **only the books on that page** (bounded by `limit`), and resolves
  trust weights via the existing seam in a **bounded, batched** way (a single `weights` call
  over the page's rater set, mirroring how the ratings read batches one `weights` call per
  book-address read), with **no per-book per-rater fan-out** that scales unbounded. Re-ranking
  is confined to the returned page; the route's `limit`/`offset`/`total` contract is unchanged.

- [ ] **AC-7 — The architecture guard stays green: no Meili specifics and no ranking-blend
  logic leak across the seam.** Given the blend is implemented in `apps/api`, when the test
  suite runs, then the ADR 0013 architecture guard (`apps/api/test/search/architecture.test.ts`)
  stays **green**: no Meili specific (`_rankingScore`, `searchableAttributes`, `/indexes/`,
  `estimatedTotalHits`, `MEILI_`, etc.) appears outside `packages/search/src/meili.ts`, and the
  `SearchProvider` interface / the adapter remain pure text-relevance (the trust blend lives
  entirely in `apps/api`). The blend reads the neutral `SearchHit.score`; it does not reach into
  any provider-specific field.

- [ ] **AC-8 — Built and verified against the fixture provider in CI.** Given
  `TRUST_PROVIDER=fixture` with a deterministic `TRUST_FIXTURE` giving the active observer known
  weights over a known set of rater keys, when the test suite runs in CI, then the API-side blend
  + reordering (AC-1), the observer awareness (AC-2), the configurable weight at both extremes
  (AC-3), the no-trusted-signal neutral treatment (AC-4), the text-only honest degrade + the
  preserved short-query/503 contract (AC-5), and the bounded/batched page-scoped trust read
  (AC-6) are all exercised green with no Brainstorm call, no relay, and no human. No
  Brainstorm/NIP-85 specifics leak outside `apps/api/src/trust/brainstorm.ts` and the ADR 0014
  trust architecture guard stays green; the ADR 0013 search architecture guard stays green
  (AC-7).

## DList shapes touched

No **new** shapes. This reads existing events, adds a read-time re-ranking *view* over the
existing search results, and writes nothing.

- `kind:39999` — book **rating** events under each result book's address (read; the
  trust-weighted rating signal per result book is computed over these via the existing
  `weightedRatings` / `dedupeRatings` view, ADR 0014, keyed by rater pubkey for weighting).
- The search **index documents** (the `SearchDocument` / `SearchHit` shape, ADR 0013) — read
  only, via the existing `SearchProvider.search`; the adapter is unchanged and still returns
  text-relevance order with a neutral `score`.
- Trust weights consumed via the existing `TrustProvider` seam (`apps/api/src/trust/`); the
  fixture provider supplies deterministic weights in CI.

## Out of scope

State explicitly — do not build. Several are named so the Architect inherits the boundary:

- **Homepage trust shelves** — Trending, Community Favorites, and genre rows (PRD §2.9). A
  **separate later Block-D story (Story 35)**. This story changes only search-result ordering;
  it adds no shelf, no Home-page query, no "last 7 days" trending computation.
- **The For-You personalized shelf** (PRD §2.9) — a **separate later Block-D story (Story 36)**.
  No personalized recommendation surface here.
- **Index-on-write** (PRD §2.11, Block E) — search re-ranking reads the existing batch-built
  index; it does not change when or how the index is written.
- **The house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → the production librarian). The interim
  house vantage (nosfabrica) stays; the feature is built and verified against the fixture
  provider regardless (ADR 0017 / PRD §2.0).
- **Changing the `SearchProvider` interface, the Meili adapter, or the indexer.** The adapter
  stays pure text-relevance and unchanged; the blend lives in `apps/api`. No new searchable
  attribute, no Meili-side ranking rule, no provider-side trust awareness (that would break the
  ADR 0013 seam and the architecture guard).
- **Rendering any trust score / GrapeRank number on a search surface.** Re-ranking changes the
  ORDER; it does not show a number, a tier string, or a "trusted" label on search results
  (CLAUDE.md). Whether search hits gain a House⇄Yours `PoVBar` like BookDetail is a UX/Flags
  question, not a requirement of this story.
- **A new trust-weighting or ranking algorithm.** This reuses the shipped `weights` /
  `weightedRatings`; the only new computation is the single configurable text-vs-trust blend
  and the defined no-signal treatment (AC-3/AC-4). No new GrapeRank math, no new scoring source.
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": this story touches none of payments, file
hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed, reading
progress, federation, or email notifications. It is a read-time, page-bounded trust-weighted
re-ranking of existing search results, blended in the API, with an honest text-only degrade.

## Open questions

Resolve before approving the story (PO recommendations in Flags below).

1. **The blend model + how the two scores combine.** A single env blend weight (e.g.
   `SEARCH_TRUST_BLEND` ∈ [0,1]) mixing a **normalized text-relevance score** and a **0..1
   trust signal**? How does the Meili `_rankingScore` (already 0..1-ish via `showRankingScore`)
   normalize against a trust-weighted rating (a 1..5 average → normalize to 0..1)? PO position:
   a single weight `final = (1 − w)·normalize(text) + w·normalize(trustRating)`, both
   normalized to 0..1, computed per page in the API. Architect confirms the exact normalization
   and combination function and pins the env name + default.

2. **No-trusted-signal behavior (AC-4).** What score does a book with no trusted rating from the
   observer get in the blend? PO recommends a **neutral midpoint / absent-signal treatment**
   (the trust term contributes neutrally, so the book keeps its text-relevance standing) rather
   than a **zero** (which buries unrated-but-relevant books below trusted-but-mediocre ones) or
   a **fabricated** number. Architect picks the exact neutral value/rule; tests pin it (AC-4).

3. **Personalized vs house for v1.** Does `/api/search` take `?observer=` (Yours) like
   ratings/tags, with the web search page gaining a House⇄Yours toggle, or is search **house-PoV
   only** for v1 (simpler, and the search page has no `PoVBar` today)? PO recommends **house-only
   for v1** with the route written so `?observer=` is a thin add later (Story 36 / personalized
   surfaces), but flagging it for the gate. AC-2 is written to allow either.

4. **Page-size / performance bound (AC-6).** Confirm the trust read is bounded by the route's
   page size (`limit`, default 20, capped at `MAX_LIMIT` = 50; the instant dropdown asks for
   ~6). PO position: fetch ratings for the page's books and resolve weights in **one batched
   `weights` call** over the page's rater set, no per-book per-rater N+1. Architect confirms the
   batching shape and whether the per-book rating reads themselves need bounding/caching at the
   top of the page-size range.

## Flags for the gate (PO — contentious; the user decides)

- **The blend model + config (Open Question 1).** PO recommends a **single env blend weight**
  (`SEARCH_TRUST_BLEND` ∈ [0,1], default conservative, e.g. text-leaning) mixing
  normalized text-relevance and a normalized 0..1 trust-weighted-rating signal:
  `final = (1 − w)·normText + w·normTrust`. It is one legible knob, reuses `weightedRatings`,
  and degrades to pure text at `w = 0`. The alternative (a multiplicative boost, or a
  count-aware signal that also weights *how many* trusted ratings a book has) is more
  expressive but introduces a second tuning surface. The user picks; the choice sets AC-1/AC-3.

- **What the trust signal IS + the no-signal rule (Open Question 2 / AC-4).** PO recommends the
  trust signal be the **trust-weighted average rating** from `weightedRatings` (the same number
  the book page shows), normalized to 0..1, with a **neutral midpoint** when there is no trusted
  signal so an unrated-but-relevant book is **not** sunk below trusted-but-mediocre books and
  **not** given a fake number. A **count-aware** variant (a book with one trusted 5-star rating
  shouldn't necessarily beat one with twenty trusted 4.5s) is the considered alternative and is
  worth the user's call. This is load-bearing for honesty; confirm.

- **Personalized vs house for v1 (Open Question 3).** PO recommends **house-PoV only for v1**:
  search re-ranks from the house observer's vantage, the route is written so `?observer=` (Yours)
  is a thin later add, and the web search page does **not** grow a House⇄Yours toggle in this
  story (the personalized surfaces are Stories 35/36). The alternative is to thread `?observer=`
  now for parity with BookDetail. The user decides whether v1 search is house-only.

- **Thin-graph reality.** On today's graph (interim house observer = nosfabrica, no real trust
  weights over our seeded rater keys), **no result book has a trusted rating signal**, so in
  practice **re-ranking is a no-op and search returns pure text relevance** until the graph fills
  in, exactly as ratings/tags/promotion are effectively raw/librarian-only today (Stories 25/30).
  PO recommendation: **acceptable for v1** — it is the honest, safe state (text-only ordering,
  no fabricated trust), and the fixture provider proves the whole blend works for when real
  signal arrives. The user confirms "search ranks by text relevance until the graph fills" is
  acceptable for v1.

## Linked artifacts
- PRD: `engineering-team/phase2-prd.md` **§2.9** (the charter — the SEARCH re-ranking half:
  "after Meili returns by text relevance, the API blends in trust-weighted rating from the
  observer's PoV (configurable blend) … the blend lives in the API, not in the search adapter";
  AC: "Search incorporates trust-weighted rating as a configurable ranking signal, blended in
  the API (not the search adapter)"), §2.0 (fixture/CI sequencing), §2.11 (index-on-write —
  OUT, Block E).
- Search ADR + seam: `engineering-team/decisions/0013-catalog-search.md` (the provider-neutral
  `SearchProvider`, the Meili-only adapter, the architecture guard, the `GET /api/search`
  contract). Code: `apps/api/src/routes/search.ts`, `packages/search/src/{types,meili,index}.ts`,
  `apps/api/test/search/architecture.test.ts`, `apps/web/src/routes/Search.tsx`,
  `apps/web/src/components/SearchBox.tsx`, `apps/web/src/lib/api.ts` (`api.search`).
- Trust ADRs: `engineering-team/decisions/0014-graperank-personalize.md` (the `TrustProvider`
  `weights`/`hasScores` seam + observer resolution + `weightedRatings`),
  `0025-weighted-consensus.md` (the weighted-consensus pattern the re-ranking signal mirrors),
  `0017-fixture-trust-provider.md` (the fixture provider this is verified against). Code:
  `apps/api/src/ratings/summary.ts` (`weightedRatings`/`dedupeRatings`),
  `apps/api/src/routes/ratings.ts` (the `?observer=` resolution + degrade-to-raw pattern),
  `apps/api/src/trust/{types,fixture,index,brainstorm}.ts`.
- ADR for this story: `engineering-team/decisions/0035-trust-weighted-search.md` (Proposed —
  Architecture phase; 0034 was taken by the accusatory-tag-gate ADR)
- Test plan: `engineering-team/stories/34-trust-weighted-search.test-plan.md`
- Review: (filled in after Review phase)
