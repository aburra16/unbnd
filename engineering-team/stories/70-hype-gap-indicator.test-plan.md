# Test Plan: Story 70 — Hype-gap indicator on book detail

**Story:** `engineering-team/stories/70-hype-gap-indicator.md`
**ADR:** `engineering-team/decisions/0068-hype-gap-indicator.md`
**Date:** 2026-06-06

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (hidden gem) | `classifyHypeGap … hidden-gem`; indicator `renders a Hidden gem signal` | `apps/web/test/components/hype-gap.test.tsx` | unit + component |
| AC-2 (overhyped) | `classifyHypeGap … overhyped`; indicator `renders an Overhyped signal` | same | unit + component |
| AC-3 (consensus → nothing) | `consensus when within the margin`; indicator `renders nothing on consensus` | same | unit + component |
| AC-4 (House/Yours viewpoint) | inherited: `HypeGapIndicator` consumes the active-perspective summary in `RatingsPanel` (the panel's House/Yours toggle is already covered by `ratings-panel.test.tsx`) | — | (architecture) |
| AC-5 (trusted-rater minimum) | `null below the trusted-rater minimum`; indicator `renders nothing below the minimum` | same | unit + component |
| AC-6 (color + text) | the indicator renders text labels ("Hidden gem" / "Overhyped"); color is an additive dot, so the signal is legible without color | component | component |

## Edge cases
- [x] `null` when there is no trusted average (no PoV signal yet).
- [x] Margin boundary: a gap of exactly `HYPE_GAP_MARGIN` classifies as a signal (≥).
- [x] Consensus and below-threshold both render nothing.

## Test infrastructure
- Vitest. The classifier is a pure function in `view-model.ts`; the indicator is a presentational component (no api/session mock needed — it takes the raw/trusted averages + count as props). AC-4 (observer relativity) is structural: the indicator reads the active summary in `RatingsPanel`, whose toggle is already tested.

## How to run
```
pnpm --filter @unbnd/web exec vitest run test/components/hype-gap.test.tsx
pnpm -r test && pnpm -r typecheck
```

## Verification
Feature tests fail with the current (stub) code for the right reason (classifyHypeGap throws; the indicator returns null), typecheck clean, no existing test regressed. Confirmed 2026-06-06 (pre-implementation):
```
apps/web components/hype-gap.test.tsx   7 failed | 2 passed (the 2 are the consensus / below-threshold "nothing" guards)
apps/web full: 1 failed | 58 passed     pnpm -r typecheck → EXIT 0; color guard green
```
