import type {
  DListAddress,
  HexPubkey,
  UnsignedDListEvent,
} from "./envelope";

export const BOOK_GENRE_TAG_KIND = 39999 as const;
export const BOOK_GENRE_TAG_WORD_TYPE = "bookGenreTag" as const;

/**
 * Domain type — what the UI consumes.
 *
 * Mirrors PRD §6.5. Two typed cross-references: one to the book record,
 * one to the genre. Both flow through the shared `DListAddress<39999>`
 * type per ADR 0001 AC-3.
 */
export type BookGenreTag = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly genreSlug: string;
  readonly genreAddress: DListAddress<39999>;
  readonly taggerPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookGenreTagPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookGenreTag", ...string[]];
  };
  readonly bookGenreTag: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly genreSlug: string;
  };
};

export type BookGenreTagEvent = UnsignedDListEvent<
  39999,
  "bookGenreTag",
  BookGenreTagPayload["bookGenreTag"]
>;

/**
 * D-tag pattern: `genre-tag--<bookSlug>--<genreSlug>--<taggerPubkey.slice(0,8)>`.
 * Composite identity (tagger, book, genre); re-publishing overwrites.
 */
export function buildBookGenreTagDTag(
  _bookSlug: string,
  _genreSlug: string,
  _taggerPubkey: HexPubkey,
): string {
  throw new Error("buildBookGenreTagDTag not implemented");
}

export function toBookGenreTagEvent(_tag: BookGenreTag): BookGenreTagEvent {
  throw new Error("toBookGenreTagEvent not implemented");
}

export function fromBookGenreTagEvent(_event: BookGenreTagEvent): BookGenreTag {
  throw new Error("fromBookGenreTagEvent not implemented");
}
