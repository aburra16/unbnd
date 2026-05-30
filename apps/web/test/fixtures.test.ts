import { describe, expect, it } from "vitest";
import type {
  BookGenre,
  BookRecord,
} from "@unbnd/schemas";
import { bookRecords } from "../src/data/book-fixtures";
import { genreRecords } from "../src/data/genre-fixtures";
import {
  profileRecords,
  type ProfileShelfFixture,
} from "../src/data/profile-fixtures";

describe("book-fixtures conform to @unbnd/schemas BookRecord", () => {
  it("exports the orbital fixture as a BookRecord", () => {
    const r: BookRecord = bookRecords["orbital"]!;
    expect(r.slug).toBe("orbital");
    expect(r.parentHeader.kind).toBe(39998);
    expect(r.parentHeader.dTag).toBe("books");
  });

  it("every entry in bookRecords is a valid BookRecord with the required fields", () => {
    for (const [slug, record] of Object.entries(bookRecords)) {
      const r: BookRecord = record;
      expect(r.slug).toBe(slug);
      expect(typeof r.title).toBe("string");
      expect(typeof r.authorName).toBe("string");
      expect(r.parentHeader.kind).toBe(39998);
    }
  });
});

describe("genre-fixtures conform to @unbnd/schemas BookGenre", () => {
  it("every genre in genreRecords is a valid BookGenre", () => {
    for (const [slug, record] of Object.entries(genreRecords)) {
      const g: BookGenre = {
        slug: record.slug,
        name: record.name,
        description: record.description,
        parentHeader: record.parentHeader,
      };
      expect(g.slug).toBe(slug);
      expect(g.parentHeader.kind).toBe(39998);
      expect(g.parentHeader.dTag).toBe("genres");
    }
  });
});

describe("profile-fixtures shelves are well-formed ProfileShelfFixtures", () => {
  it("every shelf in mira-calloway's profile is z-tagged to book-shelves with parallel book arrays", () => {
    const mira = profileRecords["mira-calloway"];
    expect(mira).toBeDefined();
    for (const shelf of mira!.shelves) {
      const s: ProfileShelfFixture = shelf;
      expect(s.parentHeader.kind).toBe(39998);
      expect(s.parentHeader.dTag).toBe("book-shelves");
      expect(s.bookSlugs.length).toBe(s.bookAddresses.length);
    }
  });
});
