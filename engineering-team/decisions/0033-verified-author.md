# ADR 0033: Verified Author — count-gate consensus + gated author-edit overlay (Block C)

**Status:** Proposed
**Date:** 2026-06-01
**Story:** `engineering-team/stories/32-verified-author.md`

## Context

Story 32 (PRD §2.10, Lane 2 / Block C) builds the **trust-DEPENDENT** half of author
identity on top of Story 31's trust-independent claim core (ADR 0032). Story 31 shipped open
claiming: any signed-in user claims a catalog book, the book shows an honest **"Claimed by
{name}"** badge listing every claimant, the author profile gains "Books by this author."
Story 31 deliberately deferred two things to here: the **verification upgrade** and **author
metadata editing** (editing was gated behind verification, so it could not ship until
verification existed). This ADR builds that layer:

1. an **`author-verified`** curator-gated assertion (apply/dispute) targeting an (author,
   book) claim;
2. a **verification count-gate** over those assertions (the consensus that flips a claim to
   "Verified");
3. the **"Verified Author"** badge state;
4. the **`author-edits`** author-signed overlay (blurb / cover URL / purchase links only);
5. the **read-merge** that applies the overlay at read time only when the author is Verified.

### Gate decisions (2026-06-01) baked into this ADR

The user resolved the open forks at the gate. They are **not** open here:

1. **Consensus = COUNT-GATE, not weighted-sum.** A claim is **Verified** when **≥ N distinct
   curators**, each at/above a per-curator weight floor, have **net-asserted** `author-verified`
   (latest-per-curator apply minus dispute), with the **author's own assertion EXCLUDED** (no
   self-verification). `N` is a new configurable env (`VERIFIED_AUTHOR_MIN_CURATORS`). The
   per-curator weight floor **reuses `CURATOR_THRESHOLD`** (decision below). This is the same
   count-gate shape C-7 (trust-weighted curator roles, Phase 3) will generalize — this story
   pre-establishes the primitive.
2. **Multi-verified conflict = NONE-ON-CONFLICT.** If >1 claimant is Verified on one book,
   **badge all of them** and apply **NO** edit overlay (no fabricated winner). Co-author support
   (show/merge both verified authors' contributions) is a **Phase-3 deferral** (Consequences).
3. **Editing turns ON for Verified authors** (resolves the Story-31 deferral). Self-verification
   excluded; dispute symmetric (a trusted dispute lowers the net count); edit surface **inline on
   BookDetail**, revealed only to the Verified author; a **separate** verification threshold env,
   distinct from `CURATOR_THRESHOLD`.

### What exists today (cited)

- **The canonical record + the read-merge seam.** `GET /api/books/:slug`
  (`apps/api/src/routes/books.ts:75-96`) already runs the book read and a sibling claims read
  in `Promise.all`, projects claimants (`projectClaimants`, `apps/api/src/claims/claimants.ts`),
  and returns `{ book, claimants }`. ADR 0032 §3 names this exact assembly as the Story-32
  read-merge seam; today `effectiveBook === canonical` (pass-through). The canonical
  `BookRecord` is **librarian-signed**; the API holds only `LIBRARIAN_PUBKEY`, **no librarian
  secret** (ADR 0031). `PublicBook` is the projection (`books.ts:18-57`).
- **The claim event (the (author, book) target).** `BookClaim`
  (`packages/schemas/src/BookClaim.ts`): claimant-signed kind-39999, `["a", "39999:<lib>:<slug>"]`
  + `["p", <claimantHex>]` + `["t", <slug>]`, z → `book-claims` header
  (`BOOK_CLAIMS_HEADER_SLUG`, `concept-headers.ts:17`), d-tag `claim--<slug>--<claimant8>`. This
  is the pair `author-verified` targets and the overlay author must own.
- **The reserved overlay header.** `BOOK_AUTHOR_EDITS_HEADER_SLUG = "author-edits"`
  (`concept-headers.ts:20`) is already declared (no builder yet). This ADR adds
  `buildBookAuthorEditsHeaderAddress` and the schema that z-tags there. (No new
  `author-verified` header — see Decision §1.)
- **The assertion pattern to mirror.** `BookTagAssertion`
  (`packages/schemas/src/BookTagAssertion.ts`): kind-39999, `["a", <bookAtag>]`, `["p",
  <asserterHex>]`, `["t", <tagSlug>]`, `["t", <tagType>]`, `["polarity", "1"|"-1"]`, z →
  `book-tag-assertions`, d-tag `tagassert--<slug>--<tag>--<asserter8>`, `Polarity = 1|-1`. The
  `author-verified` event is the same shape with the tag-slug fixed to a sentinel.
- **The curator gate + house weight idiom.** `apps/api/src/routes/submissions.ts:282-291`:
  `houseWeightOf(callerHex)` = `(await trust.weights(houseObserverHex, [callerHex])).get(callerHex)
  ?? 0`, fail-closed to `0` (no provider / no observer / empty / throw). The promote gate
  (`submissions.ts:296-321`): anon → 401 `no_session`; `weight < curatorThreshold` → 403
  `below_gate`; else proceed. The `author-verified` **write** reuses this gate verbatim.
- **The weighting / asserter-weight-fetch idiom.** `aggregateBookTagsWeighted`
  (`apps/api/src/tags/aggregate.ts:120-188`): dedupe by (author, slug) latest-`created_at`, then
  `weights.get(author) ?? 0`. The verification gate reuses the **dedupe + asserter-weight-fetch**
  shape, but **counts above-floor net-apply asserters** instead of summing weights. `dedupeRatings`
  / `weightedRatings` (`apps/api/src/ratings/summary.ts:58,148`) supply `trustedCount` (count of
  above-weight raters) — the count idiom, ready to reuse.
- **The trust seam (ADR 0014).** `apps/api/src/trust/{types,fixture,index}.ts`:
  `weights(observerHex, targetHexes) → Map`, **never throws** (empty map on failure); observer =
  `config.houseObserverPubkey`. Fixture provider (`fixture.ts`, `TRUST_PROVIDER=fixture` +
  `TRUST_FIXTURE`) gives deterministic weights for CI.
- **The two-tier write path.** `apps/api/src/routes/claims.ts` is the canonical DI'd two-tier
  router: sovereign `POST …/template` → client NIP-07 sign → `POST …` validate
  (`validateSignedClaim`, kind + `pubkey===session` else 403 `pubkey_mismatch` + `verifyEvent`)
  → `publish`; custodial builds the template → `custodialSign` (null → 401 `reauth_required`) →
  `publish` (fail → 502). Deps = `userEventDeps` (`index.ts:364-377`). The
  `author-verified` write and the `author-edits` write both clone this shape.
- **URL validation (Story 22 parity).** `httpUrl` (`apps/api/src/nostr/profile.ts:26-27`) and
  the substack `isHttpUrl` (`profile/validate-kind0.ts:38`) — the well-formed-`http(s)` check the
  cover-URL and purchase-link inputs reuse.
- **Identity / badge.** `AuthorBadge` (`apps/web/src/components/AuthorBadge.tsx`) renders
  "Claimed by {name}" per claimant via `useProfileMeta` / `displayNameOf` + `shortNpub`, never
  "verified". `BookHeader` (`BookHeader.tsx:39`) renders `<AuthorBadge claimants={…}/>` under the
  `by {authorName}` line. `BookDetail` threads `claimants` from `api.books.get`. api client:
  `apps/web/src/lib/api.ts` (`api.claims.*`, `api.books.get`, `BookClaimant`).

### Constraints

- **Architecture invariants (CLAUDE.md).** POV-first: verification is computed from the **house
  observer's** vantage (same as trusted tag/rating consensus). Decentralized-first: the
  `author-verified` assertion is published permissionlessly; the **curator gate is enforced at the
  write authorization**, emergent from GrapeRank weight (the Story-30 gate), **not** a role list
  (the domain `curator` role is C-7, Phase 3, OUT). Filter-at-view-time: verification and the
  overlay are composed at **read time** in `effectiveBook`; the canonical record is **never**
  mutated. No raw GrapeRank number / trust-tier string on any surface; the badge shows
  "Verified Author" or "claimed".
- **No new crypto** (crypto policy). Both tiers reuse the shipped template→sign→submit
  (sovereign) and `custodialSign` (custodial) paths.
- **No automated verification** (website/ISBN/domain) — Phase 3. **No librarian secret** in the
  API. **Editing limited** to blurb / cover URL / purchase links. **No new lint/typecheck/build
  tooling.** Copy reviewed against `memory/feedback_unbnd_copy_and_visual.md`.

Aligns with ADR 0005 (author-signed write + replaceable d-tag + read-back), 0006 (custodial,
both tiers), 0009 (`#a`-referencing apply/dispute assertion), 0014 (`TrustProvider`), 0017
(fixture provider), 0025 (the weighting idiom), 0031 (the curator gate), 0032 (the claim, the
reserved header, the read-merge seam). Contradicts no prior ADR; it **activates** the ADR-0032
seam.

## Options considered

### Decision 1 — the verification consensus model

#### Option A — COUNT-GATE: ≥ N distinct curators above a weight floor, net-apply, self-excluded (CHOSEN, per gate)

Verified iff `count(distinct curators C: weight(house, C) ≥ floor AND C's latest net polarity
on this (author, book) is apply AND C ≠ author) ≥ N`. A trusted dispute by a curator flips that
curator's net to non-apply, lowering the count (symmetric). `N` env-configurable;
`floor = CURATOR_THRESHOLD`.

- **Pros:** Legible — "three trusted curators confirmed this author," not an opaque weight sum.
  Self-exclusion and the per-curator floor are structural (each counted curator already cleared
  the same gate they need to *assert*, so "who may assert" and "who counts" are one bar). Untrusted
  volume cannot push it over (below-floor curators contribute 0 to the count). It is the exact shape
  C-7 will reuse for trust-weighted curator roles, so this pre-establishes the primitive instead of
  inventing a second one later.
- **Cons:** A second consensus idiom alongside the weighted-sum used for tags/ratings. Mitigated:
  it reuses the **dedupe + asserter-weight-fetch** half of `aggregateBookTagsWeighted` and the
  **count** half of `weightedRatings.trustedCount`; only the final reduce differs (count ≥ N vs.
  sum ≥ bar). Verification is a binary identity verdict, not a graded community signal — a count of
  distinct trusted humans is the honest unit, where a weight-sum invites one heavy account to verify.

#### Option B — WEIGHTED-SUM: sum of above-floor curator weights ≥ a bar (the PO default, REJECTED at the gate)

Reuse `aggregateBookTagsWeighted` directly: sum trusted apply-weights minus dispute-weights ≥ a
configurable bar.

- **Pros:** One trust-weighting idiom across the whole app; least new code.
- **Cons:** A single high-weight curator could verify alone (the bar is a weight, not a head
  count) — weak for an identity claim, where "how many distinct trusted humans vouched" is the
  honest question. It is not the shape C-7 generalizes. **Rejected by the gate** in favor of the
  legible, head-count count-gate.

### Decision 2 — the per-curator weight floor (W)

#### Option A — REUSE `CURATOR_THRESHOLD` as the floor (CHOSEN, recommended)

A curator's `author-verified` assertion counts toward the gate only if `weight(house, curator) ≥
CURATOR_THRESHOLD` — the **same** bar the Story-30 write gate enforces.

- **Pros:** An asserter must already clear `CURATOR_THRESHOLD` to *assert at all* (Decision §3
  write gate), so the write gate **doubles** as the counting floor: every published, non-rejected
  `author-verified` assertion is, by construction, from an above-floor curator. No second
  per-curator env, no skew between "who may assert" and "who counts," one calibration knob. Honest
  degrade is identical to the gate's (empty weights → no one clears the floor → count 0).
- **Cons:** Couples "may assert" and "counts toward verification" to one number. Acceptable: they
  are the same question ("is this a curator the house trusts?"). A future split is a one-env
  follow-up if ever needed.

#### Option B — a separate `VERIFIED_AUTHOR_MIN_WEIGHT` floor (REJECTED)

A distinct per-curator floor for counting, independent of the assert gate.

- **Cons:** Two floors (assert vs. count) with no behavioral difference today — any counting floor
  **below** `CURATOR_THRESHOLD` is dead (those curators can't assert); any floor **above** it just
  silently drops some published assertions, which is surprising. Adds an env for a distinction the
  feature doesn't need. **Rejected.** (`N` — the *head count* — is the new knob, not a second
  weight.)

### Decision 3 — what `author-verified` targets + its tag layout

#### Option A — target the book `#a` + `["p", authorHex]` (CHOSEN)

`["a", "39999:<lib>:<slug>"]` (the canonical book) + `["p", <authorBeingVerifiedHex>]`, exactly
mirroring `BookClaim` / `BookTagAssertion`. The (author, book) pair is `(p, a)`.

- **Pros:** Identical read shape to the existing `#a`-scan the books route already does for
  claimants (`{ kinds:[39999], "#z":[verified-header], "#a":[bookAtag] }`) — one filter returns
  every verification assertion for the book, grouped by `#p` author. Reuses `formatAddress` /
  `pubkeyPrefix` verbatim. The claim need not be addressable as an event for the assertion to point
  at it; `(book, author)` is the stable identity, and a claim is the same `(book, claimant)` pair —
  they join naturally.
- **Cons:** Doesn't reference the claim *event* directly. Irrelevant — verification is about the
  (author, book) relationship, and re-claims replace under a stable d-tag, so the claim address is
  not a durable join key anyway.

#### Option B — target the `BookClaim` address (`["a", "39999:<claimant>:claim--…"]`) (REJECTED)

Point at the claim's own replaceable address.

- **Cons:** The claim's d-tag (`claim--<slug>--<claimant8>`) is claimant-owned, not librarian-owned
  — the read would need each claimant's pubkey to construct addresses, defeating the single `#a`
  book scan. Couples verification to the claim event's churn. **Rejected** for the clean book-`#a`
  + author-`#p` shape.

### Decision 4 — the `author-verified` z-header

#### Option A — REUSE the `book-tags` / a new dedicated header? → a NEW `author-verified` header (CHOSEN)

A new concept header `BOOK_AUTHOR_VERIFIED_HEADER_SLUG = "author-verified"`.

- **Pros:** Reading "all verification assertions for this book" is a single
  `"#z":[author-verified header]` + `"#a":[bookAtag]` scan, uncontaminated by genre/style/signal
  tag assertions (which live under `book-tag-assertions`). Mirrors the one-concept-per-assertion
  idiom (`book-ratings`, `book-tag-assertions`, `book-claims`). Keeps the verification read and the
  tag-consensus read fully independent.
- **Cons:** One more concept header in the catalog set. Trivial and consistent with the existing
  pattern. **Folding into `book-tags`/`book-tag-assertions` is rejected:** it would mix an identity
  verdict into the community-classification stream and force the verification read to filter by a
  reserved tag-slug — fragile and surprising.

### Decision 5 — multi-verified conflict (gate decision 2)

#### Option A — NONE-ON-CONFLICT: badge all, apply no overlay (CHOSEN, per gate)

If exactly one claimant is Verified → apply that author's overlay. If >1 → badge all Verified
authors, apply **no** overlay (canonical renders). If 0 → no badge upgrade, no overlay.

- **Pros:** Honest — a contested book never silently takes one author's edits. Deterministic.
- **Cons:** A genuinely co-authored book shows no author edits until co-author support exists →
  **Phase-3 deferral** (Consequences). Accepted by the gate.

#### Option B — first-verified / most-recent wins (REJECTED)

- **Cons:** Fabricates a single winner the data doesn't support; invites verify-races. Rejected by
  the gate.

## Decision

We chose **D1-A (count-gate)**, **D2-A (floor = `CURATOR_THRESHOLD`)**, **D3-A (book `#a` +
author `#p`)**, **D4-A (new `author-verified` header)**, **D5-A (none-on-conflict)**, with
**editing ON for Verified authors**, **self-verification excluded**, **symmetric apply/dispute**,
the **canonical record never mutated**, **both tiers**, and **honest degrade** throughout.

### 1. The `author-verified` assertion event (new schema — built)

A new `AuthorVerifiedAssertion` schema (`packages/schemas/src/AuthorVerifiedAssertion.ts`),
mirroring `BookTagAssertion.ts`:

- **kind:** `39999`. **word type:** `"authorVerified"`.
- **`["a", "39999:<librarian>:<slug>"]`** — the canonical book (`formatAddress`).
- **`["p", <authorBeingVerifiedHex>]`** — the claimant whose authorship this assertion concerns
  (the (author, book) target — **not** necessarily the signer).
- **`["t", <slug>]`** — slug-scoped scans, mirroring the assertions.
- **`["polarity", "1"|"-1"]`** — `Polarity = 1` (apply / verify) | `-1` (dispute), reusing the
  `BookTagAssertion` `Polarity` type.
- **`["z", "39998:<librarian>:author-verified"]`** — the **new** header
  `BOOK_AUTHOR_VERIFIED_HEADER_SLUG = "author-verified"` +
  `buildBookAuthorVerifiedHeaderAddress(librarianPubkey)` in `concept-headers.ts`.
- **d-tag:** `authorverified--<slug>--<author8>--<curator8>`
  (`buildAuthorVerifiedDTag(slug, authorPubkey, curatorPubkey)` via `pubkeyPrefix`) — **per-(curator,
  author, book)**, so a curator re-asserting/flipping polarity on the same (author, book) **replaces**
  (idempotent, AC-1). The **curator is the signer** (`event.pubkey`); the author is the `#p` target.
- **content:** `""`. Round-trips `toAuthorVerifiedEvent` / `fromAuthorVerifiedEvent`, exported from
  the schemas index.

**Curator-gated WRITE (both tiers, no new crypto).** A new DI'd `buildAuthorVerifiedRouter(userEventDeps)`
mirroring `claims.ts`, **with the Story-30 gate added** (the one structural difference from the
claim write, which is open):

- `POST /api/author-verified/template` — `sessionUser` null → **401 `no_session`**; then the
  **curator gate**: `houseWeightOf(user.pubkeyHex) < curatorThreshold` → **403 `below_gate`**
  (server-enforced, not UI-hidden, AC-1); else build the unsigned template server-side
  (`apps/api/src/author-verified/template.ts`, `buildAuthorVerifiedTemplate(config, { curatorPubkey,
  authorPubkey, bookSlug, polarity }, createdAt)`, librarian resolved at runtime). Body carries
  `{ bookSlug, authorPubkey, polarity }`.
- `POST /api/author-verified` — `sessionUser` null → **401 `no_session`**; **curator gate** → **403
  `below_gate`** below floor (re-checked server-side on the write, AC-1). **Custodial:** build
  template → `custodialSign` (null → 401 `reauth_required`) → `publish` (fail → 502). **Sovereign:**
  `validateSignedAuthorVerified(event, sessionPubkey)` (kind, `pubkey===session` else 403
  `pubkey_mismatch`, `verifyEvent`, round-trip parse) → `publish`. Return `{ ok: true }`.
- The gate uses the **same `houseWeightOf` fail-closed degrade** as `submissions.ts` (no provider /
  no observer / empty map / throw → weight 0 → gate closes → 403, AC-8). Anon → 401, below → 403,
  absent-from-map → 403.
- Registered `app.use("/", buildAuthorVerifiedRouter(userEventDeps))` in `index.ts`.

(Whether the author may *publish* a self-assertion is harmless — AC-3 excludes it from the verdict
at read time, §2. The write gate does not special-case the author; an author below `CURATOR_THRESHOLD`
simply can't assert at all, and one above can publish but is excluded from their own count.)

### 2. The verification count-gate (read — `effectiveBook` compute)

A new pure helper `computeVerification` (`apps/api/src/author-verified/verify.ts`):

Input: the book's `author-verified` assertion events, the claimants set (from the existing claims
read), the house observer hex, the curator floor (`= curatorThreshold`), and `N`. Steps:

1. **Dedupe per (curator, author) latest-`created_at`** (reuse the `aggregateBookTagsWeighted`
   dedupe shape, keyed `${curatorHex}|${authorHex}`), keeping each curator's **latest polarity**
   for that author.
2. **Fetch asserter weights once, batched:** `weights(houseObserverHex, [...distinct curator
   hexes])` — **one** `TrustProvider.weights` call over the union of curators (no N+1).
3. For each claimant (author) under consideration, **count distinct curators** C where:
   `C ≠ author` (self-excluded, AC-3) **AND** `weight(C) ≥ floor` **AND** C's latest polarity for
   that author is **apply** (`+1`). A latest **dispute** (`-1`) means C does not count (symmetric,
   lowering the net count, AC-2/Open-Q5).
4. **Verified(author) iff count ≥ N.** Untrusted volume can't cross the bar (below-floor curators
   contribute 0 to the count, AC-2).
5. **Honest degrade (AC-8):** `weights` empty / no observer / provider absent or throwing → every
   weight is 0 → every count is 0 → **no** claimant Verified. The seam never throws; the compute is
   wrapped so a degraded vantage yields "not verified," never a 500.

Output: `verifiedAuthorHexes: string[]` (the claimants that cleared `N`). The raw distinct-curator
count is the unweighted basis (not surfaced as a number; AC-4 / CLAUDE.md).

### 3. The badge upgrade (web — built)

`AuthorBadge` (`apps/web/src/components/AuthorBadge.tsx`) gains a **Verified Author** state,
distinct from "claimed":

- The book read (§5) returns, per claimant, `{ npub, verified: boolean }` (the existing
  `BookClaimant` gains an optional `verified`). For a **Verified** claimant the badge renders a
  **"Verified Author"** mark (distinct copy + treatment from "Claimed by"); for an unverified
  claimant it stays **"Claimed by {name}"** (never "verified").
- Identity via the Story 29 path (`useProfileMeta` / `displayNameOf` / `shortNpub`), linking to the
  profile. **No** trust-tier string, **no** raw GrapeRank number, **no** raw curator count — only
  the badge state (AC-4 / CLAUDE.md). Mixed sets (some verified, some claimed) render each in its
  honest state.
- New treatment reuses existing Pill/link tokens; **no new icon library, no hex outside
  `tokens.css`, no emoji.** Copy reviewed against the no-slop file.

### 4. The author-edit overlay (new schema — built)

A new `BookAuthorOverlay` schema (`packages/schemas/src/BookAuthorOverlay.ts`), the ADR-0032 §3
reserved design:

- **kind:** `39999`. **word type:** `"bookAuthorOverlay"`.
- **`["a", "39999:<librarian>:<slug>"]`** + **`["p", <authorHex>]`** (the author = the signer).
- **`["z", "39998:<librarian>:author-edits"]`** — the **reserved** header
  (`BOOK_AUTHOR_EDITS_HEADER_SLUG`, already declared; this ADR adds
  `buildBookAuthorEditsHeaderAddress`).
- **d-tag:** `authoredit--<slug>--<author8>` (`buildBookAuthorOverlayDTag(slug, authorPubkey)`) —
  **per-(author, book) replaceable/reversible** (AC-6).
- **payload — ONLY three fields** (AC-5 "and nothing else"): `{ blurb?: string | null, coverUrl?:
  string | null, purchaseUrl?: string | null }`. **No** title, author name, ISBN, page count, year,
  tags, ratings, reviews. A `null`/absent field = "no author value for this field" (reverts to
  canonical, AC-6 reversibility). content `""`. Round-trips `toBookAuthorOverlayEvent` /
  `fromBookAuthorOverlayEvent`.

**Write path (both tiers, no new crypto), VERIFIED-author-gated.** `buildAuthorEditsRouter(deps)`
(deps = `userEventDeps` + `query` for the verification check), mirroring `claims.ts`:

- `POST /api/author-edits/template` — `sessionUser` null → **401 `no_session`**; then the
  **verified-author gate**: the session user must be the **Verified author of this book** (re-run
  `computeVerification` for `(sessionUser, book)` → must be in `verifiedAuthorHexes`); not Verified
  → **403 `not_verified`** (server-enforced; a bare claimant, non-claimant, or signed-out has no
  edit affordance and is rejected, AC-5). **Field validation:** `coverUrl` and each `purchaseUrl`
  must be well-formed `http(s)` (reuse the `httpUrl` / `isHttpUrl` Story-22 idiom) — bad value →
  **400 `invalid_url`**, **no event published** (AC-5). Then build the template.
- `POST /api/author-edits` — same 401 / **403 `not_verified`** / 400 `invalid_url` gates;
  **custodial:** template → `custodialSign` (null → 401) → `publish` (fail → 502); **sovereign:**
  `validateSignedAuthorOverlay` (kind, `pubkey===session` else 403 `pubkey_mismatch`, the
  three-field whitelist enforced — any extra editable field → 400 `invalid_event`, `verifyEvent`,
  round-trip) → `publish`. Return `{ ok: true, book: effectiveBook }` (read-back so the page
  reflects the overlay).
- Registered in `index.ts`.

### 5. The read-merge (activate the ADR-0032 seam) — `GET /api/books/:slug`

Extend the existing `Promise.all` in `books.ts:83-86` from two reads to **four**, all parallel
(no N+1):

```
const [bookEvents, claimEvents, verifiedEvents, overlayEvents] = await Promise.all([
  query({ kinds:[KIND], "#z":[booksConcept],          "#d":[slug] }),       // canonical (today)
  query({ kinds:[KIND], "#z":[claimsConcept],         "#a":[bookAtag] }),   // claims  (today)
  query({ kinds:[KIND], "#z":[authorVerifiedConcept], "#a":[bookAtag] }),   // verification assertions (new)
  query({ kinds:[KIND], "#z":[authorEditsConcept],    "#a":[bookAtag] }),   // author overlays        (new)
]);
```

Then (the new compose step; `BooksDeps` gains `trust` + the `config` it already has):

1. `claimants = projectClaimants(claimEvents)` (today).
2. `verifiedAuthorHexes = await computeVerification(verifiedEvents, claimantHexes, houseObserver,
   curatorThreshold, N)` — **one** batched `weights` call (§2). Annotate each claimant with
   `verified: hex ∈ verifiedAuthorHexes` for the badge (§3).
3. **Overlay application (none-on-conflict, D5):**
   - **exactly one** Verified claimant → take that author's latest `BookAuthorOverlay` (dedupe by
     author latest-`created_at`), and compose `effectiveBook = { ...canonical, ...defined overlay
     fields }` for **blurb / coverUrl / purchaseUrl only**. A `null`/absent overlay field falls
     back to canonical (reversibility, AC-6). Each applied field is marked in an
     **`authorProvided: ("blurb"|"coverUrl"|"purchaseUrl")[]`** array on the response so the UI can
     attribute it (AC-6).
   - **zero or >1** Verified → **no** overlay; `effectiveBook = canonical`, `authorProvided = []`.
4. The **canonical `BookRecord` is never mutated** (the API holds no librarian secret); the
   canonical value is always recoverable (it is the un-overlaid `book` field; the overlay is a
   read-time compose). Response: `{ book: effectiveBook, claimants /* now with `verified` */,
   authorProvided }`. **Honest degrade (AC-8):** verification empty → no claimant verified → no
   overlay → canonical renders, badge stays "claimed", and the route never 500s (the trust seam
   resolves empty, the compute is wrapped).

The web (`BookHeader` / `BookDetail`) renders `effectiveBook` and labels `authorProvided` fields
(e.g. a small "from the author" attribution beside an overlaid blurb/cover/link) — honest, no
trust string.

### 6. The verified-author edit surface (web — built)

Inline on **BookDetail** (gate decision: not a dedicated view). Revealed **only** when the session
user is the Verified author of *this* book — i.e. their npub is in `claimants` with `verified:true`
and matches the session identity. It exposes **exactly** blurb / cover URL / purchase link(s),
pre-filled with the current effective values, with `http(s)` validation (honest inline message, no
publish on a bad value, AC-5), wired to `api.authorEdits.*` (idle / in-flight / success / error in
place). A bare claimant, a non-claimant, or a signed-out viewer sees **no** edit affordance (and
the server rejects a direct request, AC-5). Reuses existing form/button tokens; no new icon/hex.

### 7. Config

Two new env keys, both **distinct from `CURATOR_THRESHOLD`**, validated in `loadConfig`:

- **`VERIFIED_AUTHOR_MIN_CURATORS`** → `config.verifiedAuthorMinCurators` (the `N` head count).
  Validated as a **positive integer ≥ 1**. **Default: `2`** (conservative: two distinct trusted
  curators must confirm, excluding the author; legible and resistant to a single account). Tests pin
  a fixture value and assert both sides (AC-2).
- The **per-curator floor reuses `config.curatorThreshold`** (Decision §2) — **no new weight env.**

(If a future split is ever needed, `VERIFIED_AUTHOR_MIN_WEIGHT` is the documented escape hatch —
not added now.)

### 8. Copy (reviewed against `memory/feedback_unbnd_copy_and_visual.md`)

Illustrative; final strings are the Implementer's within the no-slop rule (no em dash, no
declarative negative, no rhetorical contrast, no hedged opener, no SaaS chrome, no emoji). None
expose a trust tier or a number.

| Element | String |
|---|---|
| Verified badge | `Verified Author` |
| Claimed (unchanged) | `Claimed by {name}` |
| Overlaid-field attribution | `From the author` |
| Edit surface heading (verified only) | `Your book details` |
| Edit fields | `Blurb`, `Cover image URL`, `Where to buy` |
| Save in-flight | `Saving…` |
| Save failure | `Could not save your changes. Try again.` |
| Bad URL inline | `Enter a web address that starts with http or https.` |
| Curator verify action | `Verify this author` / `Dispute this claim` |

"Verified Author" and "Claimed by" are unmistakably different; neither implies the other.

## Consequences

- **Enables** the Block-C layer: trusted curators verify/dispute authorship via a legible
  count-gate; a Verified author edits blurb/cover/purchase-links (attributed, reversible) without
  ever touching the canonical record; the badge honestly distinguishes claimed vs. Verified; the
  whole flow is fixture-verifiable. **Pre-establishes the count-gate primitive** C-7 reuses.
- **Constrains:** `GET /api/books/:slug` grows from 2 to **4 parallel reads** + one batched trust
  call — a small hot-path cost (still one round-trip, one `weights` call). Two new concept headers
  (`author-verified`, plus the now-built `author-edits`). A second consensus idiom (count-gate)
  lives beside the weighted-sum (tags/ratings).
- **Phase-3 deferral — CO-AUTHOR SUPPORT.** None-on-conflict means a genuinely co-authored book
  with >1 Verified author shows **no** author overlay until co-author support exists (showing /
  merging both verified authors' blurb/cover/link contributions, with attribution per author). This
  is explicitly deferred to **Phase 3** alongside automated verification. Logged here so it is not
  lost.
- **Thin-graph reality (accepted v1):** on the interim nosfabrica vantage with no real curator
  weights over seeded keys, no user clears `CURATOR_THRESHOLD`, so **no claim verifies and no
  overlay applies** until the graph fills — the honest, safe state (badge stays "claimed"). The
  fixture provider proves the flow for when real signal arrives.
- **Follow-ups / debt:** the per-book `author-verified` and `author-edits` reads are
  un-paginated/500-capped (acceptable for a single book; the ADR-0029 author-scoped fallback is the
  template if it ever matters). `VERIFIED_AUTHOR_MIN_WEIGHT` is the documented split escape hatch
  (not built). Disputing/removing a *published overlay* by a third party, and kind-5
  un-verification, stay OUT (dispute is the `author-verified` `-1` polarity lowering the count).
- **Affects existing fixtures?** Yes (after implementation): web `BookDetail` tests that mock
  `api.books.get` must add `authorProvided` and `verified` on claimants; the `GET /api/books/:slug`
  endpoint test gains `authorProvided: []` + `verified:false` on the no-verification path (the
  existing two-read assertions still hold; the response grows additively). New schema fixtures
  (`AuthorVerifiedAssertion`, `BookAuthorOverlay`) are Tester-owned.
- **New dependency?** No. Reuses `@unbnd/schemas` envelope helpers, `nostr-tools/nip19`, the existing
  signing/publish/query/trust deps, `useProfileMeta`, and the `httpUrl` validation idiom.
- **PRD section change required?** No. This implements PRD §2.10 Block C verbatim (trusted-curator
  `author-verified` consensus, "Verified Author" upgrade, verified-author edit of
  blurb/cover/purchase-links and nothing else). The **count-gate vs. weighted-sum** choice is an
  architecture decision the PRD leaves to the Architect/gate; no PRD claim is invalidated.

## Testable seams (for the Tester — trust-DEPENDENT, fixture-verified)

Mirror the ratings/tags/claims/submissions route tests (DI'd `query` / `publish` / `sessionUser` /
`custodialSign` / `trust`) + the web tests (mock `api`, `useSession`, `useProfileMeta`). **Fixture
`TrustProvider`** (`TRUST_PROVIDER=fixture` + deterministic `TRUST_FIXTURE`) gives the house
observer known weights over a known curator set. **No Brainstorm, no relay, no human. No
intra-module `vi.mock`; no `Date.now()` in asserted output. Deterministic.** Pin `N` to a fixture
value and assert both sides.

- **Schema (`@unbnd/schemas`):** round-trip tests for `AuthorVerifiedAssertion` (emits `["a",
  bookAtag]`, `["p", authorHex]`, `["t", slug]`, `["polarity", "1"|"-1"]`, z → `author-verified`
  header, d-tag `authorverified--<slug>--<author8>--<curator8>`; re-build for same (curator, author,
  book) → same d-tag, idempotent) and `BookAuthorOverlay` (`["a"]`, `["p", authorHex]`, z →
  `author-edits`, d-tag `authoredit--<slug>--<author8>`; payload carries **only** blurb/coverUrl/
  purchaseUrl; `from…` round-trips; a `null` field round-trips as cleared). Mirror
  `book-tag-assertion.test` / `book-claim.test`.
- **Count-gate (`computeVerification`, pure):** with fixture weights — **above N** distinct
  above-floor apply-curators → verified; **below N** → not; the **author's own** apply assertion is
  **excluded** (self → still below N); a curator's latest **dispute** lowers the count (was verified,
  now not); many **zero-weight** asserters → not verified; **degrade** (empty weights / no observer)
  → not verified. Assert the trust seam is hit **once** (batched), not per curator.
- **Curator-gated write (`author-verified` route, DI'd):** anon → **401 `no_session`**; below floor
  → **403 `below_gate`** (server-side, on both template + write); above floor sovereign valid →
  `publish` once + `{ok}`; `pubkey ≠ session` → **403 `pubkey_mismatch`**; custodial → `custodialSign`
  invoked, null → **401 `reauth_required`**, publish fail → **502**; re-assert same (curator, author,
  book) → idempotent (same d-tag). Both tiers.
- **Verified-only read-merge (`GET /api/books/:slug`, DI'd `query` + fixture `trust`):** book +
  claim + verification assertions clearing N + an overlay → `effectiveBook` shows the overlaid
  blurb/cover/link, `authorProvided` lists them, claimant `verified:true`; a **bare** (unverified)
  claim + an overlay → overlay **not** applied, canonical renders, `verified:false`; **>1 verified**
  claimant → **no** overlay (`authorProvided: []`), **all** badged verified; clearing an overlay
  field + re-save → reverts to canonical (reversibility); **canonical always recoverable** (the
  `book` field is the un-overlaid value even when overlaid? — assert the canonical is reconstructable
  / never mutated); degrade → canonical + `verified:false`, no 500.
- **Gated edit write (`author-edits` route, DI'd):** a Verified author → publish succeeds; a bare
  claimant / non-claimant / anon → **403 `not_verified`** / **401** (server-side, both template +
  write); bad `coverUrl`/`purchaseUrl` → **400 `invalid_url`**, **no publish**; an event carrying a
  non-whitelisted editable field (e.g. title) → **400 `invalid_event`**, no publish; both tiers
  (custodial reauth 401 / publish 502).
- **Badge upgrade (web `AuthorBadge`):** mock `useProfileMeta`; a `verified:true` claimant →
  "Verified Author"; `verified:false` → "Claimed by {name}"; mixed set → each in its honest state;
  assert **no** trust-tier string and **no** number appear.
- **Edit surface (web BookDetail):** mock `api` + `useSession`; session = the Verified author of the
  book → edit surface visible with exactly the three fields, prefilled; a bare claimant / other user
  / signed-out → **no** edit surface; bad URL → inline message, no submit; success → effectiveBook
  reflects the overlay with the "From the author" attribution.
- **Guard:** **ADR-0014 architecture guard** (`apps/api/test/trust/architecture.test.ts`) stays
  green — this feature consumes only the neutral `TrustProvider`; no Brainstorm/NIP-85/30382
  specifics leak.

All run with **no Brainstorm call, no relay, no human** (AC-9).

## Ripple / new files

**New (schema):**
- `packages/schemas/src/AuthorVerifiedAssertion.ts` — type, `AUTHOR_VERIFIED_KIND = 39999`,
  `buildAuthorVerifiedDTag(slug, authorPubkey, curatorPubkey)`, `to…Event`/`from…Event`. Mirror
  `BookTagAssertion.ts`. Export from `packages/schemas/src/index.ts`.
- `packages/schemas/src/BookAuthorOverlay.ts` — type, `BOOK_AUTHOR_OVERLAY_KIND = 39999`,
  `buildBookAuthorOverlayDTag(slug, authorPubkey)`, three-field payload, `to…Event`/`from…Event`.
  Export from the index.

**New (API):**
- `apps/api/src/author-verified/template.ts` — `buildAuthorVerifiedTemplate(config, { curatorPubkey,
  authorPubkey, bookSlug, polarity }, createdAt)` (librarian resolved at runtime; mirror
  `claims/template.ts`).
- `apps/api/src/author-verified/validate.ts` — `validateSignedAuthorVerified(event, sessionPubkey)`
  (mirror `claims/validate.ts`).
- `apps/api/src/author-verified/verify.ts` — `computeVerification(verifiedEvents, claimantHexes,
  houseObserverHex, floor, N, trust) → Promise<string[]>` (the count-gate, §2; one batched
  `weights` call; fail-closed).
- `apps/api/src/routes/author-verified.ts` — `buildAuthorVerifiedRouter(deps)` (curator-gated write,
  both tiers, §1).
- `apps/api/src/author-edits/template.ts` — `buildAuthorEditsTemplate(config, { authorPubkey,
  bookSlug, blurb?, coverUrl?, purchaseUrl? }, createdAt)` + the `http(s)` field validation.
- `apps/api/src/author-edits/validate.ts` — `validateSignedAuthorOverlay(event, sessionPubkey)`
  (kind, pubkey-match, **three-field whitelist**, `verifyEvent`, round-trip).
- `apps/api/src/routes/author-edits.ts` — `buildAuthorEditsRouter(deps)` (verified-author-gated
  write, both tiers, §4/§6).

**New (web):**
- The verified-author edit surface (a section/component under `BookDetail`, e.g.
  `apps/web/src/components/AuthorEdit.tsx` + `.css`, existing tokens only).
- *(Tester-owned)* schema tests, the `author-verified` route test, the `computeVerification` test,
  the read-merge test, the `author-edits` route test, the `AuthorBadge` verified test, the
  BookDetail edit-surface test.

**Concept header (DList):**
- `packages/schemas/src/concept-headers.ts` — add `BOOK_AUTHOR_VERIFIED_HEADER_SLUG =
  "author-verified"` + `buildBookAuthorVerifiedHeaderAddress`, and add
  `buildBookAuthorEditsHeaderAddress` for the already-declared `BOOK_AUTHOR_EDITS_HEADER_SLUG`.

**Changed (production):**
- `apps/api/src/config.ts` — add `verifiedAuthorMinCurators` (env `VERIFIED_AUTHOR_MIN_CURATORS`,
  validated positive integer ≥ 1, default 2). Floor reuses `curatorThreshold`.
- `apps/api/src/routes/books.ts` — extend `GET /api/books/:slug` to 4 parallel reads + the
  verification compute + the none-on-conflict overlay merge; return `{ book: effectiveBook,
  claimants (with `verified`), authorProvided }`. `BooksDeps` gains `trust` (and uses `config`).
  The canonical `book` is never mutated.
- `apps/api/src/index.ts` — register `buildAuthorVerifiedRouter(userEventDeps)` and
  `buildAuthorEditsRouter(userEventDeps)`; pass `trust` into `buildBooksRouter`.
- `apps/web/src/lib/api.ts` — add `api.authorVerified.{template,submit,submitCustodial}`,
  `api.authorEdits.{template,submit,submitCustodial}`; extend `BookClaimant` with `verified?:
  boolean`; add `authorProvided?: string[]` to the `api.books.get` response.
- `apps/web/src/components/AuthorBadge.tsx` — add the "Verified Author" state (§3).
- `apps/web/src/components/BookHeader.tsx` — render the `authorProvided` attribution; pass through
  the verified flag on claimants.
- `apps/web/src/routes/BookDetail.tsx` — mount the verified-only edit surface; thread
  `authorProvided` / `verified`.

**Existing tests that change:**
- `apps/api` `GET /api/books/:slug` endpoint test — add `authorProvided: []` + claimant
  `verified:false` on the no-verification path (response grows additively; existing assertions
  hold); add fixture-trust cases for the verified path.
- `apps/web` BookDetail / BookHeader tests mocking `api.books.get` — include `authorProvided` and
  `verified` in the mock shape.
- `apps/api/test/trust/architecture.test.ts` — assert it stays green (no change).

## Out of scope

- **Automated author verification** (website / ISBN / domain) — Phase 3.
- **Co-author overlay support** (merging >1 Verified author's edits) — **Phase 3** (none-on-conflict
  until then).
- **Editing anything but blurb / cover URL / purchase links** — hard constraint (AC-5).
- **Mutating the librarian-signed `BookRecord` / giving the API a librarian secret** — never
  (CLAUDE.md invariant 3).
- **Cover/image hosting or upload** — cover is a URL only (no Blossom).
- **The general curator-role system** (the `curator` tag-assertion / `roleScore`) — C-7, Phase 3.
  This reuses the Story-30 emergent `CURATOR_THRESHOLD` gate as the assert gate and the count floor.
- **The house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → production librarian) — deferred; built and
  verified against the fixture provider.
- **Re-opening the Story-31 claim core** — the `BookClaim`, the open-claim badge, "Books by this
  author" are unchanged; this only extends the badge + adds the verification/edit layers.
- **Third-party dispute/removal of a published overlay, kind-5 un-verification, a separate
  `VERIFIED_AUTHOR_MIN_WEIGHT` floor, new lint/typecheck/build tooling.**
