// The promoter's PURE builder (Story 30 / ADR 0031 §1/§5). Given a parsed
// submission + the librarian's `books` header + the original submitter's hex,
// produce the canonical catalog `BookRecord`:
//   - parentHeader = the librarian's `books` concept (first-class catalog entry)
//   - d-tag = slug (the idempotency/address key: 39999:<librarian>:<slug>)
//   - source = "community" (honest provenance, not openlibrary)
//   - submittedBy = the original submitter hex → a single ["submitted-by", <hex>]
//     tag on the wire (HEX, never an npub)
//
// Pure: no signing, no relay, no LIBRARIAN_NSEC. Signing happens in the loop.
import type { BookRecord, DListAddress, HexPubkey } from "@unbnd/schemas";

/** The submission as the worker reads it (parsed from the submitter-signed event). */
export type ParsedSubmission = {
  readonly slug: string;
  readonly title: string;
  readonly authorName: string;
  readonly isbn13?: string;
  readonly isbn10?: string;
  readonly coverUrl?: string;
  readonly publishYear?: number;
  readonly language?: string;
  readonly subjects?: readonly string[];
  readonly blurb?: string;
  readonly format: BookRecord["format"];
};

export function mapSubmissionToCatalogRecord(
  submission: ParsedSubmission,
  booksHeader: DListAddress<39998>,
  submittedBy: HexPubkey,
): BookRecord {
  return {
    slug: submission.slug,
    title: submission.title,
    authorName: submission.authorName,
    isbn13: submission.isbn13,
    isbn10: submission.isbn10,
    coverUrl: submission.coverUrl,
    publishYear: submission.publishYear,
    language: submission.language,
    subjects: submission.subjects,
    blurb: submission.blurb,
    format: submission.format,
    source: "community",
    submittedBy,
    parentHeader: booksHeader,
  };
}
