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

const KINDS: ReadonlySet<string> = new Set([
  "substring",
  "word",
  "regex",
  "sentence-initial",
]);
const SEVERITIES: ReadonlySet<string> = new Set(["error", "flag"]);

function fail(reason: string): never {
  throw new Error(`guide-lint: Appendix M (${APPENDIX_FENCE_TAG}) ${reason}`);
}

export function loadRules(styleGuideText: string): MechanicalList {
  const fence = new RegExp(
    "```json " + APPENDIX_FENCE_TAG + "\\n([\\s\\S]*?)```",
  ).exec(styleGuideText);
  if (!fence) fail("fence not found in the style guide");

  let raw: unknown;
  try {
    raw = JSON.parse(fence[1]!);
  } catch (err) {
    fail(`is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  const l = raw as Partial<MechanicalList>;
  if (typeof l.version !== "number") fail("is missing a numeric version");
  if (!Array.isArray(l.contentGlobs)) fail("is missing contentGlobs");
  if (!Array.isArray(l.exemptibleRules)) fail("is missing exemptibleRules");
  if (typeof l.exemptMarker !== "string" || l.exemptMarker === "") {
    fail("is missing exemptMarker");
  }
  if (!Array.isArray(l.rules) || l.rules.length === 0) fail("has no rules");

  for (const r of l.rules as Partial<MechanicalRule>[]) {
    if (typeof r.id !== "string" || r.id === "") fail("has a rule with no id");
    if (typeof r.name !== "string") fail(`rule ${r.id} has no name`);
    if (typeof r.kind !== "string" || !KINDS.has(r.kind)) {
      fail(`rule ${r.id} has an unknown kind`);
    }
    if (typeof r.severity !== "string" || !SEVERITIES.has(r.severity)) {
      fail(`rule ${r.id} has an unknown severity`);
    }
    const hasWords = Array.isArray(r.words) && r.words.length > 0;
    const hasPatterns = Array.isArray(r.patterns) && r.patterns.length > 0;
    if (r.kind === "word" ? !hasWords : !hasPatterns) {
      fail(`rule ${r.id} (${r.kind}) is missing its ${r.kind === "word" ? "words" : "patterns"}`);
    }
    if (r.scope !== undefined && r.scope !== "all" && r.scope !== "steps") {
      fail(`rule ${r.id} has an unknown scope`);
    }
  }

  return l as MechanicalList;
}
