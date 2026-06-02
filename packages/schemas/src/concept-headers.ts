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
/** ADR 0016: community submissions live in their own concept, separate from
 * the librarian-seeded canonical catalog. */
export const BOOK_SUBMISSIONS_HEADER_SLUG = "book-submissions";
/** ADR 0032 §1: author claims against catalog books (the "Author (claimed)"
 * badge + "Books by this author"). */
export const BOOK_CLAIMS_HEADER_SLUG = "book-claims";
/** ADR 0032 §3 / ADR 0033 §4: the author metadata overlay (blurb / cover /
 * purchase links) z-tags here. Reserved in Story 31, built in Story 32. */
export const BOOK_AUTHOR_EDITS_HEADER_SLUG = "author-edits";
/** ADR 0033 §1: trusted-curator author-verified assertions z-tag here (the
 * verification count-gate reads this concept). */
export const BOOK_AUTHOR_VERIFIED_HEADER_SLUG = "author-verified";
/** ADR 0034 §3: librarian-signed accusatory-tag reveal/withdraw events z-tag
 * here. The book-tags read scans this concept (per book, #a-scoped) to surface
 * a revealed accusatory tag at read time (filter-at-view-time). */
export const BOOK_ACCUSATORY_REVEALS_HEADER_SLUG = "accusatory-reveals";

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

export function buildBookSubmissionsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_SUBMISSIONS_HEADER_SLUG);
}

export function buildBookClaimsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_CLAIMS_HEADER_SLUG);
}

export function buildBookAuthorEditsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_AUTHOR_EDITS_HEADER_SLUG);
}

export function buildBookAuthorVerifiedHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_AUTHOR_VERIFIED_HEADER_SLUG);
}

export function buildBookAccusatoryRevealsHeaderAddress(
  librarianPubkey: HexPubkey,
): DListAddress<39998> {
  return header(librarianPubkey, BOOK_ACCUSATORY_REVEALS_HEADER_SLUG);
}
