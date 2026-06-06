// Failing tests (red) for Story 66 / ADR 0065 — scoresByAuthor: group a
// multi-author rating set into `authorHex -> (bookSlug -> latest score)`, the
// in-memory fold the book-detail taste-match runs over a single batched read.
// `scoresByAuthor` is a stub (returns an empty Map) → these fail red.
import { describe, expect, it } from "vitest";
import { scoresByAuthor } from "../../src/ratings/summary";
import { signedRating } from "./_fixtures";

const A = new Uint8Array(32).fill(1);
const B = new Uint8Array(32).fill(2);

describe("scoresByAuthor", () => {
  it("groups events by author into per-book score maps", () => {
    const a1 = signedRating({ sk: A, bookSlug: "alpha", score: 5 });
    const a2 = signedRating({ sk: A, bookSlug: "beta", score: 3 });
    const b1 = signedRating({ sk: B, bookSlug: "alpha", score: 2 });
    const out = scoresByAuthor([a1.event, a2.event, b1.event]);
    expect(out.get(a1.pubkey)).toEqual(
      new Map([
        ["alpha", 5],
        ["beta", 3],
      ]),
    );
    expect(out.get(b1.pubkey)).toEqual(new Map([["alpha", 2]]));
  });

  it("keeps the latest score per (author, book)", () => {
    const older = signedRating({ sk: A, bookSlug: "alpha", score: 2, createdAt: 100 });
    const newer = signedRating({ sk: A, bookSlug: "alpha", score: 5, createdAt: 200 });
    const out = scoresByAuthor([older.event, newer.event]);
    expect(out.get(older.pubkey)?.get("alpha")).toBe(5);
  });

  it("skips malformed events", () => {
    const good = signedRating({ sk: A, bookSlug: "alpha", score: 4 });
    const bad = { ...good.event, tags: [], content: "" } as typeof good.event;
    const out = scoresByAuthor([good.event, bad]);
    expect(out.size).toBe(1);
    expect(out.get(good.pubkey)?.get("alpha")).toBe(4);
  });
});
