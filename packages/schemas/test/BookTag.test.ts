import { describe, expect, it } from "vitest";
import {
  buildBookTagDTag,
  fromBookTagEvent,
  toBookTagEvent,
  type BookTag,
} from "../src/BookTag";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const TAGS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-tags",
};

const genre: BookTag = {
  slug: "literary-fiction",
  type: "genre",
  name: "Literary fiction",
  sensitivity: "normal",
  parentHeader: TAGS_HEADER,
};

const signal: BookTag = {
  slug: "ai-generated",
  type: "signal",
  name: "AI generated",
  sensitivity: "accusatory",
  parentHeader: TAGS_HEADER,
};

describe("buildBookTagDTag", () => {
  it("builds tag--<type>--<slug>", () => {
    expect(buildBookTagDTag("genre", "literary-fiction")).toBe(
      "tag--genre--literary-fiction",
    );
    expect(buildBookTagDTag("signal", "ai-generated")).toBe(
      "tag--signal--ai-generated",
    );
  });
});

describe("toBookTagEvent", () => {
  it("emits a kind-39999 element with d, z, t(slug), t(type), sensitivity tags", () => {
    const e = toBookTagEvent(genre);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual(["d", "tag--genre--literary-fiction"]);
    expect(e.tags).toContainEqual(["z", `39998:${LIBRARIAN}:book-tags`]);
    expect(e.tags).toContainEqual(["t", "literary-fiction"]);
    expect(e.tags).toContainEqual(["t", "genre"]);
    expect(e.tags).toContainEqual(["sensitivity", "normal"]);
  });

  it("carries the bookTag word-wrapper payload + sensitivity for accusatory tags", () => {
    const e = toBookTagEvent(signal);
    expect(e.payload.word.wordTypes).toEqual(["word", "bookTag"]);
    expect(e.payload.bookTag).toMatchObject({
      slug: "ai-generated",
      type: "signal",
      sensitivity: "accusatory",
    });
    expect(e.tags).toContainEqual(["sensitivity", "accusatory"]);
  });
});

describe("fromBookTagEvent", () => {
  it("round-trips genre and signal tags", () => {
    expect(fromBookTagEvent(toBookTagEvent(genre))).toEqual(genre);
    expect(fromBookTagEvent(toBookTagEvent(signal))).toEqual(signal);
  });
});
