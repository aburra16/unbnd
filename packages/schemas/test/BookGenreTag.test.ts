import { describe, expect, it } from "vitest";
import {
  buildBookGenreTagDTag,
  fromBookGenreTagEvent,
  toBookGenreTagEvent,
  type BookGenreTag,
} from "../src/BookGenreTag";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const TAGGER = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const BOOK_AUTHOR = hex64("3".repeat(63) + "b");

const GENRE_TAGS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-genre-tags",
};

const sample: BookGenreTag = {
  bookSlug: "orbital",
  bookAddress: { kind: 39999, pubkey: BOOK_AUTHOR, dTag: "orbital" },
  genreSlug: "literary-fiction",
  genreAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "literary-fiction" },
  taggerPubkey: TAGGER,
  parentHeader: GENRE_TAGS_HEADER,
};

describe("buildBookGenreTagDTag", () => {
  it("builds genre-tag--<bookSlug>--<genreSlug>--<tagger8>", () => {
    expect(
      buildBookGenreTagDTag("orbital", "literary-fiction", TAGGER),
    ).toBe("genre-tag--orbital--literary-fiction--9bf2eed5");
  });

  it("is deterministic", () => {
    expect(
      buildBookGenreTagDTag("orbital", "literary-fiction", TAGGER),
    ).toBe(buildBookGenreTagDTag("orbital", "literary-fiction", TAGGER));
  });
});

describe("toBookGenreTagEvent", () => {
  it("returns kind 39999 with the genre-tags parent header", () => {
    const event = toBookGenreTagEvent(sample);
    expect(event.kind).toBe(39999);
    expect(event.parentHeader.dTag).toBe("book-genre-tags");
  });

  it("includes two `t` tags: book slug and genre slug", () => {
    const event = toBookGenreTagEvent(sample);
    const tTags = event.tags.filter((t) => t[0] === "t");
    expect(tTags).toHaveLength(2);
    expect(tTags).toContainEqual(["t", "orbital"]);
    expect(tTags).toContainEqual(["t", "literary-fiction"]);
  });

  it("includes two `a` tags: book address and genre address", () => {
    const event = toBookGenreTagEvent(sample);
    const aTags = event.tags.filter((t) => t[0] === "a");
    expect(aTags).toHaveLength(2);
    expect(aTags).toContainEqual(["a", `39999:${BOOK_AUTHOR}:orbital`]);
    expect(aTags).toContainEqual([
      "a",
      `39999:${LIBRARIAN}:literary-fiction`,
    ]);
  });

  it("carries the bookGenreTag payload", () => {
    const event = toBookGenreTagEvent(sample);
    expect(event.payload.word.wordTypes).toEqual(["word", "bookGenreTag"]);
    expect(event.payload.bookGenreTag).toMatchObject({
      bookSlug: "orbital",
      genreSlug: "literary-fiction",
    });
  });
});

describe("fromBookGenreTagEvent", () => {
  it("round-trips a sample genre tag", () => {
    expect(fromBookGenreTagEvent(toBookGenreTagEvent(sample))).toEqual(sample);
  });
});
