import {
  asHexPubkey,
  formatAddress,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";

export const BOOK_RECORD_KIND = 39999 as const;
export const BOOK_RECORD_WORD_TYPE = "bookSubmission" as const;

export type BookFormat = "reference" | "ebook" | "both";
export type BookSource = "openlibrary" | "author" | "community";

/**
 * Domain type — what the UI and fixtures consume.
 *
 * Mirrors PRD §6.2. `parentHeader` is the address of the librarian's
 * "books" concept header; it travels with the record so consumers can
 * navigate back without recomputing the address.
 */
export type BookRecord = {
  readonly slug: string;
  readonly title: string;
  readonly authorName: string;
  readonly authorPubkey?: HexPubkey;
  readonly isbn13?: string;
  readonly isbn10?: string;
  readonly openLibraryId?: string;
  readonly coverUrl?: string;
  readonly pageCount?: number;
  readonly publishYear?: number;
  readonly language?: string;
  readonly subjects?: readonly string[];
  readonly blurb?: string;
  readonly format: BookFormat;
  readonly fileUrl?: string;
  readonly purchaseUrl?: string;
  readonly source: BookSource;
  /**
   * Original submission event's author (hex). Set only on a community record
   * minted by promotion (ADR 0031 §5); seeded records leave it unset. When set,
   * `toBookRecordEvent` emits a single `["submitted-by", <hex>]` tag.
   */
  readonly submittedBy?: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookRecordPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookSubmission", ...string[]];
  };
  readonly bookSubmission: {
    readonly slug: string;
    readonly title: string;
    readonly authorName: string;
    readonly authorPubkey: string | null;
    readonly isbn13?: string;
    readonly isbn10?: string;
    readonly openLibraryId?: string;
    readonly coverUrl?: string;
    readonly pageCount?: number;
    readonly publishYear?: number;
    readonly language?: string;
    readonly subjects?: readonly string[];
    readonly blurb?: string;
    readonly format: BookFormat;
    readonly fileUrl: string | null;
    readonly purchaseUrl?: string;
    readonly source: BookSource;
    readonly submittedBy?: string | null;
  };
};

export type BookRecordEvent = UnsignedDListEvent<
  39999,
  "bookSubmission",
  BookRecordPayload["bookSubmission"]
>;

/**
 * The book record's d-tag is the slug — the librarian alone publishes the
 * catalog seed, so the composite identity reduces to slug.
 */
export function buildBookRecordDTag(slug: string): string {
  return slug;
}

export function toBookRecordEvent(record: BookRecord): BookRecordEvent {
  const dTag = buildBookRecordDTag(record.slug);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(record.parentHeader)],
    ["t", record.slug],
    ["title", record.title],
    ["author", record.authorName],
  ];
  if (record.authorPubkey) tags.push(["p", record.authorPubkey]);
  if (record.submittedBy) tags.push(["submitted-by", record.submittedBy]);
  if (record.isbn13) tags.push(["isbn", record.isbn13]);
  if (record.isbn10) tags.push(["isbn10", record.isbn10]);
  if (record.openLibraryId)
    tags.push(["open-library-id", record.openLibraryId]);
  if (record.language) tags.push(["lang", record.language]);
  if (record.publishYear !== undefined)
    tags.push(["year", String(record.publishYear)]);
  if (record.pageCount !== undefined)
    tags.push(["pages", String(record.pageCount)]);
  if (record.coverUrl) tags.push(["cover", record.coverUrl]);
  if (record.purchaseUrl) tags.push(["read-at", record.purchaseUrl]);
  if (record.fileUrl) tags.push(["file", record.fileUrl]);
  if (record.subjects) {
    for (const subject of record.subjects) {
      tags.push(["subject", subject]);
    }
  }
  tags.push(["format", record.format]);
  tags.push(["source", record.source]);

  const payload: BookRecordPayload = {
    word: {
      slug: record.slug,
      name: record.title,
      title: record.title,
      wordTypes: ["word", "bookSubmission"],
    },
    bookSubmission: {
      slug: record.slug,
      title: record.title,
      authorName: record.authorName,
      authorPubkey: record.authorPubkey ?? null,
      isbn13: record.isbn13,
      isbn10: record.isbn10,
      openLibraryId: record.openLibraryId,
      coverUrl: record.coverUrl,
      pageCount: record.pageCount,
      publishYear: record.publishYear,
      language: record.language,
      subjects: record.subjects,
      blurb: record.blurb,
      format: record.format,
      fileUrl: record.fileUrl ?? null,
      purchaseUrl: record.purchaseUrl,
      source: record.source,
      submittedBy: record.submittedBy ?? null,
    },
  };

  return {
    kind: BOOK_RECORD_KIND,
    tags,
    content: record.blurb ?? "",
    payload,
    parentHeader: record.parentHeader,
  };
}

export function fromBookRecordEvent(event: BookRecordEvent): BookRecord {
  const p = event.payload.bookSubmission;
  return {
    slug: p.slug,
    title: p.title,
    authorName: p.authorName,
    authorPubkey: p.authorPubkey ? asHexPubkey(p.authorPubkey) : undefined,
    isbn13: p.isbn13,
    isbn10: p.isbn10,
    openLibraryId: p.openLibraryId,
    coverUrl: p.coverUrl,
    pageCount: p.pageCount,
    publishYear: p.publishYear,
    language: p.language,
    subjects: p.subjects,
    blurb: p.blurb,
    format: p.format,
    fileUrl: p.fileUrl ?? undefined,
    purchaseUrl: p.purchaseUrl,
    source: p.source,
    submittedBy: p.submittedBy ? asHexPubkey(p.submittedBy) : undefined,
    parentHeader: event.parentHeader,
  };
}
