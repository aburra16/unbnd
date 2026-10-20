// Failing tests for Story 104 review round 3 (ADR 0093 §4): one list of every
// tag name toBookRecordEvent can write, so a check of "the tags the schema
// writes" (the year correction's rebuild check) covers a stray schema tag too.
import { describe, expect, it } from "vitest";
import { toBookRecordEvent, type BookRecord } from "../src/BookRecord";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";
import { loadSchemasModule } from "./_load";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const BOOKS: DListAddress<39998> = { kind: 39998, pubkey: LIBRARIAN, dTag: "books" };

// Every optional field set, so every tag the builder can write appears.
const full: BookRecord = {
  slug: "the-great-gatsby",
  title: "The Great Gatsby",
  authorName: "F. Scott Fitzgerald",
  authorPubkey: hex64("2".repeat(64)),
  submittedBy: hex64("3".repeat(64)),
  isbn13: "9780743273565",
  isbn10: "0743273567",
  openLibraryId: "OL468431W",
  coverUrl: "https://covers.openlibrary.org/b/isbn/9780743273565-L.jpg",
  pageCount: 180,
  publishYear: 1925,
  language: "eng",
  subjects: ["fiction"],
  blurb: "Set in the Jazz Age on Long Island.",
  format: "both",
  fileUrl: "https://example.org/gatsby.epub",
  purchaseUrl: "https://openlibrary.org/works/OL468431W",
  source: "community",
  parentHeader: BOOKS,
};

describe("BOOK_RECORD_TAG_NAMES", () => {
  it("names exactly the tags a fully filled record carries, labels aside", async () => {
    const { BOOK_RECORD_TAG_NAMES } = await loadSchemasModule<{
      BOOK_RECORD_TAG_NAMES: readonly string[];
    }>("BookRecord");
    const written = new Set(
      toBookRecordEvent(full)
        .tags.map((t) => t[0])
        .filter((n) => n !== "L" && n !== "l"),
    );
    expect(new Set(BOOK_RECORD_TAG_NAMES)).toEqual(written);
  });
});
