# Story 96: The chrome frame splits from the content frame

**Origin:** operator staging review (2026-06-12): the app sits in a fixed 720px column that doesn't stretch with the browser; inside it the nav wraps "How it works" and "Submit a book" onto second lines.
**Block:** reader-guide refinement round 2 (book still open) — though the fix is app-wide chrome, not guide-only.

## Problem
One frame serves two jobs. `--page-max: 720px` is the reading column — correct for content — and the nav and footer are composed inside it, so six nav items plus search plus the account control fight for 672px of row and lose. The discipline (REDESIGN.md §5, ADR 0049) forbids the quick fix: a `max-width` in `Nav.css` is a hand-rolled page frame, exactly what `architecture-page-frame.test.ts` exists to catch.

## Acceptance criteria
1. A new page-geometry token `--chrome-max` joins `--page-max`/`--page-pad-x` (same block, same theme-untouchable status).
2. `Container` gains a typed `frame?: "page" | "chrome"` prop; default `"page"` renders byte-identical at every existing call site; `"chrome"` emits the centered chrome row from `Container.css` — the one allowlisted frame home.
3. Nav and footer become full-bleed bars (border edge to edge) wrapping a centered chrome row; on wide viewports the nav links sit on one line.
4. Routes compose chrome through one app-level `PageShell` (Nav + Container + Footer); the 18 hand-composed triples across 14 routes collapse to one composition site. ADR 0084's "third occurrence" threshold for a shell is superseded: the forced whole-surface restructure is the moment.
5. `architecture-page-frame.test.ts` extends to lock `--chrome-max` exactly as its siblings; REDESIGN.md's page-frame references (§2, §4, §5) updated so the capstone stays true.
6. Content column unchanged at 720px. Mobile unchanged by construction (the new max binds only above today's cap; the 860/540 nav breakpoints keep working).
7. All visual baselines regenerated via the documented Docker path in a separately labeled commit (intentional change).

## Out of scope
A wider guide content frame (separable, operator's call). Re-skinning the nav/footer (bespoke surfaces keep their look).
