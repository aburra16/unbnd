# ADR 0068: Hype-gap indicator on book detail

**Status:** Accepted
**Date:** 2026-06-06
**Story:** `engineering-team/stories/70-hype-gap-indicator.md`

## Context

Story #70 shows a hidden-gem / overhyped / consensus signal on book detail from the gap between the crowd's raw average and the viewer's trusted (observer-weighted) average. The book page already has both: `useBookRatings` (`apps/web/src/hooks/useBookRatings.ts`) holds the active-perspective `RatingsSummary`, whose `average` is the raw community mean and whose `weighted` (`{ average, trustedCount }`, PoV-dependent) is the trust-weighted view. `RatingsPanel` already toggles House/Yours and derives those values (ADR 0025/0036). So the hype-gap is a pure classification over data the client already has — no server round-trip, no new DList shape.

## Options considered

### Option A — Web-only pure classifier + a presentational indicator (chosen)
A pure `classifyHypeGap(rawAverage, trustedAverage, trustedCount)` in `view-model.ts` returning `"hidden-gem" | "overhyped" | "consensus" | null`, and a `HypeGapIndicator` reading the active perspective's `RatingsSummary` in `RatingsPanel`. Observer-relativity is free: it consumes whichever (House/Yours) summary is active.
- **Pros:** zero new endpoint/shape; reuses the exact raw + weighted values the panel already computes; observer-relativity inherited from the existing toggle; trivially testable as a pure function.
- **Cons:** the margin/min thresholds live as documented web constants (no env config in the web app, unlike the API). Acceptable for a display threshold; promote to API-served config only if tuning demands it.

### Option B — A server-computed hype-gap endpoint
- **Cons:** duplicates the raw + weighted read the book page already performs; adds a per-PoV server computation for a pure display classification. Rejected.

## Decision

**Option A.** `classifyHypeGap` returns `null` when there is no trusted average or fewer than `HYPE_GAP_MIN_TRUSTED` trusted raters; `"consensus"` when `|trusted − raw| < HYPE_GAP_MARGIN`; `"hidden-gem"` when `trusted − raw ≥ HYPE_GAP_MARGIN`; `"overhyped"` when `raw − trusted ≥ HYPE_GAP_MARGIN`. The indicator renders a labeled signal only for `hidden-gem` / `overhyped`; `consensus` and `null` render nothing.

## Consequences
- Enables #71 (the Hidden Gems shelf reuses the same classification idea, server-side over the cached shelves).
- Constrains: thresholds are web constants (`HYPE_GAP_MARGIN = 0.5`, `HYPE_GAP_MIN_TRUSTED = 2`), documented and single-sourced. v1.
- **New dependency?** No. **New DList shape?** No. **New config (env)?** No.
- **Affects fixtures?** The visual-regression `book-detail` fixture is signed-out / house-raw with no trusted average → `null` → no signal → baseline unchanged.

## Implementation notes
- **`apps/web/src/lib/view-model.ts`** — add `HYPE_GAP_MARGIN`, `HYPE_GAP_MIN_TRUSTED`, and `classifyHypeGap(rawAverage: number | null, trustedAverage: number | null, trustedCount: number): HypeGap` where `type HypeGap = "hidden-gem" | "overhyped" | "consensus" | null`. Pure.
- **`apps/web/src/components/HypeGapIndicator.tsx`** (new) — props `{ rawAverage, trustedAverage, trustedCount }`; calls `classifyHypeGap`; renders nothing for `consensus`/`null`; otherwise a token-only line pairing a colored dot with a text label: hidden gem → `--signal-positive` "Hidden gem · your network rates this above the crowd"; overhyped → `--signal-negative` "Overhyped · people you trust are cooler on this than the crowd". Color is paired with text (legible without color, AC-6).
- **`apps/web/src/components/RatingsPanel.tsx`** — render `<HypeGapIndicator rawAverage={active.average} trustedAverage={w?.average ?? null} trustedCount={w?.trustedCount ?? 0} />` near the rating block, where `active` is the active-perspective summary and `w` its `weighted` (already computed in the panel). Observer-relative by construction.
- **`apps/web/src/components/HypeGapIndicator.css`** (new) — token-only (`--signal-positive` / `--signal-negative`, spacing tokens).

## Out of scope
- The Hidden Gems homepage shelf (#71) and the unfurl-card rating (#72).
- Any change to the trust-weighted average computation.
- Env-configurable thresholds (web constants for v1).
