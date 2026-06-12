// Content-integrity guard (Story 86, standing for every batch): runs over the
// REAL guide content. Anchors are unique across the guide; every related ref
// resolves to a published entry; the loader's section rule already loud-fails
// unknown directories. Red whenever a batch lands broken; green is the
// shippable state.
import { describe, expect, it } from "vitest";
import { PRODUCTION_GUIDE } from "../../src/guide/GuideContext";
import { loadGuide } from "../../src/guide/load";

describe("guide content integrity (the standing batch guard)", () => {
  it("anchors are unique across the entire guide", () => {
    const seen = new Map<string, string>();
    for (const s of PRODUCTION_GUIDE.published) {
      for (const e of s.entries) {
        const prior = seen.get(e.anchor);
        expect(prior, `anchor "${e.anchor}" in ${s.slug} already used in ${prior}`).toBeUndefined();
        seen.set(e.anchor, s.slug);
      }
    }
  });

  it("every related ref resolves to a published entry", () => {
    const all = new Set(
      PRODUCTION_GUIDE.published.flatMap((s) => s.entries.map((e) => `${s.slug}#${e.anchor}`)),
    );
    for (const s of PRODUCTION_GUIDE.published) {
      for (const e of s.entries) {
        for (const ref of e.related) {
          expect(all.has(ref), `related ref "${ref}" on ${s.slug}#${e.anchor} does not resolve`).toBe(true);
        }
      }
    }
  });

  it("every entry has a non-empty body and name", () => {
    for (const s of PRODUCTION_GUIDE.published) {
      for (const e of s.entries) {
        expect(e.body.length, `${s.slug}#${e.anchor} body`).toBeGreaterThan(40);
        expect(e.name.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// Story 95: authoring comments are machine metadata (the taxonomy-exemption
// marker), never reader-facing words. The sweep renders EVERY production body
// through the real formatter and fails on the whole leak class.
import { formatBody, type Block } from "../../src/guide/format";

function renderedText(blocks: readonly Block[]): string {
  return blocks
    .map((b) => {
      if (b.kind === "heading") return b.text;
      const parts = b.kind === "paragraph" ? [b.parts] : b.items;
      return parts.flat().map((p) => p.text).join(" ");
    })
    .join("\n");
}

describe("rendered-output sweep (Story 95): no authoring artifacts reach the reader", () => {
  it("comment-only lines are stripped from bodies at load", () => {
    const guide = loadGuide({
      "./content/getting-started/1-x.md": `---
anchor: x
name: X
order: 1
---

<!-- taxonomy-exempt: E -->

A real paragraph.
`,
    });
    expect(guide.published[0]!.entries[0]!.body).not.toContain("<!--");
    expect(guide.published[0]!.entries[0]!.body).toContain("A real paragraph.");
  });

  it("comment-only lines are stripped from the landing at load", () => {
    const guide = loadGuide({
      "./content/landing.md": "---\nslot: landing\n---\n\n<!-- a note -->\n\nWords.\n",
    });
    expect(guide.landing).not.toContain("<!--");
    expect(guide.landing).toContain("Words.");
  });

  it("no production entry or landing renders comments, raw bold/link syntax, or stray hashes", () => {
    const offenders: string[] = [];
    const bodies: Array<[string, string]> = PRODUCTION_GUIDE.published.flatMap((s) =>
      s.entries.map((e) => [`${s.slug}#${e.anchor}`, e.body] as [string, string]),
    );
    if (PRODUCTION_GUIDE.landing) bodies.push(["landing", PRODUCTION_GUIDE.landing]);
    for (const [where, body] of bodies) {
      const text = renderedText(formatBody(body));
      for (const mark of ["<!--", "**", "]("]) {
        if (text.includes(mark)) offenders.push(`${where}: rendered text contains ${mark}`);
      }
      if (/^#/m.test(text)) offenders.push(`${where}: rendered text has a line-initial #`);
    }
    expect(offenders).toEqual([]);
  });
});

