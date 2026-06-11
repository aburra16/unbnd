// FAILING TESTS — Story 79 / ADR 0077 (schemas contract).
//
// A rating retraction is a kind-39999 event under the SAME
// `rating--<slug>--<rater8>` d-tag as the rating it removes (relay-enforced
// replace), carrying `["retracted","true"]` and NO score. `isRatingRetraction`
// is the single predicate every read fold shares; it must work tag-level
// (before any payload parse) so `fromBookRatingEvent`'s score-required
// invariant stays intact.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  buildBookRatingDTag,
  buildBookRatingRetraction,
  formatAddress,
  isRatingRetraction,
  toBookRatingEvent,
  type BookRating,
  type BookRatingRetraction,
  type DListAddress,
} from "../src";

const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");
const RATER = asHexPubkey("9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84");

const header: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-ratings",
};
const bookAddress: DListAddress<39999> = {
  kind: 39999,
  pubkey: LIBRARIAN,
  dTag: "orbital",
};

const retraction: BookRatingRetraction = {
  bookSlug: "orbital",
  bookAddress,
  raterPubkey: RATER,
  parentHeader: header,
};

const rating: BookRating = {
  bookSlug: "orbital",
  bookAddress,
  raterPubkey: RATER,
  score: 4,
  reviewDate: "2026-06-01",
  parentHeader: header,
};

function tag(tags: ReadonlyArray<readonly string[]>, name: string) {
  return tags.find((t) => t[0] === name);
}

describe("buildBookRatingRetraction (ADR 0077 §2)", () => {
  it("uses the SAME d-tag as the rating it removes — the relay-replace identity", () => {
    const event = buildBookRatingRetraction(retraction);
    expect(tag(event.tags, "d")?.[1]).toBe(buildBookRatingDTag("orbital", RATER));
    expect(tag(event.tags, "d")?.[1]).toBe(
      tag(toBookRatingEvent(rating).tags, "d")?.[1],
    );
  });

  it("carries the retracted marker and NO score tag", () => {
    const event = buildBookRatingRetraction(retraction);
    expect(tag(event.tags, "retracted")?.[1]).toBe("true");
    expect(tag(event.tags, "score")).toBeUndefined();
    expect(event.content).toBe("");
  });

  it("keeps the rating's routing tags (z, t, a, p) so the same #a read returns it", () => {
    const event = buildBookRatingRetraction(retraction);
    expect(tag(event.tags, "z")?.[1]).toBe(formatAddress(header));
    expect(tag(event.tags, "t")?.[1]).toBe("orbital");
    expect(tag(event.tags, "a")?.[1]).toBe(formatAddress(bookAddress));
    expect(tag(event.tags, "p")?.[1]).toBe(RATER);
  });

  it("payload carries the retracted sentinel and no score", () => {
    const event = buildBookRatingRetraction(retraction);
    expect(event.payload.bookRating.retracted).toBe(true);
    expect("score" in event.payload.bookRating).toBe(false);
    expect(event.payload.word.wordTypes).toEqual(["word", "bookRating"]);
  });
});

describe("isRatingRetraction (the shared fold predicate)", () => {
  it("true for a built retraction", () => {
    const event = buildBookRatingRetraction(retraction);
    expect(isRatingRetraction(event)).toBe(true);
  });

  it("false for a normal rating event", () => {
    expect(isRatingRetraction(toBookRatingEvent(rating))).toBe(false);
  });

  it("false for a non-39999 event even with the marker tag", () => {
    expect(
      isRatingRetraction({ kind: 1, tags: [["retracted", "true"]] }),
    ).toBe(false);
  });
});
