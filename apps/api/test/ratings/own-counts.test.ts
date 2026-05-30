// Failing tests (red) for Story 19 AC-5 / AC-6 — the own-ratings count helper.
// Mirrors apps/api/test/ratings/summary.test.ts fixture pattern. Targets a new
// `countOwnRatings` export in apps/api/src/ratings/summary.ts, which does not
// exist yet.
//
// Why a NEW helper and not `dedupeRatings`: ADR 0019 Decision 2 — `dedupeRatings`
// keys latest-wins by `pubkey`, which collapses ALL of one user's ratings to a
// single entry. For a per-book "Books rated" count that is wrong. The own-count
// helper must key latest-wins by BOOK (the rating's bookSlug). `dedupeRatings`
// keeps its pubkey key for the public per-book read and is left untouched.
import { describe, expect, it } from "vitest";
import { countOwnRatings } from "../../src/ratings/summary";
import { signedRating } from "./_fixtures";

const SK = (n: number) => new Uint8Array(32).fill(n);

describe("countOwnRatings — books rated (AC-5)", () => {
  it("counts distinct rated books, keyed by book not by pubkey", () => {
    // One author, three distinct books → booksRated = 3. (dedupeRatings would
    // collapse these to 1 because it keys on pubkey; this must not.)
    const sk = SK(7);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 5 }).event,
      signedRating({ sk, bookSlug: "north-woods", score: 4 }).event,
      signedRating({ sk, bookSlug: "the-bee-sting", score: 3 }).event,
    ];
    expect(countOwnRatings(events).booksRated).toBe(3);
  });

  it("counts a re-rating of the same book once (latest-wins per book)", () => {
    const sk = SK(8);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 2, createdAt: 1 }).event,
      signedRating({ sk, bookSlug: "orbital", score: 5, createdAt: 9 }).event,
    ];
    expect(countOwnRatings(events).booksRated).toBe(1);
  });

  it("counts a rating that carries no review text in booksRated", () => {
    const sk = SK(9);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 4 }).event, // no reviewText
    ];
    const r = countOwnRatings(events);
    expect(r.booksRated).toBe(1);
    expect(r.reviews).toBe(0);
  });

  it("returns zero for a user with no ratings (a true, honest zero)", () => {
    expect(countOwnRatings([])).toEqual({ booksRated: 0, reviews: 0 });
  });
});

describe("countOwnRatings — reviews (AC-6)", () => {
  it("counts only ratings whose review text is non-empty after trim", () => {
    const sk = SK(10);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 5, reviewText: "Luminous." }).event,
      signedRating({ sk, bookSlug: "north-woods", score: 4, reviewText: "   " }).event, // whitespace → not a review
      signedRating({ sk, bookSlug: "the-bee-sting", score: 3 }).event, // no text → not a review
    ];
    const r = countOwnRatings(events);
    expect(r.booksRated).toBe(3);
    expect(r.reviews).toBe(1);
  });

  it("reviews is a subset of booksRated and follows latest-wins per book", () => {
    // Latest rating on a book dropped its review → that book no longer counts
    // as a review, but still counts as rated.
    const sk = SK(11);
    const events = [
      signedRating({ sk, bookSlug: "orbital", score: 4, reviewText: "Had thoughts.", createdAt: 1 }).event,
      signedRating({ sk, bookSlug: "orbital", score: 5, createdAt: 9 }).event, // latest has no review
    ];
    const r = countOwnRatings(events);
    expect(r.booksRated).toBe(1);
    expect(r.reviews).toBe(0);
  });
});
