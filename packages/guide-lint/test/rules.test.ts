// FAILING TESTS — Story 83 / ADR 0080 (Appendix M parsing).
//
// The mechanical list lives inside the style guide; loadRules extracts the
// tagged fence and validates it. The REAL document is the fixture for the
// happy path, so the contract is pinned against the artifact the scanner
// will actually read. A malformed appendix throws loudly.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRules } from "../src/rules";

const STYLE_GUIDE = resolve(
  __dirname,
  "../../../product-team/guides/reader-guide-style-guide.md",
);

describe("loadRules — Appendix M is the one artifact (ADR 0080 §1)", () => {
  it("parses the real style guide's appendix: globs, exemption config, and rules", () => {
    const list = loadRules(readFileSync(STYLE_GUIDE, "utf8"));
    expect(list.version).toBe(1);
    expect(list.contentGlobs).toEqual(["apps/web/src/guide/content/**/*.md"]);
    expect(list.exemptibleRules).toEqual(["E"]);
    expect(list.exemptMarker).toBe("taxonomy-exempt:");
    // Spot-pin rules across the families.
    const ids = new Set(list.rules.map((r) => r.id));
    for (const id of ["A1", "A2", "A3", "B6", "C1", "C2", "C3", "C4", "C7", "F2", "F3", "E"]) {
      expect(ids.has(id), `rule ${id} present`).toBe(true);
    }
    const just = list.rules.find((r) => r.id === "C4" && r.scope === "steps");
    expect(just?.words).toEqual(["just"]);
    const f2 = list.rules.filter((r) => r.id === "F2");
    expect(f2.every((r) => r.severity === "flag")).toBe(true);
  });

  it("throws loudly when the appendix fence is missing (never silently scan nothing)", () => {
    expect(() => loadRules("# A document with no appendix")).toThrow(/appendix|taxonomy-mechanical-list/i);
  });

  it("throws loudly on invalid JSON or a rule missing required fields", () => {
    const badJson = "```json taxonomy-mechanical-list\n{ not json }\n```";
    expect(() => loadRules(badJson)).toThrow();
    const badRule =
      '```json taxonomy-mechanical-list\n{"version":1,"contentGlobs":[],"exemptibleRules":[],"exemptMarker":"x:","rules":[{"id":"Z1"}]}\n```';
    expect(() => loadRules(badRule)).toThrow(/rule|severity|kind/i);
  });
});
