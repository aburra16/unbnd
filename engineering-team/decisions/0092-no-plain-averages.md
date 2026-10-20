# ADR 0092: No plain averages; the crowd is readers with standing

**Status:** Accepted
**Date:** 2026-10-20
**Story:** `engineering-team/stories/101-no-plain-averages.md`
**Amends:** ADR 0014 (raw fallback), ADR 0068 (hype gap), ADR 0069 (Hidden Gems), ADR 0070 (unfurl card)

## Context
Story 99 put Unbnd's ratings on the shared review record and drew the counting line at rank 5 (ADR 0089). The plain mean, every rating counted equally, survived in three reads: the book page's fallback when nobody trusted has rated, the link-preview card, and the "crowd" side of the hype gap (book page and Hidden Gems). It is the one figure a stranger can set by minting keys. The operator decided (decision 6): no number when a book has no trusted ratings; the hype gap's crowd is reviewers with any rank above zero, counted equally.

## Decision
1. **The crowd mean lives on the trusted view.** `WeightedRatings` (`@unbnd/trust`) gains `crowdAverage` and `crowdCount`: the unweighted mean and count of starred reviews whose weight from the observer is above zero. Every counted reviewer (weight ≥ the rank-5 line) is in the crowd, so the crowd is never empty when the trusted view exists, and both sides of the gap come from one fold over one weight map.
2. **Both hype-gap readers use it.** The web's `classifyHypeGap` takes the crowd mean in place of the plain mean; the shelves worker's Hidden Gems gap is `weighted.average − weighted.crowdAverage`. Margin and minimum are unchanged.
3. **`RatingsSummary` drops `average`.** The API helper becomes `summaryFromParsed` (count of starred reviews and the standing reviews). One route helper, `houseSummary`, builds the public summary with the trusted view (house vantage, or `?observer=` on the read), degrading to no trusted view on a trust failure. The read, submit and remove routes all answer with it, which also ends the post-write drop to the plain branch.
4. **The book page shows a count without a figure** when the active view has no trusted view: `RatingsBlock` renders the count alone when given no average.
5. **The unfurl card reads the house view.** The unfurl readers take the trust provider and house observer; the card's rating line is `★ <trusted average> · <n> trusted ratings` when the house view exists, else `<n> ratings`, else nothing. A trust failure or no configured trust gives the count line.

## Alternatives rejected
- **Keep the plain mean in the API and stop rendering it.** A public field invites the next client to show it; the contract with our own web app should carry only what it may show.
- **Weight the crowd by rank too.** That makes the crowd a second trusted average with a lower line, and the gap would shrink toward zero. Equal counting above zero is what the operator chose: standing admits a reader to the crowd, and inside it each reader is one voice.
- **Leave the unfurl card viewer-independent with the count only.** It would drop the trusted figure that the book page shows to every anonymous visitor.

## Consequences
- A book rated only by keys with no standing shows a count and reviews, and never a gem line or a shelf slot.
- Unfurl now makes one trust read per preview; the provider's caching keeps it cheap, and a failure falls back to the count.
- The guide entries describing the community figure and the everyone-average are rewritten in the same story.
