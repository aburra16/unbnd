# Review: Story 96 — The chrome/content frame split

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-12

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · full workspace green (web 447, ui 20 incl. all guards) · build ok · guide scan unchanged.
- [x] Browser-verified at 1600px (nav on one line in the wide row, hairlines edge to edge, content column centered at reading width), at 375px (existing mobile behavior carries over exactly: search hidden, Submit + How it works collapsed, single column), zero console errors.
- [x] Baselines: 6 regenerated in the canonical image, labeled commit, intended delta stated; auth-welcome verified unchanged with the reason (AuthShell, no site chrome).

## Spec adherence (ADR 0086, against the REDESIGN.md discipline)
- [x] `--chrome-max: 1200px` lives in the page-geometry block beside `--page-max`/`--page-pad-x`, commented theme-untouchable.
- [x] `Container frame` is a typed prop; the default path emits `class="page"` byte-identical (tested), preserving the ADR 0049 zero-diff contract; the chrome-row rule lives in `Container.css`, the one allowlisted frame home. No hand-rolled frame anywhere.
- [x] **The page-frame guard grew with the geometry**: `var(--chrome-max)` is now locked to the same allowlist as its siblings. The discipline's promise (a second frame is impossible to hand-roll silently) extends to the new token.
- [x] Nav/Footer are full-bleed bars over `Container frame="chrome"` rows — structure changed, skin untouched, both still the documented bespoke token-backed surfaces.
- [x] **One `PageShell`** replaces all 18 hand-composed chrome triples across 14 routes (verified zero `<Nav />`/`<Footer />`/`<Container` left in routes). ADR 0084's wait-for-a-third-bug shell threshold is explicitly superseded in ADR 0086 §4 with the reasoning on record.
- [x] REDESIGN.md updated in step (§2 geometry note, §4 Container row + page-frame token row, §5 guard row, §7 nav/footer note) — the capstone stays self-contained and true.

## Findings
### Blocking
_None._
### Non-blocking
1. Loading/error early-returns now render the footer (PageShell keeps every return uniform; previously they composed the same triple, so this is no change — confirmed by the route counts: Nav=Footer in every file pre-migration).
2. The guide content column is still `--page-max`; a wider guide frame is one typed frame value away through the same seam if the operator wants it (named out of scope in the story).
3. `--chrome-max: 1200px` is a starting judgment; retuning is a one-token edit.

## Verdict
**PASS** — two frames, one discipline: the chrome got the width it needed without the content losing the measure it was designed for, and the guard that forbade this yesterday now enforces it.
