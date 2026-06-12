// Content-integrity guard (Story 86, standing for every batch): runs over the
// REAL guide content. Anchors are unique across the guide; every related ref
// resolves to a published entry; the loader's section rule already loud-fails
// unknown directories. Red whenever a batch lands broken; green is the
// shippable state.
import { describe, expect, it } from "vitest";
import { PRODUCTION_GUIDE } from "../../src/guide/GuideContext";

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
