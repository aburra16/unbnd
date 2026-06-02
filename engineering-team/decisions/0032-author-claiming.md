# ADR 0032: Author claiming — the trust-independent core (claim + "claimed" badge + Books by this author)

**Status:** Accepted
**Date:** 2026-06-01
**Story:** `engineering-team/stories/done/31-author-claiming.md`

## Context

Story 31 ships Lane 1 of PRD §2.10 ("Author claiming + verification"): an author finds
their book in the librarian-seeded catalog, clicks **"Claim this book,"** the book shows an
**"Author (claimed)"** badge linking to the claimant, and the author's profile gains a
**"Books by this author"** section. This is the deterministic, fixture-free core that the
**Verified Author** layer (Story 32, PRD §2.10 Block C) sits on top of.

### Gate decisions (2026-06-01) baked into this ADR

The user resolved the load-bearing forks at the gate. They are not open here:

1. **Author metadata EDITING (blurb / cover / purchase links) is GATED BEHIND
   VERIFICATION and DEFERRED to Story 32 (Verified Author).** Story 31 builds **no** edit
   surface and **no** overlay-apply. It ships only: claim → "Author (claimed)" badge →
   "Books by this author." This ADR **defines the seam** where the edit-overlay event and
   the verification gate will plug in (so Story 32 slots in without rework) but builds none
   of it. This selects, and then narrows, the story's old "option (a)" — even the
   *edit-capture* surface moves to Story 32; Story 31 captures nothing editable.
2. **Open claiming.** Any signed-in user (sovereign or custodial) can claim any catalog
   book. The badge says **"claimed,"** never **"verified."** Copy must make
   "claimed ≠ verified" unmistakable. The canonical librarian-signed `BookRecord` is
   **never mutated.**
3. **Multiple claimants** are shown honestly — all of them ("claimed by …"), never a
   silently chosen single winner.

### What exists today (cited)

- **The canonical catalog record.** A book is a kind-39999 `BookRecord`
  (`packages/schemas/src/BookRecord.ts`), d-tag = slug
  (`buildBookRecordDTag`, line 88), z-tagged to the librarian's `books` header
  (`packages/schemas/src/concept-headers.ts` `BOOK_RECORDS_HEADER_SLUG = "books"`, line 3;
  `buildBookRecordsHeaderAddress`, line 23). It is **librarian-signed**; the API holds only
  `LIBRARIAN_PUBKEY`, no librarian secret (ADR 0031). It already carries an optional
  `authorPubkey` (lines 26, 101 — emitted as `["p", <hex>]`). `GET /api/books/:slug`
  (`apps/api/src/routes/books.ts` line 72) reads it via `parseBook` → `toPublicBook`
  (lines 40–65); `PublicBook` (lines 18–33) is the UI projection.

- **The author-signed assertion pattern to mirror.** `BookRating`
  (`packages/schemas/src/BookRating.ts`) and `BookTagAssertion`
  (`packages/schemas/src/BookTagAssertion.ts`) are author-signed kind-39999 events that
  `#a`-reference the canonical book address `39999:<librarian>:<slug>` and `#p`-tag the
  author, under a **per-author replaceable d-tag**:
  - `BookRating`: `["a", <bookAtag>]`, `["p", <raterPubkey>]`, `["z", <book-ratings header>]`,
    d-tag `rating--<slug>--<rater8>` (`buildBookRatingDTag`, lines 61–66).
  - `BookTagAssertion`: `["a", <bookAtag>]`, `["p", <asserterPubkey>]`,
    `["z", <book-tag-assertions header>]`, d-tag `tagassert--<slug>--<tag>--<asserter8>`
    (`buildBookTagAssertionDTag`, lines 55–61).
  Both use `pubkeyPrefix` (8 hex chars) from `envelope.ts` (line 141) for the d-tag suffix,
  `formatAddress` (line 46) for the `#a` value, and round-trip via
  `to<X>Event` / `from<X>Event`. A **claim** is the same shape with no payload beyond the
  reference. The schemas index re-exports each module (`packages/schemas/src/index.ts`).

- **The two-tier write path the claim reuses (no new crypto).**
  `apps/api/src/routes/ratings.ts` (and `tags.ts`) implement the canonical DI'd router:
  - **Sovereign:** `POST /api/ratings/template` returns an unsigned template
    (`buildRatingTemplate`, `apps/api/src/ratings/template.ts`); the client signs via NIP-07;
    `POST /api/ratings` validates the signed event (`validateSignedRating`,
    `apps/api/src/ratings/validate.ts` — kind check, `pubkey === sessionPubkey` else
    `pubkey_mismatch` → 403, `verifyEvent`, round-trip parse) then `deps.publish`.
  - **Custodial:** the route builds the template server-side and calls
    `deps.custodialSign(sessionIdHex, template)` (ADR 0006); null → 401 `reauth_required`.
  - **Auth gate:** `deps.sessionUser(cookie)` null → 401 `no_session` (ratings.ts lines
    119–124, 156–161; tags.ts lines 145, 167). This is the server-side rejection of
    signed-out writes the gate requires.
  - The deps bundle is `userEventDeps` (`apps/api/src/index.ts` lines 362–377):
    `{ config, sessionUser, publish, query, queryPaged, trust, custodialSign }`. Routers are
    registered `app.use("/", build…Router(userEventDeps))` (lines 438–440).

- **The read aggregation + cap lesson.** `GET /api/books/:slug/ratings` (ratings.ts line
  268) reads by `#a` (book address): `deps.query({ kinds:[39999], "#a":[addr] })`. The
  tags route reads a book's assertions the same way (tags.ts lines 86–89). The per-book
  read is **un-paginated and 500-capped**; `resolveYourRating` (ratings.ts lines 86–111) and
  ADR 0021/0029 establish the **author-scoped fallback read** when a user's own event may
  fall outside the cap. Author-scoped/by-pubkey reads for profile use the **paginating**
  `queryPaged` (`profile-stats.ts` lines 81–98, ADR 0021).

- **Identity resolution (Story 29 / ADR 0030).** `apps/web/src/hooks/useProfileMeta.ts`
  (`useProfileMeta` + `displayNameOf`, lines 44–109) resolves an npub → kind-0 display name,
  cached, with an honest short-npub fallback (`shortNpub`, `lib/view-model.ts`). The badge
  and "Books by this author" reuse this. `GET /api/profile/:id` (`profile.ts` line 22)
  resolves kind-0 best-effort, always returns the npub.

- **The web surfaces.** `apps/web/src/routes/BookDetail.tsx` loads the book
  (`api.books.get(slug)`, line 51) and renders `BookHeader`
  (`apps/web/src/components/BookHeader.tsx`), which prints `by {book.authorName}` (line 35).
  `apps/web/src/routes/ProfileMe.tsx` (own profile) and `Profile.tsx` (`/profile/:npub`)
  render shelves/submissions/stats sections; both read by the **path/own npub**, never the
  viewer's session (ADR 0020). The api client is `apps/web/src/lib/api.ts`.

- **The existing "I am the author" toggle is unrelated.** `apps/web/src/routes/Submit.tsx`
  (line 283, `label="I am the author of this book"`) sets `source=author` / `authorPubkey`
  on a **new community submission** (`book-submissions` concept). That is a self-claim at
  *creation* of a *submission*, not a claim against an existing **catalog** entry. Its
  description ("Adds the Author Verified badge…") is now stale relative to this story's
  honest "claimed" framing; reconciling that copy is noted as a follow-up, not built here.

### Constraints

- **Architecture invariants (CLAUDE.md).** Publishing is permissionless (invariant 2): the
  claim write is **not** gated on trust, role, or verification. The canonical record is
  never mutated (invariant 3): the claim is an additive author-signed layer composed at read
  time. The Librarian pubkey is resolved at runtime (`config.librarianPubkey`), never
  hardcoded.
- **No new crypto (crypto policy / CLAUDE.md).** Both tiers reuse the shipped
  template→sign→submit (sovereign) and `custodialSign` (custodial) paths.
- **Copy/visual no-slop rule** (`memory/feedback_unbnd_copy_and_visual.md`): all strings
  pass the ban list; the badge says **claimed**, never **verified**; no trust-tier string
  and no raw GrapeRank number appears (CLAUDE.md). "nostr"/"npub" do not surface on these
  reader-facing surfaces.
- **No new lint/typecheck/build tooling** (house rule).

This ADR aligns with **ADR 0005** (author-signed write + replaceable d-tag + read-back),
**ADR 0006** (custodial server signing, both tiers), **ADR 0009** (the `#a`-referencing
assertion + per-author d-tag), **ADR 0014 / 0025** (the read-time overlay/merge pattern the
*future* metadata overlay will mirror), **ADR 0020/0021/0029** (by-pubkey profile reads,
paging past the 500 cap, author-scoped fallback), and **ADR 0030** (npub→name resolution).
It contradicts no prior ADR.

## Options considered

### Decision 1 — one event type or two (claim vs. edit)

#### Option A — Claim is its own event type; the edit overlay is a *separate, future* type (chosen)

A `BookClaim` schema = a claimant-signed kind-39999 event, `["a", <bookAtag>]` +
`["p", <claimantHex>]`, d-tag `claim--<slug>--<claimant8>`, z-tagged to a **new
`book-claims` header**, carrying **no editable metadata**. The author **metadata overlay**
(blurb/cover/links) is a *distinct, deferred* type (`BookAuthorOverlay`, z → `author-edits`),
designed-but-not-built here for Story 32.

- **Pros:** Each concept reads cleanly by `#a` (per book → claimants) or by author (→ Books
  by this author), exactly like ratings/tags. The claim carries nothing that could leak an
  unverified edit into a reader's view — there is literally no editable field to display,
  so the gate's "no edit in v1" is structural, not a render-time policy. The two headers are
  independent seams: Story 32 adds the overlay type + its header + the read-merge without
  touching the claim. Mirrors the codebase's one-concept-per-assertion idiom
  (`book-ratings`, `book-tag-assertions`).
- **Cons:** Two headers and two schemas eventually. Trivial; they are independent reads.

#### Option B — One combined "author assertion" event carrying both the claim and the metadata

A single kind-39999 event whose payload holds the claim *and* optional blurb/cover/links.

- **Cons:** Story 31 would have to ship the metadata fields (even if unused) to keep the
  schema stable, or Story 32 would mutate the v1 schema. Reading "who claimed this" would
  pull the metadata payload along. Worst: an unverified claimant's metadata would ride
  inside the very event the badge reads, so "don't display unverified edits" becomes a
  render-time discipline rather than a structural absence — exactly the vandalism surface the
  gate closed. Rejected.

#### Option C — Reuse `BookRecord.authorPubkey` (mutate the canonical record on claim)

Set `authorPubkey` on the librarian record when a user claims.

- **Cons:** Requires the API to hold a librarian secret to re-sign the canonical record —
  forbidden (CLAUDE.md invariant 3; ADR 0031). Destroys the open/multi-claimant model (one
  field, one winner). Rejected outright.

### Decision 2 — the per-book claimants read (badge) and the by-author read (Books by this author)

#### Option A — Enrich the existing book read with claimants; a small new profile endpoint for by-author (chosen)

- **Badge (per book):** add `claimants` to `GET /api/books/:slug` by reading
  `{ kinds:[39999], "#z":[book-claims header], "#a":[bookAtag] }` and projecting each claim's
  `#p` → npub. One book-detail fetch already runs there; the claim read is a sibling
  `Promise.all` like the tags route's two-read pattern (tags.ts lines 86–89). Returns a small
  `claimants: { npub }[]` array (book-scoped; bounded; the 500-cap is irrelevant for a single
  book's claim set in practice, and is acceptable for a badge — see Consequences).
- **Books by this author (per profile npub):** a new author-scoped read
  `GET /api/profile/:npub/claimed-books` →
  `queryPaged({ kinds:[39999], "#z":[book-claims header], authors:[hex] })` (paging past the
  cap, ADR 0021), resolve each claim's `#a` slug, then reuse the existing
  `/api/books?slugs=` batch read (books.ts line 96, the `bySlug` ordered map) to hydrate
  cover/title. Honest empty: an author with no claims → `{ books: [] }` → the section is
  **absent** (no placeholder).

- **Pros:** The badge data travels with the book the page already fetches (no extra web
  round-trip on the hot path). The by-author read reuses the proven `queryPaged` author-scope
  + the `slugs` batch hydrate, so it inherits the cap-safety and ordered-skip-missing
  behavior. Both are pure reads; no POV/trust input (trust-independent).
- **Cons:** `GET /api/books/:slug` grows a second read. Acceptable; it is one `#a` scan,
  parallelized.

#### Option B — A single standalone `/api/claims` endpoint for both directions

One endpoint taking either `?book=slug` or `?author=npub`.

- **Cons:** The badge then needs a *second* web fetch on book load (the book read + a claims
  read), reintroducing the BookDetail two-fetch the codebase already consolidated for ratings
  (ADR 0029 `useBookRatings`). Enriching the book read is cheaper on the hot path. The
  by-author read genuinely is a separate profile concern; folding both into one endpoint
  couples unrelated reads. Rejected; Option A keeps each read where its consumer lives.

### Decision 3 — multiple-claimant presentation (gate decision 3, confirmed)

#### Option A — Show all claimants honestly; no winner (chosen, per gate)

The badge renders **every** distinct claimant ("Claimed by {name}" per claimant, or
"Claimed by {name} and N others" when many), each linking to that author's profile. No
silent pick. With zero claims, no badge. The Verified layer (Story 32) later disambiguates
the *real* author; v1 makes no such claim.

- **Pros:** Honest for an open-claim model; matches the gate. Deterministic from the read
  (sort claimants by a stable key, e.g. claim `created_at` then npub).
- **Cons:** A book could show several "claimed by" entries until verification. Acceptable and
  honest; the copy states these are self-claims.

#### Option B — Most-recent or first claimant wins

- **Cons:** Fabricates a single "the author" the data does not support; invites claim-races.
  Rejected by the gate.

## Decision

We chose **D1-A (claim is its own event type; the metadata overlay is a designed-but-unbuilt
separate type), D2-A (enrich the book read with claimants + a new by-author profile read),
and D3-A (show all claimants)**, with **open claiming**, the **canonical record never
mutated**, **no edit surface and no verification gate built** (both Story 32), and **both
tiers reusing the shipped write paths**.

### 1. The claim event (built now)

A new `BookClaim` schema (`packages/schemas/src/BookClaim.ts`), mirroring
`BookTagAssertion.ts`:

- **kind:** `39999`.
- **word type:** `"bookClaim"`.
- **`["a", "39999:<librarian>:<slug>"]`** — the canonical book address (`formatAddress`).
- **`["p", <claimantHex>]`** — the claimant.
- **`["t", <slug>]`** — for slug-scoped scans, mirroring the assertions.
- **`["z", "39998:<librarian>:book-claims"]`** — a **new** concept header
  `BOOK_CLAIMS_HEADER_SLUG = "book-claims"` + `buildBookClaimsHeaderAddress(librarianPubkey)`
  in `concept-headers.ts`.
- **d-tag:** `claim--<slug>--<claimant8>` (`buildBookClaimDTag(slug, claimantPubkey)` via
  `pubkeyPrefix`). Per-(claimant, book) → **re-claim replaces, idempotent** (AC-1).
- **content:** `""`. The claim carries **no editable metadata** (blurb/cover/links live only
  in the *future* overlay type).
- Round-trips via `toBookClaimEvent` / `fromBookClaimEvent`, exported from the schemas index.

**Write path (both tiers, no new crypto).** A new DI'd `buildClaimsRouter(userEventDeps)`
mirroring `ratings.ts`:

- `POST /api/claims/template` — `sessionUser` null → **401 `no_session`**; else build the
  unsigned claim template server-side (new `apps/api/src/claims/template.ts`,
  `buildClaimTemplate(config, { claimantPubkey, bookSlug }, createdAt)`, resolving the
  librarian pubkey at runtime exactly like `ratings/template.ts`).
- `POST /api/claims` — `sessionUser` null → **401 `no_session`** (server-side rejection of
  signed-out claims, AC-1). **Custodial:** build template → `custodialSign` (null → 401
  `reauth_required`) → `publish` (fail → 502 `publish_failed`). **Sovereign:** validate the
  client-signed event with a new `apps/api/src/claims/validate.ts` `validateSignedClaim`
  (kind check, `pubkey === sessionPubkey` else `pubkey_mismatch` → 403, `verifyEvent`,
  round-trip parse) → `publish`. Return `{ claimed: true }` (and the refreshed claimant list,
  read by `#a`, so the badge updates on success — the ratings route's read-back idiom).
- Registered `app.use("/", buildClaimsRouter(userEventDeps))` in `index.ts`.

### 2. The read paths (built now)

**(a) Per book → the claimant set (badge).** Extend `GET /api/books/:slug`
(`apps/api/src/routes/books.ts`):

- After the book read, in a `Promise.all`, also
  `deps.query({ kinds:[39999], "#z":[claimsConcept], "#a":[bookAtag] })`.
- Dedupe by claimant pubkey (freshest by `created_at`; a replaced claim under the same d-tag
  collapses), sort deterministically (claim `created_at`, then npub), project each to
  `{ npub }` (hex stays server-internal; npub via `npubEncode`).
- Add `claimants: { npub: string }[]` to the `{ book }` response. Empty array when none.
- `PublicBook` is unchanged; `claimants` rides alongside `book` in the response envelope so
  the projection stays clean.

**(b) Per profile npub → claimed books ("Books by this author").** A new
`GET /api/profile/:npub/claimed-books` (added to `profile-stats.ts` or a small
`profile-claims.ts` router; place beside the other by-npub twins, ADR 0020):

- `toHex(npub)` null → **404 `not_found`** (matches the profile twins).
- `queryPaged({ kinds:[39999], "#z":[claimsConcept], authors:[hex] })` (paging past the 500
  cap, ADR 0021), parse each claim → its book slug (from `#a`/`#t`), dedupe slugs.
- Hydrate via the existing ordered batch read (books.ts `slugs` branch): unresolvable slugs
  are skipped (a claim whose book was removed simply drops). Return `{ books: PublicBook[] }`.
- Honest empty: `{ books: [] }` → the web renders **no section** (AC: absent, not a
  placeholder). Read by the **path npub**, never the viewer's session.

### 3. The Story-32 plug-in point (defined, NOT built)

Story 32 (Verified Author) adds, against the seams this ADR fixes:

- **A new overlay event type — `BookAuthorOverlay`** (designed here, **built in Story 32**):
  a claimant-signed kind-39999 event, `["a", <bookAtag>]` + `["p", <authorHex>]`, carrying
  author-provided **blurb / cover URL / purchase link(s)**, under a per-(author, book)
  replaceable/reversible d-tag `authoredit--<slug>--<author8>`, z-tagged to a **new
  `author-edits` header** (`BOOK_AUTHOR_EDITS_HEADER_SLUG`, reserved name; not added now).
- **The verification gate** (`author-verified` trusted-curator consensus above a threshold) —
  the trust read that flips a claimant from "claimed" to "Verified."
- **The read-merge seam** — the single place the composition happens:
  **inside `GET /api/books/:slug`, where this ADR already assembles
  `{ book, claimants }`.** Story 32 adds a third parallel read (the overlay events) and a
  trust read (which claimant is Verified), then computes
  `effectiveBook = (canonical BookRecord) × (author overlay, applied only when that author is
  Verified)` — the same architectural move as the House⇄Yours overlay (ADR 0014/0025): raw +
  a signed layer composed at **read time**, the canonical record never mutated. Until Story
  32, `effectiveBook === canonical` (no overlay exists, nothing to merge), so the seam is a
  no-op pass-through that this story ships as `book` unchanged.

Story 31 builds **none** of: the overlay schema/builder, the `author-edits` header, the edit
surface, the verification/trust read, or the merge. The seam is the `{ book, claimants }`
assembly point in `GET /api/books/:slug` plus the reserved header/d-tag names above, so
Story 32 adds reads and a merge step without reshaping the claim or the badge.

### 4. Identity / badge (built now)

- **Web: an `AuthorBadge` component** (`apps/web/src/components/AuthorBadge.tsx`) consumed by
  `BookDetail`/`BookHeader`. Given `claimants: { npub }[]`:
  - **0 claimants:** render nothing (AC: no badge).
  - **≥1:** for each, resolve `useProfileMeta(npub)` → `displayNameOf(meta, shortNpub(npub))`
    (Story 29 path, honest short-npub fallback), render **"Claimed by {name}"** linking to
    `/profile/{npub}`. Many → "Claimed by {name} and N others" (each name still resolves;
    the "+N" expands). The badge wording is **claim**, never **verified** — no trust-tier
    string, no GrapeRank number.
  - Placement: in `BookHeader`, beside/under the `by {authorName}` line (line 35), so the
    canonical author name (librarian record) and the *claimed-by* badge are visibly distinct
    — the badge attributes a self-claim, it does not overwrite the catalog's author line.
- **Web: "Books by this author"** — a read-only section in `ProfileMe.tsx` (own) and
  `Profile.tsx` (`/profile/:npub`), fed by `api.profile.claimedBooks(npub)`, rendered with
  the existing `BookGrid` + `toCardBook` (the shelves idiom). Absent when empty.
- **api client** (`lib/api.ts`): add `api.claims.template`, `api.claims.submit` (sovereign),
  `api.claims.submitCustodial` (custodial) mirroring `api.ratings`; extend
  `api.books.get` return type with `claimants`; add `api.profile.claimedBooks(npub)`. Add a
  `BookClaimant = { npub: string }` type.

### 5. Copy (reviewed against `memory/feedback_unbnd_copy_and_visual.md`)

Illustrative; final strings are the Implementer's within the no-slop rule. All pass the ban
list (no em dash, no rhetorical contrast, no hedged opener, no filler verb, no exclamation
CTA, no emoji); none imply verification.

| Element | String |
|---|---|
| Claim action (button) | `Claim this book` |
| Badge, single claimant | `Claimed by {name}` |
| Badge, many | `Claimed by {name} and {N} others` |
| In-flight | `Claiming…` |
| Success (in place, no toast) | `You claimed this book.` |
| Failure | `Could not record the claim. Try again.` |
| Profile section heading | `Books by this author` |

The word "claimed" is doing the honesty work: it states a self-assertion and does not imply
trust or endorsement. No "verified," no trust tier, no npub/nostr on these reader surfaces.

### 6. Both tiers / trust-independent (built now)

Sovereign signs the template via NIP-07; custodial server-signs via `custodialSign` (ADR
0006), returning 401 `reauth_required` when the session key is gone. Neither path adds
crypto. The claim write, the claimant read/badge, and the by-author read take **no trust
provider, no Brainstorm, no relay-trust, no fixture-trust** — they are pure author-signed
events + plain reads. CI exercises them green with no trust provider and no human.

## Consequences

- **Enables** the Lane-1 core: open claiming, an honest "claimed" badge showing all
  claimants, and a "Books by this author" profile section, all trust-independent and
  deterministic. Establishes the exact seam (`{ book, claimants }` assembly +
  reserved `author-edits` header / overlay-event names) for Story 32 to add the metadata
  overlay, the verification gate, and the read-merge without reshaping anything shipped here.
- **Constrains:** `GET /api/books/:slug` now does two reads (book + claims) in parallel — a
  small hot-path cost. A new `book-claims` concept header joins the catalog's concept set.
  The badge's per-book claim read is un-paginated/500-capped; for a badge this is acceptable
  (a book accumulating >500 *distinct* claims is itself a signal, and the count/identities
  shown are honest within the cap). If that ever matters, the author-scoped fallback idiom
  (ADR 0029 `resolveYourRating`) is the template — noted, not built.
- **Follow-ups / debt:** Story 32 must add the `BookAuthorOverlay` schema, the `author-edits`
  header, the edit surface, the verification/trust read, and the read-merge at the seam. The
  Submit form's "I am the author" toggle copy ("Adds the Author Verified badge…",
  `Submit.tsx` line 284) is now stale against the honest "claimed" framing and the
  submission-vs-catalog distinction; reconcile it in a small copy pass (flagged, not built
  here). `BookRecord.authorPubkey` remains the librarian's seeded value and is **not** touched
  by claims.
- **Affects existing fixtures?** No DList fixtures change. New schema unit fixtures for
  `BookClaim` are added by the Tester. Existing `GET /api/books/:slug` endpoint tests gain a
  `claimants: []` assertion on the unchanged path (no claims → empty array); web BookDetail
  tests that mock `api.books.get` must include `claimants` in the mock shape.
- **New dependency?** No. Reuses `@unbnd/schemas` envelope helpers, `nostr-tools/nip19`
  (`npubEncode`), the existing signing/publish/query deps, and `useProfileMeta`.
- **PRD section change required?** No. This is PRD §2.10 Lane 1 verbatim with the editing
  bullet deferred to Block C (Story 32) per the gate. (The stale Submit toggle copy is a copy
  fix, not a PRD change.)
- **Brand tokens / copy:** new UI is `AuthorBadge` (reuse existing Pill/link tokens; no new
  hex, no icon library, no emoji) and the "Books by this author" section (reuse `me-*` /
  `BookGrid` patterns). All strings reviewed against the no-slop file (§5).

## Testability seams (for the Tester)

Trust-INDEPENDENT throughout: no trust provider, no Brainstorm, no relay, no fixture-trust,
no human. Mirror the ratings/tags route tests (DI'd `query`/`publish`/`sessionUser`/
`custodialSign`) and the web tests (mock `api`, `useSession`, `useProfileMeta`). **No
intra-module `vi.mock`; no `Date.now()` in asserted output.**

- **Schema (`@unbnd/schemas`):** a `BookClaim` round-trip test — `toBookClaimEvent` emits the
  `["a", <bookAtag>]`, `["p", <claimant>]`, `["z", <book-claims header>]`,
  `["t", <slug>]` tags and the `claim--<slug>--<claimant8>` d-tag; `fromBookClaimEvent`
  reconstructs it; re-building for the same (claimant, book) yields the **same d-tag**
  (idempotent replace). Mirror `book-rating.test`/`book-tag-assertion.test`.
- **Claim write route (new endpoint test, DI'd):**
  - Signed-out (`sessionUser → null`) → **401 `no_session`** on both
    `POST /api/claims/template` and `POST /api/claims` (server-side rejection).
  - **Sovereign:** a client-signed claim whose `pubkey` ≠ session → **403 `pubkey_mismatch`**;
    a valid claim → `publish` called once, `{ claimed: true }`, claimant list reflects it.
  - **Custodial:** intent body → `custodialSign` invoked; null key → **401 `reauth_required`**;
    publish fail → **502 `publish_failed`**.
  - Re-claim (same user, same book) → idempotent (same d-tag; one claim in the read-back).
- **Per-book claimants read:** `GET /api/books/:slug` with mocked `query` returning 0 / 1 / N
  distinct claims (and a replaced claim under the same d-tag) → asserts `claimants` is empty /
  one npub / N npubs sorted deterministically, hex never leaked.
- **By-author read:** `GET /api/profile/:npub/claimed-books` — unresolvable npub → **404**;
  N claims → N hydrated `PublicBook`s in order, unresolvable slug skipped; zero claims →
  `{ books: [] }`. `queryPaged` mocked to exercise the cap-paging path.
- **Web `AuthorBadge`:** mock `useProfileMeta`. 0 claimants → renders nothing; 1 →
  "Claimed by {name}" linking to `/profile/{npub}`; many → "and N others"; name falls back to
  `shortNpub` when no kind-0; asserts the word "verified" and any trust string are **absent**.
- **Web BookDetail claim action:** mock `api.claims.*` + `useSession`. Signed-out → no claim
  affordance. Signed-in → idle/in-flight/success/error states in place (no toast); success
  surfaces the badge; failure shows the honest error and no fabricated success.
- **Web "Books by this author":** mock `api.profile.claimedBooks`. Non-empty → grid of
  claimed books linking to detail; empty → section absent (no placeholder). Reads the path/own
  npub, not the viewer session.

## Implementation notes

### New files

- `packages/schemas/src/BookClaim.ts` — `BookClaim` domain type, `BOOK_CLAIM_KIND = 39999`,
  `buildBookClaimDTag(slug, claimantPubkey)`, `toBookClaimEvent` / `fromBookClaimEvent`.
  Mirror `BookTagAssertion.ts`. Export from `packages/schemas/src/index.ts`.
- `apps/api/src/claims/template.ts` — `buildClaimTemplate(config, { claimantPubkey, bookSlug },
  createdAt)`; resolve the librarian pubkey at runtime (mirror `ratings/template.ts`).
- `apps/api/src/claims/validate.ts` — `validateSignedClaim(event, sessionPubkey)` (mirror
  `ratings/validate.ts`).
- `apps/api/src/routes/claims.ts` — `buildClaimsRouter(deps)` with
  `POST /api/claims/template`, `POST /api/claims`. DI shape = `userEventDeps`.
- `apps/web/src/components/AuthorBadge.tsx` (+ `.css`, existing tokens only).
- *(Tester-owned)* schema test, claims-route test, books-claimants test, claimed-books test,
  author-badge test, book-detail-claim test, books-by-author profile test.

### Concept header (DList)

- `packages/schemas/src/concept-headers.ts` — add `BOOK_CLAIMS_HEADER_SLUG = "book-claims"`
  and `buildBookClaimsHeaderAddress(librarianPubkey)`. **Reserve** (comment only, not added)
  `BOOK_AUTHOR_EDITS_HEADER_SLUG = "author-edits"` for Story 32.

### DList shape (built)

- `kind:39999` `BookClaim`: d-tag `claim--<slug>--<claimant8>`; tags
  `["d", …] ["z","39998:<librarian>:book-claims"] ["t",<slug>] ["a","39999:<librarian>:<slug>"]
  ["p",<claimantHex>]`; word-wrapper `{ word: {...}, bookClaim: { bookSlug, bookAtag } }`;
  content `""`. Pattern cribbed from `BookTagAssertion` (ADR 0009).

### Ripple files (modified — production)

- `apps/api/src/routes/books.ts` — `GET /api/books/:slug`: add the parallel claims read,
  dedupe/sort/project to `claimants: { npub }[]`, return alongside `book`. This is the Story-32
  read-merge seam (today a pass-through; `effectiveBook === canonical`).
- `apps/api/src/index.ts` — `import { buildClaimsRouter }`; register
  `app.use("/", buildClaimsRouter(userEventDeps))`; pass `query` into the books router (already
  present) for the claims read.
- `apps/api/src/routes/profile-stats.ts` *(or new `profile-claims.ts`)* — add
  `GET /api/profile/:npub/claimed-books` (paged author-scoped claim read → slug hydrate via the
  `slugs` batch). Register in `index.ts` if a new router.
- `apps/web/src/lib/api.ts` — add `api.claims.{template,submit,submitCustodial}`,
  `api.profile.claimedBooks(npub)`, `BookClaimant` type, `claimants` on the book-get response.
- `apps/web/src/routes/BookDetail.tsx` — thread `claimants` from `api.books.get` into the
  header; add the claim action wiring (idle/in-flight/success/error in place).
- `apps/web/src/components/BookHeader.tsx` — render `<AuthorBadge claimants={…} />` beside the
  `by {authorName}` line (line 35).
- `apps/web/src/routes/ProfileMe.tsx` and `apps/web/src/routes/Profile.tsx` — add the
  "Books by this author" section (BookGrid + toCardBook), absent when empty, read by own/path
  npub.

### Existing tests that change

- `apps/api` `GET /api/books/:slug` endpoint test — add `claimants: []` on the no-claims path
  (response shape grows; existing assertions on `book` stay).
- `apps/web` BookDetail tests that mock `api.books.get` — include `claimants` in the mock.
- `apps/web` ProfileMe/Profile tests that mock `api.profile.*` — add `claimedBooks` to the mock
  (default `{ books: [] }` → section absent).

## Out of scope

- **The author edit surface, the `BookAuthorOverlay` event/builder, the `author-edits`
  header, and the read-time overlay-apply** — all **Story 32** (gate decision 1). Defined as a
  seam here; built nowhere here.
- **The verification gate / `author-verified` trusted-curator consensus / any trust read /
  the "claimed → Verified" badge flip** — **Story 32** (PRD §2.10 Block C).
- **Automated author verification** (website / ISBN / domain) — Phase 3.
- **Mutating the librarian-signed `BookRecord` or giving the API a librarian secret** — never
  (CLAUDE.md invariant 3).
- **Claiming community submissions / the Submit "I am the author" toggle** — unchanged; this
  story is catalog entries only. (Its stale copy is flagged for a later fix.)
- **Cover/image hosting**, **a general profile editor**, **new lint/typecheck/build tooling.**
