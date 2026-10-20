# ADR 0089: Book reviews are the shared kind 34259 record

**Status:** Accepted
**Date:** 2026-10-20
**Story:** `engineering-team/stories/99-book-reviews-shared-record.md`
**Supersedes:** ADR 0077 (the retraction idiom) and the rating parts of ADR 0011 (dcosl up-sync).

## Context
The places contract (Brainstorm-UI `docs/dictionary/food-and-drink-places-actions.md`) made kind 34259 the one review record for a place across Brainstorm and Regulars. The operator decided books follow it, in a sibling contract, `books-actions.md` (drafted 2026-10-20). Unbnd's 39999 rating predates both and is invisible to every other client. Facts checked live on 2026-10-20: dcosl refuses reviews; the index answers `#m` and `#k` filters under `search: "include:spam"`; another app already writes kind 34259 `m book` reviews with `d` `book:<address>` for kind 30040 publications, so the shape is in use and Unbnd's reader must skip reviews of books outside its catalog.

## Decision
1. **The record lives in `@unbnd/schemas` (`BookReview.ts`):** constants (`BOOK_REVIEW_KIND` 34259, mark `book`, the hub hint, the 1,200-character limit), `buildBookReviewTemplate` (new or edit: carry-over and date rule included), `buildBookReviewRemoval`, and the readers `starsOf` (Brainstorm's rule: `s` first, then `rating` as fraction or stars, 0 is none), `wordsOf` (content minus `imeta` addresses), `reviewedAddressOf` (`a`, else `d` with or without `book:`).
2. **The rules live in `@unbnd/trust` (`reviews.ts`): `standingReviews(events, { librarian, now })`** returns one `StandingReview` per person per catalog book after contract §4 and §6, from a mixed batch of reviews and removals. Signature checks happen at the boundary where events enter Unbnd's relay (strfry verifies on write; the sync verifies before writing), so the fold does not re-verify. `dedupeRatings` becomes a thin mapping over it; `countOwnRatings`, `ownRatedSlugs`, `scoreBySlug` and `scoresByAuthor` derive from it instead of repeating "newest per book". `weightedRatings` counts a weight only from `REVIEW_WEIGHT_LINE` (0.05, rank 5). `ParsedRating.score` and `PublicRating.score` become nullable for reviews without stars, which enter no average.
3. **Reads:** `apps/api/src/reviews/read.ts` turns a scope (one book by `#a`, some authors, or every book review by `#m`) into one relay read for reviews and one for those authors' kind 5 removals with `#k` `34259`, and hands both to the fold. The shelves worker does the same through its own relay module. No read filters by `z` any more.
4. **Writes:** the rating routes keep their paths and response shapes. The template route reads the person's current standing review and builds on it. The submit and remove routes validate the 34259 or kind 5 (kind, signature, author, catalog address, `book:` d, stars 1 to 5, words length; a removal must name the author's own current review). `publishReview` publishes locally, then fans out without waiting to the reviewer's write relays (`kind 10002`, read from the profile relays and cached for an hour; custodial accounts have none) and the review set. A guard refuses dcosl.
5. **Sync:** `apps/api/src/reviews/relay-sync.ts`, an unref'd timer like the maintenance sweeper. Each cycle pulls reviews and removals newer than a watermark (minus ten minutes' overlap; seven days back on start) from the review set, keeps signature-checked events whose address is a catalog book (removals: whose `a` is a book review address, or whose `e` names a review Unbnd holds), writes them to Unbnd's relay, then re-sends Unbnd's reviews and removals from the last two days to the index. `REVIEW_SYNC_INTERVAL_MS` (default two minutes; 0 disables).
6. **Retired:** `BookRating.ts`, `isRatingRetraction`, the `book-ratings` header slug, its dcosl up-sync filter (`ops/cron/unbnd-upsync` keeps tag assertions) and its count in `health/upsync.ts`.

## Consequences
- Unbnd reviews are readable by any client that reads the shared record; Brainstorm's book view sees them once it adopts the contract.
- Reviews written elsewhere about catalog books appear in Unbnd within a sync cycle, weighted by the same lens.
- Until story 100 runs, the 17 legacy ratings are not shown.
- The local relay holds reviews it did not originate; it already holds every list item, so this is in character.
