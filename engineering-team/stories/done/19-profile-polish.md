# Story 19: Polish the logged-in profile (enriched shelves, account-menu nav, honest activity counts)

**Status:** Done
**Created:** 2026-05-30
**Type:** Feature

## Background
Story 18 shipped shelves to staging. The first thing the signed-in user did was add a book to a shelf and open `/profile/me`. Three rough edges turned up, all on the user's own profile and the signed-in account menu. None of them touch trust weighting (Lane 1 / trust-independent — `/profile/me` is a single-author read of the user's own events).

1. **Shelves render raw identifiers.** "Your shelves" lists each book as its slug (e.g. `ol-ol21177w`) because `GET /api/shelves/mine` returns only `{ bookSlug, bookAtag }`. Every other place a book appears (genre pages, browse rows, search) shows a cover, title, and author. The profile should match.
2. **The account dropdown is a dead end.** The profile-pic menu (`AccountMenu.tsx`) only offers "Sign out". There is no way to reach the profile or the shelves from it.
3. **The profile stats are fabricated.** "Books rated", "Reviews", and "Tags applied" are hard-coded to `0` (`ProfileMe.tsx` ~lines 72-75) even when the user has rated and tagged books. A zero that the user knows is wrong reads as a broken product and a dishonest one.

This work is the logged-in slice of **PRD §5.5 User Profile Page** ("Stats: books rated, reviews written, tags applied …" and "Shelves: publicly visible shelves … with covers") and **PRD §5.6 Shelves**. It does not expand PRD scope; §11.3 out-of-scope items (social feed / activity stream, reading progress, federation, payments) are untouched — a real *activity feed* stays out; this story only wires the three *count* stats and enriches the shelf display.

Affected persona: the signed-in **Reader / Curator** viewing their own profile.

## User-facing description
As a signed-in Reader or Curator, I want my own profile to show my shelves with real book covers and titles, a way to reach my profile and shelves from the account menu, and activity counts that reflect what I have actually done, so that my profile is legible and I can trust what it tells me about myself.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] **AC-1 — Enriched shelf books.** Given a signed-in user with at least one book on a shelf, when they open `/profile/me`, then each shelf renders its books as a grid of cover image + title + author (reusing the existing `BookCard`/`BookGrid` components used on genre pages), and no raw book slug (e.g. `ol-ol21177w`) is shown as the book's visible label.
- [ ] **AC-2 — Missing-book honesty.** Given a shelf entry whose book record cannot be resolved (no catalog record for that slug), when the shelf renders, then that entry is omitted from the visible grid and the shelf's displayed count reflects only the books actually shown (no broken card, no slug fallback, no fabricated cover). _Definitional choice flagged for the Architect — see Open Questions Q1._
- [ ] **AC-3 — Account menu: Your profile.** Given the account dropdown is open, when the user activates "Your profile", then they navigate to `/profile/me` and the menu closes. The entry sits above "Sign out".
- [ ] **AC-4 — Account menu: Your shelves.** Given the account dropdown is open, when the user activates "Your shelves", then they land on `/profile/me` scrolled/anchored to the shelves section (deep link), and the menu closes. The entry sits above "Sign out", below "Your profile". No top-level nav link is added anywhere.
- [ ] **AC-5 — Books rated count.** Given a signed-in user who has published ratings on N distinct books, when they open `/profile/me`, then "Books rated" shows N, where N = the count of distinct books the user has a current (latest-wins per book) rating on.
- [ ] **AC-6 — Reviews count.** Given a signed-in user, when they open `/profile/me`, then "Reviews" shows the number of the user's current ratings that carry non-empty review text (a rating with no review text is counted in AC-5 but not here).
- [ ] **AC-7 — Tags applied count.** Given a signed-in user who has published tag assertions, when they open `/profile/me`, then "Tags applied" shows the number of distinct (book, tag) pairs whose latest assertion by that user has polarity +1 (apply). A pair the user later disputed (latest polarity -1) or retracted does not count.
- [ ] **AC-8 — Honest stat, never a fabricated zero.** Given a count cannot be computed (the read fails or the data source is unavailable), when `/profile/me` renders, then that individual stat is hidden rather than shown as `0`. A genuine, successfully-computed `0` (the user truly has none) may show as `0`.
- [ ] **AC-9 — `toShelfSlug` deduped.** Given `ShelfControl.tsx`, when it needs to slugify a custom-shelf name, then it imports `toShelfSlug` from `@unbnd/schemas` rather than re-defining its own copy, and shelf-creation behavior is unchanged (the existing slug cases still pass).
- [ ] **AC-10 — Stale doc-comment fixed.** Given `apps/web/src/data/profile-fixtures.ts` (~line 22), when read, then the doc-comment no longer claims the type is "the wire-shape `@unbnd/schemas` BookShelf" (that type was renamed to `ProfileShelfFixture` and the wire model changed in Story 18); the comment describes the current shape accurately.

## DList shapes touched
No new shapes. This story reads existing kinds from the signed-in user's own author filter and enriches one existing read.

- `kind:39999` — book-shelf membership assertions under `39998:<librarian>:book-shelves` (the `/api/shelves/mine` read being enriched).
- `kind:39999` — book records under `39998:<librarian>:books` (the catalog source for cover/title/author enrichment; already exposed via `api.books.list` / `GET /api/books?slugs=`).
- `kind:39999` — book ratings under the ratings concept (counted for "Books rated" / "Reviews"; today read per-book by `#a`, here must be read by `authors:[user]`).
- `kind:39999` — book-tag assertions under `39998:<librarian>:book-tag-assertions` (counted for "Tags applied"; same author-filter consideration).

The exact filter shape, whether enrichment happens server-side or web-side, and whether counts are computed via new read endpoints or extended existing ones are **the Architect's call**. PO recommendation below is non-binding.

## PO recommendation (non-binding — Architect decides the mechanism)

**Shelf enrichment: prefer server-side.** Enrich the `/api/shelves/mine` read so each shelf book is returned as a `PublicBook`-shaped entry, mirroring how `GET /api/books` already maps `BookRecord → PublicBook` (`apps/api/src/routes/books.ts`). Rationale:
- The server already holds the catalog read path (`booksConcept()` + `parseBook`) and the `PublicBook` projection; reusing it keeps one mapping, not two.
- It avoids a web-side waterfall (load `/mine`, collect slugs, then batch `api.books.list`, then merge) and the matching client-side missing-book handling.
- It keeps hex/internal fields off the wire, consistent with the existing `PublicBook` boundary.
- The web-side merge via `api.books.list` is a viable fallback if the Architect wants to keep `/mine` a pure membership read; it is more round-trips and more client glue. PO leans server-side; final mechanism is the Architect's.

**Counts: same query+aggregate pattern as ratings/tags/shelves.** The existing per-book reads filter by `#a` (the book); the user's *own* counts need an `authors:[user.pubkeyHex]` filter, exactly as `/api/shelves/mine` already does. Reuse the latest-wins dedupe already in `ratings/summary.ts` and `tags/aggregate.ts`. Whether this is one new `/api/profile/me/stats`-style read or three small reads is the Architect's call.

## Precise count definitions (resolve any ambiguity in Architecture)
- **Books rated** = number of *distinct books* on which the user has a current rating. Latest-wins per book (a user re-rating the same book counts once). A rating with no review text still counts here.
- **Reviews** = number of the user's *current* ratings whose review text is non-empty (after trim). Subset of Books rated.
- **Tags applied** = number of distinct *(book, tag)* pairs whose latest assertion by the user has polarity +1 (apply). Disputes (latest polarity -1) and retracted pairs are excluded. This counts the user's own apply assertions, not consensus.

## Out of scope
Stated explicitly; these are later stories and must not creep in:
- Public browse of **other** users' shelves (PRD §5.6 "social function" — a curator's public shelves browsable by anyone). Later story.
- The dedicated `/shelves/:user/:shelf-slug` page. Later story.
- Custom-shelf rename / delete UI.
- NIP-44 encrypted private shelves (PRD §5.6 public/private toggle). Public-only slice stands; §11.3 file-hosting/encryption surfaces stay out.
- An activity feed / recent-activity stream and the genre-affinity chart (PRD §5.5 "Recent activity", §11.3 social feed). This story wires *counts only*, not a feed.
- Retiring the Mira fixture on the **public** profile route `/profile/:handle`. This story is `/profile/me` + the account dropdown only.
- A top-nav "Shelves" link. The user chose account-dropdown-only navigation; no top-level nav entry.
- Followers / following counts (PRD §5.5 lists them, but they need follow-graph reads out of this story's scope).

## Open questions
Resolve before approving the story.

- **Q1 (missing book in a shelf — for the Architect, AC-2):** When a shelf references a book slug with no resolvable catalog record, the PO position is "omit it and let the count reflect what is shown." Confirm this is acceptable, vs. showing a minimal placeholder card with just the slug. PO recommends omit-and-recount for honesty; flagged as a definitional choice for the Architect.
- **Q2 (deep link to shelves, AC-4):** "Your shelves" should anchor to the shelves section on `/profile/me`. The exact anchor mechanism (hash fragment + section id, scroll-into-view on mount) is an implementation detail for the Architect; the AC only requires landing on `/profile/me` at the shelves section.
- **Q3 (counts read cost):** Counting the user's own ratings/tags is a full author-scoped scan. At current staging volume this is trivial. If the Architect foresees this read getting hot, flag whether it should be combined into a single profile-stats read. Not a blocker for the story.

## Linked artifacts
- ADR: `engineering-team/decisions/0019-profile-polish.md`
- Test plan: `engineering-team/stories/done/19-profile-polish.test-plan.md`
- Review: `engineering-team/reviews/19-profile-polish.md` (PASS)
