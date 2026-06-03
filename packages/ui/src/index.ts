// @unbnd/ui — the Unbnd design system: the home for tokens, primitives, the
// icon registry, the motion layer, and layout primitives (Epic 0001, ADR 0038).
//
// Story 38 stood up the package and the token stylesheet (consumed by apps/web
// via the "@unbnd/ui/styles/tokens.css" export). Story 40 (ADR 0040) adds the
// first JS surface: the genre/cover palette and the runtime-injected semantic
// colors, both single sources of color truth bound to the CSS Tier-1 raws by
// the palette-sync guard. Primitives, the icon registry, and the motion layer
// arrive in later epic stories, each behind a CI guard.
export { GENRE_PALETTE } from "./palette";
export type { GenreRow } from "./palette";
export { SEMANTIC_COLORS } from "./colors";
export { breakpoints } from "./breakpoints";
export type { Breakpoint } from "./breakpoints";
