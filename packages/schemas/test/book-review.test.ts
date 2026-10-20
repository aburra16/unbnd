// FAILING TESTS — Story 99 / ADR 0089: the shared book review record
// (Brainstorm-UI docs/dictionary/books-actions.md §3, §6).
import { beforeAll, describe, expect, it } from "vitest";
import {
  BOOK_REVIEW_KIND,
  BOOK_REVIEW_WORDS_MAX,
  REVIEW_HUB,
  buildBookReviewRemoval,
  buildBookReviewTemplate,
  reviewedAddressOf,
  starsOf,
  wordsOf,
} from "../src";

const LIB = "1".repeat(63) + "a";
const BOOK = `39999:${LIB}:ol-ol19722168w`;

describe("buildBookReviewTemplate: a new review (contract §3)", () => {
  const make = () => buildBookReviewTemplate({
    bookAddress: BOOK,
    title: "The storm before the storm",
    stars: 4,
    words: "  Read it in three sittings.  ",
    now: 1_790_000_000,
  });
  let t: ReturnType<typeof make>;
  beforeAll(() => {
    t = make();
  });

  it("is kind 34259 with d, a + hub hint, m, rating, s and alt, in that order", () => {
    expect(BOOK_REVIEW_KIND).toBe(34259);
    expect(t.kind).toBe(34259);
    expect(t.tags).toEqual([
      ["d", `book:${BOOK}`],
      ["a", BOOK, REVIEW_HUB],
      ["m", "book"],
      ["rating", "0.800"],
      ["s", "4"],
      ["alt", "Review of The storm before the storm: 4 of 5 stars"],
    ]);
    expect(REVIEW_HUB).toBe("wss://dcosl.brainstorm.world");
  });

  it("carries the trimmed words as content and is dated now", () => {
    expect(t.content).toBe("Read it in three sittings.");
    expect(t.created_at).toBe(1_790_000_000);
  });

  it("refuses stars outside 1 to 5, a non-catalog address, and words over the limit", () => {
    const base = { bookAddress: BOOK, title: "T", stars: 3, words: "", now: 1 };
    expect(() => buildBookReviewTemplate({ ...base, stars: 0 })).toThrow();
    expect(() => buildBookReviewTemplate({ ...base, stars: 4.5 })).toThrow();
    expect(() => buildBookReviewTemplate({ ...base, bookAddress: "30040:abc:pg1" })).toThrow();
    expect(BOOK_REVIEW_WORDS_MAX).toBe(1200);
    expect(() => buildBookReviewTemplate({ ...base, words: "x".repeat(1201) })).toThrow();
  });
});

describe("buildBookReviewTemplate: an edit (contract §6)", () => {
  const previous = {
    id: "e".repeat(64),
    created_at: 1_790_003_600, // an hour ahead of "now" below
    content: "Old words.",
    tags: [
      ["d", `book:${BOOK}`],
      ["a", BOOK],
      ["m", "book"],
      ["rating", "0.600"],
      ["s", "3"],
      ["x-other-app", "keep me", "and this"],
      ["client", "Brainstorm"],
      ["nonce", "123", "16"],
      ["imeta", "url https://blossom.example/p.jpg"],
    ],
  };
  let t: ReturnType<typeof buildBookReviewTemplate>;
  beforeAll(() => {
    t = buildBookReviewTemplate({
      bookAddress: BOOK,
      title: "T",
      stars: 5,
      words: "New words.",
      now: 1_790_000_000,
      previous,
    });
  });

  it("is dated a second after the version it replaces when that is later than now", () => {
    expect(t.created_at).toBe(1_790_003_601);
  });

  it("sets its own tags and carries every other one over in order, except client and nonce", () => {
    expect(t.tags).toEqual([
      ["d", `book:${BOOK}`],
      ["a", BOOK, REVIEW_HUB],
      ["m", "book"],
      ["rating", "1.000"],
      ["s", "5"],
      ["alt", "Review of T: 5 of 5 stars"],
      ["x-other-app", "keep me", "and this"],
      ["imeta", "url https://blossom.example/p.jpg"],
    ]);
  });

  it("keeps a carried photo's address after the words", () => {
    expect(t.content).toBe("New words.\nhttps://blossom.example/p.jpg");
  });
});

describe("buildBookReviewRemoval (contract §6)", () => {
  it("is a kind 5 naming the review by e and a, with k 34259", () => {
    const pubkey = "b".repeat(64);
    const r = buildBookReviewRemoval({ id: "e".repeat(64), pubkey, d: `book:${BOOK}` }, 1_790_000_000);
    expect(r.kind).toBe(5);
    expect(r.created_at).toBe(1_790_000_000);
    expect(r.tags).toEqual([
      ["e", "e".repeat(64)],
      ["a", `34259:${pubkey}:book:${BOOK}`],
      ["k", "34259"],
    ]);
  });
});

describe("starsOf (contract §3, Brainstorm's rule; check G)", () => {
  const stars = (tags: string[][]) => starsOf({ tags });
  it("reads s first, then rating as a fraction or as stars; 0 and out-of-range are none", () => {
    expect(stars([["s", "4"], ["rating", "0.800"]])).toBe(4);
    expect(stars([["rating", "4"]])).toBe(4);
    expect(stars([["rating", "0.9"]])).toBe(4.5);
    expect(stars([["rating", "0"]])).toBeNull();
    expect(stars([["rating", "7"]])).toBeNull();
    expect(stars([["rating", "0.6"]])).toBe(3);
  });
  it("prefers an aspect-free rating", () => {
    expect(stars([["rating", "0.2", "plot"], ["rating", "0.8"]])).toBe(4);
  });
});

describe("wordsOf and reviewedAddressOf", () => {
  it("takes photo addresses out of the words", () => {
    expect(
      wordsOf({ content: "Good.\nhttps://b.example/p.jpg", tags: [["imeta", "url https://b.example/p.jpg"]] }),
    ).toBe("Good.");
  });
  it("names the book by a, else by d with or without book:", () => {
    expect(reviewedAddressOf({ tags: [["a", BOOK, REVIEW_HUB], ["d", "book:other"]] })).toBe(BOOK);
    expect(reviewedAddressOf({ tags: [["d", `book:${BOOK}`]] })).toBe(BOOK);
    expect(reviewedAddressOf({ tags: [["d", BOOK]] })).toBe(BOOK);
    expect(reviewedAddressOf({ tags: [["d", "something"]] })).toBeNull();
  });
});
