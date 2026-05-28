import { describe, expect, it } from "vitest";
import {
  buildBookGenreDTag,
  fromBookGenreEvent,
  toBookGenreEvent,
  type BookGenre,
} from "../src/BookGenre";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");

const GENRES_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "genres",
};

const literary: BookGenre = {
  slug: "literary-fiction",
  name: "Literary fiction",
  description:
    "Character-driven fiction with attention to prose, structure, and psychological depth.",
  parentHeader: GENRES_HEADER,
};

const subgenre: BookGenre = {
  slug: "autofiction",
  name: "Autofiction",
  description:
    "Literary fiction that takes the author's life as its starting material.",
  parentGenreSlug: "literary-fiction",
  parentHeader: GENRES_HEADER,
};

describe("buildBookGenreDTag", () => {
  it("returns the slug unchanged", () => {
    expect(buildBookGenreDTag("literary-fiction")).toBe("literary-fiction");
  });
});

describe("toBookGenreEvent", () => {
  it("produces an event of kind 39999 with the correct parent header", () => {
    const event = toBookGenreEvent(literary);
    expect(event.kind).toBe(39999);
    expect(event.parentHeader.dTag).toBe("genres");
  });

  it("includes d, z, t, name tags", () => {
    const event = toBookGenreEvent(literary);
    expect(event.tags).toContainEqual(["d", "literary-fiction"]);
    expect(event.tags).toContainEqual(["z", `39998:${LIBRARIAN}:genres`]);
    expect(event.tags).toContainEqual(["t", "literary-fiction"]);
    expect(event.tags).toContainEqual(["name", "Literary fiction"]);
  });

  it("includes a parent-genre tag only when set", () => {
    expect(toBookGenreEvent(subgenre).tags).toContainEqual([
      "parent-genre",
      "literary-fiction",
    ]);

    const tagNames = toBookGenreEvent(literary).tags.map((t) => t[0]);
    expect(tagNames).not.toContain("parent-genre");
  });

  it("carries the bookGenre payload with the description in content", () => {
    const event = toBookGenreEvent(literary);
    expect(event.payload.word.wordTypes).toEqual(["word", "bookGenre"]);
    expect(event.payload.bookGenre.name).toBe("Literary fiction");
    expect(event.content).toBe(literary.description);
  });
});

describe("fromBookGenreEvent", () => {
  it("round-trips literary fiction", () => {
    expect(fromBookGenreEvent(toBookGenreEvent(literary))).toEqual(literary);
  });

  it("round-trips a subgenre with a parent-genre tag", () => {
    expect(fromBookGenreEvent(toBookGenreEvent(subgenre))).toEqual(subgenre);
  });
});
