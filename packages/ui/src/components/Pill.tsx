// Pill — the typed @unbnd/ui pill primitive (ADR 0047 §3, under epic 0001 /
// ADR 0038 §2). A closed discriminated `variant` subsuming the three existing
// pill looks byte-identical (NOT a normalization, ADR 0047):
//   - variant="genre"  — the former apps/web GenrePill non-interactive <span>
//                        chip (folded in; GenrePill is re-exported as a thin
//                        variant="genre" wrapper so its call sites change only
//                        their import path).
//   - variant="select" — the GenrePillSelector toggle <button> (on / disabled).
//   - variant="count"  — the RatedByRow circular "+N" overflow <button>.
//
// The skin (fill, border, radius, the variant look) is owned entirely by
// Pill.css. Per ADR 0038 §2 the `className` here is ADDITIVE LAYOUT-ONLY (the
// rated-by-more margin-left that positions the chip in the avatar pile) — never
// a re-skin. State (on / disabled) rides on real typed props.
//
// The signal pills (book-signal / cs-item-signal / tagc-reviewed) are NOT
// subsumed — they are tone-keyed quality-signal tags with a different radius /
// tint model and stay bespoke (ADR 0047 §Out of scope).
import type { ReactNode } from "react";
import "./Pill.css";

export type PillVariant = "genre" | "select" | "count";

interface PillBase {
  /** ADDITIVE LAYOUT-ONLY (ADR 0038 §2). Never a re-skin. */
  className?: string;
}

interface GenrePillProps extends PillBase {
  /** The non-interactive filled chip (default). */
  variant?: "genre";
  label: string;
  /** Per-genre `${color}14` inline fill + text color, when a colour is given. */
  color?: string;
  /** Raw count of readers who applied this tag (the optional .pill-conf badge). */
  count?: number;
  /**
   * A community-only tag sitting inside an otherwise trusted-consensus section
   * (ADR 0025). Carries a subtle token-only treatment so it reads as less
   * settled than the trusted chips around it. No badge, no icon.
   */
  community?: boolean;
  /**
   * Story 81 / ADR 0079: the trusted graph net-disputes this tag. Muted +
   * struck + dashed "contested" treatment; takes precedence over `community`;
   * the applies count is suppressed (a struck chip with an endorsement count would contradict itself).
   */
  contested?: boolean;
}

interface SelectPillProps extends PillBase {
  /** The selectable toggle <button> (gps-pill). */
  variant: "select";
  /** Selected state → .gps-on. */
  on?: boolean;
  /** Disabled state → .gps-off (opacity .4, cursor not-allowed) + native disabled. */
  disabled?: boolean;
  onClick?: () => void;
  "aria-pressed"?: boolean;
  children: ReactNode;
}

interface CountPillProps extends PillBase {
  /** The circular "+N" overflow <button> (rated-by-more). */
  variant: "count";
  onClick?: () => void;
  /** Required — an icon-like control with no readable text alone. */
  "aria-label": string;
  children: ReactNode;
}

export type PillProps = GenrePillProps | SelectPillProps | CountPillProps;

export function Pill(props: PillProps) {
  if (props.variant === "select") {
    const { on = false, disabled = false, onClick, className } = props;
    const ariaPressed = props["aria-pressed"];
    // Byte-identical className: the former GenrePillSelector built this exact
    // template (empty strings preserved so the double-space spans match).
    const cls = `gps-pill ${on ? "gps-on" : ""} ${disabled ? "gps-off" : ""}`;
    return (
      <button
        type="button"
        className={className ? `${cls} ${className}` : cls}
        disabled={disabled}
        onClick={onClick}
        aria-pressed={ariaPressed}
      >
        {props.children}
      </button>
    );
  }

  if (props.variant === "count") {
    const { onClick, className } = props;
    return (
      <button
        type="button"
        className={className ? `rated-by-more ${className}` : "rated-by-more"}
        aria-label={props["aria-label"]}
        onClick={onClick}
      >
        {props.children}
      </button>
    );
  }

  // variant="genre" (default): the non-interactive filled <span> chip.
  const { label, color, count, community, contested, className } = props;
  // Contested takes precedence over community (it carries strictly more
  // information); the per-genre color fill is dropped on a struck chip.
  const style = !contested && color
    ? {
        background: `${color}14`,
        color,
      }
    : undefined;
  let cls = contested
    ? "pill pill-genre pill-contested"
    : community
      ? "pill pill-genre pill-community"
      : "pill pill-genre";
  if (className) cls = `${cls} ${className}`;
  return (
    <span className={cls} style={style}>
      {label}
      {contested ? (
        <span className="pill-contested-label">contested</span>
      ) : (
        typeof count === "number" && count > 0 && (
          <span className="pill-conf">{count}</span>
        )
      )}
    </span>
  );
}

// GenrePill — the existing non-interactive chip, re-exported as a thin
// variant="genre" wrapper so its three call sites (BookHeader, ShelfControl,
// TagControl) change only their import path (../components/Pill → @unbnd/ui),
// staying byte-identical. (ADR 0047 §3 / OQ-3: keep GenrePill as a re-export.)
type GenrePillPublicProps = Omit<GenrePillProps, "variant" | "className">;

export function GenrePill(props: GenrePillPublicProps) {
  return <Pill variant="genre" {...props} />;
}
