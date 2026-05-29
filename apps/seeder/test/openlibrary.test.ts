import { describe, expect, it } from "vitest";
import { deriveSlug, mapWorkToBookRecord, type OLWork } from "../src/openlibrary";
import {
  fromBookRecordEvent,
  toBookRecordEvent,
  buildBookRecordsHeaderAddress,
  asHexPubkey,
  type DListAddress,
} from "@unbnd/schemas";

const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");
const HEADER: DListAddress<39998> = buildBookRecordsHeaderAddress(LIBRARIAN);

const sample: OLWork = {
  key: "/works/OL45804W",
  title: "The Great Gatsby",
  authors: [{ name: "F. Scott Fitzgerald", key: "/authors/OL26320A" }],
  first_publish_year: 1925,
  cover_id: 1234,
  subject: ["fiction", "classic"],
};

describe("deriveSlug", () => {
  it("normalizes a work key to a stable slug", () => {
    expect(deriveSlug("/works/OL45804W")).toBe("ol-ol45804w");
    expect(deriveSlug("OL45804W")).toBe("ol-ol45804w");
  });
  it("is deterministic (idempotent d-tag)", () => {
    expect(deriveSlug("/works/OL1W")).toBe(deriveSlug("/works/OL1W"));
  });
});

describe("mapWorkToBookRecord", () => {
  it("maps a work to a BookRecord with openlibrary source + reference format", () => {
    const r = mapWorkToBookRecord(sample, HEADER);
    expect(r).not.toBeNull();
    expect(r!.slug).toBe("ol-ol45804w");
    expect(r!.title).toBe("The Great Gatsby");
    expect(r!.authorName).toBe("F. Scott Fitzgerald");
    expect(r!.source).toBe("openlibrary");
    expect(r!.format).toBe("reference");
    expect(r!.publishYear).toBe(1925);
    expect(r!.openLibraryId).toBe("OL45804W");
    expect(r!.coverUrl).toMatch(/covers\.openlibrary\.org\/b\/id\/1234/);
    expect(r!.parentHeader.dTag).toBe("books");
  });

  it("returns null when title or author is missing", () => {
    expect(mapWorkToBookRecord({ key: "/works/OL2W", authors: [{ name: "x" }] }, HEADER)).toBeNull();
    expect(mapWorkToBookRecord({ key: "/works/OL3W", title: "Untitled" }, HEADER)).toBeNull();
  });

  it("produces an event that round-trips through the schemas builders", () => {
    const r = mapWorkToBookRecord(sample, HEADER)!;
    const back = fromBookRecordEvent(toBookRecordEvent(r));
    expect(back.slug).toBe(r.slug);
    expect(back.title).toBe(r.title);
    expect(back.authorName).toBe(r.authorName);
  });
});
