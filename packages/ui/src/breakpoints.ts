// packages/ui/src/breakpoints.ts — the single source of truth for Unbnd's
// responsive breakpoints. CSS custom properties cannot be used inside @media
// queries (ADR 0038 §1), so the canonical pixel values live here as a typed TS
// constant: (1) any JS-driven responsive logic (matchMedia, a useMediaQuery
// hook) reads these instead of hardcoding a pixel; (2) the @media guard derives
// its allowed pixel set from these values, so the CSS @media literals and the
// JS source can never drift. Values are the distinct in-use @media max-width
// values on main, preserved EXACTLY (ADR 0043, no consolidation). Keys are
// value-keyed (the px integer) so no clean-ladder ordering is implied — the set
// is not a designed ramp, it is the honest registry of values actually in use.
export const breakpoints = {
  bp480: 480,
  bp540: 540,
  bp620: 620,
  bp700: 700,
  bp720: 720,
  bp860: 860,
  bp880: 880,
} as const;

export type Breakpoint = keyof typeof breakpoints;
