// The taxonomy's Appendix M parser (Story 83 / ADR 0080 §1). The mechanical
// list lives INSIDE the style guide (one artifact, no drift); this module's
// only coupling to the document is the fence tag. A malformed appendix throws
// loudly: a broken appendix must never silently scan nothing.

export type RuleSeverity = "error" | "flag";
export type RuleKind = "substring" | "word" | "regex" | "sentence-initial";

export type MechanicalRule = {
  readonly id: string;
  readonly name: string;
  readonly kind: RuleKind;
  readonly patterns?: readonly string[];
  readonly words?: readonly string[];
  readonly caseInsensitive?: boolean;
  readonly scope?: "all" | "steps";
  readonly severity: RuleSeverity;
};

export type MechanicalList = {
  readonly version: number;
  readonly contentGlobs: readonly string[];
  readonly exemptibleRules: readonly string[];
  readonly exemptMarker: string;
  readonly rules: readonly MechanicalRule[];
};

export const APPENDIX_FENCE_TAG = "taxonomy-mechanical-list";

// STUB (red): real extraction + validation in implementation.
export function loadRules(_styleGuideText: string): MechanicalList {
  return {
    version: 0,
    contentGlobs: [],
    exemptibleRules: [],
    exemptMarker: "",
    rules: [],
  };
}
