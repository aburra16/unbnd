// IconButton — the icon-only sibling of Button (ADR 0045 §1). No visible text,
// so an accessible name (aria-label) is REQUIRED. The icon node is passed as
// `children` (the raw <Star> / <Avatar> node today); when the icon registry
// lands (epic story 9) `children` becomes <Icon name=…> with no contract change.
//
// Carries the standardized 2px amber :focus-visible ring (JC-5). Skin lives in
// IconButton.css; `className` is ADDITIVE LAYOUT-ONLY (ADR 0038 §2).
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ButtonSize } from "./Button";
import "./IconButton.css";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** REQUIRED — there is no visible text to name the control. */
  "aria-label": string;
  /** The two icon-only looks in use today. Defaults to "bare". */
  variant?: "ghost" | "bare";
  size?: ButtonSize;
  /** acct-trigger is a circle; rate-star is square. Defaults to "square". */
  shape?: "circle" | "square";
  /** Toggle/pressed state (rate-star uses aria-pressed). Visual class only. */
  selected?: boolean;
  /** ADDITIVE LAYOUT-ONLY (ADR 0038 §2). */
  className?: string;
  /** The icon node (an SVG today; the <Icon> registry is epic story 9). */
  children: ReactNode;
}

export function IconButton({
  variant = "bare",
  size = "md",
  shape = "square",
  selected = false,
  className,
  children,
  // `type` is NOT defaulted (ADR 0045 §1): carried through verbatim.
  ...rest
}: IconButtonProps) {
  const classes = [
    "u-iconbtn",
    `u-iconbtn--${variant}`,
    `u-iconbtn--${shape}`,
  ];
  if (selected) classes.push("is-selected");
  if (className) classes.push(className);

  return (
    <button className={classes.join(" ")} {...rest}>
      {children}
    </button>
  );
}
