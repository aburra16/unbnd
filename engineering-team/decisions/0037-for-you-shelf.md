# ADR 0037: For-You personalized shelf — read-time, per-request, user-vantage trust read (no per-POV cache)

**Status:** Accepted
**Date:** 2026-06-02
**Story:** `engineering-team/stories/36-for-you-shelf.md`

## Context

This is the last Block-D story. PRD §2.9 closes its homepage-shelves list with one personalized
shelf — **"For You** (personalized users): books highly rated by curators in the user's graph that
they have not rated."** with the acceptance bullet **"Personalized users see 'For You.'"** Story 34
(ADR 0035) shipped the §2.9 *search* half; Story 35 (ADR 0036) shipped the house-PoV *shelves* half
(Trending / Community Favorites / genre rows) as an off-path worker that writes a Postgres
`homepage_shelves` cache served by `GET /api/homepage/shelves`. For-You is what remains: the
**personalized counterpart**, from the **signed-in user's OWN vantage**.

### The load-bearing constraint (ADR 0036 invariant-3 boundary)

The Story-35 `homepage_shelves` cache is the codebase's **only** per-POV denormalization, and it is
bounded **precisely because it holds ONE vantage** (the house observer). ADR 0036 §2/Consequences
record it as the §2.9-sanctioned exception to CLAUDE.md invariant 3 explicitly *because there is no
per-POV combinatorial blow-up at one POV*, and state the boundary For-You must honor verbatim:

> *"Story 36 (For-You) will add a per-user vantage — it must **not** extend this house cache into a
> per-POV cache (that would reintroduce the invariant-3 blowup); it computes at **read time** per
> CLAUDE.md §3."*

So For-You is a **read-time, per-request, bounded computation** for the signed-in personalized user
from **their own vantage**. It is NOT a precomputed cache, NOT a row in `homepage_shelves`, NOT a
per-user cache table. This is the canonical case CLAUDE.md §3 ("filter at view time") describes: two
personalized users get two different For-You shelves and both are right.

### Locked gate decisions (the user, 2026-06-02) — designed to exactly

1. **Pure read-time compute for v1.** Per-request, from the user's own vantage. **No** short-TTL
   per-user memoization in v1 (a later add only if measured cost warrants). **Absolutely no**
   precomputed per-POV cache table — For-You does not read or write `homepage_shelves` at all.
2. **Non-personalized behavior:** signed-in-but-not-personalized users get an honest invitation to
   personalize in the shelf's place; **signed-out users get silent absence** (no shelf, no prompt).
3. **"Highly rated" bar:** trust-weighted average from the user's vantage **≥ 4.0** AND **≥ 2 trusted
   raters** (raters carrying positive weight in the user's graph). Both env-configurable; row length
   env too. Follow the established `searchTrustBlend` / `curatorThreshold` config convention
   (optional-in-type, `loadConfig` always sets, validated range).

### The machinery to reuse (no new trust or ranking math)

- **`@unbnd/trust`** (`packages/trust/src/{types,ratings}.ts`, extracted by the ADR-0036 amendment) —
  the `TrustProvider.weights(observerHex, targetHexes)` seam (weights ∈ (0,1]; untrusted raters
  absent; best-effort, **never throws**, empty map on backend failure), plus the pure
  `dedupeRatings` / `weightedRatings` helpers. `weightedRatings` returns **null** when no rater
  carries positive weight (the honest "no trusted signal from this view") and otherwise exposes
  `average` and `trustedCount`. For-You resolves the **user's OWN** weights (their pubkey as the
  observer) over the candidate raters. Reuse, do not reimplement.
- **Story 34 search re-rank** (`apps/api/src/search/rerank.ts`, `apps/api/src/routes/search.ts`;
  ADR 0035) — the established API-side, observer-aware, **single-batched-`weights`**, bounded,
  honest-degrade trust read. For-You mirrors this discipline: one `weights` call over the page/candidate
  rater union, `try { … } catch` degrade, never 500.
- **Story 35 shelves** (`apps/shelves/src/compute.ts`, `apps/api/src/routes/homepage-shelves.ts`,
  migration `0005`; ADR 0036) — the `weightedRatings`-based Community-Favorites computation (average
  gated by `SHELF_FAVORITES_MIN_RATINGS`) is the closest analog to For-You's qualification, but
  For-You is **read-time + user-vantage**, not a cached worker. For-You honors ADR 0036's per-POV-cache
  prohibition (§2/Consequences).
- **Personalization** (ADR 0014 / ADR 0026) — a user is "personalized" when `hasScores(theirHex)` is
  true (`GET /api/trust/status` → `{ enabled, hasScores, canPersonalize }`,
  `apps/api/src/routes/trust.ts`). The user becomes personalized by self-triggering "Personalize"
  (sovereign NIP-07 / custodial server-signed). The **observer is the signed-in user's own pubkey** —
  exactly the `?observer=<my npub>` "Yours" vantage the ratings read already serves on BookDetail
  (`GET /api/books/:slug/ratings?observer=`, ADR 0014). For-You reuses that identical weighting; the
  only difference from the house shelves is the observer is the user, not the house.
- **Observer resolution** — the API already knows the signed-in user's hex pubkey via
  `resolveSessionUser(cookie)` (`apps/api/src/index.ts` → `{ id, pubkeyHex, tier, displayName }`),
  the same dep the ratings/trust routes use. **For-You does not invent any new observer-resolution**:
  the vantage IS `user.pubkeyHex`. No `?observer=` query param, no npub parsing — the session is the
  vantage.
- **Own-ratings read** (the exclude-already-rated filter, AC-3) — the profile-stats path
  (`apps/api/src/routes/profile-stats.ts`) reads the user's own ratings author-scoped via
  `queryPaged({ kinds: [39999], authors: [user.pubkeyHex] })` and counts them with `countOwnRatings`
  (`apps/api/src/ratings/summary.ts`, which keys latest-wins **by book slug** for a single author).
  For-You reuses that exact author-scoped read to build the set of slugs the user has already rated.

### Constraints carried in

No new ranking/trust math beyond `weightedRatings`; no raw GrapeRank number / tier / "trusted" badge
on any For-You card (CLAUDE.md — the shelf only selects + orders books); no new crypto (this reads
weights and composes a view, it signs nothing — CLAUDE.md crypto policy); built/verified against the
**fixture `TrustProvider`** (ADR 0017) with no Brainstorm, no relay, no human; no new homepage layout
(reuse `Shelf` / `BookCard` / the Story-35 `Home.tsx` structure); brand tokens unchanged (no new hex
outside `tokens.css`); copy reviewed against `memory/feedback_unbnd_copy_and_visual.md`. No new DList
shape — For-You reads existing kind-39998/39999 events and writes nothing (no event, no cache row).

## Options considered

### Option A — Dedicated `GET /api/foryou` read-time route, candidate-limited to the user's trusted curators, ONE batched `weights(userHex, raterUnion)` call (CHOSEN)

A new authenticated read-only route. It resolves the signed-in user's hex from the session, confirms
they are personalized (`hasScores`), reads the catalog ratings concept once (cap-safe), batches a
**single** `weights(userHex, raterUnion)` call over the union of raters, keeps only positive-weight
raters (the user's trusted curators), restricts the candidate book set to books those curators rated,
excludes books the user has already rated (one author-scoped own-ratings read), qualifies each
remaining book by `weightedRatings.average ≥ FORYOU_MIN_AVG` AND `trustedCount ≥ FORYOU_MIN_RATINGS`,
ranks by `average` (deterministic tie-break by slug), caps the row at `FORYOU_BOOKS`, hydrates slugs
to `PublicBook`, and returns. On any trust failure / no vantage / thin graph it returns an honest
empty (200, never 500). Computed **fresh per request**, never cached.

- **Pros.** Truest reading of "books highly rated by curators in MY graph": candidate books are
  literally the books the user's trusted curators rated. The trust read is the standing **single
  batched `weights`** pattern (Story 34/35) — O(distinct raters), never O(catalog × raters). Reuses
  `weightedRatings` / `dedupeRatings` / the session-vantage / the own-ratings read verbatim — no new
  math. Honors the ADR-0036 per-POV-cache prohibition exactly (read-time, no cache table). The
  fixture provider makes the whole compute deterministic + CI-testable. A dedicated endpoint keeps
  For-You's per-user compute entirely off `GET /api/homepage/shelves` (the house cache is untouched).
- **Cons.** Pure read-time recomputes on every personalized homepage load (accepted per gate
  decision 1; revisit with a memo if measured). The candidate-book scope depends on a cap
  (`FORYOU_CANDIDATE_RATERS`) to keep the batched `weights` array bounded on a future dense graph.

### Option B — Extend `GET /api/homepage/shelves` with a personalized For-You shelf when the request carries a session

Fold For-You into the existing homepage-shelves route so the homepage makes one call.

- **Pros.** One homepage fetch; one response shape.
- **Cons.** `GET /api/homepage/shelves` is **serve-from-cache only** by ADR 0036 §3 — it must never
  compute on a request and never read ratings/weights on the request path. Adding a per-user compute
  branch to it directly violates that contract and entangles the house-PoV cache read with a per-user
  read-time read (two failure domains, two latency profiles, on one route). It also blurs the
  invariant-3 boundary the story is built to keep crisp. Rejected: the house serve route stays
  cache-only and untouched; For-You is its own read-time endpoint.

### Option C — A short-TTL per-user memoization cache layered on Option A

Option A plus a small in-process per-user cache (keyed by user hex, short TTL) to avoid recompute on
every homepage load.

- **Pros.** Trims repeat compute for an active user within the TTL window.
- **Cons.** Adds a staleness window and a per-replica, restart-fragile cache with its own
  invalidation story, for a cost we have not measured. The gate explicitly chose **pure read-time for
  v1** and deferred any memoization to "only if measured cost warrants it." Recorded as the
  first follow-up, not adopted now. (It is still **not** a precomputed per-POV cache table — that
  remains forbidden by ADR 0036 in all cases.)

### (Option D — A precomputed per-POV For-You cache table)

A `foryou_shelves` Postgres table the worker fills per personalized user, mirroring `homepage_shelves`.

- **Cons.** This is the exact thing ADR 0036 forbids: a per-POV denormalization reintroduces the
  invariant-3 combinatorial blow-up (N users × M books) the house cache avoided by staying one-POV.
  The story names it Out of Scope. **Explicitly rejected, for v1 and beyond, by ADR 0036.**

## Decision

We chose **Option A**: a dedicated, authenticated, **read-time** `GET /api/foryou` route that computes
the signed-in user's For-You shelf from **their own vantage** with a single batched `weights` call over
a bounded candidate-rater set, qualifies by the env bar + min-count, excludes already-rated books,
ranks + caps, and degrades honestly to empty. It touches **no** cache table. Below is the precise spec.

### 1. Endpoint + auth + vantage resolution

A new read-only route `GET /api/foryou` (`buildForYouRouter(deps)` in `apps/api/src/routes/foryou.ts`,
registered in the API wiring beside the books / homepage-shelves routers). Deps mirror the
ratings/search reads:

```ts
export type ForYouDeps = {
  readonly config: Config;
  readonly sessionUser: (cookie: string | undefined) => Promise<SessionUser | null>;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly queryPaged: (filter: NostrFilter) => Promise<PagedResult>; // own-ratings cap-safe read
  readonly trust?: TrustProvider;
};
```

Auth + vantage (no new observer-resolution — the session IS the vantage):

1. Resolve the signed-in user from the session cookie via `deps.sessionUser(cookie)` (the same
   `resolveSessionUser` wired everywhere). **Signed-out** (`null`) → the endpoint returns an honest
   **personalized-absent** shape (see §6); the web renders **nothing** for signed-out (gate decision
   2). The route stays a 200 read — it does not 401, so the homepage fetch never has to special-case a
   status code. (Web decides prompt-vs-silence on the `state` field, §5.)
2. **Personalization gate:** if `!deps.trust` or `!deps.config.librarianPubkey` or
   `await deps.trust.hasScores(user.pubkeyHex)` is false → return the **not-personalized** shape
   (`state: "not_personalized"`, empty books). No compute. This is the `hasScores(theirHex)` gate from
   ADR 0014 / `GET /api/trust/status`.
3. Otherwise the **observer hex is `user.pubkeyHex`** — the user's own GrapeRank vantage, identical to
   the `?observer=<my npub>` "Yours" path the ratings read serves, except sourced from the session
   rather than a query param. Proceed to the compute (§2–§4).

### 2. Candidate-set strategy + the bound (no whole-catalog × whole-graph scan)

The candidate set is **books rated by curators the user trusts**, gathered bounded:

1. **Read the catalog ratings once (cap-safe).** Read all rating events under the librarian's ratings
   header — `query({ kinds: [39999], "#z": [formatAddress(buildBookRatingsHeaderAddress(lib))] })` (or
   `queryPaged` past the 500 cap, ADR 0021), exactly the candidate set the shelves worker reads in
   `apps/shelves/src/compute.ts`. Group events by `bookSlug` (via the existing `fromBookRatingEvent`
   parse), `dedupeRatings` each book → `ParsedRating[]` per slug.
2. **Bound the rater union.** Collect the union of distinct rater hexes across all candidate books.
   To keep the single `weights` call bounded on a future dense graph, **cap the union** at
   `FORYOU_CANDIDATE_RATERS` (§4) — take the raters appearing across the most-rated books first
   (deterministic, slug-ordered), so the batched array is `O(FORYOU_CANDIDATE_RATERS)`, never the whole
   graph. On today's thin graph the union is far under the cap and the cap is a no-op.
3. **ONE batched `weights` call (AC-6).** `weights = await deps.trust.weights(user.pubkeyHex,
   [...raterUnion])` — a single call (the worker's `weights` chunking convention applies if the union
   ever exceeds a fixed chunk size: fixed-size chunks unioned into one `Map`). **No per-book per-rater
   fan-out**, mirroring Story 34 (AC-6) / Story 35 (AC-7). Wrapped in `try { … } catch { weights = new
   Map(); }` so a surprise rejection degrades to empty (honest degrade, §6).
4. **Trusted-curator restriction.** The user's "trusted curators" are the raters with `weight > 0` in
   `weights`. The candidate books are those that have **at least one** rating from a trusted curator
   (every other book has `weightedRatings === null` from this vantage and is dropped). The candidate
   **book** count is implicitly bounded by `FORYOU_CANDIDATE_RATERS` (only trusted-curator-rated books
   survive) and never exceeds the catalog; the row itself is capped at `FORYOU_BOOKS` (§4).

This is `O(distinct raters)` for the trust read and `O(candidate books)` for the qualification, with
both bounded — never `O(catalog × graph)`.

### 3. Qualification (the "highly rated" bar) + exclude-already-rated

Per candidate book, compute the user-vantage view with the shipped helper:

```
weighted = weightedRatings(thatBooksDeduped, weights, npubEncode(user.pubkeyHex))
```

A book **qualifies** only if all hold:

- `weighted !== null` (≥ 1 trusted curator rated it from the user's vantage), AND
- `weighted.average >= config.foryouMinAvg` (default **4.0**), AND
- `weighted.trustedCount >= config.foryouMinRatings` (default **2**), AND
- the book is **not** in the user's own-rated set (AC-3).

The bar + min-count mirror Story 35's Community-Favorites shape (`SHELF_FAVORITES_MIN_RATINGS`) but
from the **user's** vantage rather than the house's. A single trusted 5-star does not qualify a book
(min-count 2); a thinly-rated book is excluded rather than topping the shelf.

**Exclude-already-rated (AC-3).** Read the user's own current ratings author-scoped and cap-safe —
`deps.queryPaged({ kinds: [39999], authors: [user.pubkeyHex], "#z": [ratingsHeaderAddress] })` — and
derive the set of slugs the user has a current rating on. Reuse the profile-stats own-ratings read
shape (`countOwnRatings` keys latest-wins **by book slug** for a single author; For-You needs the slug
*set*, so it derives the same per-slug latest-wins map and takes its keys — a small `ownRatedSlugs(events):
Set<string>` helper alongside `countOwnRatings`, or inline the same latest-by-slug fold). Every book in
that set is dropped from the candidate set, even if highly rated by the user's curators.

### 4. Ranking + row cap

Rank qualifying books by `weighted.average` **descending**, tie-broken by slug ascending
(deterministic, matching the shelves worker's `b.average - a.average || a.slug.localeCompare(b.slug)`),
take the top `config.foryouBooks` (default **12**), hydrate each slug to `PublicBook` via the existing
`#d` slug batch read (`query({ kinds: [39999], "#z": [booksConcept], "#d": slugs })` → `parseBook`,
the same hydrate `homepage-shelves.ts` uses), preserving rank order and dropping any slug that no
longer resolves to a catalog book. **No trust number / tier / count crosses the wire** (CLAUDE.md —
the shelf only orders books).

### 5. Response shape + web placement + the non-personalized invitation

Response (honest-empty by empty array; `state` carries the why so the web renders correctly):

```jsonc
{
  "state": "personalized" | "not_personalized" | "anonymous",
  "books": PublicBook[]   // [] when personalized-but-thin, or for non-personalized/anon
}
```

- `state: "personalized"` + non-empty `books` → render the For-You `Shelf`.
- `state: "personalized"` + empty `books` → honest empty; the shelf is **absent** (thin graph;
  no fabrication).
- `state: "not_personalized"` → the web renders the **invitation** (gate decision 2).
- `state: "anonymous"` → the web renders **nothing** (silent absence for signed-out, gate decision 2).

**Web (`apps/web/src/routes/Home.tsx`).** For-You is the **top** trust surface for a personalized user
— placed **above** the Story-35 house trust shelves (Trending / Favorites / genre rows), which are
themselves above the non-trust fallback (Recently added + Explore genres). The web client gains
`api.foryou()` in `apps/web/src/lib/api.ts` (the credentialed `authFetch` already sends the session
cookie via `credentials: "include"`). `Home.tsx` fetches it alongside the existing reads; on `state`:

- `personalized` + books → `<Shelf title="For you" books={…} />` at the top.
- `not_personalized` → a single honest invitation block in the shelf's place (one line + a link to
  the personalize flow). **Draft copy (reviewed against `memory/feedback_unbnd_copy_and_visual.md` —
  no em dash, no rhetorical contrast, no filler, plain nouns):**
  - Heading: **`For you`**
  - Body: **`Build your web of trust and this shelf fills with books the curators you follow rate
    highly.`**
  - Link label: **`Personalize your view`** (routes to the existing personalize affordance).
  (Final wording is the Implementer's within the no-slop constraint; this draft is clean.)
- `anonymous` → render nothing (no shelf, no prompt).

The For-You fetch **degrades to nothing** on any failure (`api.foryou().catch(() => ({ state:
"anonymous", books: [] }))`), so a failed/absent For-You never blanks the homepage — the rest of the
page (house shelves + non-trust fallback) renders exactly as Story 35 ships it. Reuses `Shelf` /
`BookCard` and existing tokens only; no new layout, no new hex, no new icon. Shelf title and the
invitation strings are reviewed against the no-slop rule.

### 6. Honest empty / honest degrade (200, never 500; never fabricate)

- **No vantage / not personalized** (`!trust`, `!librarianPubkey`, `hasScores` false): return
  `state: "not_personalized"`, `books: []` — no compute, no relay read.
- **Signed out:** return `state: "anonymous"`, `books: []`.
- **Thin graph** (personalized, but no book clears the bar + min-count from the user's vantage after
  excluding their own ratings): return `state: "personalized"`, `books: []` — honest empty, **never**
  padded with non-personalized / house / arbitrary books (AC-7).
- **Trust failure** (`weights` rejects or resolves to an empty map): the `try { … } catch { weights =
  new Map() }` wrapper makes every `weightedRatings` return null → zero qualifying books → honest empty
  `state: "personalized"`, `books: []`. A trust failure **degrades** to empty; it never throws, never
  500s. The whole route body is wrapped (`try { … } catch (err) { next(err) }`) so even a surprise
  read error surfaces as the app's normal error path rather than a fabricated shelf — but the trust
  step itself degrades silently to empty, as the ratings/search/shelves reads do.
- The `@unbnd/trust` seam never throws by contract; the read still wraps the `weights` call, matching
  the ratings/tags/search/shelves discipline.

### 7. Config (env knobs — `loadConfig` convention)

Three new env knobs on `Config`, added to `apps/api/src/config.ts` following the `searchTrustBlend` /
`curatorThreshold` convention (optional-in-`Config` so partial test fixtures need not set them;
`loadConfig` **always** sets them from `withDefault` + a validated range; throws the house-style
`config: <NAME> must be …; got …` on a bad value):

| Env | `Config` field | Default | Validation |
|---|---|---|---|
| `FORYOU_MIN_AVG` | `foryouMinAvg: number` | `4.0` | finite, in `[1,5]` (the rating scale) |
| `FORYOU_MIN_RATINGS` | `foryouMinRatings: number` | `2` | integer ≥ 1 |
| `FORYOU_BOOKS` | `foryouBooks: number` | `12` | integer ≥ 1 |
| `FORYOU_CANDIDATE_RATERS` | `foryouCandidateRaters: number` | `2000` | integer ≥ 1 |

`FORYOU_MIN_AVG` = 4.0 makes "highly rated" honest on a 1–5 scale; `FORYOU_MIN_RATINGS` = 2 stops a
lone trusted 5-star from qualifying a book (mirrors `SHELF_FAVORITES_MIN_RATINGS` = 3 but from the
user's sparser own vantage, so 2 keeps a real graph able to produce a non-empty shelf); `FORYOU_BOOKS`
= 12 fills one `Shelf` row; `FORYOU_CANDIDATE_RATERS` = 2000 bounds the single batched `weights` array
(a no-op on today's thin graph; a guardrail when the graph densifies). All four live in the **API**
config (the route computes at read time — there is no worker), unlike the Story-35 shelf knobs which
live in the worker.

### 8. Architecture-guard posture

- **ADR-0014 trust guard stays green.** For-You consumes only the neutral `@unbnd/trust` surface
  (`TrustProvider.weights` / `hasScores`, `weightedRatings` / `dedupeRatings`). No Brainstorm/NIP-85
  specifics (`/setup/`, `/authChallenge`, `/user/graperank`, `graperankResult`, `30382`,
  `brainstorm_login`) appear in `apps/api/src/routes/foryou.ts` or anywhere outside
  `packages/trust/src/brainstorm.ts`. The repo-wide guard
  (`packages/trust/test/architecture.test.ts`, ADR 0036 A3) scans `apps` ∪ `packages` and stays green.
- **No new crypto.** The route reads weights and composes a view; it signs nothing (CLAUDE.md crypto
  policy). It imports no signer.
- **`homepage_shelves` is untouched (Story-35 invariant-3 exception stays scoped to the house cache).**
  For-You does **not** read or write the `homepage_shelves` table, does not call
  `GET /api/homepage/shelves`, and adds **no** cache table / migration. The house cache remains the
  **only** per-POV denormalization, and it stays one-POV (house). For-You's per-user vantage stays
  entirely at read time, honoring the ADR-0036 boundary verbatim.

## Consequences

- **Enables** the §2.9 For-You shelf: each personalized user's homepage surfaces their next read from
  **their own** web of trust (POV-first), composed read-time from the same weighting machinery the
  rest of the app uses, with honest empty/absent states and no fabricated picks. Closes Block D.
- **Constrains / makes harder.** Pure read-time **recomputes on every personalized homepage load** —
  one cap-safe ratings read + one batched `weights` call + one own-ratings read + one slug hydrate per
  load (accepted per gate decision 1). On a future dense graph this is the surface to watch; the
  bound (`FORYOU_CANDIDATE_RATERS`) keeps the trust read O(bounded), and a short-TTL per-user
  memoization is the recorded first follow-up **if measured cost warrants it** (never a precomputed
  per-POV cache).
- **New debt / follow-ups.** (1) Optional short-TTL per-user memoization (Option C), behind a measured
  trigger. (2) The candidate-set could later be narrowed to the user's *directly-followed* curators
  rather than all positive-weight raters, if the trusted-rater union proves wide; deferred (the
  positive-weight set is the truest reading of "curators in MY graph" for v1).
- **Affects existing fixtures?** No existing fixtures change. The Tester adds a `TRUST_FIXTURE` giving
  a known **user** observer known weights over a known rater set, a known set of rated books, and a
  known set of the user's own ratings, plus a fake relay/own-ratings read. `Home.tsx` gains a mocked
  `api.foryou()`.
- **New dependency?** No. Reuses `@unbnd/trust`, the existing `query` / `queryPaged` / `sessionUser`
  deps, `parseBook`, and `nostr-tools/nip19` (`npubEncode`).
- **PRD section change required?** No. This implements PRD §2.9's For-You line as written.

## Implementation notes

Concrete for the Tester (red set) and Implementer.

- **New file `apps/api/src/routes/foryou.ts`** — `buildForYouRouter(deps: ForYouDeps): Router` exposing
  `GET /api/foryou`. The compute SHOULD be factored as a **pure, injected-deps function** (e.g.
  `computeForYou({ observerHex, candidateRatings, ownRatedSlugs, weights, defs }): { slug, average }[]`)
  so the bar/min-count/exclude/rank logic is unit-testable without the route, mirroring how
  `apps/api/src/search/rerank.ts` is a pure function the route calls. The route does: session →
  `hasScores` gate → cap-safe ratings read + own-ratings read → one `trust.weights(user.pubkeyHex,
  raterUnion)` → `computeForYou` → slug hydrate → JSON. Wrap the trust step in `try/catch → empty
  map`; wrap the route body in `try/catch → next(err)`.
- **File `apps/api/src/index.ts`** — register the router beside `buildHomepageShelvesRouter`:
  `app.use("/", buildForYouRouter({ config, sessionUser: resolveSessionUser, query:
  userEventDeps.query, queryPaged: userEventDeps.queryPaged, trust }))`. All four deps already exist in
  `userEventDeps` / `resolveSessionUser` / `trust`.
- **File `apps/api/src/config.ts`** — add `foryouMinAvg` / `foryouMinRatings` / `foryouBooks` /
  `foryouCandidateRaters` to `Config` (optional) and to `loadConfig` (always set, validated per §7),
  with the house-style throw messages. Mirror the `searchTrustBlend` block exactly. Add the four to
  `apps/api/test/config.test.ts` (the Tester adds the validation cases).
- **File `apps/api/src/ratings/summary.ts`** — add a small `ownRatedSlugs(events: SignedNostrEvent[]):
  Set<string>` helper next to `countOwnRatings` (same latest-by-slug fold, returning the key set), OR
  the route inlines the same fold. No change to the shared `@unbnd/trust` surface — `weightedRatings` /
  `dedupeRatings` are reused as-is.
- **File `apps/web/src/lib/api.ts`** — add `api.foryou()` returning the §5 shape (new `ForYou` type:
  `{ state: "personalized" | "not_personalized" | "anonymous"; books: PublicBook[] }`), via the
  credentialed `authFetch` (cookie sent automatically). Reuse the existing `PublicBook` type.
- **File `apps/web/src/routes/Home.tsx`** — fetch `api.foryou()` alongside the existing reads
  (degrade-to-`anonymous` on failure). Render, **above** the house trust shelves: the For-You `Shelf`
  when `personalized` + non-empty; the invitation block (§5 copy) when `not_personalized`; nothing when
  `anonymous` or `personalized`-but-empty. No new component, no new token, no new hex.
- **Address builders** reused from `@unbnd/schemas`: `buildBookRatingsHeaderAddress(lib)` +
  `formatAddress` for the ratings `#z`; `39998:<lib>:books` (`booksConcept`) for the book `#d` hydrate
  — identical to `apps/shelves/src/compute.ts` and `apps/api/src/routes/homepage-shelves.ts`. The
  librarian pubkey is read at runtime from `config.librarianPubkey` (never hardcoded, CLAUDE.md).
- **No DList shape touched.** Reads existing kind-39998/39999 events; writes nothing (no event, no
  cache row, no migration).
- **No new crypto, no new dependency, no new lint/build tooling.**

### Testable seams (fixture-verified; deterministic; no Brainstorm/relay/human)

The compute is a pure function with injected `weights` / candidate ratings / own-rated slugs / defs;
the route is dependency-injected (`sessionUser` / `query` / `queryPaged` / `trust` faked), matching the
ratings/search route test style (no intra-module `vi.mock`). Seams per AC:

- **AC-1** — own-vantage ranking: a `TRUST_FIXTURE` with a known **user** observer's weights ranks
  books by `weightedRatings.average` from that user's vantage; swapping the fixture user's weight row
  changes the order (two users → two shelves, both correct).
- **AC-2** — bar + min-count: a book with avg ≥ `FORYOU_MIN_AVG` AND `trustedCount ≥
  FORYOU_MIN_RATINGS` qualifies; a single trusted 5-star (count 1) does not; a 3.9-avg book does not.
- **AC-3** — exclude-already-rated: a book the fixture user has a rating on never appears, even when
  highly rated by their curators.
- **AC-4** — read-time, not cached: the route computes per request and makes **no** read/write to
  `homepage_shelves` and **no** call to `GET /api/homepage/shelves` (assert no cache dep is touched);
  no per-user cache table exists.
- **AC-5** — non-personalized / signed-out: `hasScores` false → `state: "not_personalized"`, no
  fabricated books; signed-out → `state: "anonymous"`; the web renders the invitation vs nothing
  accordingly and never a populated "For You" of arbitrary books.
- **AC-6** — bounded/batched: assert **one** `trust.weights` call over the union rater set (or fixed
  chunks unioned), never per-book; the candidate read is cap-safe; no `O(catalog × raters)` fan-out.
- **AC-7** — honest empty/degrade: no qualifying book → empty `personalized`; `weights` throws / empty
  map → empty `personalized`, no throw, **200 never 500**; the homepage still renders the rest.
- **AC-8** — all run under `TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE`, no
  Brainstorm/relay/human; the ADR-0014 guard (`packages/trust/test/architecture.test.ts`) stays green;
  no Brainstorm/NIP-85 specifics in `foryou.ts`.

## Out of scope

- **Any precomputed per-POV / per-user cache table** (`foryou_shelves` or similar) — forbidden by
  ADR 0036's invariant-3 boundary. For-You is read-time only.
- **Extending the Story-35 `homepage_shelves` house cache or `GET /api/homepage/shelves`** to hold or
  serve For-You — the house cache stays one-POV (house) and untouched.
- **A short-TTL per-user memoization** — recorded as the first follow-up (Option C), adopted only if
  measured cost warrants it; not built for v1.
- **The house homepage shelves** (Story 35), **trust-weighted search** (Story 34), the **Personalize
  trigger** itself (ADR 0014/0026 — For-You only reads `hasScores`), and the **house-observer swap** —
  all untouched/irrelevant (For-You uses the user's observer).
- **Any new ranking/trust math beyond `weightedRatings`**, any trust score / GrapeRank number / tier
  badge on a For-You card, a homepage redesign, an admin "recommend this book" affordance,
  index-on-write (Block E), and new lint/build tooling.
