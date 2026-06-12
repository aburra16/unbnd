// FAILING TESTS — Story 85 / ADR 0082 §2 (the heading construct).
import { describe, expect, it } from "vitest";
import { formatBody } from "../../src/guide/format";

describe("formatBody — the ## heading construct", () => {
  it("a ## line becomes a heading block", () => {
    const blocks = formatBody("Intro.\n\n## Your first session\n\nBody.");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "heading", "paragraph"]);
    const h = blocks[1]!;
    if (h.kind !== "heading") throw new Error("expected heading");
    expect(h.text).toBe("Your first session");
  });

  it("deeper hashes are NOT the construct and render literal (never swallowed)", () => {
    const blocks = formatBody("### Too deep");
    expect(blocks[0]!.kind).toBe("paragraph");
  });
});
