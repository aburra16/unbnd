# Story 101: No plain averages

**Origin:** review-kind decision 6 (operator, 2026-10-20), carried out of Story 99 ("Out of scope: no number without trusted ratings, and the hidden gem / overhyped wider network").

## Problem
Two places still show or compare against the plain mean of every rating, from anyone, counted equally:

1. **A book with no trusted ratings shows the plain mean.** The book page falls back to "Community consensus from all ratings" with a star figure, and the link-preview card (`og:description`, Story 72) always prints the plain mean. Anyone can mint keys and rate, so that figure is the one number on the page a stranger can set.
2. **The hype gap compares against the plain mean.** "Hidden gem" and "Overhyped" on the book page (Story 70) and the Hidden Gems homepage shelf (Story 71) measure the trusted average against the plain mean, so a handful of fresh keys rating a book 1 or 5 can make or break a gem.

A related fault: after a reader rates or removes a rating, the rating routes answer with the plain summary and no trusted view, so the panel drops to the plain branch until the page reloads.

## Acceptance criteria
1. **No number without trusted ratings.** When the active view has no counted rating with stars, the book page shows how many ratings there are and the reviews, with no star figure. The link-preview card shows the house view's trusted average when there is one, else only the count; a trust failure gives the count only.
2. **The crowd is readers with any standing, counted equally.** The trusted view carries a crowd mean: the plain mean of the stars from reviewers whose weight in that view is above zero (rank > 0), each counted once. The hype gap on the book page and the Hidden Gems shelf compare the trusted average against it. A key with no standing never moves either.
3. **The plain mean leaves the public API.** `GET /api/books/:slug/ratings` and the submit and remove responses carry no plain `average`; every one of them returns the same summary, with the trusted view for the house vantage when trust is configured.
4. **Guide entries say what the page now does**, written through the two-pass taxonomy process: the landing page's "Why the numbers here are different", *What Unbnd is*, *Trusted ratings and community consensus*, *Hidden gem and Overhyped*, *Hidden Gems* and *The book page*.

## Out of scope
- Changing the rank-5 line, the hype-gap margin or the trusted-rater minimum.
- The "Yours" empty state, which already shows no number.
