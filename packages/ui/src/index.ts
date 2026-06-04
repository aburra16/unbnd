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
// Button / IconButton primitives (Story 45 / ADR 0045). The first React
// primitives on the token foundation; every <button> in apps/web goes through
// these, enforced by the no-raw-<button> guard.
export { Button } from "./components/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./components/Button";
export { IconButton } from "./components/IconButton";
export type { IconButtonProps } from "./components/IconButton";
// Icon registry (Story 46 / ADR 0046). A typed <Icon name> over a map of our
// hand-authored SVGs; every <svg> in apps/web goes through this, enforced by the
// no-raw-<svg> guard. The `name` union is derived from the registry keys.
export { Icon } from "./components/Icon/Icon";
export type { IconName, IconProps } from "./components/Icon/Icon";
// Link / Pill primitives (Story 47a / ADR 0047). Link is the router-agnostic
// home for the link-styled controls + the link-as-button affordances; Pill
// subsumes GenrePill + the gps-pill / rated-by-more deferred pills. Both clear
// the last four Story-45 no-raw-<button> DEFERRALS (only searchbox-hit remains).
export { Link } from "./components/Link";
export type { LinkProps, LinkVariant } from "./components/Link";
export { Pill, GenrePill } from "./components/Pill";
export type { PillProps, PillVariant } from "./components/Pill";
// Avatar primitive (Story 47b / ADR 0048). MOVED in from apps/web byte-identical
// (the kind-0 picture / deterministic-initials identity circle); its former
// cross-package GENRE_PALETTE import is now an intra-package relative import.
export { Avatar } from "./components/Avatar";
export type { AvatarProps } from "./components/Avatar";
// Label / Field form primitives (Story 47b / ADR 0048). Label owns the one
// consistent label skin (.u-label); Field is layout-only (.u-field), preserving
// each form's divergent wrapper class as additive layout-only. The four input
// skins are accidentally inconsistent and stay bespoke (Input escalated).
export { Field, Label } from "./components/Field";
export type { FieldProps, LabelProps } from "./components/Field";
