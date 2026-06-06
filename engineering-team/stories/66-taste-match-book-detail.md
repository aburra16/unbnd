# Story 66: Taste Match on book detail, and taste-sorted raters

**Status:** Approved
**Created:** 2026-06-06
**Type:** Feature

## Background
Story #65 put a taste match on a person's profile. The book detail page is where a reader weighs whether to trust a book's ratings, so the same signal belongs on each rater and reviewer byline there: "this 5-star came from someone who reads like you." PRD §5.2 specifies taste-match chips on bylines and the ability to order raters and reviews by best taste match alongside the existing trust order. This deepens the Trusting Reader's "is this recommendation actually for me" judgment (journey 4.2 steps 2–4). Reuses the `computeTasteMatch` metric from ADR 0064. Wireframe: `social-loop-wireframes.html#book`.

## User-facing description
As a Trusting Reader, I want to see how closely each person who rated a book matches my taste, and to sort the raters and reviews by that match, so that I can weigh a book through the people who read like I do, not just the crowd or the broadly trusted.

## Acceptance criteria
- [ ] On a book detail page, each rater and reviewer byline shows that person's taste-match to the signed-in viewer.
- [ ] A signed-in viewer can switch the order of the raters and reviews between "Most trusted" and "Best taste match."
- [ ] The default order is most trusted.
- [ ] A byline whose match is below the overlap threshold shows no match chip (not a zero).
- [ ] A signed-out viewer sees neither byline matches nor the sort control.

## DList shapes touched
- `kind:39999` — `book-ratings` (read only; the book's raters, plus the viewer's own ratings, are the input to the per-rater match).
- No new concept. Reuses the derived `computeTasteMatch`; whether/how to batch the per-rater computation is the Architect's call.

## Out of scope
- The profile taste-match chip (shipped in #65).
- The hype-gap / hidden-gems signal (#70).
- The trust-weighted taste-match variant (raw agreement, per ADR 0064).
- Changing how the trust order itself is computed.

## Open questions
1. **Batching:** a book can have many raters, so the per-byline match wants one batched computation (the viewer vs all of the book's raters) rather than N round-trips. The exact endpoint shape is the Architect's call; the product intent is one efficient read per page.

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
