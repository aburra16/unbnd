import type { DListAddress, HexPubkey } from "./envelope";

export const BOOK_RECORDS_HEADER_SLUG = "books";
export const BOOK_GENRES_HEADER_SLUG = "genres";
export const BOOK_RATINGS_HEADER_SLUG = "book-ratings";
export const BOOK_GENRE_TAGS_HEADER_SLUG = "book-genre-tags";
export const BOOK_QUALITY_SIGNALS_HEADER_SLUG = "book-quality-signals";
export const BOOK_SHELVES_HEADER_SLUG = "book-shelves";
/** ADR 0009: the unified classification concepts. */
export const BOOK_TAGS_HEADER_SLUG = "book-tags";
export const BOOK_TAG_ASSERTIONS_HEADER_SLUG = "book-tag-assertions";

function header(
  librarianPubkey: HexPubkey,
  dTag: string,
): DListAddress<39998> {
  return { kind: 39998, pubkey: librarianPubkey, dTag };
}

export function buildBookRecordsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_RECORDS_HEADER_SLUG);
}

export function buildBookGenresHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_GENRES_HEADER_SLUG);
}

export function buildBookRatingsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_RATINGS_HEADER_SLUG);
}

export function buildBookGenreTagsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_GENRE_TAGS_HEADER_SLUG);
}

export function buildBookQualitySignalsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_QUALITY_SIGNALS_HEADER_SLUG);
}

export function buildBookShelvesHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_SHELVES_HEADER_SLUG);
}

export function buildBookTagsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_TAGS_HEADER_SLUG);
}

export function buildBookTagAssertionsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_TAG_ASSERTIONS_HEADER_SLUG);
}
