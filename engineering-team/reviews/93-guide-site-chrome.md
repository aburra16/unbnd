# Review: Story 93 — The guide joins the site chrome

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-12

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · web 433/433 · guide scan 0 errors, 5 standing flags · build ok.
- [x] Visual refresh in the canonical pinned image: 5 baselines changed (home, book-detail, profile, search, submit — the nav link + footer rename), auth-welcome verified unchanged with the reason traced (auth surfaces compose AuthShell, never the site chrome; their guide door is the #85 in-card line).

## Spec adherence (ADR 0084)
- [x] "How it works" in the top nav, after Browse, both auth states (tested), href /guide.
- [x] Footer door renamed to match — one name for one door. The #85 doors test updated, not deleted (it still pins the door's existence and target).
- [x] GuideLanding + GuideSection render `<Nav />` + `<Footer />` by the same per-route composition every other page uses; both tested via full route renders.
- [x] No new breakpoint logic: at ≤540px the link collapses alongside Submit (the existing pattern). Phones keep the footer door and the contextual marks.

## Findings
### Blocking
_None._
### Non-blocking
1. One stale assertion surfaced as designed: the empty-guide test counted page-wide links and the chrome added nine; it now scopes to `.guide-toc`. The assertion is stronger for it.
2. The site still has no shared layout shell (every route composes its own chrome). Two routes missing it was a bug, not yet a pattern; ADR 0084 names the threshold for a shell story (a third occurrence).

## The staying-current rule
- [x] No guide entry names the footer door (verified by grep before ADR 0084), so no content change. The About and auth prose mentions describe the guide rather than label the door; they stand.

## Verdict
**PASS** — the guide is one click from every page, and every page is one click from the guide.
