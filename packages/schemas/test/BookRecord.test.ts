import { describe, expect, it } from "vitest";
import {
  buildBookRecordDTag,
  fromBookRecordEvent,
  toBookRecordEvent,
  type BookRecord,
} from "../src/BookRecord";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");

const BOOKS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "books",
};

const sample: BookRecord = {
  slug: "the-great-gatsby",
  title: "The Great Gatsby",
  authorName: "F. Scott Fitzgerald",
  isbn13: "9780743273565",
  isbn10: "0743273567",
  openLibraryId: "OL468431W",
  coverUrl: "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
  pageCount: 180,
  publishYear: 1925,
  language: "en",
  subjects: ["fiction", "classics"],
  blurb: "Set in the Jazz Age on Long Island.",
  format: "reference",
  purchaseUrl: "https://openlibrary.org/works/OL468431W",
  source: "openlibrary",
  parentHeader: BOOKS_HEADER,
};

describe("buildBookRecordDTag", () => {
  it("returns the slug unchanged", () => {
    expect(buildBookRecordDTag("the-great-gatsby")).toBe("the-great-gatsby");
  });

  it("is deterministic", () => {
    expect(buildBookRecordDTag("orbital")).toBe(buildBookRecordDTag("orbital"));
  });
});

describe("toBookRecordEvent", () => {
  it("returns an unsigned event of kind 39999", () => {
    const event = toBookRecordEvent(sample);
    expect(event.kind).toBe(39999);
  });

  it("carries the parent header as a structured field of kind 39998", () => {
    const event = toBookRecordEvent(sample);
    expect(event.parentHeader.kind).toBe(39998);
    expect(event.parentHeader.dTag).toBe("books");
    expect(event.parentHeader.pubkey).toBe(LIBRARIAN);
  });

  it("includes the d-tag as the slug", () => {
    const event = toBookRecordEvent(sample);
    expect(event.tags).toContainEqual(["d", "the-great-gatsby"]);
  });

  it("includes a z-tag pointing to the parent header", () => {
    const event = toBookRecordEvent(sample);
    expect(event.tags).toContainEqual([
      "z",
      `39998:${LIBRARIAN}:books`,
    ]);
  });

  it("includes relay-filterable named tags for title, author, isbn, lang, year, cover", () => {
    const event = toBookRecordEvent(sample);
    expect(event.tags).toContainEqual(["t", "the-great-gatsby"]);
    expect(event.tags).toContainEqual(["title", "The Great Gatsby"]);
    expect(event.tags).toContainEqual(["author", "F. Scott Fitzgerald"]);
    expect(event.tags).toContainEqual(["isbn", "9780743273565"]);
    expect(event.tags).toContainEqual(["isbn10", "0743273567"]);
    expect(event.tags).toContainEqual(["lang", "en"]);
    expect(event.tags).toContainEqual(["year", "1925"]);
    expect(event.tags).toContainEqual([
      "cover",
      "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
    ]);
  });

  it("omits optional tags when the source field is absent", () => {
    const minimal: BookRecord = {
      slug: "no-isbn",
      title: "No ISBN",
      authorName: "Anon",
      format: "reference",
      source: "community",
      parentHeader: BOOKS_HEADER,
    };
    const event = toBookRecordEvent(minimal);
    const tagNames = event.tags.map((t) => t[0]);
    expect(tagNames).not.toContain("isbn");
    expect(tagNames).not.toContain("isbn10");
    expect(tagNames).not.toContain("cover");
    expect(tagNames).not.toContain("year");
  });

  it("puts the blurb in content and an empty string when absent", () => {
    expect(toBookRecordEvent(sample).content).toBe(
      "Set in the Jazz Age on Long Island.",
    );
    const noBlurb: BookRecord = { ...sample, blurb: undefined };
    expect(toBookRecordEvent(noBlurb).content).toBe("");
  });

  it("carries the word-wrapper JSON payload with the bookSubmission discriminator", () => {
    const event = toBookRecordEvent(sample);
    expect(event.payload.word.wordTypes).toEqual(["word", "bookSubmission"]);
    expect(event.payload.word.slug).toBe("the-great-gatsby");
    expect(event.payload.bookSubmission).toMatchObject({
      slug: "the-great-gatsby",
      title: "The Great Gatsby",
      authorName: "F. Scott Fitzgerald",
      format: "reference",
      source: "openlibrary",
    });
  });
});

describe("fromBookRecordEvent", () => {
  it("round-trips: to then from yields a BookRecord equal to the original", () => {
    const event = toBookRecordEvent(sample);
    const back = fromBookRecordEvent(event);
    expect(back).toEqual(sample);
  });
});
