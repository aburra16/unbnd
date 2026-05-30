# Test Plan: Story 19 — Polish the logged-in profile

**Story:** `engineering-team/stories/19-profile-polish.md`
**ADR:** `engineering-team/decisions/0019-profile-polish.md`
**Date:** 2026-05-30
**Branch:** `feat/profile-polish`

## Summary

Ten ACs. Eight are pinned by failing tests against the surface ADR 0019 specifies
(enriched `/api/shelves/mine`, the new `/api/profile/me/stats` route, two new
aggregate helpers, the account-dropdown nav, the polished `ProfileMe`). AC-9 is a
behavior-preserving refactor covered by **green regression-guard** tests plus
review-verification of the import dedupe. AC-10 is a doc-comment change, not
unit-testable — review-verified.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 enriched books | `returns each shelf book as a PublicBook with cover/title/author …` | `apps/api/test/routes/shelves-enriched.test.ts` | route |
| AC-1 boundary | `keeps the PublicBook boundary — no hex pubkey or parent header on the wire` | `apps/api/test/routes/shelves-enriched.test.ts` | route |
| AC-1 single batch read | `issues a single batch catalog read for the distinct shelved slugs` | `apps/api/test/routes/shelves-enriched.test.ts` | route |
| AC-1 web render | `renders shelf books with title and author, not the raw slug` | `apps/web/test/routes/profile-me-polish.test.tsx` | component |
| AC-1 web link | `links each shelf book to its book detail page (BookCard)` | `apps/web/test/routes/profile-me-polish.test.tsx` | component |
| AC-2 omit + recount | `omits a shelved slug with no catalog record and recounts to the survivors` | `apps/api/test/routes/shelves-enriched.test.ts` | route |
| AC-2 no-books guard | `never issues a catalog read when the user has no shelved books` | `apps/api/test/routes/shelves-enriched.test.ts` | route (green guard) |
| AC-3 Your profile | `renders a 'Your profile' menuitem linking to /profile/me` | `apps/web/test/components/account-menu.test.tsx` | component |
| AC-3/AC-4 order | `orders the items: Your profile, then Your shelves, then Sign out` | `apps/web/test/components/account-menu.test.tsx` | component |
| AC-4 Your shelves | `renders a 'Your shelves' menuitem deep-linking to the shelves section` | `apps/web/test/components/account-menu.test.tsx` | component |
| AC-4 close on activate | `closes the menu when 'Your shelves' is activated` | `apps/web/test/components/account-menu.test.tsx` | component |
| AC-5 booksRated helper | `counts distinct rated books, keyed by book not by pubkey` (+ re-rate, no-review, empty) | `apps/api/test/ratings/own-counts.test.ts` | unit |
| AC-6 reviews helper | `counts only ratings whose review text is non-empty after trim` (+ subset/latest-wins) | `apps/api/test/ratings/own-counts.test.ts` | unit |
| AC-7 tagsApplied helper | `counts distinct (book, tag) pairs whose latest polarity is +1` (+ dedupe, dispute, retract) | `apps/api/test/tags/own-counts.test.ts` | unit |
| AC-5/6/7 endpoint | `returns booksRated, reviews, and tagsApplied computed from the user's events` | `apps/api/test/routes/profile-stats.test.ts` | route |
| AC-5/6/7 web | `shows the real numbers from api.profile.meStats` | `apps/web/test/routes/profile-me-polish.test.tsx` | component |
| AC-8 present zero (api) | `shows a true zero as a PRESENT 0` | `apps/api/test/routes/profile-stats.test.ts` | route |
| AC-8 omit-on-throw (api) | `OMITS a stat whose underlying read throws, while keeping the others` (+ ratings-throw) | `apps/api/test/routes/profile-stats.test.ts` | route |
| AC-8 session gate | `401 for an anonymous caller` / `reads each concept author-scoped to the signed-in user` | `apps/api/test/routes/profile-stats.test.ts` | route |
| AC-8 present zero (web) | `renders a genuine zero as 0 when the stat is present` | `apps/web/test/routes/profile-me-polish.test.tsx` | component |
| AC-8 hide absent (web) | `HIDES a stat that is absent from the response — never a fabricated 0` (+ whole-call-fails) | `apps/web/test/routes/profile-me-polish.test.tsx` | component |
| AC-9 empty-name guard | `does not crash or submit when the custom shelf name is whitespace only` | `apps/web/test/components/shelf-control.test.tsx` | component (green guard) |
| AC-9 slug unchanged | `still derives a valid slug from a normal custom name (existing cases unchanged)` | `apps/web/test/components/shelf-control.test.tsx` | component (green guard) |
| AC-10 doc-comment | — (review-verified, see below) | — | review |

## Notes on AC-9 and AC-10 (not red)

- **AC-9** is a dedupe + behavior-preserving refactor: swap `ShelfControl`'s local
  `toShelfSlug` for the `@unbnd/schemas` export. The schemas version *throws* on an
  empty/whitespace-normalized name; the local copy returned `""`. `ShelfControl`'s
  new-shelf path already guards (`if (!slug) … return`) before that matters, so the
  swap is behavior-preserving. The two added tests therefore pass against the
  current code **and** must keep passing after the swap — they are **regression
  guards** that pin "an empty/whitespace custom name does not crash and does not
  publish" and "a normal name still slugifies". The import-dedupe itself (that the
  local copy is removed and the symbol comes from `@unbnd/schemas`) is not directly
  assertable from a render and is **review-verified**.
- **AC-10** is a pure doc-comment change in `apps/web/src/data/profile-fixtures.ts`
  (~line 21–27) — not unit-testable. **Review-verified**: the comment must stop
  calling `ProfileShelfFixture` "UI augmentation of the wire-shape `@unbnd/schemas`
  BookShelf" and describe the current fixture/UI shape instead.

## Edge cases covered
- [x] Empty input — `groupOwnShelves([])` already covered (Story 18); new helpers
  return true zeros for empty input; stats endpoint returns all-present zeros.
- [x] Latest-wins keyed correctly — booksRated keyed by **book** (not pubkey, which
  would collapse to 1); tagsApplied keyed by **(book, tag) pair** (not (author, tag)).
- [x] Disputed/retracted tag pair excluded from the applied count.
- [x] Review text that is whitespace-only is not counted as a review.
- [x] A shelved book with no catalog record is omitted and the count recounted.
- [x] Same slug across two shelves collapses to one distinct slug in the batch read.
- [x] No catalog read fired when the user has no shelved books.
- [x] A single failing source omits only its field; the others still report.
- [x] Anonymous caller is 401 on the stats endpoint.
- [x] Whole-stats-call failure hides all three stats (web), shelves still render.

## Test infrastructure
- Runner: Vitest. API tests under `apps/api/test/`, web tests under `apps/web/test/`.
- Component tests: Vitest + Testing Library, `MemoryRouter` wrapper, `api`/`useSession`
  mocked. No network, no real crypto in the web tests; the API route/aggregate tests
  build wire-realistic signed events via `@unbnd/schemas` + `nostr-tools/pure` (the
  same fixture pattern as `shelves.test.ts` / `books.test.ts` / `ratings/_fixtures.ts`).
- **No live relay / Docker prerequisite** for any test here — all reads are injected
  via the `query` dep mock; all three concepts are routed by their `#z` parent header.
- No new framework, no Playwright (not introduced by ADR 0019).

## How to run
```
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/web test
pnpm -r test
```

## Verification

New tests fail against the current code, each for the intended not-implemented reason
(missing export / missing route / missing enrichment / missing menu items / missing
stats fetch) — not import errors or test bugs. Confirmed on 2026-05-30 at commit
`e8f10cf` (`feat/profile-polish`).

### API — `pnpm --filter @unbnd/api test`
```
 FAIL  test/routes/profile-stats.test.ts [ test/routes/profile-stats.test.ts ]
Error: Failed to load url ../../src/routes/profile-stats (resolved id: ../../src/routes/profile-stats) … Does the file exist?

 FAIL  test/ratings/own-counts.test.ts > countOwnRatings — books rated (AC-5) > counts distinct rated books, keyed by book not by pubkey
TypeError: countOwnRatings is not a function

 FAIL  test/tags/own-counts.test.ts > countOwnAppliedTags — applied pairs (AC-7) > counts distinct (book, tag) pairs whose latest polarity is +1
TypeError: countOwnAppliedTags is not a function

 FAIL  test/routes/shelves-enriched.test.ts > GET /api/shelves/mine — enriched books (AC-1) > returns each shelf book as a PublicBook with cover/title/author and no raw slug-only entry
TypeError: Cannot read properties of undefined (reading 'title')

 Test Files  4 failed | 38 passed | 2 skipped (44)
      Tests  17 failed | 282 passed | 10 skipped (309)
```
Breakdown of the 17 API reds:
- `ratings/own-counts.test.ts` — 6 reds: `countOwnRatings is not a function` (helper not exported yet).
- `tags/own-counts.test.ts` — 7 reds: `countOwnAppliedTags is not a function` (helper not exported yet).
- `routes/profile-stats.test.ts` — file fails to load: `apps/api/src/routes/profile-stats.ts` does not exist yet (8 cases blocked, correct not-implemented).
- `routes/shelves-enriched.test.ts` — 4 reds: current `/mine` returns `{bookSlug, bookAtag}`, so `book.title`/`coverUrl` are undefined and the catalog batch read is never issued (enrichment not implemented). The 5th case (`never issues a catalog read when … no shelved books`) is a green guard.

### Web — `pnpm --filter @unbnd/web test`
```
   × AccountMenu — profile + shelves nav (AC-3, AC-4) > renders a 'Your profile' menuitem linking to /profile/me
TestingLibraryElementError: Unable to find an accessible element with the role "menuitem" and name `/your profile/i`

   × ProfileMe — enriched shelf books (AC-1) > renders shelf books with title and author, not the raw slug
TestingLibraryElementError: Unable to find an element with the text: Orbital …

   × ProfileMe — honest stats (AC-5, AC-6, AC-7, AC-8) > shows the real numbers from api.profile.meStats
AssertionError: expected "spy" to be called at least once

 Test Files  2 failed | 18 passed (20)
      Tests  10 failed | 75 passed (85)
```
Breakdown of the 10 web reds:
- `account-menu.test.tsx` — 4 reds: the "Your profile" / "Your shelves" menuitems do not exist yet (AC-3/AC-4).
- `profile-me-polish.test.tsx` — 6 reds: ProfileMe still renders the raw slug (not the PublicBook title/author), and never calls `api.profile.meStats` (the stats are hard-coded `0`). All correct not-implemented reds.

Green-by-design (regression guards, not reds): `shelf-control.test.tsx` (AC-9) — 9 passed
(7 prior + 2 new). These pin behavior the swap to `@unbnd/schemas` `toShelfSlug` must
preserve.

## Prerequisite notes for the Implementer

1. **`/api/shelves/mine` `books` element shape changes** (ADR 0019 Decision 1):
   `{ bookSlug, bookAtag }` → `PublicBook`. The web `Shelf` type in
   `apps/web/src/lib/api.ts` (currently `books: ShelfBook[]`) must follow to
   `books: PublicBook[]`, and `ProfileMe` renders via `toCardBook` + `BookGrid`.
   - **Existing `apps/api/test/routes/shelves.test.ts`** "GET /api/shelves/mine"
     block asserts only on `count` (it does not read `books[]` element fields), so
     it does **not** break on the shape change. Leave it; it still pins the grouped
     read. Do **not** delete it.
   - **`ShelfControl.tsx`** reads `api.shelves.mine()` and uses `s.books.some((b) => b.bookSlug === bookSlug)`
     to compute membership chips. With the element shape becoming `PublicBook`, that
     `.bookSlug` access becomes `.slug`. **The Implementer must update ShelfControl's
     membership predicate to `b.slug === bookSlug`** or the chips/remove targets break.
     The existing `shelf-control.test.tsx` membership tests still feed `{ bookSlug, bookAtag }`
     in their `mine` mocks — the Implementer should migrate those mock fixtures to the
     `PublicBook` shape in lockstep with the predicate change (flagged here so coverage
     is not silently lost; the Tester left them as-is since they are Story-18 mocks).

2. **`countOwnRatings`** (new export in `apps/api/src/ratings/summary.ts`): latest-wins
   keyed on **`bookSlug`**, returns `{ booksRated, reviews }` in one pass. Do **not**
   repurpose `dedupeRatings` (its `pubkey` key is correct for the public per-book read
   and must stay).

3. **`countOwnAppliedTags`** (new export in `apps/api/src/tags/aggregate.ts`):
   latest-wins keyed on **`${bookSlug}|${tagSlug}`**, count pairs whose latest polarity
   is `+1`. Mirror `aggregateBookTags` parsing (`parseAssertion`) but key on the pair,
   not `(author, tag)`.

4. **`apps/api/src/routes/profile-stats.ts`** (new): export `buildProfileStatsRouter`,
   `ProfileStatsDeps` (`{ config, sessionUser, query }`), `ProfileStatsSessionUser`
   (`{ id, pubkeyHex, tier }`) — mirroring the shelves router's session-gating deps.
   `GET /api/profile/me/stats`: 401 anon; read each concept author-scoped
   (`authors:[user.pubkeyHex]`, `kinds:[39999]`, `#z` = ratings / tag-assertions);
   wrap each read so a single throw **omits only its field** (present 0 vs absent).
   Return `{ stats: { booksRated?, reviews?, tagsApplied? } }`. The Tester pinned the
   exported builder/deps surface; how it is mounted in `apps/api/src/index.ts` (its own
   router vs. a `/me/stats` sub-route of the profile router) is the Implementer's call,
   as long as the export names match.

5. **`api.profile.meStats()`** (new in `apps/web/src/lib/api.ts`):
   `() => Promise<{ stats: { booksRated?: number; reviews?: number; tagsApplied?: number } }>`.

6. **`ProfileMe.tsx`**: fetch stats in the existing effect; build the `ProfileStats`
   array from **present fields only** (absent field → no cell; present `0` → renders
   `0`); render shelves via `toCardBook` + `BookGrid`; add `id="shelves"` to the
   shelves `<section>` and a `location.hash` effect to scroll it into view (AC-4
   deep-link). The web test asserts title+author render and the hidden/absent-stat
   rule; the `id="shelves"` + scroll behavior is covered by review (jsdom does not
   exercise scroll), consistent with the ADR's Q2 note.

7. **`AccountMenu.tsx`**: insert `<Link to="/profile/me" role="menuitem">Your profile</Link>`
   and `<Link to="/profile/me#shelves" role="menuitem">Your shelves</Link>` between the
   `acct-id` block and the sign-out button, each `onClick={() => setOpen(false)}`,
   reusing `acct-*` classes. Order: Your profile, Your shelves, Sign out.

8. **AC-9 / AC-10**: swap `ShelfControl`'s local `toShelfSlug` for the `@unbnd/schemas`
   export (keep the existing empty-name guard so the schemas throw never escapes), and
   fix the `profile-fixtures.ts` doc-comment. Both review-verified; the AC-9 regression
   guards must stay green.
