// Build the unsigned kind-39999 BookRating wire template, server-side, with
// the librarian pubkey resolved from config. ADR 0005.
import {
  asHexPubkey,
  buildBookRatingRetraction,
  buildBookRatingsHeaderAddress,
  toBookRatingEvent,
  toWireTemplate,
  type BookRating,
  type NostrEventTemplate,
  type RatingScore,
} from "@unbnd/schemas";
import type { Config } from "../config";

export type BuildRatingInput = {
  readonly raterPubkey: string;
  readonly bookSlug: string;
  readonly score: number;
  readonly reviewText?: string;
  readonly reviewDate: string;
};

export type RatingErrorCode =
  | "score_out_of_range"
  | "feature_unavailable"
  | "invalid_book";

export class RatingError extends Error {
  constructor(
    readonly code: RatingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RatingError";
  }
}

function isValidScore(n: number): n is RatingScore {
  return Number.isInteger(n) && n >= 1 && n <= 5;
}

export function buildRatingTemplate(
  config: Config,
  input: BuildRatingInput,
  createdAt: number,
): NostrEventTemplate {
  if (!isValidScore(input.score)) {
    throw new RatingError(
      "score_out_of_range",
      "Rating score must be an integer from 1 to 5.",
    );
  }
  if (!config.librarianPubkey) {
    throw new RatingError(
      "feature_unavailable",
      "Rating publishing is not configured (no librarian pubkey).",
    );
  }

  const librarian = asHexPubkey(config.librarianPubkey);
  const raterPubkey = asHexPubkey(input.raterPubkey);

  const rating: BookRating = {
    bookSlug: input.bookSlug,
    // The house catalog: book records are owned by the librarian identity.
    bookAddress: { kind: 39999, pubkey: librarian, dTag: input.bookSlug },
    raterPubkey,
    score: input.score,
    reviewText: input.reviewText,
    reviewDate: input.reviewDate,
    parentHeader: buildBookRatingsHeaderAddress(librarian),
  };

  return toWireTemplate(toBookRatingEvent(rating), createdAt);
}

export type BuildRetractionInput = {
  readonly raterPubkey: string;
  readonly bookSlug: string;
};

/**
 * Build the unsigned retraction wire template (Story 79 / ADR 0077): the SAME
 * `rating--<slug>--<rater8>` d-tag as the caller's rating, the retracted
 * marker, no score. Signing stays per-tier (sovereign NIP-07 / custodial
 * session key) exactly like the rating template.
 */
export function buildRetractionTemplate(
  config: Config,
  input: BuildRetractionInput,
  createdAt: number,
): NostrEventTemplate {
  if (typeof input.bookSlug !== "string" || input.bookSlug === "") {
    throw new RatingError("invalid_book", "A book slug is required.");
  }
  if (!config.librarianPubkey) {
    throw new RatingError(
      "feature_unavailable",
      "Rating removal is not configured (no librarian pubkey).",
    );
  }

  const librarian = asHexPubkey(config.librarianPubkey);
  return toWireTemplate(
    buildBookRatingRetraction({
      bookSlug: input.bookSlug,
      bookAddress: { kind: 39999, pubkey: librarian, dTag: input.bookSlug },
      raterPubkey: asHexPubkey(input.raterPubkey),
      parentHeader: buildBookRatingsHeaderAddress(librarian),
    }),
    createdAt,
  );
}
