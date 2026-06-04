// Button — the typed @unbnd/ui button primitive (ADR 0045 §1, under epic 0001 /
// ADR 0038 §2). Every interactive <button> in apps/web goes through this (or its
// icon-only sibling IconButton); the no-raw-<button> guard
// (packages/ui/test/architecture-button-literals.test.ts) enforces it.
//
// CLEAN VARIANT SET (ADR 0045 §1, USER SIGN-OFF 2026-06-03). State rides on real
// typed props, never on a re-skinning className:
//   - variant: "primary" | "secondary" | "ink" | "ghost" | "danger"
//   - size:    "sm" | "md" | "lg"
//   - accent:  boolean — secondary-only amber-outline look (rp-personalize, JC-2b)
//   - selected/block/loading — visual/aria state; disabled passes through native
//
// The skin (color, border, radius, fill, weight, the variant look) is owned
// entirely by Button.css and is NOT reachable through `className`. Per ADR 0038
// §2 the `className` here is ADDITIVE LAYOUT-ONLY (margin, flex/grid placement,
// align-self, width-context) — never a re-skin. The standardized 2px amber
// :focus-visible ring (JC-5) lives in the CSS and applies to every button.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ink"
  | "ghost"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The variant look. Defaults to "primary". */
  variant?: ButtonVariant;
  /** The size/density step. Defaults to "md". */
  size?: ButtonSize;
  /**
   * Secondary-only amber-outline look (rp-personalize, JC-2b). A single boolean
   * tied to one intentional style, NOT a re-skin axis. No effect on other
   * variants.
   */
  accent?: boolean;
  /**
   * Busy affordance: sets aria-busy="true". Does NOT auto-disable and renders no
   * spinner (the visible spinner is a later visual story). The caller keeps
   * passing its own `disabled` exactly as today.
   */
  loading?: boolean;
  /**
   * The toggle/-active visual state (rp-tab, pov-sw selected; rate-star is on
   * IconButton). Drives the selected CSS class ONLY; it does NOT force
   * aria-pressed — tabs use aria-selected, so the caller passes the correct aria
   * for its role.
   */
  selected?: boolean;
  /** Full-width (the width:100% / flex:1 layout cases). A layout prop, not a skin. */
  block?: boolean;
  /** ADDITIVE LAYOUT-ONLY (ADR 0038 §2). Never a re-skin. */
  className?: string;
  children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "u-btn--primary",
  secondary: "u-btn--secondary",
  ink: "u-btn--ink",
  ghost: "u-btn--ghost",
  danger: "u-btn--danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "u-btn--sm",
  md: "u-btn--md",
  lg: "u-btn--lg",
};

export function Button({
  variant = "primary",
  size = "md",
  accent = false,
  loading = false,
  selected = false,
  block = false,
  className,
  children,
  // `type` is intentionally NOT defaulted (ADR 0045 §1): native <button> defaults
  // to type="submit"; every call site passes its own `type` explicitly, carried
  // through here verbatim to avoid a latent form-submit regression.
  ...rest
}: ButtonProps) {
  const classes = ["u-btn", VARIANT_CLASS[variant], SIZE_CLASS[size]];
  if (accent && variant === "secondary") classes.push("u-btn--accent");
  if (selected) classes.push("is-selected");
  if (block) classes.push("u-btn--block");
  if (className) classes.push(className);

  return (
    <button
      className={classes.join(" ")}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
