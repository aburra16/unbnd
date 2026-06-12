# Review: Story 94 — The guide rail becomes a docs tree

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-12

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · full workspace suite green (web 440) · build ok · guide scan unchanged (0 errors, 5 standing flags; no content touched).
- [x] **Two architecture guards fired during the story and both were right**: the type-literal guard caught a raw `font-weight: 600` (now `--u-font-weight-semibold`, raw value 600, so the captured baseline stays pixel-true); the #93 run of the shape guard had already set the precedent. New chrome keeps testing the token discipline and the discipline keeps holding.
- [x] **Browser-verified live, not just DOM-tested**: navigated the dev server at 1280px — all 8 sections frozen in the rail, current section open and amber, others collapsed with visible carets, toggle works, the active-entry highlight moved from "Unbnd house view" to "Taste match" on a real scroll (the IntersectionObserver path, which happy-dom cannot exercise). Zero console errors. Under 880px the tree hides, as before.

## Spec adherence (ADR 0085)
- [x] One `GuideTree` on every guide page, landing included; the per-section "In this section" rail is gone (asserted).
- [x] Native `<details>`/`<summary>` disclosure: current section `open` on arrival + `guide-tree-current` mark; the rest start collapsed; toggle is the platform's (tested via real summary clicks).
- [x] `aria-current="location"` on the active entry; the CSS highlight keys off the attribute — one claim, asserted in tests and verified visually.
- [x] `useActiveEntry`: URL hash is the initial value (tested), scroll-spy via IntersectionObserver where available (verified live), the no-IO fallback is the testable contract as the ADR states.
- [x] The landing keeps its inline TOC (narrative contents + the only contents under 880px); asserted alongside the tree's presence.
- [x] **`guide-section.png` joins the visual baselines** — the first capture of the guide surface (tree + measure + #93 chrome together), closing the gap the #92 review flagged. The other six baselines verified unchanged in the same canonical run.

## Findings
### Blocking
_None._

### Caught and fixed during the story
1. **Invisible carets**: the default disclosure marker hangs outside the content box and the tree's `overflow-y: auto` clipped it — the tree read as a list of plain links, defeating the requested affordance. Caught only in browser verification (markers are paint, not DOM; no test sees them). Fixed with `list-style-position: inside`. The new visual baseline now pins the carets.
2. One stale assertion, same class as #93's: the landing test's `getByText` for an entry name now matches the inline TOC and the tree; rewritten to assert presence rather than uniqueness, with the reason in place.

### Non-blocking
1. Expansion state resets on navigation (the tree remounts; the new current section opens, reader toggles are forgotten). Standard docs behavior and explicitly out of scope; persisting it is a one-hook follow-up if readers ever ask.
2. The scroll-spy's "reading band" (`rootMargin -60%`) is a judgment constant; if entries ever get very short, two could share the band. Fine at current content lengths.

## Verdict
**PASS** — the guide now reads like documentation: one tree, your place marked, nothing reshuffling underfoot.
