// Build the unsigned kind-39999 record for a community submission (ADR 0016).
// The record is z-tagged to the librarian's `book-submissions` concept — NOT
// the canonical `books` concept — so submissions stay separate until promotion
// (story 16b). Signed by the submitter (sovereign NIP-07 / custodial wrap).
import {
  asHexPubkey,
  buildBookSubmissionsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type NostrEventTemplate,
} from "@unbnd/schemas";
import type { Config } from "../config";

export type SubmissionInput = {
  readonly submitterPubkey: string;
  readonly title: string;
  readonly authorName: string;
  readonly isbn13?: string;
  readonly isbn10?: string;
  readonly blurb?: string;
  readonly coverUrl?: string;
  readonly publishYear?: number;
  readonly pageCount?: number;
  readonly language?: string;
  readonly purchaseUrl?: string;
  readonly subjects?: readonly string[];
  readonly isAuthor?: boolean;
};

export type SubmissionErrorCode = "validation_failed" | "feature_unavailable";

export class SubmissionError extends Error {
  constructor(readonly code: SubmissionErrorCode, message: string) {
    super(message);
    this.name = "SubmissionError";
  }
}

function slugPart(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isbnDigits(s?: string): string | undefined {
  const d = s?.replace(/[^0-9Xx]/g, "");
  return d && (d.length === 13 || d.length === 10) ? d.toUpperCase() : undefined;
}

/**
 * Deterministic, collision-safe submission slug: ISBN when present, else
 * title+author, suffixed with the submitter's pubkey so re-submitting the same
 * book by the same user is idempotent (replaceable d-tag) without clashing
 * across submitters.
 */
export function submissionSlug(input: SubmissionInput): string {
  const isbn = isbnDigits(input.isbn13) ?? isbnDigits(input.isbn10);
  const base = isbn
    ? `isbn-${isbn}`
    : `${slugPart(input.title)}--${slugPart(input.authorName)}`.slice(0, 80);
  return `sub--${base}--${input.submitterPubkey.slice(0, 8)}`;
}

export function buildSubmissionTemplate(
  config: Config,
  input: SubmissionInput,
  createdAt: number,
): NostrEventTemplate {
  if (!config.librarianPubkey) {
    throw new SubmissionError("feature_unavailable", "Submissions are not configured.");
  }
  if (!input.title?.trim() || !input.authorName?.trim()) {
    throw new SubmissionError("validation_failed", "Title and author are required.");
  }
  const record: BookRecord = {
    slug: submissionSlug(input),
    title: input.title.trim(),
    authorName: input.authorName.trim(),
    authorPubkey: input.isAuthor ? asHexPubkey(input.submitterPubkey) : undefined,
    isbn13: isbnDigits(input.isbn13),
    isbn10: input.isbn10?.trim() || undefined,
    blurb: input.blurb?.trim() || undefined,
    coverUrl: input.coverUrl?.trim() || undefined,
    publishYear: input.publishYear,
    pageCount: input.pageCount,
    language: input.language,
    subjects: input.subjects && input.subjects.length > 0 ? input.subjects : undefined,
    purchaseUrl: input.purchaseUrl?.trim() || undefined,
    format: "reference",
    source: input.isAuthor ? "author" : "community",
    parentHeader: buildBookSubmissionsHeaderAddress(asHexPubkey(config.librarianPubkey)),
  };
  return toWireTemplate(toBookRecordEvent(record), createdAt) as NostrEventTemplate;
}
