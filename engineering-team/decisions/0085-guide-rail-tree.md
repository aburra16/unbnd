# ADR 0085: The guide tree — disclosure-native, scroll-aware, one everywhere

**Status:** Accepted
**Date:** 2026-06-12
**Story:** `engineering-team/stories/94-guide-rail-tree.md`

## Context
ADR 0081 §2 gave section pages a per-section rail ("In this section"). Operator review found it disorienting: the rail changes contents as you move, and the landing has none. The refinement aligns the guide with standard documentation UX: one stable tree, disclosure per category, the reader's position marked.

## Decision
1. **One component, `GuideTree`** (`apps/web/src/guide/GuideTree.tsx`), rendered by both GuideLanding and GuideSection in the rail slot. Props: the published sections (from `useGuide`), `currentSlug` (undefined on the landing), `activeAnchor`. It replaces the per-section rail entirely.
2. **Native disclosure elements.** Each section is a `<details>`/`<summary>`: the platform's expand/collapse semantics, keyboard behavior, and state for free — no open/closed React state to maintain, no ARIA wiring to hand-roll. The current section gets `open` on mount and a `guide-tree-current` class on its summary; the rest start closed. The caret is the summary marker, styled.
3. **The active entry carries `aria-current="location"`**; CSS keys the highlight off the attribute, so the accessibility claim and the visual claim are the same claim.
4. **Scroll-spy is a hook, `useActiveEntry(anchors)`**, owned by GuideSection (it owns the entry sections): an IntersectionObserver picks the topmost entry heading in view; the URL hash is the initial value; environments without IntersectionObserver (happy-dom) keep the hash value — which is also the testable contract. The hook returns the anchor; GuideSection threads it to the tree. The landing passes none.
5. **The landing keeps its inline table of contents.** It is part of the narrative ("ends in the full table of contents", PRD §5.1) and the only contents narrow viewports get (the rail hides under 880px, unchanged). Redundancy with the tree on wide screens is the cheap side of the trade.
6. **A `guide-section` visual baseline** (the ratings-you-can-trust page): the first capture of the guide surface. Static bundled content, deterministic by construction; the same signed-out mock fan-out as the other captures. Closes the #92 review's noted gap (no baseline exercised any guide chrome) for the tree, the measure, and the site chrome together.

## Consequences
- `guide-rail` CSS evolves into tree styles; the rail's width/sticky/breakpoint rules carry over.
- GuideSection's "In this section" rail and its `aria-label` go; the tree's nav is labeled "Guide contents".
- New baseline added; existing six untouched (no non-guide surface changes).
- No new dependency. No content change, so no taxonomy pass (code-only story… except the tree renders entry names, which are already published content).
