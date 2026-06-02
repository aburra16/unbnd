// Story 36 / ADR 0037 §3 (AC-3) — the `ownRatedSlugs` helper: the SET of book
// slugs the signed-in user currently has a rating on, used by For-You to exclude
// books the user already rated. Sibling of `countOwnRatings` in
// apps/api/src/ratings/summary.ts: the SAME author-scoped latest-wins-by-slug
// fold, but it returns the key SET (which slugs) rather than counts.
//
// Mirrors apps/api/test/ratings/own-counts.test.ts. Targets a new `ownRatedSlugs`
// export that does NOT exist yet (intentionally red).
import { describe, expect, it } from "vitest";
import { ownRatedSlugs } from "../../src/ratings/summary";
import { signedRating } from "./_fixtures";

const SK = (n: number) => new Uint8Array(32).fill(n);

describe("ownRatedSlugs — the set of slugs the user currently rates (AC-3)", () => {
  it("returns each distinct rated book slug, keyed by book not by pubkey", () => {
    const sk = SK(7);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 5 }).event,
      signedRating({ sk, bookSlug: "north-woods", score: 4 }).event,
      signedRating({ sk, bookSlug: "the-bee-sting", score: 3 }).event,
    ];
    const set = ownRatedSlugs(events);
    expect(set).toBeInstanceOf(Set);
    expect([...set].sort()).toEqual(["north-woods", "orbital", "the-bee-sting"]);
  });

  it("collapses a re-rating of the same book to one slug (latest-wins per book)", () => {
    const sk = SK(8);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 2, createdAt: 1 }).event,
      signedRating({ sk, bookSlug: "orbital", score: 5, createdAt: 9 }).event,
    ];
    const set = ownRatedSlugs(events);
    expect(set.size).toBe(1);
    expect(set.has("orbital")).toBe(true);
  });

  it("returns an empty set for a user with no ratings", () => {
    expect(ownRatedSlugs([]).size).toBe(0);
  });

  it("ignores events that are not well-formed ratings", () => {
    const sk = SK(9);
    const good = signedRating({ sk, bookSlug: "orbital", score: 4 }).event;
    const junk = { ...good, kind: 1, tags: [], content: "not a rating" } as typeof good;
    const set = ownRatedSlugs([good, junk]);
    expect([...set]).toEqual(["orbital"]);
  });

  it("is consistent with countOwnRatings: |ownRatedSlugs| === booksRated", async () => {
    const { countOwnRatings } = await import("../../src/ratings/summary");
    const sk = SK(10);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 5 }).event,
      signedRating({ sk, bookSlug: "orbital", score: 4, createdAt: 99 }).event, // re-rate
      signedRating({ sk, bookSlug: "piranesi", score: 5 }).event,
    ];
    expect(ownRatedSlugs(events).size).toBe(countOwnRatings(events).booksRated);
  });
});
