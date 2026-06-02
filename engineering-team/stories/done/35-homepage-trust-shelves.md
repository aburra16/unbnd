# Story 35: Homepage trust shelves (Block D — the §2.9 SHELVES half)

**Status:** Done
**Created:** 2026-06-02
**Type:** Feature

**Gate decisions (2026-06-02):** scheduled worker + Postgres cache; non-trust fallback sections;
house-PoV only; least-privilege worker (no librarian key). See `engineering-team/decisions/0036-homepage-trust-shelves.md`.

## Background

The homepage ships today (`apps/web/src/routes/Home.tsx`). It renders a `Hero`, a
`PoVBar`, and — when the catalog read succeeds — a single **"Recently added"** `Shelf`
(`api.books.recent(18)` → `GET /api/books?limit=18`, newest-first by `created_at`) plus an
**"Explore genres"** `GenreGrid` (the taxonomy from `api.tags.list()` filtered to
`type === "genre"`). It carries an honest loading/error state and an empty-safe render (each
section only renders when its array is non-empty). There is **no trust-aware shelf** today:
"Recently added" is a raw recency list, not a trust-weighted view. The card/grid primitives to
reuse are `apps/web/src/components/{Shelf,BookCard,BookGrid,GenreGrid}.tsx` and the read client
is `apps/web/src/lib/api.ts` (`api.books.*`, `api.tags.*`).

This story builds the **shelves half of PRD §2.9** and nothing else. The §2.9 **search
re-ranking** shipped as **Story 34** (ADR 0035); the **For-You** personalized shelf is a
**separate later story (Story 36)** and is explicitly OUT of this one. Per §2.9, the homepage
gains three trust-weighted shelves: **Trending** ("highest trust-weighted rating activity in
the last 7 days, weighted so spam/bot ratings do not inflate"), **Community Favorites**
("highest trust-weighted average across genres (min rating-count threshold)"), and **Genre
shelves** ("top trust-weighted per genre"). §2.9 is explicit on two non-negotiables: "Shelves
are cached and refreshed on a schedule, not per-request. Empty shelves show honest empty
states." Its acceptance bullets, verbatim, for this half: **"Homepage shows Trending, Community
Favorites, and genre shelves from real/harness trust data, with honest empty states"** and
**"Shelves refresh on a schedule; verified against the fixture provider in CI."**

**The trust machinery to reuse (no new scoring math).** Every shelf's trust signal is the
**trust-weighted average rating** from the existing weighted view
(`weightedRatings`, `apps/api/src/ratings/summary.ts`, ADR 0014/0025): weight raters with
weight > 0 from an observer's vantage, return **null** when no rater carries positive weight
(the honest "no trusted signal from this view" state). The observer is resolved exactly as the
ratings/tags/search reads resolve it: the **house** observer (`config.houseObserverPubkey`,
interim `DEFAULT_HOUSE_OBSERVER` = nosfabrica) for these homepage shelves (they are house-PoV;
For-You / personalized vantage is Story 36). Weights come from the `TrustProvider.weights`
seam (`apps/api/src/trust/{types,fixture,index,brainstorm}.ts`), which **never throws** (empty
map on backend failure per the `TrustProvider` contract). The catalog/genre reads to draw the
shelf membership from are the existing ones: `GET /api/books` (newest-first, `apps/api/src/
routes/books.ts`) and `GET /api/genres/:slug/books` (net-positive genre consensus,
`apps/api/src/routes/tags.ts`), with the genre taxonomy from `GET /api/tags`. **No new ranking
or trust math** beyond reusing `weightedRatings`; the shelves are a composition of the existing
weighted view over a window/genre slice.

**The "scheduled, not per-request" compute pattern.** §2.9 requires the shelves be computed on
a schedule and served from a cache, not recomputed on every homepage load. The established
shape for off-hot-path scheduled compute in this codebase is the **off-path worker + cron + a
Postgres cache the API serves**: `apps/promoter` (Story 30/33, ADR 0031/0034) is a separate app
fired by an operator cron that claims rows from a Postgres table and writes results back; the
`promotions`/`reveals` tables live in `apps/api/src/db/migrations.ts` (idempotent
`IF NOT EXISTS` migrations run on startup); and the droplet already runs reference crons
(`ops/cron/unbnd-upsync`, the seed/down-sync). A scheduled compute that writes a cache table the
API serves is the natural shape; the **worker-vs-API-TTL** mechanism choice is load-bearing and
flagged for the gate (Open Question 1 / Flags). Whatever the mechanism, the cache must honor
CLAUDE.md invariant 3 ("cache only with a clear invalidation story"): the refresh schedule **is**
that invalidation story, which is the §2.9-sanctioned exception to the otherwise filter-at-read
default.

**The architectural tension to name (CLAUDE.md §3 vs §2.9).** CLAUDE.md invariant 3 warns
against "compute the trust-weighted score once and cache it" because the answer changes per-POV
and per-new-rating. These shelves are explicitly the sanctioned exception: they are **house-PoV
only** (one vantage, so no per-POV combinatorial cache), and §2.9 itself mandates the scheduled
cache with a refresh cadence as the invalidation story. The Architect should record this as a
deliberate, bounded denormalization (one POV, scheduled refresh), not a drift from the invariant.

**Build/test isolation (§2.0 / ADR 0017).** As a trust-consuming feature, this is built and
verified against the **fixture `TrustProvider`** (`apps/api/src/trust/fixture.ts`, selected by
`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE`): a known house observer with known
weights over a known set of rater keys, so each shelf's composition is deterministic and
CI-testable with no Brainstorm, no relay, and no human — exactly as Stories 25/30/34 are. The
shelf compute consumes only the `weights` seam + the existing catalog/genre/ratings reads.

**Architecture invariants (CLAUDE.md).** POV-first (§1): shelves are computed from the house
observer's vantage (the default delegate); they show the house's trust-weighted view, not a
global "the rating." Decentralized-first (§2): the trust signal emerges from the observer's
GrapeRank weights via `weightedRatings`, never an administered "featured books" list. Filter-at-
view-time (§3): the only denormalization is the §2.9-sanctioned scheduled cache for one POV with
the refresh cadence as its clear invalidation story. No new crypto: this reads weights and
composes a view — it signs nothing (CLAUDE.md crypto policy).

This is Phase-2 / Block-D scope and touches **no** PRD §11.3 / §3-deferred "Out of Scope"
surface: no payments, no Blossom/file hosting, no ebook sales, no bounty marketplace, no
print-on-demand, no social feed, no reading progress, no federation, no email notifications, no
index-on-write (Block E), and no For-You personalized shelf (Story 36).

## User-facing description

As a **Reader** landing on the Unbnd homepage, I want shelves that reflect what curators the
house trusts have actually rated well — what is **Trending** (getting trust-weighted rating
activity lately), what the community's **Favorites** are across genres, and the strongest books
**per genre** — rather than only a raw recency list, so that the first thing I see is curated by
trust and not by upload time or rating volume that bots could stuff. When there is no trusted
signal yet, I want the homepage to be **honest** about it — an honest empty state, never a shelf
of fabricated or filler books dressed up as "trending."

As a **Curator** whose ratings carry trust weight from the house vantage, I want my judgments to
shape what the homepage surfaces — Trending, Community Favorites, and the genre rows — the same
way they already shape a book's rating average, its genre consensus, and search ordering, so
that careful rating improves discovery on the most-seen page in the product.

## Acceptance criteria

Testable from the outside. Each criterion is independently testable **against the fixture
`TrustProvider`** (`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE` giving the house
observer known weights over a known set of rater keys, plus a known set of rated books across
genres in a known time window), with no Brainstorm call, no relay, and no human — mirroring how
the Story 25/30/34 trust tests are structured. The shelf definitions, the Community-Favorites
min-rating-count threshold, the per-genre/per-shelf book counts, and the refresh cadence are
**configurable** values; tests pin them to fixture values. Any copy in these ACs (shelf titles,
empty-state strings) is illustrative and must pass the no-slop rule
(`memory/feedback_unbnd_copy_and_visual.md`); final strings are the Architect/Implementer's
within that constraint. **No raw GrapeRank number appears on any homepage surface** (the shelves
order/select books; no trust score, tier string, or "trusted" badge is rendered on a shelf
card). No new crypto.

- [ ] **AC-1 — The homepage shows a Trending shelf computed from trust-weighted rating activity
  in a recent window.** Given a set of books with rating events from a mix of trusted and
  untrusted raters within the last *N* days (the window is configurable, default 7 per §2.9),
  when the homepage Trending shelf is read, then it lists books ranked by **trust-weighted**
  rating activity in that window — activity from raters the house observer trusts
  (`weightedRatings` over the windowed rating set, weight > 0) drives the order, and activity
  from untrusted/throwaway raters does **not** inflate a book onto the shelf (spam/bot-resistant
  by the trust weighting, not by an anti-spam heuristic). The exact "activity" measure (e.g.
  count and/or weighted sum of trusted ratings in the window, optionally recency-weighted) is the
  Architect's to pin (Open Question 2 / Flags); the AC is that untrusted volume cannot push a book
  onto Trending and trusted activity drives the order.

- [ ] **AC-2 — The homepage shows a Community Favorites shelf: highest trust-weighted average
  across genres, above a minimum rating-count threshold.** Given books with trust-weighted
  ratings from the house vantage, when the Community Favorites shelf is read, then it lists books
  ranked by **trust-weighted average rating** (`weightedRatings.average`) across all genres, and a
  book qualifies **only** if it has at least a **configurable minimum number of trusted ratings**
  (a `MIN_RATING_COUNT`-style env, default per Flags) — so a single trusted 5-star rating does not
  beat a book with many trusted high ratings, and a thinly-rated book is excluded rather than
  topping the shelf. Books below the threshold do not appear.

- [ ] **AC-3 — The homepage shows genre shelves: the top trust-weighted books per genre.** Given
  the genre taxonomy (`GET /api/tags`, `type === "genre"`) and the per-genre book membership
  (`GET /api/genres/:slug/books` / the existing net-positive genre consensus), when the genre
  shelves are read, then for each surfaced genre the homepage shows a row of the **top
  trust-weighted** books in that genre (ranked by `weightedRatings` from the house vantage), with
  the **number of genres shown** and the **number of books per row** both configurable (defaults
  per Flags). A genre with no trust-weighted signal across its books shows the honest empty
  treatment per AC-5 (it is not filled with raw/arbitrary books presented as trust-ranked).

- [ ] **AC-4 — Shelves are computed on a schedule and served from a cache, not recomputed
  per-request.** Given a Reader loads the homepage, when the shelves are served, then they are
  read from a **cache** populated by a **scheduled compute** (the mechanism — off-path worker +
  cron writing a Postgres cache table, or an API-side TTL cache — is the Architect's to pin per
  Open Question 1 / Flags), and the per-request homepage read does **not** recompute the
  trust-weighted shelves from scratch (the expensive trust + windowed-rating compute is off the
  hot path). Two homepage loads between scheduled refreshes serve the **same** cached shelves
  without re-running the compute. The refresh **cadence is configurable** (env).

- [ ] **AC-5 — Honest empty states: a thin/absent trust signal yields an honest empty shelf,
  never fabricated or filler books.** Given a shelf has **no** qualifying trust-weighted signal
  (no book clears the window/threshold/per-genre bar from the house vantage, or `weightedRatings`
  returns null for every candidate — the reality on today's thin nosfabrica graph), when the
  homepage renders that shelf, then it shows an **honest empty state** (an honest "nothing here
  yet" treatment, or the shelf is simply absent) and **never** fabricates, pads, or substitutes
  non-trust books while presenting them as trust-ranked. Whether the homepage **also** keeps a
  clearly-labeled non-trust fallback (the existing raw "Recently added" recency shelf and the
  "Explore genres" grid) so the page is not blank when every trust shelf is empty is a **gate
  decision** (Open Question 3 / Flags); this AC requires only that any trust shelf with no trusted
  signal is honestly empty, never faked.

- [ ] **AC-6 — Honest degrade: a trust failure does not 500 and does not fabricate a shelf.**
  Given trust is unavailable (no observer configured, the provider errors, or `weights` resolves
  to an empty map per the `TrustProvider` contract), when the shelves are computed/served, then
  the trust shelves degrade to their **honest empty state** (AC-5) — they never throw, never 500,
  and never present a raw/recency list as a trust-weighted shelf. The homepage still renders
  (with whatever non-trust fallback the gate chooses in AC-5), exactly as the ratings/tags/search
  paths degrade today. The provider seam never throws.

- [ ] **AC-7 — Computed from the house observer's vantage; no per-request observer fan-out.**
  Given the active vantage for these homepage shelves is the default **house** observer
  (`config.houseObserverPubkey`, resolved exactly as the ratings/tags/search reads resolve it),
  when the shelves are computed, then the trust-weighted signal for every shelf is computed from
  the **house** vantage only (For-You / a per-user vantage is Story 36 and OUT). The scheduled
  compute resolves trust weights via the existing `weights` seam in a **bounded, batched** way
  (over the candidate books' rater set), with no unbounded per-book per-rater fan-out, mirroring
  how the ratings/search reads batch the `weights` call.

- [ ] **AC-8 — Built and verified against the fixture provider in CI; trust/architecture guards
  stay green.** Given `TRUST_PROVIDER=fixture` with a deterministic `TRUST_FIXTURE` giving the
  house observer known weights over a known set of rater keys, and a known fixture of rated books
  across genres and a known time window, when the test suite runs in CI, then the Trending
  composition (AC-1), the Community Favorites threshold behavior (AC-2), the per-genre top-N
  (AC-3), the cached/scheduled-not-per-request behavior (AC-4), the honest-empty states (AC-5),
  the honest degrade (AC-6), and the house-vantage bounded/batched trust read (AC-7) are all
  exercised green with no Brainstorm call, no relay, and no human. No Brainstorm/NIP-85 specifics
  leak outside `apps/api/src/trust/brainstorm.ts`; the ADR 0014 trust architecture guard stays
  green.

## DList shapes touched

No **new** shapes. This reads existing events, composes a scheduled trust-weighted *view* over
them, and (depending on the gate's mechanism choice) writes only an internal Postgres **cache**
(not a DList event). It signs and publishes nothing.

- `kind:39999` — book **rating** events under each candidate book's address (read; the
  trust-weighted signal per book — Trending activity, Community-Favorites average, per-genre rank
  — is computed over these via the existing `weightedRatings` / `dedupeRatings` view, ADR
  0014/0025, keyed by rater pubkey for weighting and by `created_at` for the Trending window).
- `kind:39999` — catalog **book records** under the librarian's `books` concept header (read;
  the shelf membership / candidate set, via the existing `GET /api/books` and the parse path).
- `kind:39999` — book **tag/genre assertion** events under `book-tag-assertions` (read; the
  per-genre membership for the genre shelves, via the existing `GET /api/genres/:slug/books`
  net-positive consensus).
- `kind:39998` — `books`, `book-tags` (taxonomy), and `book-tag-assertions` concept headers
  (read; the catalog header, the genre taxonomy for the genre shelves, and the genre membership
  parent pointer).
- Trust weights consumed via the existing `TrustProvider` seam (`apps/api/src/trust/`); the
  fixture provider supplies deterministic weights in CI.
- **(Mechanism-dependent, Architect's call)** a Postgres **shelf cache** table (mirroring the
  `promotions`/`reveals` migration pattern in `apps/api/src/db/migrations.ts`) — an internal
  cache, **not** a DList event, written by the scheduled compute and read by the API.

## Out of scope

State explicitly — do not build. Several are named so the Architect inherits the boundary:

- **The For-You personalized shelf** (PRD §2.9: "books highly rated by curators in the user's
  graph that they have not rated") — a **separate later story (Story 36)**. These homepage
  shelves are **house-PoV only**; this story adds no per-user vantage, no personalized shelf, and
  no "you have not rated" filtering.
- **Trust-weighted search re-ranking** (PRD §2.9 search half) — shipped as **Story 34** (ADR
  0035). This story changes the homepage only; it does not touch `/api/search` or its blend.
- **Index-on-write** (PRD §2.11, Block E) — the shelves read the existing live catalog/genre/
  rating reads; this story does not change when or how the search index is written.
- **The house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → the production librarian). The interim
  house vantage (nosfabrica, `DEFAULT_HOUSE_OBSERVER` in `apps/api/src/config.ts`) stays; the
  feature is built and verified against the fixture provider regardless (ADR 0017 / PRD §2.0).
- **Any new ranking or trust-weighting math beyond reusing `weightedRatings`.** No new GrapeRank
  computation, no new scoring source. The only new logic is the shelf *composition* (windowing for
  Trending, the Community-Favorites min-count threshold, the per-genre top-N) over the existing
  weighted view, plus the cache/refresh plumbing.
- **Rendering any trust score / GrapeRank number / tier badge on a shelf card.** The shelves
  select and order books; they do not show a number, a "trusted" label, or a tier string on a
  shelf card (CLAUDE.md). The cards reuse the existing `BookCard`/`Shelf` rendering.
- **A new homepage layout / redesign.** This reuses the existing `Shelf`, `BookCard`, `BookGrid`,
  and `GenreGrid` primitives and the existing `Home.tsx` structure; it adds shelves, not a new
  visual system.
- **An admin/operator "feature this book" affordance.** Shelves are emergent from trust weights,
  never an administered featured-books list (CLAUDE.md §2).
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": this story touches none of payments, file
hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed, reading
progress, federation, or email notifications. It is a scheduled, house-PoV, trust-weighted view
over existing catalog/genre/rating events, cached and served on the homepage, with honest empty
states.

## Open questions

Resolve before approving the story (PO recommendations in Flags below).

1. **The compute + cache mechanism (load-bearing — for the Architect/user).** §2.9 requires
   shelves be "cached and refreshed on a schedule, not per-request." The options, without
   deciding: (a) a **scheduled worker/cron** (extend `apps/promoter`, or a new shelves worker)
   that computes the shelves from trust-weighted data and writes a Postgres cache table the API
   serves — keeps the cost fully off the hot path and never makes a Reader wait, at the cost of a
   new worker + cron + migration + ops install step (the `unbnd-upsync` / promoter pattern);
   (b) an **API-side TTL cache** — compute on the first request after expiry, serve the cached
   result otherwise — no new worker/cron, simpler, but the first post-expiry homepage load pays
   the full trust+windowed-rating compute cost; (c) **compute-at-deploy/seed only** — simplest,
   but does not honor "refreshed on a schedule." PO position in Flags. Architect picks and pins
   the cache shape (a migration if (a)), the env names, and the defaults.

2. **Each shelf's exact definition + thresholds.** **Trending:** is the activity measure the
   **count** of trusted ratings in the window, the **weighted sum** of trusted ratings, or a
   recency-weighted blend? Window default 7 days per §2.9 — confirm the env name/default.
   **Community Favorites:** the rank is `weightedRatings.average`; what is the **min trusted
   rating-count** threshold default (the env that excludes thinly-rated books)? **Genre shelves:**
   how many genres are shown on the homepage, and how many books per row? PO recommends conservative
   defaults (Flags); Architect pins exact env names + values.

3. **Thin-graph empty-state UX call (load-bearing — for the user).** On today's interim graph
   (house observer = nosfabrica, no real trust weights over our seeded rater keys), **no book has
   a trusted signal**, so **every trust shelf is empty at v1**. The UX question: does the homepage
   (a) show **honest empty trust shelves** (blank-but-honest — the page leads with empty Trending/
   Favorites/genre shelves until the graph fills), or (b) keep a clearly-labeled **non-trust
   fallback** so the page is not blank — i.e. retain the existing raw "Recently added" recency
   shelf and the "Explore genres" grid as honestly-labeled non-trust sections beneath/instead of
   the empty trust shelves? PO recommends (b): keep the existing non-trust sections as an honest,
   clearly-non-trust fallback so the most-seen page is never a blank wall, while every *trust*
   shelf stays honestly empty until real signal arrives. The user decides blank-honest vs
   non-trust fallback.

4. **Refresh cadence + staleness.** What is the default refresh cadence (env-configurable)?
   §2.9 gives the 7-day Trending *window* but not the *refresh* interval. PO recommends a cadence
   short enough to feel live but well off the hot path (e.g. hourly), env-configurable like the
   `unbnd-upsync` 5-min cron. An honest "as of" timestamp on the shelves is **not required**
   (and no fabrication); the user can opt into showing freshness. Architect pins the env +
   default; the user confirms the cadence.

## Flags for the gate (PO — contentious; the user decides)

- **Compute + cache mechanism (Open Question 1).** **PO recommendation: the
  scheduled worker/cron writing a Postgres cache table (option a)** — it is the lowest-risk way to
  honor "scheduled, not per-request" *and* keep the cost off the hot path so **no** Reader ever
  pays the compute, and it reuses the proven `apps/promoter` + `unbnd-upsync` + idempotent-
  migration pattern this codebase already runs. The honest tradeoff: it adds a new worker + cron +
  migration + a one-time ops install step. The **API-side TTL cache (option b)** is genuinely
  simpler (no new worker) and is defensible if the compute is cheap at our scale — but it puts the
  first-post-expiry homepage load on the hot path, which is the page we least want slow. The user
  picks; the choice sets AC-4 and the DList-shapes cache row. (PO leans worker/cron for the hot-
  path guarantee but explicitly flags the new-worker-vs-TTL complexity tradeoff for the user.)

- **Shelf definitions + thresholds (Open Question 2).** PO recommendations, all env-configurable:
  **Trending** = ranked by the **weighted sum of trusted ratings in the last 7 days** (count alone
  ignores how strongly trusted raters rated; a recency tilt within the window is a nice-to-have the
  Architect may add) — spam-resistant because untrusted raters contribute zero weight.
  **Community Favorites** = ranked by `weightedRatings.average` with a **min trusted-rating-count
  threshold** (PO suggests a small positive default, e.g. 3, env `SHELF_FAVORITES_MIN_RATINGS`),
  so thinly-rated books are excluded. **Genre shelves** = a conservative number of genres
  (e.g. 4–6, env) × a row of the top **~6–12** trust-weighted books each (env), reusing the
  `Shelf`/`BookCard` row. Exact env names + values are the Architect's; the user confirms the
  Community-Favorites threshold is sane.

- **Thin-graph empty-state UX (Open Question 3) — the key UX call.** On today's graph **every
  trust shelf is empty**. **PO recommendation: keep a clearly-labeled non-trust fallback** (retain
  the existing raw "Recently added" recency shelf + "Explore genres" grid as honest, explicitly-
  non-trust sections) so the homepage — the most-seen page — is never a blank wall, while every
  *trust* shelf (Trending / Favorites / genre rows) stays **honestly empty** until real signal
  arrives. The alternative (blank-but-honest: lead with empty trust shelves, no fallback) is more
  purist but ships a near-empty homepage on the interim graph. This is the load-bearing UX decision
  for the user. (Either way: no fabricated/filler books dressed as "trending" — AC-5 is firm.)

- **Refresh cadence (Open Question 4).** PO recommendation: **hourly default**, env-configurable
  (short enough to feel live, well off the hot path), installed as a droplet cron like
  `unbnd-upsync` if the worker mechanism is chosen. No "as of" timestamp required; no fabrication.
  The user confirms the cadence.

- **Thin-graph reality (shared with Stories 25/30/34).** On the interim graph, re-confirm that
  **the trust shelves being empty at v1 is the honest, safe state** — the fixture provider proves
  the whole shelf compute works for when real signal arrives, exactly as ratings/tags/promotion/
  search are effectively raw/librarian-only today. PO recommendation: acceptable for v1; the user
  confirms "empty trust shelves (with the chosen non-trust fallback) until the graph fills" is
  acceptable.

## Linked artifacts
- PRD: `engineering-team/phase2-prd.md` **§2.9** (the charter — the SHELVES half: Trending /
  Community Favorites / genre shelves, "cached and refreshed on a schedule, not per-request,"
  "empty shelves show honest empty states"; ACs: "Homepage shows Trending, Community Favorites,
  and genre shelves from real/harness trust data, with honest empty states" and "Shelves refresh
  on a schedule; verified against the fixture provider in CI"), §2.0 (fixture/CI sequencing),
  §2.11 (index-on-write — OUT, Block E).
- Predecessor / sibling stories: `engineering-team/stories/done/34-trust-weighted-search.md`
  (the §2.9 SEARCH half, done), the For-You shelf (Story 36, OUT, not yet written),
  `engineering-team/stories/done/30-trust-gated-promotion.md` (the off-path worker + Postgres
  queue + cron pattern this story's cache mechanism mirrors),
  `engineering-team/stories/done/25-weighted-consensus.md` (the weighted-view pattern reused).
- Search ADR: `engineering-team/decisions/0013-catalog-search.md` (the catalog read / provider
  seam / architecture-guard model; §2.9 search half).
- Weighted-consensus ADR: `engineering-team/decisions/0025-weighted-consensus.md` (the weighted
  view the shelf signal reuses). Search re-ranking ADR:
  `engineering-team/decisions/0035-trust-weighted-search.md` (the §2.9 search half, shipped).
- Trust ADRs: `engineering-team/decisions/0014-graperank-personalize.md` (the `TrustProvider`
  `weights`/`hasScores` seam + observer resolution + `weightedRatings`),
  `0017-fixture-trust-provider.md` (the fixture provider this is verified against).
- Worker/cron ADRs: `engineering-team/decisions/0011-write-upsync.md` (the droplet cron pattern —
  `unbnd-upsync`, `ops/cron/`), `0031-trust-gated-promotion.md` (the off-path key-holding
  `apps/promoter` worker + Postgres queue + idempotent migration pattern the cache mechanism
  mirrors). Code: `apps/web/src/routes/Home.tsx`, `apps/web/src/components/{Shelf,BookCard,
  BookGrid,GenreGrid}.tsx`, `apps/web/src/lib/api.ts`, `apps/api/src/ratings/summary.ts`
  (`weightedRatings`/`dedupeRatings`), `apps/api/src/routes/books.ts` (catalog reads),
  `apps/api/src/routes/tags.ts` (`GET /api/genres/:slug/books`, `GET /api/tags`),
  `apps/api/src/trust/{types,fixture,index,brainstorm}.ts`, `apps/api/src/db/migrations.ts`,
  `apps/promoter/{main,queue}.ts`, `ops/cron/unbnd-upsync`.
- ADR for this story: `engineering-team/decisions/0036-homepage-trust-shelves.md` (incl. the
  **2026-06-02 amendment** extracting `@unbnd/trust` — the shared package holding the `TrustProvider`
  seam + `weightedRatings`/`dedupeRatings`, so the shelves/For-You workers reuse apps/api's
  trust-weighting via a workspace package, not a cross-app source import; landed via a re-export shim,
  with the ADR-0014 guard relocated to `packages/trust/test/architecture.test.ts`).
- Test plan: `engineering-team/stories/done/35-homepage-trust-shelves.test-plan.md`
- Review: (filled in after Review phase)
