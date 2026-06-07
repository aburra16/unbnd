# Story 71: Hidden Gems homepage shelf

**Status:** Approved
**Created:** 2026-06-06
**Type:** Feature

## Background
Story #70 surfaced the hype-gap on a single book page. This story makes discovery out of it: a homepage shelf of the books the viewer's trusted network loves that the crowd has missed (the highest positive hype-gap), from the active viewpoint. PRD §5.3 / §7. This is the Trusting Reader's "show me what my people rate far above the mainstream" surface (journey 4.2 step 4) and the discovery payoff of the whole trust layer. The homepage already runs scheduled, per-observer shelves through the off-path `apps/shelves` worker + the cached serve route (Story 35 / ADR 0036); this adds a Hidden Gems shelf to that machinery.

Anchor: `product-team/prd/social-loop.md` §5.3, §7. Wireframe: `social-loop-wireframes.html#home`.

## User-facing description
As a Trusting Reader, I want a homepage shelf of books my trusted network rates far above the crowd, so that I can discover hidden gems I would never find through popularity.

## Acceptance criteria
- [ ] The homepage shows a Hidden Gems shelf of books with the highest positive hype-gap (trusted average above the crowd's raw average) from the house viewpoint.
- [ ] When empty, the shelf shows an on-ramp explaining what will appear and that following curators starts it.
- [ ] The shelf refreshes on a schedule, not per request (computed by the off-path `apps/shelves` worker into the per-observer cache).

> Scope (ADR 0069, Option A, PO-approved): #71 delivers the **House** Hidden Gems shelf (scheduled). The **Yours** per-user variant (read-time, like For-You — "surfaces different books under each viewpoint") is a thin fast-follow, **#71b**.

## DList shapes touched
- Reuses `book-ratings` (raw + observer-weighted averages), computed by the off-path `apps/shelves` worker into the per-observer homepage cache. No new concept.

## Out of scope
- The book-detail hype-gap indicator (#70, shipped).
- Any change to the trust-weighted average computation or the existing shelves (Trending / Favorites / genre rows).
- The Yours read-time per-user Hidden Gems (fast-follow #71b, per ADR 0069 Option A).

## Open questions
1. **Ranking + gate:** rank by the size of the positive hype-gap (trusted − raw), among books with a meaningful gap and enough trusted raters. Recommendation: reuse #70's classification idea (the margin + trusted-rater minimum) server-side in the worker, rather than a new knob set.
2. **Cache shape:** whether Hidden Gems is a new row in the existing per-observer homepage cache or a sibling. Architect's call against the `apps/shelves` worker.

## Linked artifacts
- ADR: `engineering-team/decisions/0069-hidden-gems-shelf.md` (Accepted)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
