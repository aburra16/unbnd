import { describe, expect, it } from "vitest";
import {
  buildBookQualitySignalDTag,
  fromBookQualitySignalEvent,
  toBookQualitySignalEvent,
  type BookQualitySignal,
} from "../src/BookQualitySignal";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const TAGGER = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const BOOK_AUTHOR = hex64("3".repeat(63) + "b");

const QUALITY_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-quality-signals",
};

const aiFlag: BookQualitySignal = {
  bookSlug: "the-algorithm-within",
  bookAddress: {
    kind: 39999,
    pubkey: BOOK_AUTHOR,
    dTag: "the-algorithm-within",
  },
  signalSlug: "ai-generated",
  taggerPubkey: TAGGER,
  parentHeader: QUALITY_HEADER,
};

describe("buildBookQualitySignalDTag", () => {
  it("builds quality-signal--<bookSlug>--<signalSlug>--<tagger8>", () => {
    expect(
      buildBookQualitySignalDTag(
        "the-algorithm-within",
        "ai-generated",
        TAGGER,
      ),
    ).toBe("quality-signal--the-algorithm-within--ai-generated--9bf2eed5");
  });
});

describe("toBookQualitySignalEvent", () => {
  it("returns kind 39999 with the quality-signals parent header", () => {
    const event = toBookQualitySignalEvent(aiFlag);
    expect(event.kind).toBe(39999);
    expect(event.parentHeader.dTag).toBe("book-quality-signals");
  });

  it("includes two `t` tags: book slug and signal slug", () => {
    const event = toBookQualitySignalEvent(aiFlag);
    const tTags = event.tags.filter((t) => t[0] === "t");
    expect(tTags).toHaveLength(2);
    expect(tTags).toContainEqual(["t", "the-algorithm-within"]);
    expect(tTags).toContainEqual(["t", "ai-generated"]);
  });

  it("includes exactly one `a` tag: the book address", () => {
    const event = toBookQualitySignalEvent(aiFlag);
    const aTags = event.tags.filter((t) => t[0] === "a");
    expect(aTags).toHaveLength(1);
    expect(aTags).toContainEqual([
      "a",
      `39999:${BOOK_AUTHOR}:the-algorithm-within`,
    ]);
  });

  it("carries the bookQualitySignal payload", () => {
    const event = toBookQualitySignalEvent(aiFlag);
    expect(event.payload.word.wordTypes).toEqual([
      "word",
      "bookQualitySignal",
    ]);
    expect(event.payload.bookQualitySignal).toMatchObject({
      bookSlug: "the-algorithm-within",
      signalSlug: "ai-generated",
    });
  });
});

describe("fromBookQualitySignalEvent", () => {
  it("round-trips an AI-generated signal", () => {
    expect(
      fromBookQualitySignalEvent(toBookQualitySignalEvent(aiFlag)),
    ).toEqual(aiFlag);
  });
});
