# ADR 0084: The guide joins the site chrome — "How it works"

**Status:** Accepted
**Date:** 2026-06-12
**Story:** `engineering-team/stories/93-guide-site-chrome.md`

## Context
ADR 0081 built the guide surface as standalone routes; #85 added the three doors (footer, About cross-link, auth line). Operator review of staging found the footer door insufficient (low-attention real estate) and the missing chrome on guide pages an outright trap: no path back to the site. The site has no shared layout shell — every route composes `<Nav />`/`<Footer />` itself — so the guide routes simply never did.

## Decision
1. **The nav label is "How it works."** It answers the question a Goodreads arrival actually has (why are there two numbers on this book?) rather than assuming they know a guide exists. Rejected: "Guide" (label assumes the destination), "Docs"/"Help" (the banned SaaS chrome register). The guide page keeps its own title, "The Reader's Guide" — a menu label is a question, a title is a name; the pattern is ordinary (a "Docs" tab opening "Developer Documentation").
2. **One name for one door:** the footer link renames from "Guide" to "How it works". The About page's prose sentence ("The guide walks through…") stays — prose describing the thing, not a labeled door.
3. **Placement:** after Browse, before "Submit a book" — reading order matches a visitor's order of needs (look around → understand → contribute).
4. **Chrome on guide pages by composition, not a new shell.** GuideLanding and GuideSection render `<Nav />` and `<Footer />` exactly as every other route does. Introducing a layout shell to fix two routes is a refactor this story does not need; if a third missing-chrome bug ever appears, that is the moment for a shell story.

## Consequences
- All six visual baselines change (every captured screen shows the nav and footer); refreshed per ADR 0039's canonical procedure.
- The #85 doors test's footer assertion updates to the new name.
- No content change: no guide entry references the footer door by name (verified by grep before this ADR).
