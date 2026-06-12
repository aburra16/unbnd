# Story 93: The guide joins the site chrome

**Origin:** operator review of the live guide on staging (2026-06-12), reader-guide book held open for a refinement pass.
**Block:** reader-guide refinement (book still open).

## Problem
The guide shipped reachable only through the footer, and the guide pages themselves render without the site's top nav or footer. A reader who lands on /guide has no way back to the catalog except the browser, and a visitor scanning the top nav never learns the guide exists. Footer links are where links go to be ignored.

## Acceptance criteria
1. The top nav carries a permanent "How it works" link to /guide, placed after Browse, visible signed in and signed out, styled as the existing nav links.
2. The footer's guide door is renamed "How it works" — one name for one door, site-wide.
3. Every guide page (the landing and all section pages) renders the same top nav and footer as the rest of the site.
4. Existing nav responsive behavior is preserved (the link collapses with the other nav links at the existing breakpoints, no new breakpoint logic).
5. Visual baselines refreshed (the nav link and footer rename appear on every captured screen) — intentional-change refresh in the canonical environment.

## Out of scope
The left-rail redesign (story 94). Mobile-specific guide nav.
