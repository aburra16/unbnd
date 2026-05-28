import { describe, expect, it } from "vitest";
import {
  buildBookRatingDTag,
  fromBookRatingEvent,
  toBookRatingEvent,
  type BookRating,
} from "../src/BookRating";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const RATER = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const BOOK_AUTHOR = hex64(
  "82b75e47ab2f9aa1e6c3d9e7b8f2a4c5d6e7f8091a2b3c4d5e6f7081929a3b4c",
);

const RATINGS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-ratings",
};

const sample: BookRating = {
  bookSlug: "the-great-gatsby",
  bookAddress: {
    kind: 39999,
    pubkey: BOOK_AUTHOR,
    dTag: "the-great-gatsby",
  },
  raterPubkey: RATER,
  score: 5,
  reviewText: "A masterpiece of American literature.",
  reviewDate: "2026-05-27",
  parentHeader: RATINGS_HEADER,
};

describe("buildBookRatingDTag", () => {
  it("builds rating--<bookSlug>--<rater8>", () => {
    expect(buildBookRatingDTag("the-great-gatsby", RATER)).toBe(
      "rating--the-great-gatsby--9bf2eed5",
    );
  });

  it("is deterministic for a given (bookSlug, rater) pair", () => {
    expect(buildBookRatingDTag("orbital", RATER)).toBe(
      buildBookRatingDTag("orbital", RATER),
    );
  });

  it("differs when the rater changes", () => {
    const otherRater = hex64("0".repeat(63) + "f");
    expect(buildBookRatingDTag("orbital", RATER)).not.toBe(
      buildBookRatingDTag("orbital", otherRater),
    );
  });
});

describe("toBookRatingEvent", () => {
  it("returns an unsigned event of kind 39999", () => {
    expect(toBookRatingEvent(sample).kind).toBe(39999);
  });

  it("carries the book-ratings concept header as parent", () => {
    expect(toBookRatingEvent(sample).parentHeader.dTag).toBe("book-ratings");
  });

  it("includes d, z, t, a, score, review-date tags", () => {
    const event = toBookRatingEvent(sample);
    expect(event.tags).toContainEqual([
      "d",
      "rating--the-great-gatsby--9bf2eed5",
    ]);
    expect(event.tags).toContainEqual([
      "z",
      `39998:${LIBRARIAN}:book-ratings`,
    ]);
    expect(event.tags).toContainEqual(["t", "the-great-gatsby"]);
    expect(event.tags).toContainEqual([
      "a",
      `39999:${BOOK_AUTHOR}:the-great-gatsby`,
    ]);
    expect(event.tags).toContainEqual(["score", "5"]);
    expect(event.tags).toContainEqual(["review-date", "2026-05-27"]);
  });

  it("places the review text in content", () => {
    expect(toBookRatingEvent(sample).content).toBe(
      "A masterpiece of American literature.",
    );
  });

  it("leaves content empty when reviewText is absent", () => {
    const noText: BookRating = { ...sample, reviewText: undefined };
    expect(toBookRatingEvent(noText).content).toBe("");
  });

  it("carries the word-wrapper payload with bookRating discriminator", () => {
    const event = toBookRatingEvent(sample);
    expect(event.payload.word.wordTypes).toEqual(["word", "bookRating"]);
    expect(event.payload.bookRating).toMatchObject({
      bookSlug: "the-great-gatsby",
      score: 5,
      reviewDate: "2026-05-27",
    });
  });
});

describe("fromBookRatingEvent", () => {
  it("round-trips a sample rating", () => {
    expect(fromBookRatingEvent(toBookRatingEvent(sample))).toEqual(sample);
  });

  it("round-trips a rating with no review text", () => {
    const noText: BookRating = { ...sample, reviewText: undefined };
    expect(fromBookRatingEvent(toBookRatingEvent(noText))).toEqual(noText);
  });
});
