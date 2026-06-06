# Story 65: Taste Match on curator profiles

**Status:** Approved
**Created:** 2026-06-06
**Type:** Feature

## Background
Following a curator today signals only that the community trusts them, not that they read like you do. The Phase 3 PRD makes the social layer personal: §5.1 adds a Taste Match chip to the profile, §6 defines Taste Match as a derived, observer-relative measure of rating agreement, and §7 binds it to the House/Yours viewpoint and the no-fake-data honesty rule. This is the payoff that converts a Founding Curator's favor into genuine interest (journey step 3) and gives the Trusting Reader their first "they read like I do" moment. First story of the `social-loop` book (`engineering-team/audits/social-loop/book.md`); the end-to-end demo of the loop.

Anchor: `product-team/prd/social-loop.md` §5.1, §6, §7. PRD open question 1 (overlap threshold) is resolved here as a configurable minimum.

## User-facing description
As a reader (Founding Curator or Trusting Reader), I want to see how closely my taste matches a person when I view their profile, so that I can tell whether they read like I do, not just whether the community trusts them.

## Acceptance criteria
- [ ] Given a signed-in viewer and a profile whose owner shares at least the minimum number of co-rated books, when the viewer opens that profile, then a taste-match percentage and the count of books in common are shown.
- [ ] Given two people who agree closely on the books they have both rated, when the match is shown, then the percentage is higher than for two people who often disagree (the score reflects rating agreement from the viewer's viewpoint).
- [ ] Given fewer than the minimum co-rated books, when the viewer opens the profile, then "Not enough overlap yet" is shown instead of a percentage.
- [ ] Given a signed-out visitor, when they open any profile, then no taste-match element is shown.
- [ ] Given the viewer rates more books the profile's owner has also rated, when they reopen the profile, then the taste match reflects the new overlap.

## DList shapes touched
- `kind:39999` — `book-ratings` (read only; the co-rated set and rating values are the input).
- No new concept. Taste Match is a derived, observer-relative computation; whether to cache it is the Architect's call.

## Out of scope
- The trust-weighted taste-match variant (v1 uses raw rating agreement; the trust-graph-weighted version is a later story).
- Taste match on book-detail bylines and taste-sorted raters (Story #66).
- The hype-gap / hidden-gems signal (a different computation, Block 2).
- Does not touch any PRD out-of-scope area (payments, file hosting); no re-scope needed.

## Open questions
1. **Minimum overlap threshold** (PRD open question 1): ship a configurable minimum starting at **5 co-rated books**, tunable without a code change. (PO recommendation, approved.)
2. **v1 metric is raw agreement** on co-rated books; the trust-weighted variant is deferred. The exact agreement formula is the Architect's call; product intent is "higher means they agree more often." (PO recommendation, approved.)

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
