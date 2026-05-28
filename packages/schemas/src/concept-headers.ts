import type { DListAddress, HexPubkey } from "./envelope";

export const BOOK_RECORDS_HEADER_SLUG = "books";
export const BOOK_GENRES_HEADER_SLUG = "genres";
export const BOOK_RATINGS_HEADER_SLUG = "book-ratings";
export const BOOK_GENRE_TAGS_HEADER_SLUG = "book-genre-tags";
export const BOOK_QUALITY_SIGNALS_HEADER_SLUG = "book-quality-signals";
export const BOOK_SHELVES_HEADER_SLUG = "book-shelves";

export function buildBookRecordsHeaderAddress(
  _librarianPubkey: HexPubkey,
): DListAddress<39998> {
  throw new Error("buildBookRecordsHeaderAddress not implemented");
}

export function buildBookGenresHeaderAddress(
  _librarianPubkey: HexPubkey,
): DListAddress<39998> {
  throw new Error("buildBookGenresHeaderAddress not implemented");
}

export function buildBookRatingsHeaderAddress(
  _librarianPubkey: HexPubkey,
): DListAddress<39998> {
  throw new Error("buildBookRatingsHeaderAddress not implemented");
}

export function buildBookGenreTagsHeaderAddress(
  _librarianPubkey: HexPubkey,
): DListAddress<39998> {
  throw new Error("buildBookGenreTagsHeaderAddress not implemented");
}

export function buildBookQualitySignalsHeaderAddress(
  _librarianPubkey: HexPubkey,
): DListAddress<39998> {
  throw new Error("buildBookQualitySignalsHeaderAddress not implemented");
}

export function buildBookShelvesHeaderAddress(
  _librarianPubkey: HexPubkey,
): DListAddress<39998> {
  throw new Error("buildBookShelvesHeaderAddress not implemented");
}
