// Icon — the typed <Icon name> registry primitive (ADR 0046 §Decision, under
// epic 0001 / ADR 0038 §3 "Icon abstraction"). One swap point over a map of OUR
// hand-authored SVGs (no icon library, AGENTS.md §4): the indirection is the
// point. The no-raw-<svg> guard
// (packages/ui/test/architecture-svg-literals.test.ts) forbids any raw <svg> in
// apps/web/src; every icon goes through here.
//
// This is a ZERO-DIFF refactor (Story 46 binding): each icon renders
// byte-identical to its pre-migration output. The render functions in icons.tsx
// are verbatim transcriptions; this file is the typed dispatcher.
//
// The `name` union is derived from the ICONS map via `keyof`, so it can never
// drift from the registered set — forgetting to add an icon to the union (or
// registering one without a render function) is a type error. Props are a
// discriminated union on `name`: a small shared base (size?/className?) plus a
// per-icon extras map, so each icon accepts EXACTLY the props it honors and
// nothing else — passing `filled` to <Icon name="search"> is a type error, and a
// typo'd `name` is a type error (mirrors the Button VARIANT_CLASS-map + typed-
// props shape from ADR 0045).
import type { ReactElement } from "react";
import {
  renderBolt,
  renderCheck,
  renderLogo,
  renderSearch,
  renderStar,
} from "./icons";

// The registry. `as const` so the keys form the literal `IconName` union below.
const ICONS = {
  search: renderSearch,
  logo: renderLogo,
  check: renderCheck,
  bolt: renderBolt,
  star: renderStar,
} as const;

/** The registered icon names. Derived from ICONS so a typo / unregistered name
 *  is a TypeScript error (`"search" | "logo" | "check" | "bolt" | "star"`). */
export type IconName = keyof typeof ICONS;

// Shared base props every icon accepts. `size` is the single numeric dimension
// prop for the icons that vary their size (search/logo); the fixed-dimension
// icons (check/bolt/star) take no `size` — their width/height cannot drift.
type BaseIconProps = { className?: string };

// Per-icon extras. Each icon's render function honors exactly these.
type IconPropsByName = {
  search: { size?: number; stroke?: string };
  logo: {
    size?: number;
    fill?: string;
    opacityScheme?: "solid" | "soft";
    title?: string;
  };
  check: Record<never, never>;
  bolt: Record<never, never>;
  star: { filled?: boolean };
};

/** Discriminated union on `name`: each icon accepts only the props it honors.
 *  A wrong-icon prop (e.g. `filled` on `search`) is a compile error. */
export type IconProps = {
  [K in IconName]: { name: K } & BaseIconProps & IconPropsByName[K];
}[IconName];

export function Icon(props: IconProps): ReactElement {
  switch (props.name) {
    case "search":
      return renderSearch(props);
    case "logo":
      return renderLogo(props);
    case "check":
      return renderCheck(props);
    case "bolt":
      return renderBolt(props);
    case "star":
      return renderStar(props);
  }
}
