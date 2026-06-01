// Story 30 / ADR 0031 §1/§5 — the worker's PURE builder
// `mapSubmissionToCatalogRecord(submission, booksHeader, submitterHex)`:
// builds the canonical BookRecord under the librarian's `books` header,
// d-tag = slug, source: "community", AND a single
// `["submitted-by", <originalSubmitterHex>]` tag (hex on the wire).
//
// RED until `apps/promoter/src/build.ts` exists. No relay, no LIBRARIAN_NSEC —
// the builder is pure and signing happens elsewhere.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  type BookRecord,
} from "@unbnd/schemas";
import { mapSubmissionToCatalogRecord } from "../src/build";

const LIB = asHexPubkey("1".repeat(63) + "a");
const SUBMITTER = asHexPubkey("2".repeat(63) + "b");
const BOOKS_HEADER = buildBookRecordsHeaderAddress(LIB);

// The submission as the worker reads it (parsed from the submitter-signed event).
const submission = {
  slug: "orbital--samantha-harvey--x1",
  title: "Orbital",
  authorName: "Samantha Harvey",
  isbn13: "9780802162540",
  publishYear: 2023,
  format: "reference" as const,
};

describe("mapSubmissionToCatalogRecord — canonical catalog record (AC-3)", () => {
  it("builds a BookRecord under the librarian's `books` header (not book-submissions)", () => {
    const record = mapSubmissionToCatalogRecord(submission, BOOKS_HEADER, SUBMITTER) as BookRecord;
    expect(record.parentHeader.dTag).toBe("books");
    expect(record.parentHeader.pubkey).toBe(LIB);
    expect(record.parentHeader.kind).toBe(39998);
  });

  it("preserves the slug as the d-tag (idempotency/address key)", () => {
    const record = mapSubmissionToCatalogRecord(submission, BOOKS_HEADER, SUBMITTER) as BookRecord;
    expect(record.slug).toBe(submission.slug);
    const event = toBookRecordEvent(record);
    expect(event.tags).toContainEqual(["d", submission.slug]);
  });

  it("sets source: 'community' (honest provenance, not openlibrary)", () => {
    const record = mapSubmissionToCatalogRecord(submission, BOOKS_HEADER, SUBMITTER) as BookRecord;
    expect(record.source).toBe("community");
  });

  it("mints the original submitter via submittedBy → a single ['submitted-by', <hex>] tag", () => {
    const record = mapSubmissionToCatalogRecord(submission, BOOKS_HEADER, SUBMITTER) as BookRecord;
    expect(record.submittedBy).toBe(SUBMITTER);
    const event = toBookRecordEvent(record);
    const subTags = event.tags.filter((t) => t[0] === "submitted-by");
    expect(subTags).toHaveLength(1);
    expect(subTags[0]).toEqual(["submitted-by", SUBMITTER]);
  });

  it("carries the submission's core metadata through (title, author)", () => {
    const record = mapSubmissionToCatalogRecord(submission, BOOKS_HEADER, SUBMITTER) as BookRecord;
    expect(record.title).toBe("Orbital");
    expect(record.authorName).toBe("Samantha Harvey");
  });
});
