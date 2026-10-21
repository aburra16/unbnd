// FAILING TESTS — Story 109 / ADR 0097 §3: Open Library dump lines into the
// fields the gate and mapper read, computed as Open Library's search index does.
import { describe, expect, it } from "vitest";
import {
  EditionAggregate,
  editionWorkId,
  parseAuthor,
  parseEdition,
  parseRedirect,
  parseWork,
  readingLogWorkId,
  splitDumpLine,
  toSearchDoc,
} from "../src/dump/extract";

const line = (type: string, key: string, json: object) => `${type}\t${key}\t3\t2026-09-01T00:00:00\t${JSON.stringify(json).replace(/":/g, '": ').replace(/,"/g, ', "')}`;

describe("dump lines", () => {
  it("splits a dump line into type, key and the JSON text", () => {
    expect(splitDumpLine(line("/type/work", "/works/OL1W", { title: "T" }))).toMatchObject({ type: "/type/work", key: "/works/OL1W" });
    expect(splitDumpLine("garbage")).toBeNull();
  });

  it("reads the work of a reading-log line", () => {
    expect(readingLogWorkId("/works/OL4439701W\t\\N\tAlready Read\t2017-12-11")).toBe("OL4439701W");
    expect(readingLogWorkId("/books/OL1M\t\\N\tAlready Read\t2017")).toBeNull();
  });

  it("reads a work or author redirect, and nothing else", () => {
    expect(parseRedirect({ key: "/works/OL1W", location: "/works/OL2W" })).toEqual({ from: "OL1W", to: "OL2W" });
    expect(parseRedirect({ key: "/authors/OL1A", location: "/authors/OL2A" })).toEqual({ from: "OL1A", to: "OL2A" });
    expect(parseRedirect({ key: "/about/people", location: "/about/team" })).toBeNull();
  });

  it("finds an edition's work in the raw line before any parse", () => {
    const raw = line("/type/edition", "/books/OL9M", { title: "E", works: [{ key: "/works/OL77W" }] });
    expect(editionWorkId(raw)).toBe("OL77W");
    expect(editionWorkId(line("/type/edition", "/books/OL9M", { title: "E" }))).toBeNull();
  });
});

describe("records", () => {
  it("a work: title, first author, first cover, subjects, description in either shape", () => {
    expect(parseWork({
      title: " Orbital ", covers: [-1, 123, 456], subjects: ["Space", 7, "Fiction"],
      authors: [{ type: { key: "/type/author_role" }, author: { key: "/authors/OL5A" } }],
      description: { type: "/type/text", value: "About it." },
    })).toEqual({ title: "Orbital", authorKey: "OL5A", cover: 123, subjects: ["Space", "Fiction"], description: "About it." });
    expect(parseWork({ title: "X", description: "Plain." }).description).toBe("Plain.");
  });

  it("an edition: its languages, pages, year, ISBNs and cover", () => {
    expect(parseEdition({
      works: [{ key: "/works/OL77W" }], languages: [{ key: "/languages/eng" }, { key: "/languages/fre" }],
      number_of_pages: 320, publish_date: "June 13, 2005", isbn_13: ["9780107806682"], isbn_10: ["0107806681"], covers: [99],
    })).toEqual({ workId: "OL77W", languages: ["eng", "fre"], pages: 320, year: 2005, isbns: ["9780107806682", "0107806681"], cover: 99 });
  });

  it("an author: name and birth year", () => {
    expect(parseAuthor({ name: "Charles Dickens", birth_date: "7 February 1812" })).toEqual({ name: "Charles Dickens", birthYear: 1812 });
  });
});

describe("toSearchDoc", () => {
  it("aggregates editions as the search index does", () => {
    const agg = new EditionAggregate();
    agg.add({ languages: ["eng"], pages: 300, year: 2001, isbns: ["9780000000002"], cover: 5 });
    agg.add({ languages: ["fre"], pages: 100, year: 1999, isbns: ["0000000000"] });
    agg.add({ languages: ["eng"], pages: 200, year: 2010, isbns: [] });
    const doc = toSearchDoc("OL77W", { title: "Orbital", authorKey: "OL5A", subjects: ["Space"] }, agg, "Samantha Harvey");
    expect(doc).toEqual({
      key: "/works/OL77W",
      title: "Orbital",
      author_name: ["Samantha Harvey"],
      author_key: ["OL5A"],
      edition_count: 3,
      cover_i: 5,
      language: ["eng", "fre"],
      number_of_pages_median: 200,
      publish_year: [1999, 2001, 2010],
      first_publish_year: 1999,
      isbn: ["9780000000002", "0000000000"],
      subject: ["Space"],
    });
  });

  it("prefers the work's cover, and leaves out what is unknown", () => {
    const agg = new EditionAggregate();
    agg.add({ languages: [], isbns: [], cover: 5 });
    const doc = toSearchDoc("OL1W", { title: "T", cover: 9, subjects: [] }, agg, undefined);
    expect(doc.cover_i).toBe(9);
    expect(doc).not.toHaveProperty("author_name");
    expect(doc).not.toHaveProperty("first_publish_year");
    expect(doc).not.toHaveProperty("number_of_pages_median");
  });

  it("an even count of page numbers takes the median truncated, as Open Library's index does", () => {
    const agg = new EditionAggregate();
    agg.add({ languages: [], isbns: [], pages: 415 });
    agg.add({ languages: [], isbns: [], pages: 416 });
    expect(toSearchDoc("OL1W", { title: "T", subjects: [] }, agg, undefined).number_of_pages_median).toBe(415);
  });
});
