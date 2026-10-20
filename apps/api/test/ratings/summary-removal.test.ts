// Story 99 / ADR 0089: the API's summaries honour removals (kind 5), through
// the one fold. The full rule set is pinned in packages/trust/test/reviews.test.ts.
import { describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { countOwnRatings, ownRatedSlugs, scoreBySlug, summarizeRatings } from "../../src/ratings/summary";
import { LIBRARIAN, signedRating, signedRemoval } from "./_fixtures";

const SCOPE = { librarian: LIBRARIAN, now: 2_000_000_000 };
const evs = (...xs: { event: unknown }[]) => xs.map((x) => x.event) as SignedNostrEvent[];

describe("summaries after a removal", () => {
  it("a removed review is not counted, listed or recommended-around", () => {
    const sk = generateSecretKey();
    const r = signedRating({ sk, score: 5, reviewText: "Great.", createdAt: 1_000 });
    const gone = signedRemoval({ sk, reviewId: r.event.id, createdAt: 1_100 });
    const other = signedRating({ score: 3, createdAt: 1_000 });
    const s = summarizeRatings(evs(r, gone, other), SCOPE);
    expect(s.count).toBe(1);
    expect(s.average).toBe(3);
    expect(countOwnRatings(evs(r, gone), SCOPE)).toEqual({ booksRated: 0, reviews: 0 });
    expect(ownRatedSlugs(evs(r, gone), SCOPE).size).toBe(0);
    expect(scoreBySlug(evs(r, gone), SCOPE).size).toBe(0);
  });

  it("rating again after a removal stands", () => {
    const sk = generateSecretKey();
    const r = signedRating({ sk, score: 2, createdAt: 1_000 });
    const gone = signedRemoval({ sk, createdAt: 1_100 });
    const again = signedRating({ sk, score: 4, createdAt: 1_200 });
    expect(summarizeRatings(evs(r, gone, again), SCOPE).average).toBe(4);
  });

  it("a review without stars is listed but enters no count or average", () => {
    const words = signedRating({ score: null, reviewText: "Only words." });
    const s = summarizeRatings(evs(words), SCOPE);
    expect(s.count).toBe(0);
    expect(s.average).toBeNull();
    expect(s.ratings).toHaveLength(1);
    expect(s.ratings[0]!.score).toBeNull();
  });
});
