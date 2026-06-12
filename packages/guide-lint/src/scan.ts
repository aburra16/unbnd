// The pure scan core (Story 83 / ADR 0080 §2). Data-driven: rules in, hits
// out; extending the taxonomy never touches this logic. Whole-word matching
// uses explicit boundary checks rather than \b so it stays honest around
// punctuation and Unicode (the #75 matcher lesson).
import type { MechanicalList, MechanicalRule, RuleSeverity } from "./rules";

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

const STEP_LINE = /^\s*\d+\.\s/;
const WORD_CHAR = /[\p{L}\p{N}_-]/u;

function isWordBoundary(text: string, index: number): boolean {
  if (index < 0 || index >= text.length) return true;
  return !WORD_CHAR.test(text[index]!);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type LineCtx = {
  readonly file: string;
  readonly lineNo: number;
  readonly text: string;
  readonly isStep: boolean;
};

function hitsOnLine(rule: MechanicalRule, ctx: LineCtx): Hit[] {
  if (rule.scope === "steps" && !ctx.isStep) return [];
  const out: Hit[] = [];
  const push = (column: number, matched: string) =>
    out.push({
      file: ctx.file,
      line: ctx.lineNo,
      column,
      ruleId: rule.id,
      ruleName: rule.name,
      matched,
      severity: rule.severity,
    });

  if (rule.kind === "word") {
    for (const word of rule.words ?? []) {
      const re = new RegExp(escapeRegex(word), "giu");
      for (const m of ctx.text.matchAll(re)) {
        const at = m.index!;
        if (
          isWordBoundary(ctx.text, at - 1) &&
          isWordBoundary(ctx.text, at + m[0].length)
        ) {
          push(at + 1, m[0]);
        }
      }
    }
    return out;
  }

  if (rule.kind === "substring") {
    for (const pattern of rule.patterns ?? []) {
      const flags = rule.caseInsensitive ? "giu" : "gu";
      const re = new RegExp(escapeRegex(pattern), flags);
      for (const m of ctx.text.matchAll(re)) push(m.index! + 1, m[0]);
    }
    return out;
  }

  if (rule.kind === "regex") {
    for (const pattern of rule.patterns ?? []) {
      const re = new RegExp(pattern, "gu");
      for (const m of ctx.text.matchAll(re)) push(m.index! + 1, m[0]);
    }
    return out;
  }

  // sentence-initial: at the line start, or after . ! ? followed by spacing.
  for (const pattern of rule.patterns ?? []) {
    const re = new RegExp(
      "(?:^|[.!?]\\s+)(" + escapeRegex(pattern) + ")(?=[\\s,.!?:;]|$)",
      "giu",
    );
    for (const m of ctx.text.matchAll(re)) {
      const at = m.index! + m[0].length - m[1]!.length;
      push(at + 1, m[1]!);
    }
  }
  return out;
}

/** Strip frontmatter and find the exemption marker; returns scannable lines. */
function prepare(file: ScanFile, marker: string): {
  lines: { text: string; lineNo: number }[];
  exemptIds: string[];
} {
  const rawLines = file.text.split("\n");
  const lines: { text: string; lineNo: number }[] = [];
  const exemptIds: string[] = [];
  let inFrontmatter = false;
  for (let i = 0; i < rawLines.length; i++) {
    const text = rawLines[i]!;
    if (i === 0 && text.trim() === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (text.trim() === "---") inFrontmatter = false;
      continue;
    }
    const markerAt = text.indexOf(marker);
    if (markerAt !== -1 && text.trimStart().startsWith("<!--")) {
      const after = text.slice(markerAt + marker.length).replace(/-->.*$/, "");
      for (const id of after.split(/[,\s]+/)) if (id) exemptIds.push(id);
      continue; // the marker line itself is not scanned
    }
    lines.push({ text, lineNo: i + 1 });
  }
  return { lines, exemptIds };
}

export function scan(list: MechanicalList, files: readonly ScanFile[]): Hit[] {
  const hits: Hit[] = [];
  for (const file of files) {
    const { lines, exemptIds } = prepare(file, list.exemptMarker);

    // An exemption claim outside the allow-list is itself an error hit, and
    // the claimed rule still fires (the wall cannot widen silently).
    const allowed = new Set<string>();
    for (const id of exemptIds) {
      if (list.exemptibleRules.includes(id)) {
        allowed.add(id);
      } else {
        hits.push({
          file: file.path,
          line: 1,
          column: 1,
          ruleId: id,
          ruleName: `non-exemptible rule claimed in ${list.exemptMarker} marker`,
          matched: id,
          severity: "error",
        });
      }
    }

    for (const line of lines) {
      const ctx: LineCtx = {
        file: file.path,
        lineNo: line.lineNo,
        text: line.text,
        isStep: STEP_LINE.test(line.text),
      };
      for (const rule of list.rules) {
        if (allowed.has(rule.id)) continue;
        hits.push(...hitsOnLine(rule, ctx));
      }
    }
  }
  return hits;
}

/** Exit code semantics: non-zero ONLY on error-severity hits. */
export function exitCodeFor(hits: readonly Hit[]): 0 | 1 {
  return hits.some((h) => h.severity === "error") ? 1 : 0;
}
