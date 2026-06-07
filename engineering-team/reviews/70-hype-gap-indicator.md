# Review: Story 70 — Hype-gap indicator on book detail

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-06
**Diff:** `git diff main...HEAD` (commit `937270e`)
**Story:** `engineering-team/stories/done/70-hype-gap-indicator.md`
**Test plan:** `engineering-team/stories/done/70-hype-gap-indicator.test-plan.md`

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` — **pass** (exit 0).
- [x] `pnpm -r test` — **pass** (exit 0; `@unbnd/web` 349, `@unbnd/ui` 20 guards green). No existing test regressed.
- [x] `pnpm --filter @unbnd/web build` — **pass** (~0.6s).

## Spec adherence
- [x] Every AC has a passing test. AC-1/2 (hidden-gem / overhyped): `classifyHypeGap` + `HypeGapIndicator`. AC-3 (consensus → nothing) + AC-5 (below trusted-rater min → nothing): unit + component. AC-4 (House/Yours): inherited — the indicator consumes `RatingsPanel`'s active-perspective summary (`active.average` raw, `w.average`/`w.trustedCount` trusted). AC-6 (colour + text): the text label carries the meaning; colour is an additive dot.
- [x] Purely additive (256 insertions, 0 deletions); no behaviour beyond the story.

## ADR adherence (0068)
- [x] Web-only pure classifier (`view-model.classifyHypeGap`) + a presentational `HypeGapIndicator`, placed in `RatingsPanel` — exactly Option A. No new endpoint, no new DList shape, no env config (web constants `HYPE_GAP_MARGIN = 0.5`, `HYPE_GAP_MIN_TRUSTED = 2`, documented and single-sourced). No new dependency.

## UI integrity
- [x] `HypeGapIndicator.css` is token-only (`--u-space-2/3`, `--u-muted`, `--u-font-size-13`, `--signal-positive` / `--signal-negative`) — no hex, color guard green. The "●" is a typographic glyph, not an icon library or emoji. Colour is paired with a text label (legible without colour).
- [x] Copy ("Hidden gem · …", "Overhyped · …") passes the no-slop rules — middot separators, no em dashes, concrete. No raw GrapeRank number on the wire (a derived classification, not a trust score).

## Things tests can't catch
- [x] Pure, side-effect-free classifier; honest silence on no-trusted-average and below-threshold. POV-first (inherits the active perspective). No secrets, no debug logging.

## House rules check
- [x] PRD scope discipline, POV-first, no new tooling.

## Findings

### Blocking
None.

### Non-blocking
1. The `RatingsPanel` now renders `HypeGapIndicator`. The Playwright visual baseline (`book-detail`) is signed-out / house-raw with no trusted average → the indicator returns `null` → expected zero-diff. Worth a glance at the `visual` CI job on merge, but no baseline change is anticipated.

## Verdict
**PASS** — the diff matches the story, ADR 0068, and the test plan; all gates clean; no blocking issues; no regressions. Mergeable as-is.
