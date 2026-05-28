import type {
  DListAddress,
  HexPubkey,
  UnsignedDListEvent,
} from "./envelope";

export const BOOK_RATING_KIND = 39999 as const;
export const BOOK_RATING_WORD_TYPE = "bookRating" as const;

export type RatingScore = 1 | 2 | 3 | 4 | 5;

/**
 * Domain type — what the UI consumes.
 *
 * Mirrors PRD §6.4. `bookAddress` is the typed cross-reference to the
 * book record event. `raterPubkey` participates in d-tag construction
 * and identifies who made the rating.
 */
export type BookRating = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly raterPubkey: HexPubkey;
  readonly score: RatingScore;
  readonly reviewText?: string;
  /** ISO-8601 date (YYYY-MM-DD) */
  readonly reviewDate: string;
  readonly parentHeader: DListAddress<39998>;
};

export type BookRatingPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookRating", ...string[]];
  };
  readonly bookRating: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly score: RatingScore;
    readonly reviewText?: string;
    readonly reviewDate: string;
  };
};

export type BookRatingEvent = UnsignedDListEvent<
  39999,
  "bookRating",
  BookRatingPayload["bookRating"]
>;

/**
 * D-tag pattern: `rating--<bookSlug>--<raterPubkey.slice(0,8)>`.
 * Composite identity (rater, book); re-publishing under the same d-tag
 * overwrites the previous rating.
 */
export function buildBookRatingDTag(
  _bookSlug: string,
  _raterPubkey: HexPubkey,
): string {
  throw new Error("buildBookRatingDTag not implemented");
}

export function toBookRatingEvent(_rating: BookRating): BookRatingEvent {
  throw new Error("toBookRatingEvent not implemented");
}

export function fromBookRatingEvent(_event: BookRatingEvent): BookRating {
  throw new Error("fromBookRatingEvent not implemented");
}
