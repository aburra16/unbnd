// Link — the typed @unbnd/ui link primitive (ADR 0047 §1/§2, under epic 0001 /
// ADR 0038 §2). The home for the in-scope link looks: the two former link-styled
// controls (auth-linklike, sub-back) and the link-as-button affordances (cta-btn
// <a>, auth-submit / auth-btn-secondary <Link>s). The nav/footer/byline link
// family is OUT of scope and stays bespoke (ADR 0047 §Out of scope).
//
// RENDER-AGNOSTIC. Link renders a raw <a> by default, or a caller-supplied
// element/component passed via `as` — a react-router-dom <Link> (with `to`) for
// a route link, or "button" for an in-page action. This keeps @unbnd/ui
// router-agnostic: the package never imports react-router-dom (ADR 0038 §7).
//
// VARIANT looks (closed set):
//   - plain-amber      ← auth-linklike (rendered as="button"; in-page toggle)
//   - plain-muted      ← sub-back      (rendered as="button"; in-page action)
//   - button-primary   ← cta-btn <a>, auth-submit <Link> — emits Button's OWN
//                        skin classes (u-btn u-btn--primary u-btn--md), so it is
//                        byte-identical to Button by construction and a future
//                        primary restyle tracks it (ADR 0047 §2).
//   - button-secondary ← auth-btn-secondary <Link> — the auth secondary skin in
//                        Link.css, intentionally NOT Button's normalized
//                        secondary (ADR 0047 §2 WATCH-POINT / OQ-2).
//
// Per ADR 0038 §2 the `className` is ADDITIVE LAYOUT-ONLY (the genuine per-site
// density: cta-btn padding/font-size, auth-submit padding/font-size/margin,
// auth-btn-secondary padding/font-size) — never a re-skin.
import type {
  ComponentPropsWithoutRef,
  ElementType,
  ReactNode,
} from "react";
import "./Link.css";

export type LinkVariant =
  | "plain-amber"
  | "plain-muted"
  | "button-primary"
  | "button-secondary";

// Our own props; everything else (href / to / onClick / style / aria-* / target
// / rel / type / …) flows through from the rendered element's own prop type, so
// each call site is typed against whatever it renders `as`. This keeps @unbnd/ui
// router-agnostic: when a caller passes react-router-dom's Link via `as`, its
// `to` prop is accepted via `ComponentPropsWithoutRef<T>` WITHOUT the package
// importing the router (ADR 0047 §1).
interface LinkOwnProps<T extends ElementType> {
  /** The variant look. Every call site passes its own; default "plain-amber". */
  variant?: LinkVariant;
  /**
   * The element/component to render as. Defaults to "a" (a raw anchor with
   * `href`). Pass react-router-dom's Link (with `to`) for a route link, or
   * "button" for an in-page action; the extra props flow through `...rest`.
   * Typed as `T` so JSX infers the rendered element's prop type (e.g. `to` for
   * a router Link) WITHOUT the package importing the router (ADR 0047 §1).
   */
  as?: T;
  /** ADDITIVE LAYOUT-ONLY (ADR 0038 §2). Never a re-skin. */
  className?: string;
  children: ReactNode;
}

// Polymorphic prop type: own props + the rendered element's props (minus any our
// own props override), defaulting to an anchor when `as` is omitted.
export type LinkProps<T extends ElementType = "a"> = LinkOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof LinkOwnProps<T>>;

// The class(es) each variant emits. button-primary reuses Button's OWN skin
// classes so it is identical to Button by construction; the others carry their
// look from Link.css.
const VARIANT_CLASS: Record<LinkVariant, string> = {
  "plain-amber": "u-link--plain-amber",
  "plain-muted": "u-link--plain-muted",
  "button-primary": "u-btn u-btn--primary u-btn--md",
  "button-secondary": "u-link--button-secondary",
};

// Default rendered element per variant when the caller passes no `as` (ADR 0047
// OQ-1). The plain-* looks are LINK-STYLED IN-PAGE-ACTION CONTROLS (a signup-mode
// toggle, a form-collapse back affordance) whose correct a11y element is a real
// <button>, not an anchor — so they default to a button here, INSIDE the
// primitive (outside the no-raw-<button> guard's apps/web/src scope). The
// button-* looks are real navigational links and default to an anchor. A caller
// can always override via `as` (e.g. as={RouterLink} for a route link).
const DEFAULT_TAG: Record<LinkVariant, "a" | "button"> = {
  "plain-amber": "button",
  "plain-muted": "button",
  "button-primary": "a",
  "button-secondary": "a",
};

export function Link<T extends ElementType = "a">({
  variant = "plain-amber",
  as,
  className,
  children,
  ...rest
}: LinkProps<T>) {
  const Tag = (as ?? DEFAULT_TAG[variant]) as ElementType;
  const classes = VARIANT_CLASS[variant];
  const merged = className ? `${classes} ${className}` : classes;
  return (
    <Tag className={merged} {...rest}>
      {children}
    </Tag>
  );
}
