# ADR 0083: One quiet affordance, seven placements

**Status:** Accepted
**Date:** 2026-06-12
**Story:** `engineering-team/stories/92-guide-contextual-links.md`

## Decision
1. **One shared component, `GuideLink({ to, label })`** (`apps/web/src/components/GuideLink.tsx`): a small muted circled "?" rendered as a router `Link` to a guide anchor, `aria-label` "{label}: the guide explains". One class (`guide-what`), tokens only, the same quiet weight everywhere. Uniformity IS the quietness: readers learn the mark once.
2. **The seven placements** (each beside its surface's existing text, never replacing it):
   - `PoVBar` ("Showing: ..." line) → `ratings-you-can-trust#unbnd-house-view`
   - `TasteMatchChip` gains `withGuideLink` (default false; true on the PROFILE placement only; review-bylines stay dense) → `#taste-match`
   - `HypeGapIndicator` → `#hidden-gem-and-overhyped`
   - The profile's "N trusted people vouched" line → `for-curators#vouching`
   - `TagControl`: one link beside the chips when any chip is contested → `rating-reviewing-tagging#contested` (BookHeader's hero chips stay clean; TagControl is where tags are examined)
   - `TagControl`'s reviewed-signals area → `#reviewed-signals`
   - "Removal queued" in `PromoteCell` and the requested state in `DemoteControl` → `for-curators#removing-a-book-from-the-catalog`
3. **Signed-out behavior** follows the host surface: the PoVBar and hype-gap render signed out, so their links do; curator-only surfaces carry theirs only where they render.
4. **Visual baselines**: the PoVBar mark appears on captured screens → the documented intentional-refresh path runs with this story.

## Out of scope
Tooltips, modals, hover cards; any surface not on the PRD §5.5 list.
