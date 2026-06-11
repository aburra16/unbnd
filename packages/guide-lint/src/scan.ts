// The pure scan core (Story 83 / ADR 0080 §2). Data-driven: rules in, hits
// out; extending the taxonomy never touches this logic.
import type { MechanicalList, RuleSeverity } from "./rules";

export type ScanFile = {
  readonly path: string;
  readonly text: string;
};

export type Hit = {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly matched: string;
  readonly severity: RuleSeverity;
};

// STUB (red): real scanning in implementation.
export function scan(_list: MechanicalList, _files: readonly ScanFile[]): Hit[] {
  return [];
}

/** Exit code semantics: non-zero ONLY on error-severity hits. */
export function exitCodeFor(hits: readonly Hit[]): 0 | 1 {
  return hits.some((h) => h.severity === "error") ? 1 : 0;
}
