// Build the unsigned kind-39999 BookRating wire template, server-side, with
// the librarian pubkey resolved from config. ADR 0005.
import type { Config } from "../config";
import type { NostrEventTemplate } from "@unbnd/schemas";

export type BuildRatingInput = {
  readonly raterPubkey: string;
  readonly bookSlug: string;
  readonly score: number;
  readonly reviewText?: string;
  readonly reviewDate: string;
};

export type RatingErrorCode = "score_out_of_range" | "feature_unavailable";

export class RatingError extends Error {
  constructor(
    readonly code: RatingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RatingError";
  }
}

export function buildRatingTemplate(
  _config: Config,
  _input: BuildRatingInput,
  _createdAt: number,
): NostrEventTemplate {
  throw new Error("buildRatingTemplate not implemented");
}
