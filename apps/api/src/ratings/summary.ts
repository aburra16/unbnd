// Aggregate rating events into an honest, raw (unweighted) summary. ADR 0005.
// No trust-weighting, no GrapeRank number — that is a later personalization
// cycle. Dedups by rater (latest created_at wins; strfry already keeps only
// the latest per (author, d-tag), this is defensive).
import type { SignedNostrEvent } from "@unbnd/schemas";

/** A reviewer-facing rating. npub only; hex pubkey never leaves the server. */
export type PublicRating = {
  readonly npub: string;
  readonly score: number;
  readonly reviewText?: string;
  readonly reviewDate: string;
};

export type RatingsSummary = {
  readonly count: number;
  /** Raw arithmetic mean of scores; null when there are no ratings. */
  readonly average: number | null;
  readonly ratings: PublicRating[];
};

export function summarizeRatings(_events: SignedNostrEvent[]): RatingsSummary {
  throw new Error("summarizeRatings not implemented");
}
