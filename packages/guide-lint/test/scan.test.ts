// FAILING TESTS — Story 83 / ADR 0080 (the pure scan core).
//
// Data-driven semantics: whole-word boundaries (the #75 matcher lesson),
// sentence-initial openers, steps-only scope, flag-vs-error severity, the
// allow-listed per-file exemption, frontmatter exclusion, and the
// extension proof: a rule added to the LIST is caught with no logic change.
import { describe, expect, it } from "vitest";
import type { MechanicalList } from "../src/rules";
import { exitCodeFor, scan } from "../src/scan";

function list(over: Partial<MechanicalList> = {}): MechanicalList {
  return {
    version: 1,
    contentGlobs: [],
    exemptibleRules: ["E"],
    exemptMarker: "taxonomy-exempt:",
    rules: [
      { id: "A1", name: "em dash", kind: "substring", patterns: ["—"], severity: "error" },
      { id: "C1", name: "hype", kind: "word", words: ["seamless"], severity: "error" },
      { id: "C2", name: "opener", kind: "sentence-initial", patterns: ["Essentially", "It's worth noting"], severity: "error" },
      { id: "C4", name: "just (steps)", kind: "word", words: ["just"], scope: "steps", severity: "error" },
      { id: "F2", name: "filtering", kind: "word", words: ["seems"], severity: "flag" },
      { id: "E", name: "protocol wall", kind: "word", words: ["nostr", "relay"], severity: "error" },
    ],
    ...over,
  };
}

function file(text: string, path = "apps/web/src/guide/content/x.md") {
  return { path, text };
}

describe("scan — hit anatomy and matching semantics", () => {
  it("reports file, line, column, tic id, and the matched text", () => {
    const hits = scan(list(), [file("line one\nA rating matters — a lot.\n")]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      file: "apps/web/src/guide/content/x.md",
      line: 2,
      ruleId: "A1",
      severity: "error",
    });
    expect(hits[0]!.column).toBeGreaterThan(0);
  });

  it("word rules match whole words case-insensitively, never substrings", () => {
    const hits = scan(list(), [file("A Seamless flow. The seam less obvious. Seamlessness aside.")]);
    expect(hits).toHaveLength(1); // only the standalone "Seamless"
    expect(hits[0]!.matched.toLowerCase()).toBe("seamless");
  });

  it("sentence-initial rules fire at text start, after a sentence end, and at line starts, never mid-sentence", () => {
    const hits = scan(list(), [
      file("Essentially, this works. We said essentially nothing. Done. It's worth noting the rest.\nEssentially again."),
    ]);
    const positions = hits.map((h) => `${h.line}:${h.ruleId}`);
    expect(hits).toHaveLength(3);
    expect(positions).toEqual(["1:C2", "1:C2", "2:C2"]);
  });

  it("steps-scope rules fire only on numbered step lines", () => {
    const text = "It is just a number in prose.\n1. Just click the toggle.\n2. Pick a shelf.\n";
    const hits = scan(list(), [file(text)]);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ line: 2, ruleId: "C4" });
  });

  it("flag severity is reported but never fails the run; errors do", () => {
    const flagsOnly = scan(list(), [file("That seems fine.")]);
    expect(flagsOnly).toHaveLength(1);
    expect(flagsOnly[0]!.severity).toBe("flag");
    expect(exitCodeFor(flagsOnly)).toBe(0);
    const withError = scan(list(), [file("That seems seamless.")]);
    expect(exitCodeFor(withError)).toBe(1);
  });
});

describe("scan — the per-file exemption (the protocol-wall door)", () => {
  it("a file marked taxonomy-exempt: E skips E hits and ONLY E hits", () => {
    const text = "<!-- taxonomy-exempt: E -->\nThe wider network is called nostr. A seamless aside.\n";
    const hits = scan(list(), [file(text)]);
    expect(hits.map((h) => h.ruleId)).toEqual(["C1"]); // E silenced, C1 still fires
  });

  it("claiming exemption from a non-exemptible rule is itself an error hit", () => {
    const text = "<!-- taxonomy-exempt: C1 -->\nA seamless aside.\n";
    const hits = scan(list(), [file(text)]);
    expect(hits.some((h) => h.severity === "error" && /exempt/i.test(h.ruleName))).toBe(true);
    expect(hits.some((h) => h.ruleId === "C1")).toBe(true); // and C1 still fires
  });

  it("frontmatter and the exemption comment line are not scanned", () => {
    const text = "---\ntitle: relay of hope\n---\n<!-- taxonomy-exempt: E -->\nClean body text.\n";
    expect(scan(list(), [file(text)])).toEqual([]);
  });
});

describe("scan — the extension proof (AC-3) and the baseline", () => {
  it("a word added to the LIST is caught with no change to scan logic", () => {
    const base = list();
    const before = scan(base, [file("The delve was deep.")]);
    expect(before).toEqual([]);
    const extended = list({
      rules: [...base.rules, { id: "C8", name: "new tell", kind: "word", words: ["delve"], severity: "error" }],
    });
    const after = scan(extended, [file("The delve was deep.")]);
    expect(after).toHaveLength(1);
    expect(after[0]!.ruleId).toBe("C8");
  });

  it("zero files is a clean pass (the empty-content baseline)", () => {
    const hits = scan(list(), []);
    expect(hits).toEqual([]);
    expect(exitCodeFor(hits)).toBe(0);
  });
});
