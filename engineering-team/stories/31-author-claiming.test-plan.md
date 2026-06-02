# Test Plan: Story 31 — Author claiming (trust-independent core)

**Story:** `engineering-team/stories/31-author-claiming.md`
**ADR:** `engineering-team/decisions/0032-author-claiming.md`
**Date:** 2026-06-01
**Branch:** `feat/author-claiming`

Trust-INDEPENDENT throughout: no trust provider, no Brainstorm, no relay, no
fixture-trust, no human. The 5 active ACs are AC-1 (claim event), AC-2 (badge +
multi-claimant), AC-6 ("Books by this author"), AC-7 (honest states / "claimed ≠
verified"), AC-8 (both tiers, deterministic CI). **AC-3/AC-4/AC-5 are DEFERRED to
Story 32** and are not tested here (the ADR defines the seam; this story builds a
pass-through `effectiveBook === canonical`).

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (claim is an author-signed kind-39999 event `#a`→book, `#p`→claimant, z→book-claims, idempotent d-tag) | `targets the book by #a, carries z/t/p and empty content`; `round-trips a claim`; `builds claim--<bookSlug>--<claimant8>`; `is idempotent: same (claimant, book) yields the same d-tag` | `packages/schemas/test/BookClaim.test.ts` | unit |
| AC-1 / AC-8 (signed-in claim → template→sign→submit publishes; anon → 401 `no_session` on template AND submit; event-pubkey ≠ session → 403; idempotent re-claim) | `returns an unsigned kind-39999 claim template…`; `401 no_session when the visitor is signed out`; `publishes a valid signed claim…`; `403 pubkey_mismatch…`; `401 no_session for a signed-out claim POST`; `is idempotent: re-claiming the same book yields one claim` | `apps/api/test/routes/claims.test.ts` | route (DI'd) |
| AC-8 (custodial via `submitCustodial`; `reauth_required` 401 when key gone; 502 `publish_failed`) | `server-signs the claim and publishes it`; `401 reauth_required when the session has no live signing key`; `502 publish_failed…` (sovereign + custodial) | `apps/api/test/routes/claims.test.ts` | route (DI'd) |
| AC-2 (per-book claimants: 0 → `[]`, 1, N deduped, replaced-claim dedupe; npub-out, NO hex on the wire) | `returns an empty claimants array…`; `returns one claimant (by npub)…`; `returns N distinct claimants…`; `dedupes a replaced claim…`; `never leaks the claimant hex pubkey on the wire` | `apps/api/test/routes/books-claimants.test.ts` | route (DI'd) |
| AC-6 (by-author read: hydrate in order, skip-missing slug, empty → `{books:[]}`, read by PATH npub, cap-safe) | `404 not_found when the npub segment is unresolvable`; `returns the path author's claimed books, hydrated and in order`; `reads the claims author-scoped to the PATH npub`; `skips a claim whose catalog book is missing`; `returns { books: [] } for an author with no claims`; `uses the paginating read (queryPaged)…` | `apps/api/test/routes/profile-claimed-books.test.ts` | route (DI'd) |
| AC-2 / AC-7 (AuthorBadge: 0 → nothing; 1 → "Claimed by {name}"; N → "and N others"; npub→name w/ shortNpub fallback; links to `/profile/{npub}`; "claimed" present, "verified" ABSENT) | `renders nothing when there are zero claimants`; `shows "Claimed by {name}" and links…`; `falls back to a short npub…`; `shows "Claimed by {name} and N others"…`; `never renders the word "verified"`; `uses the word 'claimed'…` | `apps/web/test/components/author-badge.test.tsx` | component |
| AC-1 / AC-7 / AC-8 (BookDetail claim action: signed-in → "Claim this book"; idle/in-flight/success/error in place, no toast; signed-out → no affordance; custodial + sovereign reach the claim; badge from claimants) | `shows no claim affordance to a signed-out visitor`; `claims via template→sign→submit and shows success in place`; `shows an honest error in place when the claim fails`; `claims via the server-signed path (no NIP-07)…`; `renders an Author badge when the book read returns a claimant` | `apps/web/test/routes/book-detail-claim.test.tsx` | component |
| AC-6 (web "Books by this author": renders claimed books for that npub, links to detail; absent/empty when none; read by path/own npub) | `renders the claimed books for the PATH npub, linking…`; `reads claimedBooks for the path npub, not the viewer session`; `renders NO section…when the author has claimed nothing`; `renders the signed-in user's own claimed books`; `reads the own npub for claimedBooks`; `renders no section when the user has claimed nothing` | `apps/web/test/routes/profile-books-by-author.test.tsx` | component |
| AC-7 (Submit "I am the author" toggle copy is HONEST: no "Author Verified", `/verified/i` absent, reads as a claim/authorship mark) | `does NOT promise an 'Author Verified' badge`; `does not render the word 'verified' anywhere on the submit form`; `still reads as a claim/authorship mark` | `apps/web/test/routes/submit-author-toggle-copy.test.tsx` | component (copy fix) |

### How the contentious requirements are asserted

- **"claimed ≠ verified" (AC-7).** Asserted in three independent places:
  (1) `author-badge.test.tsx` asserts `queryByText(/verified/i)` is **not** in the
  document and `getByText(/claimed/i)` **is**; (2) `book-detail-claim.test.tsx`
  asserts the rendered badge contains "claimed by" and never "verified"; (3)
  `submit-author-toggle-copy.test.tsx` asserts the real `Submit` component's
  "I am the author" toggle copy contains no `/verified/i` (driving the one-line
  copy fix off the stale "Adds the Author Verified badge…" string in
  `Submit.tsx`).
- **Idempotent d-tag (AC-1).** Asserted at the schema level
  (`buildBookClaimDTag` returns the same string for the same (claimant, book) and
  differs by claimant) and at the route level (`claims.test.ts` re-claim → the
  read-back collapses two events under one d-tag to a **single** claimant;
  `books-claimants.test.ts` dedupes a replaced claim).
- **No-hex-leak (AC-2).** `books-claimants.test.ts` asserts
  `JSON.stringify(res.body)` does **not** contain the claimant hex, and every
  claimants assertion expects `{ npub }` (npub via `npubEncode`), never hex.
- **Both tiers (AC-8).** `claims.test.ts` has parallel sovereign (client-signed,
  validate → 403 `pubkey_mismatch`, publish) and custodial (`custodialSign` →
  null → 401 `reauth_required`, publish fail → 502) describe blocks;
  `book-detail-claim.test.tsx` exercises sovereign (template→NIP-07 sign→submit)
  and custodial (`submitCustodial`, no NIP-07) through the api client.

## Edge cases (beyond the happy path, covered explicitly)

- [x] No claim → empty `claimants` array / no badge / no profile section (not a placeholder).
- [x] Multiple distinct claimants on one book (the open-claim hazard) → all shown, no silent winner.
- [x] Replaced claim (two events, one d-tag) → deduped to one claimant.
- [x] Signed-out claim POST and template → 401 `no_session` (server-side rejection).
- [x] Event pubkey ≠ session → 403 `pubkey_mismatch`.
- [x] Custodial session key gone → 401 `reauth_required`; relay reject → 502 `publish_failed`.
- [x] Unresolvable npub on the by-author read → 404 `not_found`.
- [x] Claim whose catalog book was removed → skipped on hydrate (ordered skip-missing).
- [x] Over-cap author → `queryPaged` (cap-safe per ADR 0021) is exercised.
- [x] No kind-0 for a claimant → honest `shortNpub` fallback in the badge.
- [x] Claim failure in the UI → honest error in place, no fabricated success.

## Test infrastructure

- Runner: Vitest. Schema unit tests under `packages/schemas/test/`; API route tests
  under `apps/api/test/routes/` (DI'd routers, `supertest`); web component tests
  under `apps/web/test/` (Vitest + Testing Library).
- **No live relay/DB.** All reads/writes are DI'd (`query`, `queryPaged`,
  `publish`, `sessionUser`, `custodialSign`) or boundary-mocked (`api`,
  `useSession`, `useProfileMeta`, `useTrustView`, `useBookRatings`).
- **No new framework, no Playwright** (no ADR introduces it).
- **Crypto:** signed-event fixtures use audited primitives only
  (`nostr-tools/pure` `finalizeEvent`/`getPublicKey`, re-exporting `@noble`) —
  no hand-rolled crypto. New fixture: `apps/api/test/claims/_fixtures.ts`
  (`signedClaim`), mirroring `apps/api/test/ratings/_fixtures.ts`.
- **Discipline:** no intra-module `vi.mock`; no `Date.now()` in asserted output;
  role-scoped web queries; web mocks typed to the real response shape so a missing
  `claimants` / `claimedBooks` field fails.

## New test files (8)

| File | Tests | AC |
|---|---|---|
| `packages/schemas/test/BookClaim.test.ts` | 8 | AC-1 |
| `apps/api/test/claims/_fixtures.ts` | — (fixture helper) | — |
| `apps/api/test/routes/claims.test.ts` | 11 | AC-1, AC-8 |
| `apps/api/test/routes/books-claimants.test.ts` | 5 | AC-2 |
| `apps/api/test/routes/profile-claimed-books.test.ts` | 6 | AC-6 |
| `apps/web/test/components/author-badge.test.tsx` | 6 | AC-2, AC-7 |
| `apps/web/test/routes/book-detail-claim.test.tsx` | 5 | AC-1, AC-2, AC-7, AC-8 |
| `apps/web/test/routes/profile-books-by-author.test.tsx` | 6 | AC-6 |
| `apps/web/test/routes/submit-author-toggle-copy.test.tsx` | 3 | AC-7 |

## Migrated existing tests (8 files) — additive contracts, behaviors preserved

The book read grew `claimants` and the profile routes grew a `claimedBooks` read;
the BookDetail subtree grew the `api.claims.*` calls and an `<AuthorBadge>`. The
affected surfaces were enumerated by grep (below). Each migration is **additive**
(adds the new field/method to the mock or asserts the empty default); no protected
assertion was weakened or removed.

| File | What changed | Why it's faithful |
|---|---|---|
| `apps/api/test/routes/books.test.ts` | The `:slug` mock now routes by filter (`bookOnly`) so the new sibling claims read returns `[]`; one assertion added: `claimants` is `[]` on the no-claims path. | The book record could be mis-parsed as a claim if one mock answered both reads; routing keeps the existing `book.title`/`authorName` assertions exact and pins the additive empty-claimants contract. |
| `apps/web/test/book-detail-trust-view.test.tsx` | `booksGet` mock returns `{ book, claimants: [] }`; `api.claims.*` stubbed; `useProfileMeta` stubbed for the badge. | The Story-25/29 trust-view + single-`useBookRatings`-owner assertions are unchanged; only the new read shape and the badge's identity dep are added. |
| `apps/web/test/routes.smoke.test.tsx` | `booksGet` returns `claimants: []`; `api.claims.*` and `api.profile.claimedBooks` stubbed (empty). | Every existing route smoke assertion is unchanged; the additions only keep the new reads from throwing on the signed-out smoke render. |
| `apps/web/test/routes/profile-public.test.tsx` | `api.profile.claimedBooks` stubbed empty. | Story-20 identity/shelves/Substack/NotFound assertions unchanged; the new by-author read defaults empty (section absent). |
| `apps/web/test/routes/profile-following-count.test.tsx` | `api.profile.claimedBooks` stubbed empty. | Story-23 following-count assertions unchanged. |
| `apps/web/test/routes/profile-me-polish.test.tsx` | `api.profile.claimedBooks` stubbed empty. | Story-19/29 shelves/stats/header assertions unchanged. |
| `apps/web/test/routes/profile-me-capped.test.tsx` | `api.profile.claimedBooks` stubbed empty. | Story-21 capped-stats assertions unchanged. |
| `apps/web/test/routes/profile-me-shelves.test.tsx` | `api.profile.claimedBooks` stubbed empty. | Story-19 shelves assertions unchanged. |
| `apps/web/test/routes/profile-me-substack.test.tsx` | `api.profile.claimedBooks` stubbed empty. | Story-20 substack assertions unchanged. |
| `apps/web/test/routes/profile-me-nostr-identity.test.tsx` | `api.profile.claimedBooks` stubbed empty. | Story-29 nostr-identity-disclosure assertions unchanged. |

### Note for the Implementer (protected behavior, no test migration needed)

`apps/web/test/tag-consensus-labels.test.tsx` renders `<BookHeader>` **directly
with props** and asserts the consensus labels. The ADR places `<AuthorBadge>`
inside `BookHeader`, so **BookHeader's new `claimants` prop must be optional**
(default to no badge) or this test (which passes no `claimants`) will break. No
migration is applied; the contract is that the prop is optional.

### Grep that enumerated the affected surfaces

```
# API: tests using buildBooksRouter (the book read)            → books.test.ts
#   (tags.test.ts / ratings.test.ts / tags-weighted.test.ts hit /ratings + /tags
#    routes, NOT buildBooksRouter — confirmed unaffected)
grep -rln "buildBooksRouter" apps/api/test/

# WEB: tests mocking books.get  → book-detail-trust-view, book-detail-claim, routes.smoke
grep -rln "books.get|books: { get" apps/web/test/
# WEB: tests rendering BookDetail → routes.smoke, book-detail-trust-view, book-detail-claim
# WEB: tests rendering BookHeader → tag-consensus-labels (props-only, prop must stay optional)
# WEB: tests rendering Profile/ProfileMe → routes.smoke, profile-public,
#   profile-following-count, profile-me-{capped,shelves,substack,polish,nostr-identity}
grep -rln "routes/Profile|routes/ProfileMe|BookHeader" apps/web/test/
```

## How to run

```
pnpm --filter @unbnd/schemas test
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/web test
pnpm -r test
```

## Verification — the new + migrated tests fail for the RIGHT reason

Confirmed 2026-06-01 at commit `a46994c` (the tests committed on top of it).
Every failure is **not-implemented**, not a test bug.

### `@unbnd/schemas` (red summary)

```
 ❯ test/BookClaim.test.ts (0 test)
 FAIL  test/BookClaim.test.ts [ test/BookClaim.test.ts ]
Error: Failed to load url ../src/BookClaim … Does the file exist?
 Test Files  1 failed | 8 passed (9)
      Tests  78 passed (78)
```
**Reason:** `packages/schemas/src/BookClaim.ts` (and
`buildBookClaimsHeaderAddress` / `BOOK_CLAIMS_HEADER_SLUG`) do not exist yet. The
other 78 schema tests stay green (no regression).

### `@unbnd/api` (red summary)

```
 FAIL  test/routes/claims.test.ts
   Error: Failed to load url ../../src/routes/claims … Does the file exist?
 FAIL  test/routes/profile-claimed-books.test.ts
   Error: Failed to load url ../../src/routes/profile-claims … Does the file exist?
 FAIL  test/routes/books-claimants.test.ts
   TypeError: toBookClaimEvent is not a function   (schema export missing)
 FAIL  test/routes/books.test.ts > … (with an empty claimants array when none)
   AssertionError: expected undefined to deeply equal []   (claimants not added)
 Test Files  4 failed | 70 passed | 2 skipped (76)
      Tests  6 failed | 597 passed | 10 skipped (613)
```
**Reasons:** the `BookClaim` schema, the claims write route
(`apps/api/src/routes/claims.ts` + `claims/template.ts` + `claims/validate.ts`),
the `claimants` enrichment on `GET /api/books/:slug`, and the by-author endpoint
(`apps/api/src/routes/profile-claims.ts`) do not exist yet.

### `@unbnd/web` (red summary)

```
 FAIL  test/components/author-badge.test.tsx
   Error: Failed to resolve import "../../src/components/AuthorBadge"
 FAIL  test/routes/book-detail-claim.test.tsx
   → Unable to find role="button" and name `/claim this book/i`   (claim action not wired)
   → Unable to find an element with the text: /claimed by/i        (AuthorBadge not rendered)
 FAIL  test/routes/profile-books-by-author.test.tsx
   → Unable to find role="heading" and name `/books by this author/i`  (section not rendered)
 FAIL  test/routes/submit-author-toggle-copy.test.tsx
   → found <span class="toggle-desc">Adds the Author Verified badge…</span>  (stale copy)
 Test Files  4 failed | 42 passed (46)
      Tests  10 failed | 243 passed (253)
```
**Reasons:** `AuthorBadge` doesn't exist; BookDetail has no claim affordance and
no badge wiring; ProfileMe/Profile render no "Books by this author" section; the
Submit toggle still promises "Author Verified." All 42 other web test files
(including the 8 migrated ones) are green — the additive migrations did not break
any protected behavior. No unhandled errors (the new BookDetail mock stubs every
read its signed-in subtree makes).

All failures trace to absent production code, not typos or import errors in the
tests. Ready for `/implement-feature` after approval.
