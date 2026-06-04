// Label + Field — the typed @unbnd/ui form-layout primitives (ADR 0048 §2/§3,
// under epic 0001 / ADR 0038 §2). A zero-diff extraction, NOT a normalization
// (ADR 0048): every migrated instance renders byte-identical.
//
//   - Label owns the ONE genuinely-consistent label skin (verified identical
//     across the auth / submit / settings forms): font-size-12 / weight-medium /
//     color --u-ink-tint-70. Its `.u-label` carries only that skin.
//   - Field is LAYOUT-ONLY (it owns no skin): `.u-field` = the column shared by
//     all three form wrappers (display:flex; flex-direction:column;
//     gap --u-space-5, verified identical). The form's DIVERGENT wrapper class
//     (auth-field / sub-field / set-field) is passed through as the additive
//     layout-only `className` so any per-form sibling layout (e.g.
//     `.sub-row > .sub-field { flex:1 }`) keeps matching.
//
// FENCED OUT (ADR 0048 §Out of scope): the four input SKINS (accidentally
// inconsistent — Input is escalated to left-bespoke), the `author-edit-field`
// label/wrapper (a different skin + implicit-association composition), the
// checkbox/switch, and the search box. None routes through these primitives.
//
// Per ADR 0038 §2 the `className` here is ADDITIVE LAYOUT-ONLY — never a re-skin.
import type { LabelHTMLAttributes, ReactNode } from "react";
import "./Field.css";

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /** The explicit-association pattern (auth / sub / set forms). */
  htmlFor?: string;
  /**
   * ADDITIVE LAYOUT-ONLY (ADR 0038 §2). e.g. the sub-field inline-hint layout
   * (`u-label--inline`) that lays an inline glyph beside the label text. Never a
   * re-skin.
   */
  className?: string;
  children: ReactNode;
}

export function Label({ className, children, ...rest }: LabelProps) {
  const cls = className ? `u-label ${className}` : "u-label";
  return (
    <label className={cls} {...rest}>
      {children}
    </label>
  );
}

export interface FieldProps {
  /**
   * The form's divergent wrapper class (auth-field / sub-field / set-field),
   * passed through as ADDITIVE LAYOUT-ONLY (ADR 0038 §2) so per-form sibling
   * layout keeps matching. Never a re-skin.
   */
  className?: string;
  /** A <Label> + the (bespoke, escalated) input. */
  children: ReactNode;
}

export function Field({ className, children }: FieldProps) {
  const cls = className ? `u-field ${className}` : "u-field";
  return <div className={cls}>{children}</div>;
}
