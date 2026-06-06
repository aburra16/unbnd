// Failing tests (red) for Story 65 / ADR 0064 — the pure, observer-relative
// taste-match metric. v1 raw agreement: over the books BOTH rated,
//   agreement = 1 - mean(|a - b|) / 4, scaled to 0-100 (Math.round).
// Below `minOverlap` co-rated books the percentage is withheld (thresholdMet
// false). `computeTasteMatch` currently throws (stub) → these fail red.
import { describe, expect, it } from "vitest";
import { computeTasteMatch } from "../src/taste-match";

/** Build a score map from a plain object (book id -> score). */
const scores = (obj: Record<string, number>) =>
  new Map<string, number>(Object.entries(obj));

const MIN = 5;

describe("computeTasteMatch — agreement reflects rating agreement (AC-2)", () => {
  it("identical ratings on the co-rated set → 100% (perfect agreement)", () => {
    const a = scores({ a: 5, b: 4, c: 3, d: 2, e: 1 });
    const b = scores({ a: 5, b: 4, c: 3, d: 2, e: 1 });
    expect(computeTasteMatch(a, b, MIN)).toEqual({
      commonBooks: 5,
      thresholdMet: true,
      percentage: 100,
    });
  });

  it("maximally opposite ratings (1 vs 5 throughout) → 0%", () => {
    const a = scores({ a: 1, b: 1, c: 1, d: 1, e: 1 });
    const b = scores({ a: 5, b: 5, c: 5, d: 5, e: 5 });
    expect(computeTasteMatch(a, b, MIN).percentage).toBe(0);
  });

  it("off by one on every co-rated book → 75%", () => {
    const a = scores({ a: 4, b: 4, c: 4, d: 4, e: 4 });
    const b = scores({ a: 5, b: 5, c: 5, d: 5, e: 5 });
    expect(computeTasteMatch(a, b, MIN).percentage).toBe(75);
  });

  it("closer agreement scores higher than looser agreement", () => {
    const viewer = scores({ a: 5, b: 5, c: 5, d: 5, e: 5 });
    const close = scores({ a: 5, b: 5, c: 4, d: 5, e: 5 }); // one book off by 1
    const loose = scores({ a: 3, b: 2, c: 3, d: 2, e: 3 }); // off by 2-3 throughout
    const closePct = computeTasteMatch(viewer, close, MIN).percentage!;
    const loosePct = computeTasteMatch(viewer, loose, MIN).percentage!;
    expect(closePct).toBeGreaterThan(loosePct);
  });

  it("rounds to the nearest whole percent (mean distance 1.5 → 62.5 → 63)", () => {
    const a = scores({ a: 5, b: 5, c: 5, d: 5, e: 5, f: 5 });
    const b = scores({ a: 4, b: 3, c: 4, d: 3, e: 4, f: 3 }); // diffs 1,2,1,2,1,2 → mean 1.5
    expect(computeTasteMatch(a, b, MIN).percentage).toBe(63);
  });
});

describe("computeTasteMatch — only co-rated books count", () => {
  it("ignores books only one of the two has rated", () => {
    const a = scores({ a: 5, b: 5, c: 5, d: 5, e: 5, f: 5 }); // f only here
    const b = scores({ a: 5, b: 5, c: 5, d: 5, e: 5, x: 1 }); // x only here
    expect(computeTasteMatch(a, b, MIN)).toEqual({
      commonBooks: 5,
      thresholdMet: true,
      percentage: 100,
    });
  });

  it("zero overlap → commonBooks 0, threshold not met, no percentage", () => {
    const a = scores({ a: 5 });
    const b = scores({ b: 5 });
    expect(computeTasteMatch(a, b, MIN)).toEqual({
      commonBooks: 0,
      thresholdMet: false,
    });
  });
});

describe("computeTasteMatch — honest threshold (AC-3)", () => {
  it("below the minimum overlap → thresholdMet false and NO percentage", () => {
    const a = scores({ a: 5, b: 5, c: 5, d: 5 }); // 4 co-rated, min 5
    const b = scores({ a: 5, b: 5, c: 5, d: 5 });
    const r = computeTasteMatch(a, b, MIN);
    expect(r.commonBooks).toBe(4);
    expect(r.thresholdMet).toBe(false);
    expect(r.percentage).toBeUndefined();
  });

  it("exactly at the minimum overlap → thresholdMet true (boundary)", () => {
    const a = scores({ a: 5, b: 5, c: 5, d: 5, e: 5 });
    const b = scores({ a: 5, b: 5, c: 5, d: 5, e: 5 });
    expect(computeTasteMatch(a, b, MIN).thresholdMet).toBe(true);
  });

  it("honors a configurable minimum (overlap 5, min 10 → not met)", () => {
    const a = scores({ a: 5, b: 5, c: 5, d: 5, e: 5 });
    const b = scores({ a: 5, b: 5, c: 5, d: 5, e: 5 });
    expect(computeTasteMatch(a, b, 10).thresholdMet).toBe(false);
  });
});
