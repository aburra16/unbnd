// FAILING TESTS — Story 105 / ADR 0094 §1, §2, §5: a book record's facets as
// NIP-32 labels, and the record template carrying format and language.
import { describe, expect, it } from "vitest";
import {
  BOOK_LABEL_NAMESPACES,
  bookLabels,
  labelsOf,
  withBookLabels,
  sameBookLabels,
} from "../src/BookLabels";
import { fromBookRecordEvent, isbn13Of, toBookRecordEvent, type BookRecord } from "../src/BookRecord";
import { fromWireEvent, toWireTemplate } from "../src/wire";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const G = "ink.unbnd.genre";
const F = "ink.unbnd.format";
const LANG = "ISO-639-2";

describe("bookLabels", () => {
  it("names the three namespaces", () => {
    expect(BOOK_LABEL_NAMESPACES).toEqual([G, F, LANG]);
  });

  it("gives an L tag per namespace in use and an l tag per value, values sorted", () => {
    expect(bookLabels({ genres: ["mystery", "fantasy"], format: "reference", language: "eng" })).toEqual([
      ["L", G],
      ["l", "fantasy", G],
      ["l", "mystery", G],
      ["L", F],
      ["l", "reference", F],
      ["L", LANG],
      ["l", "eng", LANG],
    ]);
  });

  it("leaves out a namespace with no value, and repeats no genre", () => {
    expect(bookLabels({ genres: [], format: "ebook" })).toEqual([["L", F], ["l", "ebook", F]]);
    expect(bookLabels({ genres: ["fantasy", "fantasy"], format: "both" })).toEqual([
      ["L", G],
      ["l", "fantasy", G],
      ["L", F],
      ["l", "both", F],
    ]);
  });
});

describe("withBookLabels and labelsOf", () => {
  const record = [
    ["d", "ol-ol1w"],
    ["L", G],
    ["l", "romance", G],
    ["title", "Orbital"],
    ["L", "other.ns"],
    ["l", "keep-me", "other.ns"],
    ["format", "reference"],
  ];

  it("replaces only its own namespaces, keeps every other tag in place, and appends the new labels", () => {
    const out = withBookLabels(record, bookLabels({ genres: ["fantasy"], format: "reference", language: "eng" }));
    expect(out).toEqual([
      ["d", "ol-ol1w"],
      ["title", "Orbital"],
      ["L", "other.ns"],
      ["l", "keep-me", "other.ns"],
      ["format", "reference"],
      ["L", G],
      ["l", "fantasy", G],
      ["L", F],
      ["l", "reference", F],
      ["L", LANG],
      ["l", "eng", LANG],
    ]);
  });

  it("reads a record's labels back", () => {
    expect(labelsOf(record)).toEqual({ genres: ["romance"], format: undefined, language: undefined });
  });

  it("compares labels by value, not by tag order", () => {
    const a = bookLabels({ genres: ["fantasy", "mystery"], format: "reference" });
    const shuffled = [["l", "mystery", G], ["L", F], ["l", "reference", F], ["L", G], ["l", "fantasy", G]];
    expect(sameBookLabels(shuffled, a)).toBe(true);
    expect(sameBookLabels(record, a)).toBe(false);
  });
});

describe("the record template carries format and language labels (ADR 0094 §5)", () => {
  const LIB = hex64("1".repeat(63) + "a");
  const header: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "books" };
  const rec: BookRecord = {
    slug: "ol-ol1w",
    title: "Orbital",
    authorName: "Samantha Harvey",
    language: "eng",
    format: "reference",
    source: "openlibrary",
    parentHeader: header,
  };

  it("emits the labels and still round-trips the record", () => {
    const event = toBookRecordEvent(rec);
    expect(labelsOf(event.tags)).toEqual({ genres: [], format: "reference", language: "eng" });
    const wire = toWireTemplate(event, 1_790_000_000);
    expect(fromBookRecordEvent(fromWireEvent(wire) as never)).toMatchObject({ slug: "ol-ol1w", language: "eng" });
  });

  it("a record that already carries genre labels still parses", () => {
    const wire = toWireTemplate(toBookRecordEvent(rec), 1_790_000_000);
    const tags = withBookLabels(wire.tags, bookLabels({ genres: ["fantasy"], format: "reference", language: "eng" }));
    expect(fromBookRecordEvent(fromWireEvent({ ...wire, tags }) as never)).toMatchObject({ slug: "ol-ol1w" });
  });
});

// Story 106 / ADR 0095 §7: the book's ISBN as a NIP-73 identifier, so a relay
// can find a book by ISBN with a single-letter tag filter.
describe("the ISBN as a NIP-73 identifier", () => {
  it("bookLabels adds [i, isbn:<13 digits>] when the book has an ISBN-13", () => {
    expect(bookLabels({ genres: [], format: "reference", isbn13: "9780141439518" })).toContainEqual(["i", "isbn:9780141439518"]);
    expect(bookLabels({ genres: [], format: "reference" }).some((t) => t[0] === "i")).toBe(false);
  });

  it("withBookLabels replaces an old ISBN identifier and keeps any other i tag", () => {
    const tags = [["i", "isbn:9780000000000"], ["i", "https://example.com/x"], ["d", "x"]];
    const out = withBookLabels(tags, bookLabels({ genres: [], format: "reference", isbn13: "9780141439518" }));
    expect(out.filter((t) => t[0] === "i")).toEqual([["i", "https://example.com/x"], ["i", "isbn:9780141439518"]]);
    expect(sameBookLabels(out, bookLabels({ genres: [], format: "reference", isbn13: "9780141439518" }))).toBe(true);
  });

  it("isbn13Of normalizes an ISBN-13 or converts an ISBN-10, and refuses anything else", () => {
    expect(isbn13Of("978-0-14-143951-8")).toBe("9780141439518");
    expect(isbn13Of("0141439513")).toBe("9780141439518");
    expect(isbn13Of("080442957X")).toBe("9780804429573");
    expect(isbn13Of("orbital")).toBeNull();
    expect(isbn13Of("9780141439519")).toBeNull();
  });

  it("the record template carries the identifier", () => {
    const LIB = hex64("1".repeat(63) + "a");
    const ev = toBookRecordEvent({
      slug: "s", title: "T", authorName: "A", isbn13: "9780141439518", format: "reference", source: "openlibrary",
      parentHeader: { kind: 39998, pubkey: LIB, dTag: "books" },
    });
    expect(ev.tags).toContainEqual(["i", "isbn:9780141439518"]);
  });
});
