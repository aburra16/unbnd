# ADR 0086: The chrome frame — a second sanctioned page geometry

**Status:** Accepted
**Date:** 2026-06-12
**Story:** `engineering-team/stories/96-chrome-content-split.md`

## Context
ADR 0049 made Container the one shared page frame (`.page`, `--page-max: 720px`), and the page-frame guard enforces that no other frame is hand-rolled. That was right when every page was one reading column. The nav has since grown (Curate at #68, "How it works" at #93) and wraps inside the column; the operator flagged the fixed boundary itself. The standard resolution — chrome spans wide, content stays narrow — requires a second frame, which under the current guard is by definition a violation. So the second frame must become a first-class citizen of the same discipline, not an exception to it.

## Decision
1. **`--chrome-max: 1200px`** joins the page-geometry block in `tokens.css`. Page geometry, not skin: themes must not redefine it (same rule as `--page-*`, REDESIGN.md §3b).
2. **Container owns both frames.** A typed `frame?: "page" | "chrome"` prop (default `"page"`; the default path emits `class="page"` byte-identical to today — the ADR 0049 zero-diff contract holds). `frame="chrome"` emits `class="chrome-row"`: `max-width: var(--chrome-max); margin: 0 auto; padding: 0 var(--page-pad-x)`. The rule lives in `Container.css`, the allowlisted frame home; `className` stays additive layout-only.
3. **Nav and Footer restructure to bar + row.** The outer `<nav>`/`<footer>` is a full-bleed bar carrying the border and vertical rhythm; the inner `Container frame="chrome"` row carries the flex layout. Both remain bespoke token-backed surfaces (REDESIGN.md §7) — this is structure, their skin is untouched.
4. **One `PageShell`** (`apps/web/src/components/PageShell.tsx`, app-level, not a primitive): `<Nav /> <Container>{children}</Container> <Footer />`. All 18 route compositions collapse into it. This supersedes ADR 0084 §4's wait-for-a-third-bug threshold: the whole surface is being restructured anyway, and the shell removes the forgot-the-chrome bug class (#84's guide routes) permanently. Auth surfaces keep AuthShell; the bespoke `.rate` frame is untouched.
5. **The guard grows with the geometry.** `architecture-page-frame.test.ts` locks `var(--chrome-max)` to `Container.css` exactly as it locks the other two tokens. REDESIGN.md §2/§4/§5 updated in the same story.

## Consequences
- Every captured screen changes (full-bleed borders, wider nav row at the 1280px viewport): all 7 baselines regenerate via the documented intentional-change path, in a labeled commit.
- Loading/error early-returns gain the footer (they composed Nav-only triples identically, so PageShell keeps them uniform — a deliberate, uncaptured improvement).
- A future wider guide frame is one more typed frame value away, through the same seam.
- 1200px is a starting judgment; retuning is a one-token edit.
