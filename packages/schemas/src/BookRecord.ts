import type {
  DListAddress,
  HexPubkey,
  UnsignedDListEvent,
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
export function buildBookRecordDTag(_slug: string): string {
  throw new Error("buildBookRecordDTag not implemented");
}

export function toBookRecordEvent(_record: BookRecord): BookRecordEvent {
  throw new Error("toBookRecordEvent not implemented");
}

export function fromBookRecordEvent(_event: BookRecordEvent): BookRecord {
  throw new Error("fromBookRecordEvent not implemented");
}
