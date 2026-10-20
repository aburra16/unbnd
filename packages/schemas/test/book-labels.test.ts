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
import { fromBookRecordEvent, toBookRecordEvent, type BookRecord } from "../src/BookRecord";
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
