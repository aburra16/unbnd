# Story 36: For-You personalized shelf (Block D — the §2.9 FOR-YOU story, last Block-D story)

**Status:** Draft
**Created:** 2026-06-02
**Type:** Feature

> **Gate decisions to lock (see Flags):** read-time per-request compute (NOT the house cache;
> NOT a per-POV cache); personalized users only, honest absence for everyone else; "highly
> rated by my curators" = trust-weighted average from the user's OWN vantage above a bar with a
> min trusted-rating-count, excluding books the user already rated; thin-graph honest-empty
> accepted for v1. Final values + shape are the Architect's to pin.

## Background

PRD §2.9 ("Trust-weighted search ranking + homepage trust shelves") closes its homepage-shelves
list with one personalized shelf: **"For You** (personalized users): books highly rated by
curators in the user's graph that they have not rated."** Its acceptance bullet, verbatim:
**"Personalized users see 'For You.'"** This is the **personalized counterpart** to the house
Trending / Community Favorites / genre shelves that shipped in **Story 35** (ADR 0036). It is the
**last Block-D story**: the §2.9 search half shipped as Story 34 (ADR 0035), the house shelves
half as Story 35 (ADR 0036), and For-You is what remains.

**The constraint that defines this story (ADR 0036, the invariant-3 exception).** Story 35's house
shelves are computed **off the hot path on a schedule** and served from a Postgres cache
(`homepage_shelves`) by `GET /api/homepage/shelves`. That cache is the codebase's **only** per-POV
denormalization, and it is bounded **precisely because it holds ONE vantage** (the house observer):
ADR 0036 §2/Consequences record it as the §2.9-sanctioned exception to CLAUDE.md invariant 3
explicitly **because there is no per-POV combinatorial blow-up** at one POV, and they state the
boundary For-You must honor verbatim: *"Story 36 (For-You) will add a per-user vantage — it must
**not** extend this house cache into a per-POV cache (that would reintroduce the invariant-3
blowup); it computes at **read time** per CLAUDE.md §3."* So For-You is a **read-time, per-request,
bounded computation** for the signed-in personalized user from **their own vantage** — NOT a
precomputed cache, NOT a row in `homepage_shelves`, NOT a per-user cache table. This is the load-
bearing design boundary and the reason For-You is its own story rather than another shelf in the
worker.

**The user's OWN vantage.** Every other trust read in the app resolves an observer and weights
ratings from that vantage via the shared `@unbnd/trust` seam (ADR 0036 amendment extracted
`@unbnd/trust` from `apps/api/src` — the `TrustProvider.weights(observerHex, targetHexes)` seam +
the pure `weightedRatings` / `dedupeRatings` helpers; `weightedRatings` returns **null** when no
rater carries positive weight, the honest "no trusted signal from this view" state). The house
shelves use the **house** observer. For-You uses the **signed-in user's OWN** observer — their own
pubkey as the GrapeRank vantage — exactly the `?observer=<my npub>` "Yours" vantage the ratings
read already serves on BookDetail (ADR 0014: `GET /api/books/:slug/ratings?observer=<my npub>`
returns the weighted view from the user's own graph). So For-You reuses the **identical** weighting
machinery the rest of the app uses; the only thing that differs is the observer is the user, not the
house. No new trust or ranking math.

**Who is "personalized."** A user is personalized when GrapeRank scores exist for their own pubkey —
the `hasScores(observerHex)` true state surfaced by `GET /api/trust/status`
(`apps/api/src/routes/trust.ts`: `{ enabled, hasScores, canPersonalize }`). A user becomes
personalized by triggering "Personalize" (sovereign NIP-07 self-trigger, ADR 0014 Phase B; custodial
server-signed trigger, Story 26 / ADR 0026), which builds their own-graph GrapeRank scores. A
**non-personalized** user (signed in but never personalized, or still "building") and a **signed-out**
user have no usable own-graph vantage, so **For-You does not apply to them** — they get **no For-You
shelf** (honest absence; the "Personalize to see For-You" prompt vs silent-absence call is a gate
decision, Flags).

**"Highly rated by curators in the user's graph that they have not rated."** Two halves, both
reusing shipped machinery:
- **"highly rated by curators in the user's graph"** — books whose **trust-weighted average rating
  from the USER's own vantage** (`weightedRatings.average` with the user's pubkey as observer) is
  above a bar, with a **minimum trusted-rating-count** so a single trusted 5-star does not qualify a
  book (the same shape as Story 35's Community-Favorites `SHELF_FAVORITES_MIN_RATINGS`, but computed
  from the user's vantage rather than the house's). The "curators in the user's graph" are exactly
  the raters the user's GrapeRank assigns positive weight to.
- **"that they have not rated"** — exclude any book the **signed-in user has already rated**. The
  app already reads the user's own ratings (`countOwnRatings`, `apps/api/src/ratings/summary.ts`,
  used by the profile-stats read) and the per-book rating events; For-You drops from its candidate
  set every book the user has a current rating on.

**Read-time + bounding (the perf shape to flag).** Because For-You is per-request and per-user, it
must be **bounded** — it cannot scan the whole catalog × the user's whole graph on every homepage
load. The standing pattern in this codebase for a bounded trust read is the **single batched
`weights` call** over a candidate rater set (the ratings, tags, and search reads all batch one
`weights(observer, raterHexes)` call per read; Story 34 AC-6 / Story 35 AC-7 both pin "bounded,
batched, no per-book per-rater fan-out"). For-You must do the same from the user's vantage over a
**bounded candidate set** rather than the entire catalog. The candidate-set strategy and whether a
**short-TTL per-user memoization** (a small per-user cache, distinct from the forbidden house cache)
is allowed are gate decisions (Flags / Open Questions). PO recommends a bounded candidate approach
with at most a short per-user memoization, never a precomputed per-POV cache.

**Where it renders.** The homepage (`apps/web/src/routes/Home.tsx`, Story 35) already composes the
Hero, PoVBar, the house trust shelves (`api.homepage.shelves()`, empty → absent), and the honest
non-trust fallback (Recently added + Explore genres). For-You is an additional shelf for the
signed-in personalized user, reusing the existing `Shelf` / `BookCard` primitives — no new layout,
no new visual system. Its placement (above/below the house shelves) and the personalized-vantage
wiring are the Architect's to pin; the PO requires only that it appears for personalized users and is
honestly absent otherwise.

**Build/test isolation (§2.0 / ADR 0017).** As a trust-consuming feature, For-You is built and
verified against the **fixture `TrustProvider`** (`@unbnd/trust` `FixtureTrustProvider`, selected by
`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE`): a known user observer with known weights
over a known set of rater keys, a known set of rated books, and a known set of the user's own ratings,
so the For-You composition (including the "exclude books I rated" filter and the honest-empty state)
is deterministic and CI-testable with no Brainstorm, no relay, and no human, exactly as Stories
25/26/30/34/35 are.

**Architecture invariants (CLAUDE.md).** POV-first (§1): For-You is computed from the **user's own**
vantage; two personalized users get two different For-You shelves and both are right. Decentralized-
first (§2): the recommendation emerges from the user's GrapeRank weights over permissionless rating
events, never an administered "recommended for you" list. **Filter-at-view-time (§3): For-You is the
canonical read-time, per-POV computation** — it is the case CLAUDE.md §3 describes, and it must NOT
be denormalized into a per-POV cache (the house cache is the bounded one-POV exception; a per-user
cache would be the combinatorial blow-up the invariant forbids). No raw GrapeRank number / tier /
"trusted" badge appears on any For-You card (the shelf only selects + orders books). No new crypto:
this reads weights and composes a view — it signs nothing (CLAUDE.md crypto policy).

This is Phase-2 / Block-D scope and touches **no** PRD §11.3 / §3-deferred "Out of Scope" surface:
no payments, no Blossom/file hosting, no ebook sales, no bounty marketplace, no print-on-demand, no
social feed, no reading progress, no federation, no email notifications, no index-on-write (Block E),
and it does not change the house shelves (Story 35) or search (Story 34).

## User-facing description

As a **Reader** who has personalized Unbnd (built my own web of trust by following curators), I want
a **For You** shelf on the homepage that shows books the curators *I* trust have rated highly and
that I have not rated yet, so the homepage surfaces my next read from my own graph rather than only
the house's view. When my graph has not produced any such book yet, I want the shelf to be honestly
absent or empty, never padded with books dressed up as personalized picks.

As a **Reader** who has **not** personalized (or who is signed out), I want the homepage to be honest
that For-You is a personalized feature: I see no For-You shelf, and at most a clear invitation to
personalize, never a fake "For You" filled with generic books.

As a **Curator** whose ratings carry weight inside another user's graph, I want my judgments to shape
what that user's For-You surfaces, the same way they already shape that user's "Yours" rating view,
so careful rating improves discovery for the people who trust me.

## Acceptance criteria

Testable from the outside. Each criterion is independently testable **against the fixture
`TrustProvider`** (`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE` giving a known **user**
observer known weights over a known set of rater keys, a known set of rated books, and a known set of
the user's own ratings), with no Brainstorm call, no relay, and no human, mirroring how the Story
25/26/34/35 trust tests are structured. The For-You bar, the min trusted-rating-count, the row length,
and any candidate-set / memoization bound are **configurable** values; tests pin them to fixture
values. Any copy in these ACs (the shelf title, any prompt/empty string) is illustrative and must
pass the no-slop rule (`memory/feedback_unbnd_copy_and_visual.md`); final strings are the
Architect/Implementer's within that constraint. **No raw GrapeRank number / tier string / "trusted"
badge appears on any For-You surface** (the shelf only selects + orders books). No new crypto.

- [ ] **AC-1 — A personalized, signed-in user sees a For-You shelf of books highly rated by
  curators in THEIR OWN graph.** Given a signed-in user who is personalized (GrapeRank scores exist
  for their own pubkey — `hasScores(theirHex)` is true), when the homepage For-You shelf is read,
  then it returns books ranked by the **trust-weighted average rating** computed from the **user's
  OWN vantage** (`weightedRatings` with the user's pubkey as observer, exactly the `?observer=<my
  npub>` "Yours" weighting the ratings read uses, ADR 0014) — so the books surfaced are those the
  curators *that user* trusts (raters carrying positive weight in the user's graph) have rated highly,
  not the house's picks. Two personalized users with different graphs get different For-You shelves
  for the same catalog, both correct (POV-first).

- [ ] **AC-2 — "Highly rated" is defined: above a bar AND above a minimum trusted-rating-count.**
  Given the user's own-vantage trust-weighted ratings over the candidate books, when For-You is
  composed, then a book qualifies **only** if its trust-weighted average from the user's vantage is
  **at or above a configurable bar** AND it has **at least a configurable minimum number of trusted
  ratings** (raters with positive weight in the user's graph; the env shape mirrors Story 35's
  `SHELF_FAVORITES_MIN_RATINGS` but from the user's vantage). A book with a single trusted 5-star
  from the user's graph does **not** qualify on that alone; a thinly-rated book is excluded rather
  than topping the shelf. Books below either bar do not appear. (The Architect pins the exact env
  names + defaults per Flags.)

- [ ] **AC-3 — Books the user has already rated are excluded.** Given the signed-in user has a
  current rating on some books, when For-You is composed, then **every book the user has already
  rated is removed** from the shelf (the §2.9 "that they have not rated" clause), using the user's
  own ratings (the same own-ratings read the profile-stats path uses via `countOwnRatings`). A book
  the user rated never appears in their For-You, even if it is highly rated by curators in their
  graph.

- [ ] **AC-4 — For-You is computed at READ TIME, per request, and is NOT written to the house
  shelves cache or any per-POV cache.** Given a personalized user loads the homepage, when their
  For-You shelf is produced, then it is computed **at read time for that request from that user's
  vantage** and is **not** read from, nor written to, the Story-35 `homepage_shelves` house cache,
  and **not** stored in any per-POV (per-user) precomputed cache table — honoring ADR 0036's
  invariant-3 boundary ("it computes at read time … must not extend this house cache into a per-POV
  cache"). Any allowed optimization is bounded (AC-6) and at most a short-lived per-user memoization
  (gate decision), never a precomputed per-user cache. The house shelves and `GET
  /api/homepage/shelves` are unchanged by this story.

- [ ] **AC-5 — Non-personalized and signed-out users get NO For-You shelf (honest absence).** Given
  a user who is signed out, or signed in but **not** personalized (`hasScores(theirHex)` is false, or
  scores are still "building"), when the homepage renders, then **no For-You shelf is shown** — the
  shelf is absent, and at most an honest invitation to personalize is offered (the prompt-vs-silent
  call is a gate decision, Flags); the homepage **never** shows a "For You" populated with
  non-personalized / house / arbitrary books presented as the user's personalized picks. The rest of
  the homepage (house shelves + non-trust fallback) renders exactly as Story 35 ships it.

- [ ] **AC-6 — The read-time compute is bounded and batched (no whole-catalog × whole-graph scan).**
  Given For-You is per-request and per-user, when it is computed, then the trust read is **bounded**:
  it resolves the user's weights via the `@unbnd/trust` seam in a **single batched
  `weights(userHex, raterHexes)` call** (or fixed-size chunks unioned into one map) over a **bounded
  candidate rater set**, with **no per-book per-rater fan-out** and **no unbounded scan of the whole
  catalog against the whole graph** on every homepage load — mirroring the bounded/batched trust read
  in Story 34 (AC-6) and Story 35 (AC-7). The candidate-set strategy (e.g. a capped candidate pool)
  and any bound/cap are configurable; the AC requires only that the per-request cost is bounded and
  the weights read is batched, not O(catalog × raters).

- [ ] **AC-7 — Honest empty / honest degrade: a thin graph or a trust failure yields an honest
  empty/absent For-You, never fabricated picks, never a 500.** Given a personalized user whose graph
  produces **no** qualifying book (no book clears the bar + min-count from their vantage after
  excluding their own ratings — the reality on today's thin graph), **or** trust is unavailable (the
  provider errors or `weights` resolves to an empty map per the `TrustProvider` contract), when the
  homepage renders, then For-You shows an **honest empty state or is simply absent**, and **never**
  fabricates, pads, or substitutes non-personalized books presented as For-You picks. A trust failure
  **degrades** to honest-empty/absent; it never throws and never 500s. The homepage still renders the
  rest of the page (house shelves + non-trust fallback) exactly as today. The `@unbnd/trust` seam
  never throws (its contract); the read still wraps the `weights` call so a surprise rejection
  degrades to an empty map, as the ratings/tags/search/shelves reads do.

- [ ] **AC-8 — Built and verified against the fixture provider in CI; trust/architecture guards
  stay green.** Given `TRUST_PROVIDER=fixture` with a deterministic `TRUST_FIXTURE` giving a known
  user observer known weights over a known set of rater keys, a known set of rated books, and a known
  set of the user's own ratings, when the test suite runs in CI, then the own-vantage ranking (AC-1),
  the bar + min-count qualification (AC-2), the exclude-already-rated filter (AC-3), the read-time-not-
  cached behavior (AC-4), the no-For-You-for-non-personalized/signed-out behavior (AC-5), the
  bounded/batched read (AC-6), and the honest-empty/degrade (AC-7) are all exercised green with no
  Brainstorm call, no relay, and no human. No Brainstorm/NIP-85 specifics leak outside
  `packages/trust/src/brainstorm.ts`; the ADR 0014 trust-architecture guard
  (`packages/trust/test/architecture.test.ts`) stays green.

## DList shapes touched

No **new** shapes. This reads existing events, composes a **read-time, per-user** trust-weighted view
over them, and writes nothing (no DList event, no cache row).

- `kind:39999` — book **rating** events under each candidate book's address (read; the user's-vantage
  trust-weighted average per book is computed over these via the existing `weightedRatings` /
  `dedupeRatings`, ADR 0014/0025, keyed by rater pubkey for weighting from the **user's** vantage).
- `kind:39999` — the signed-in **user's own** rating events (read; to exclude books they have already
  rated, via the existing own-ratings read / `countOwnRatings`).
- `kind:39999` — catalog **book records** under the librarian's `books` concept header (read; the
  candidate set, via the existing catalog read + parse path).
- `kind:39998` — `books` concept header (read; the catalog header for the candidate set).
- Trust weights consumed via the existing `@unbnd/trust` `TrustProvider` seam from the **user's**
  vantage; the fixture provider supplies deterministic weights in CI.
- The user's personalization state via the existing trust status read (`hasScores(theirHex)`).
- **No** `homepage_shelves` cache write/read; **no** new cache table.

## Out of scope

State explicitly — do not build. Several are named so the Architect inherits the boundary:

- **Extending the Story-35 `homepage_shelves` house cache (or any precomputed per-POV cache) to hold
  For-You.** For-You is **read-time, per-request, per-user** (ADR 0036 invariant-3 boundary). No
  per-user cache table; the house cache and its worker are untouched.
- **The house homepage shelves** — Trending / Community Favorites / genre rows (Story 35 / ADR 0036,
  done). This story adds the personalized For-You shelf only; it does not change the house shelves,
  the shelves worker, or `GET /api/homepage/shelves`.
- **Trust-weighted search re-ranking** (PRD §2.9 search half) — Story 34 / ADR 0035, done. Untouched.
- **Any new ranking or trust-weighting math beyond reusing `weightedRatings`.** No new GrapeRank
  computation, no new scoring source, no new recommendation algorithm. The only new logic is the
  For-You *composition* (the user's-vantage bar + min-count, the exclude-already-rated filter, the
  bounded candidate set) over the existing weighted view.
- **The Personalize trigger itself** (sovereign ADR 0014 Phase B; custodial Story 26 / ADR 0026). For-You
  *consumes* a personalized user's scores; it does not add or change how a user personalizes. It only
  reads `hasScores`.
- **The house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → the production librarian). Irrelevant here —
  For-You uses the **user's** observer, not the house's. Built/verified against the fixture provider
  regardless (ADR 0017 / PRD §2.0).
- **Rendering any trust score / GrapeRank number / tier badge on a For-You card.** The shelf selects
  and orders books; no number, "trusted" label, or tier string on a card (CLAUDE.md). Reuses the
  existing `BookCard` / `Shelf` rendering.
- **A new homepage layout / redesign.** Reuses the existing `Shelf` / `BookCard` primitives and the
  Story-35 `Home.tsx` structure; adds one shelf, not a new visual system.
- **Index-on-write** (PRD §2.11, Block E) — For-You reads the existing live catalog/rating reads.
- **An admin/operator "recommend this book" affordance.** For-You is emergent from the user's trust
  weights, never an administered list (CLAUDE.md §2).
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": this story touches none of payments, file
hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed, reading progress,
federation, or email notifications. It is a read-time, per-user, bounded trust-weighted view over
existing catalog/rating events, rendered as a personalized homepage shelf, with honest empty/absent
states.

## Open questions

Resolve before approving the story (PO recommendations in Flags below).

1. **Read-time compute + bounding (load-bearing — for the Architect/user).** For-You is per-request
   and per-user, so it must be bounded. Options, without deciding: (a) **candidate-limited** — rank
   within the books rated by the user's trusted curators (the raters with positive weight in the
   user's graph), bounded by a cap, then apply the bar + min-count + exclude-already-rated; (b)
   **reuse a cheap candidate set** (e.g. recent / trending books) then re-weight by the user's
   vantage; (c) a **short-TTL per-user memoization** (a small per-user cache to avoid recompute on
   every homepage load) layered on (a) or (b) — distinct from, and **not**, the forbidden house /
   per-POV precomputed cache. PO recommends (a) (candidate-limited from the user's own trusted-rater
   set) as the truest to "books highly rated by curators in MY graph," with at most an optional
   short-TTL per-user memoization if measured cost warrants it — never a precomputed per-POV cache.
   The Architect pins the candidate-set shape, the cap env, and whether the short-TTL memoization is
   adopted for v1.

2. **Who gets For-You + the non-personalized/signed-out behavior.** Personalized users only
   (`hasScores` true). For everyone else (signed out, or signed in but not personalized / still
   building): is For-You (a) **silently absent**, or (b) **absent plus an honest "Personalize to see
   For You" invitation**? PO recommends **(b) a clear, honest invitation to personalize for signed-in
   non-personalized users** (it is a real feature they can unlock and the prompt is honest), and
   **silent absence for signed-out users** (the homepage already invites sign-in elsewhere; a
   For-You prompt for a logged-out visitor is noise). The user confirms the prompt-vs-silent call.

3. **"Highly rated by my curators" — exact definition + thresholds.** PO recommends: rank by the
   **trust-weighted average rating from the user's OWN vantage** (`weightedRatings.average` with the
   user's pubkey as observer), qualify a book only if (i) that average is **at or above a configurable
   bar** (e.g. a `FORYOU_MIN_AVG`-style env; PO suggests a high bar like ≥ 4.0 on the 1–5 scale so
   "highly rated" means highly rated) and (ii) it has **at least a configurable minimum number of
   trusted ratings** from the user's graph (a `FORYOU_MIN_RATINGS`-style env, PO suggests a small
   positive default like 2–3, mirroring Story 35's `SHELF_FAVORITES_MIN_RATINGS`), and (iii) the user
   has **not** already rated it. Row length is a `FORYOU_BOOKS`-style env (PO suggests ~6–12, reusing
   the `Shelf` row). Exact env names + values are the Architect's; the user confirms the bar +
   min-count are sane.

4. **Thin-graph reality + honest-empty (load-bearing — for the user).** Until a user has a real
   own-graph and the curators they trust have rated books in the catalog, For-You is **empty** for
   that user — exactly as the house shelves, ratings, tags, and search are effectively raw/empty on
   today's thin graph (Stories 25/30/34/35). PO recommends **confirming honest-empty/absent is the
   accepted v1 state**: the fixture provider proves the whole For-You compute (ranking, bar, min-count,
   exclude-already-rated, bounded read) works for when real signal arrives, while a real personalized
   user with a sparse graph honestly sees no For-You until their curators rate qualifying books. The
   user confirms "For-You empty/absent until the user's graph fills" is acceptable for v1.

## Flags for the gate (PO — contentious; the user decides)

- **Read-time compute + bounding (Open Question 1) — the key engineering call.** **PO recommendation:
  a bounded, candidate-limited read-time compute (option a)** — rank within the books rated by the
  raters the user's graph trusts (positive weight), capped by an env, then apply the bar + min-count +
  exclude-already-rated, resolving the user's weights in **one batched `weights` call** over that
  candidate rater set. This is the truest reading of "books highly rated by curators in MY graph" and
  keeps the per-request cost bounded and off any whole-catalog scan. On the **per-user-cache-vs-pure-
  read-time** call: **PO recommends pure read-time for v1, with at most a short-TTL per-user
  memoization** (a small per-request-avoidance cache keyed by the user, with the TTL as its clear
  invalidation story) **only if measured cost warrants it** — and **explicitly NOT** a precomputed
  per-POV cache table, which ADR 0036 forbids (it would reintroduce the invariant-3 combinatorial
  blow-up the house cache avoided by staying one-POV). The honest tradeoff: pure read-time recomputes
  on every homepage load for a personalized user; a short-TTL memoization trims that at the cost of a
  small staleness window. The user picks; the choice sets AC-4 / AC-6.

- **Who gets For-You + non-personalized behavior (Open Question 2).** **PO recommendation:
  personalized users only**; **signed-in-but-not-personalized users get an honest "Personalize to see
  For You" invitation**, **signed-out users get silent absence**. The alternative (silent absence for
  everyone non-personalized) is more minimal but hides a real feature from users who could unlock it.
  Either way: **no fabricated For-You for non-personalized users** (AC-5 is firm). The user confirms.

- **"Highly rated by my curators" definition + thresholds (Open Question 3).** **PO recommendation,
  all env-configurable:** rank by `weightedRatings.average` from the **user's** vantage; qualify only
  if (i) average ≥ a high bar (PO suggests **≥ 4.0**, env `FORYOU_MIN_AVG`), (ii) trusted-rating-count
  ≥ a small min (PO suggests **2–3**, env `FORYOU_MIN_RATINGS`), and (iii) the user has not rated the
  book; cap the row at ~6–12 (env `FORYOU_BOOKS`). Exact env names + values are the Architect's; the
  user confirms the bar + min-count are sane (high enough that "highly rated" is honest, low enough
  that a real graph produces a non-empty shelf).

- **Thin-graph reality + honest-empty (Open Question 4) — shared with Stories 25/30/34/35.** On
  today's graph, a personalized user's For-You is effectively **empty until their curators rate
  qualifying books**. **PO recommendation: acceptable for v1** — honest-empty/absent is the safe state
  (no fabricated picks), and the fixture provider proves the whole compute for when real signal
  arrives. The user confirms "For-You empty/absent until the user's graph fills" is acceptable for v1.

## Linked artifacts
- PRD: `engineering-team/phase2-prd.md` **§2.9** (the charter — the **For-You** line: "books highly
  rated by curators in the user's graph that they have not rated"; AC: "Personalized users see 'For
  You.'"), §2.0 (fixture/CI sequencing), §2.6 (custodial personalization, the trigger For-You
  consumes), §2.11 (index-on-write — OUT, Block E).
- Predecessor / sibling Block-D stories: `engineering-team/stories/done/35-homepage-trust-shelves.md`
  (the house shelves half + the `homepage_shelves` cache + `GET /api/homepage/shelves` + the read-time-
  not-per-POV-cache boundary For-You must honor), `engineering-team/stories/done/34-trust-weighted-search.md`
  (the §2.9 search half — the bounded/batched page-scoped trust read pattern For-You mirrors),
  `engineering-team/stories/done/26-custodial-personalization.md` (how a user becomes personalized —
  the `hasScores` / "Yours" vantage For-You requires).
- House-shelves ADR: `engineering-team/decisions/0036-homepage-trust-shelves.md` (the house shelves
  worker + `homepage_shelves` cache + the **invariant-3 exception** and its **explicit For-You
  read-time-not-per-POV-cache constraint** — §2/Consequences; also the **`@unbnd/trust` extraction**
  amendment For-You's weighting reuse depends on). Search ADR:
  `engineering-team/decisions/0035-trust-weighted-search.md` (the §2.9 search half).
- Personalization ADRs: `engineering-team/decisions/0014-graperank-personalize.md` (the
  `TrustProvider` `weights`/`hasScores` seam + observer resolution + `weightedRatings` + the
  `?observer=<my npub>` "Yours" vantage For-You uses + Phase B sovereign trigger),
  `engineering-team/decisions/0026-custodial-personalization.md` (the custodial server-signed trigger).
- Trust / weighting ADRs: `engineering-team/decisions/0025-weighted-consensus.md` (the weighted-view
  pattern For-You reuses), `engineering-team/decisions/0017-fixture-trust-provider.md` (the fixture
  provider For-You is verified against).
- Code (read-only, for the Architect's grounding): `packages/trust/src/{types,fixture,index}.ts`
  (the `TrustProvider` seam + `weightedRatings`/`dedupeRatings`), `apps/api/src/ratings/summary.ts`
  (`countOwnRatings` — the own-ratings read for the exclude filter), `apps/api/src/routes/ratings.ts`
  (the `?observer=` "Yours" weighting + degrade-to-raw pattern), `apps/api/src/routes/trust.ts`
  (`hasScores` / `GET /api/trust/status`), `apps/api/src/routes/homepage-shelves.ts` +
  `apps/shelves/*` (the house shelves For-You sits beside but does NOT extend),
  `apps/web/src/routes/Home.tsx` + `apps/web/src/components/{Shelf,BookCard}.tsx`,
  `apps/web/src/lib/api.ts`.
- ADR: `engineering-team/decisions/0037-for-you-shelf.md` (read-time per-request user-vantage trust
  read; dedicated `GET /api/foryou`; candidate-limited single batched `weights`; bar 4.0 + min 2;
  exclude-already-rated; honest empty/absent; NO per-POV cache, `homepage_shelves` untouched).
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
