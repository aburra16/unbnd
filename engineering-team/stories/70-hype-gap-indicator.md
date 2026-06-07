# Story 70: Hype-gap indicator on book detail

**Status:** Approved
**Created:** 2026-06-06
**Type:** Feature

## Background
On a book detail page, a reader weighs a book through the crowd and through people they trust. The hype-gap makes the difference visible: where the viewer's trusted network rates a book well above the mainstream (a hidden gem) or well below it (overhyped). PRD §5.2 / §7. This is the Trusting Reader's "is this actually good, or just popular" judgment (journey 4.2 step 2), and the most defensible thing Unbnd can show that a platform without a trust layer cannot. The book page already fetches the raw community average and the observer-weighted (trusted) average with a trusted-rater count; this story classifies and renders the gap. The Hidden Gems homepage shelf is the next story (#71).

Anchor: `product-team/prd/social-loop.md` §5.2, §7. Wireframe: `social-loop-wireframes.html#book`.

## User-facing description
As a Trusting Reader, I want to see when the people I trust rate a book very differently from the crowd, so that I can spot hidden gems and avoid the overhyped.

## Acceptance criteria
- [ ] When the trusted average exceeds the crowd average by a meaningful margin, the book shows a "hidden gem" signal.
- [ ] When the crowd average exceeds the trusted average by a meaningful margin, the book shows an "overhyped" signal.
- [ ] When the two are close (consensus), no signal shows.
- [ ] The signal reflects the active House/Yours viewpoint.
- [ ] The signal appears only when a handful of trusted raters stand behind the trusted average; below that, nothing shows.
- [ ] The signal pairs color with a text label, so it is legible without color.

## DList shapes touched
- Reuses the existing `book-ratings` (the raw + observer-weighted averages the book page already reads). No new concept; the hype-gap is a derived classification.

## Out of scope
- The Hidden Gems homepage shelf (#71).
- The shareable-card / unfurl rating (#72).
- Any change to how the trust-weighted average itself is computed.

## Open questions
1. **Meaningful margin:** how far apart the trusted and crowd averages must be before a signal shows (vs consensus). Recommendation: a configurable star delta, start at 0.5. Architect/config.
2. **Trusted-rater minimum:** the "handful" threshold for showing the signal at all. Recommendation: reuse an existing trusted-count bar rather than a new knob where one fits.

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
