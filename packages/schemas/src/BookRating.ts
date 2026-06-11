import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
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
  bookSlug: string,
  raterPubkey: HexPubkey,
): string {
  return `rating--${bookSlug}--${pubkeyPrefix(raterPubkey)}`;
}

export function toBookRatingEvent(rating: BookRating): BookRatingEvent {
  const dTag = buildBookRatingDTag(rating.bookSlug, rating.raterPubkey);
  const bookAtag = formatAddress(rating.bookAddress);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(rating.parentHeader)],
    ["t", rating.bookSlug],
    ["a", bookAtag],
    ["p", rating.raterPubkey],
    ["score", String(rating.score)],
    ["review-date", rating.reviewDate],
  ];

  const payload: BookRatingPayload = {
    word: {
      slug: dTag,
      name: `rating: ${rating.bookSlug}`,
      title: `Rating: ${rating.bookSlug}`,
      wordTypes: ["word", "bookRating"],
    },
    bookRating: {
      bookSlug: rating.bookSlug,
      bookAtag,
      score: rating.score,
      reviewText: rating.reviewText,
      reviewDate: rating.reviewDate,
    },
  };

  return {
    kind: BOOK_RATING_KIND,
    tags,
    content: rating.reviewText ?? "",
    payload,
    parentHeader: rating.parentHeader,
  };
}

/**
 * A rating RETRACTION (Story 79 / ADR 0077): a self-signed kind-39999 event
 * published under the SAME `rating--<slug>--<rater8>` d-tag as the rating it
 * removes. Kind 39999 is parameterized-replaceable, so the retraction REPLACES
 * the rating at the relay; re-rating later replaces the retraction (restore).
 * It carries a `["retracted","true"]` marker and NO score.
 */
export type BookRatingRetraction = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly raterPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookRatingRetractionPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookRating", ...string[]];
  };
  readonly bookRating: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly retracted: true;
  };
};

export type BookRatingRetractionEvent = UnsignedDListEvent<
  39999,
  "bookRating",
  BookRatingRetractionPayload["bookRating"]
>;

export function buildBookRatingRetraction(
  retraction: BookRatingRetraction,
): BookRatingRetractionEvent {
  const dTag = buildBookRatingDTag(retraction.bookSlug, retraction.raterPubkey);
  const bookAtag = formatAddress(retraction.bookAddress);
  return {
    kind: BOOK_RATING_KIND,
    // The rating's routing tags (z, t, a, p) so the same #a read returns the
    // retraction; the marker instead of a score.
    tags: [
      ["d", dTag],
      ["z", formatAddress(retraction.parentHeader)],
      ["t", retraction.bookSlug],
      ["a", bookAtag],
      ["p", retraction.raterPubkey],
      ["retracted", "true"],
    ],
    content: "",
    payload: {
      word: {
        slug: dTag,
        name: `rating: ${retraction.bookSlug}`,
        title: `Rating: ${retraction.bookSlug}`,
        wordTypes: ["word", "bookRating"],
      },
      bookRating: {
        bookSlug: retraction.bookSlug,
        bookAtag,
        retracted: true,
      },
    },
    parentHeader: retraction.parentHeader,
  };
}

/**
 * The single shared retraction predicate every read fold uses (ADR 0077 §2):
 * recognizes a rating retraction by its marker tag, BEFORE any payload parse,
 * so `fromBookRatingEvent`'s score-required invariant stays intact. Works on
 * any tag-bearing view of the event (unsigned, template, or signed wire).
 */
export function isRatingRetraction(event: {
  readonly kind: number;
  readonly tags: ReadonlyArray<readonly string[]>;
}): boolean {
  if (event.kind !== BOOK_RATING_KIND) return false;
  const dTag = event.tags.find((t) => t[0] === "d")?.[1];
  if (typeof dTag !== "string" || !dTag.startsWith("rating--")) return false;
  return event.tags.some((t) => t[0] === "retracted" && t[1] === "true");
}

export function fromBookRatingEvent(event: BookRatingEvent): BookRating {
  const p = event.payload.bookRating;
  const raterTag = event.tags.find((t) => t[0] === "p");
  if (!raterTag || raterTag.length < 2) {
    throw new Error(
      "fromBookRatingEvent: missing `p` tag carrying the rater pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    raterPubkey: asHexPubkey(raterTag[1]!),
    score: p.score,
    reviewText: p.reviewText,
    reviewDate: p.reviewDate,
    parentHeader: event.parentHeader,
  };
}
