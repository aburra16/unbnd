# Story 94: The guide rail becomes a docs tree

**Origin:** operator review of the live guide on staging (2026-06-12), reader-guide book held open for a refinement pass.
**Block:** reader-guide refinement (book still open). Builds on story 93.

## Problem
The section-page rail lists only the current section's entries, so it reshuffles on every navigation, gives no sense of the whole guide, and the landing has no rail at all. Standard documentation UX is the opposite: one frozen tree everywhere, categories that expand and collapse, the page you are on visibly marked.

## Acceptance criteria
1. One tree, the same on every guide page (the landing included): all published sections as collapsible categories, their entries as sub-links, in published order.
2. The current section is expanded on arrival and visually marked; the other sections start collapsed; any section can be expanded or collapsed by the reader.
3. The entry you are reading is highlighted: scroll position drives it on section pages (the topmost entry in view), with the URL anchor as the initial state; the highlight moves as you scroll.
4. Expand/collapse and the current-entry mark are accessible (real disclosure semantics, `aria-current` on the active link), keyboard operable for free.
5. The existing breakpoint behavior holds: the tree hides below 880px; the landing's inline table of contents stays (it is the narrative's contents and the only contents narrow viewports see).
6. A guide section page joins the visual baselines (the first capture exercising the guide surface, the tree, and the chrome from story 93).

## Out of scope
Mobile guide navigation. Guide search. Persisting the reader's expand/collapse choices across visits.
