// packages/ui/src/colors.ts — the source of truth for the runtime-injected
// component color props (ADR 0040 §4). The SVG `stroke`/`fill` defaults and the
// `logoFill` props are interpolated into the DOM by JS, where a CSS custom
// property cannot be read without a cascade read (rejected as a behavior change
// and a no-build-step violation). These values are kept byte-equal to their
// tokens.css Tier-1 raw counterparts by
// packages/ui/test/architecture-palette-sync.test.ts.
//
// Keys are the semantic roles those props carry; values equal the matching
// --u-raw-color-* raws (amber-500, muted-500, green-500, purple-500).

export const SEMANTIC_COLORS = {
  /** --u-raw-color-amber-500 — LogoMark default fill. */
  amber: "#C4763C",
  /** --u-raw-color-muted-500 — SearchIcon stroke, Footer logo fill. */
  muted: "#8B8698",
  /** --u-raw-color-green-500 — positive signal (AuthWelcome logo). */
  signalPositive: "#1D9E75",
  /** --u-raw-color-purple-500 — sovereign signal (AuthNostrConnect logo). */
  signalSovereign: "#7845FF",
} as const;
