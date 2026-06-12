// FAILING TESTS — Story 84 / ADR 0081 (the subset formatter).
import { describe, expect, it } from "vitest";
import { formatBody } from "../../src/guide/format";

describe("formatBody — exactly the anatomy's constructs", () => {
  it("paragraphs split on blank lines", () => {
    const blocks = formatBody("First paragraph.\n\nSecond paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.kind === "paragraph")).toBe(true);
  });

  it("numbered lines form one steps block with items in order", () => {
    const blocks = formatBody("Intro line.\n\n1. Open a book page.\n2. Choose Remove rating.\n\nAfter.");
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "steps", "paragraph"]);
    const steps = blocks[1]!;
    if (steps.kind !== "steps") throw new Error("expected steps");
    expect(steps.items).toHaveLength(2);
    expect(steps.items[0]![0]).toMatchObject({ kind: "text", text: "Open a book page." });
  });

  it("inline links and bold parse inside paragraphs and steps", () => {
    const blocks = formatBody("**What it is.** See [Taste match](/guide/ratings-you-can-trust#taste-match) for more.");
    const p = blocks[0]!;
    if (p.kind !== "paragraph") throw new Error("expected paragraph");
    expect(p.parts[0]).toMatchObject({ kind: "bold", text: "What it is." });
    expect(p.parts.some((x) => x.kind === "link" && x.href === "/guide/ratings-you-can-trust#taste-match")).toBe(true);
  });

  it("unknown constructs render as literal paragraph text, never swallowed", () => {
    const blocks = formatBody("## A heading that should not be here");
    expect(blocks).toHaveLength(1);
    const p = blocks[0]!;
    if (p.kind !== "paragraph") throw new Error("expected paragraph");
    expect(p.parts[0]).toMatchObject({ kind: "text", text: "## A heading that should not be here" });
  });
});
