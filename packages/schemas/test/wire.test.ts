import { describe, expect, it } from "vitest";
import { toWireTemplate, fromWireEvent } from "../src/wire";
import {
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
  bookSlug: "orbital",
  bookAddress: { kind: 39999, pubkey: BOOK_AUTHOR, dTag: "orbital" },
  raterPubkey: RATER,
  score: 4,
  reviewText: "Quietly extraordinary.",
  reviewDate: "2026-05-27",
  parentHeader: RATINGS_HEADER,
};

const CREATED_AT = 1_716_800_000;

describe("toWireTemplate", () => {
  it("carries kind, content, and the caller-supplied created_at", () => {
    const t = toWireTemplate(toBookRatingEvent(sample), CREATED_AT);
    expect(t.kind).toBe(39999);
    expect(t.created_at).toBe(CREATED_AT);
    expect(t.content).toBe("Quietly extraordinary.");
  });

  it("appends a json tag carrying the serialized word-wrapper payload", () => {
    const t = toWireTemplate(toBookRatingEvent(sample), CREATED_AT);
    const jsonTag = t.tags.find((tag) => tag[0] === "json");
    expect(jsonTag).toBeDefined();
    const parsed = JSON.parse(jsonTag![1]!);
    expect(parsed.word.wordTypes).toEqual(["word", "bookRating"]);
    expect(parsed.bookRating).toMatchObject({ bookSlug: "orbital", score: 4 });
  });

  it("preserves the named tags (d, z, t, a, p, score, review-date)", () => {
    const t = toWireTemplate(toBookRatingEvent(sample), CREATED_AT);
    expect(t.tags).toContainEqual(["d", "rating--orbital--9bf2eed5"]);
    expect(t.tags).toContainEqual(["z", `39998:${LIBRARIAN}:book-ratings`]);
    expect(t.tags).toContainEqual(["a", `39999:${BOOK_AUTHOR}:orbital`]);
    expect(t.tags).toContainEqual(["score", "4"]);
  });

  it("does not add pubkey, id, or sig (the signer does that)", () => {
    const t = toWireTemplate(toBookRatingEvent(sample), CREATED_AT) as Record<
      string,
      unknown
    >;
    expect(t.pubkey).toBeUndefined();
    expect(t.id).toBeUndefined();
    expect(t.sig).toBeUndefined();
  });
});

describe("fromWireEvent", () => {
  it("reconstructs the unsigned event so the domain rating round-trips", () => {
    const wire = toWireTemplate(toBookRatingEvent(sample), CREATED_AT);
    const back = fromWireEvent({
      kind: wire.kind,
      content: wire.content,
      tags: wire.tags,
    });
    expect(fromBookRatingEvent(back as never)).toEqual(sample);
  });

  it("round-trips a rating with no review text", () => {
    const noText: BookRating = { ...sample, reviewText: undefined };
    const wire = toWireTemplate(toBookRatingEvent(noText), CREATED_AT);
    const back = fromWireEvent({
      kind: wire.kind,
      content: wire.content,
      tags: wire.tags,
    });
    expect(fromBookRatingEvent(back as never)).toEqual(noText);
  });

  it("throws when the json tag is missing", () => {
    expect(() =>
      fromWireEvent({ kind: 39999, content: "", tags: [["d", "x"]] }),
    ).toThrow();
  });
});
