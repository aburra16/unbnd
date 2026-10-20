// Shared trust-weighting helpers (ADR 0014/0025), extracted to `@unbnd/trust`
// (ADR 0036 A1) so the apps/api routes and the off-path workers (shelves,
// For-You) compose over ONE implementation. Pure: a deduped rating set + a
// weight map + the observer's npub → a weighted view, with no network, no
// signing. The raw-summary / own-counts helpers stay in apps/api (not shared).
import { npubEncode } from "nostr-tools/nip19";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { standingReviews, type StandingReview } from "./reviews";

/**
 * A reviewer's weight counts from rank 5 (books actions contract §8, matching
 * Regulars): below it the review is shown and never counted.
 */
export const REVIEW_WEIGHT_LINE = 0.05;

/** A reviewer-facing rating. npub only; hex pubkey never leaves the server. */
export type PublicRating = {
  readonly npub: string;
  /** Null for a review with words and no stars, from another app. */
  readonly score: number | null;
  readonly reviewText?: string;
  readonly reviewDate: string;
};

/** Internal: a standing review in the shape the read routes use (server-only). */
export type ParsedRating = {
  readonly id: string;
  readonly pubkey: string;
  readonly d: string;
  readonly bookSlug: string;
  readonly bookAddress: string;
  readonly createdAt: number;
  readonly score: number | null;
  readonly reviewText?: string;
  /** ISO date (YYYY-MM-DD) of the review's own date. */
  readonly reviewDate: string;
};

/** Trust-weighted summary (ADR 0014) — present only when ≥1 counted rater. */
export type WeightedRatings = {
  /** The observer whose vantage produced this (npub for display). */
  readonly observer: string;
  /** Trust-weighted mean over the counted reviews with stars. */
  readonly average: number;
  /** Number of counted reviewers whose review gives stars. */
  readonly trustedCount: number;
  /** Counted reviews, ordered by reviewer trust (desc). */
  readonly ratings: PublicRating[];
};

function toPublic(r: ParsedRating): PublicRating {
  return {
    npub: npubEncode(r.pubkey),
    score: r.score,
    reviewText: r.reviewText,
    reviewDate: r.reviewDate,
  };
}

function toParsed(r: StandingReview): ParsedRating {
  return {
    id: r.id,
    pubkey: r.pubkey,
    d: r.d,
    bookSlug: r.bookSlug,
    bookAddress: r.bookAddress,
    createdAt: r.createdAt,
    score: r.stars,
    reviewText: r.words === "" ? undefined : r.words,
    reviewDate: new Date(r.createdAt * 1000).toISOString().slice(0, 10),
  };
}

/**
 * The standing reviews (books actions contract §4, §6) as ratings, newest
 * first: one per person per catalog book, removals honoured.
 */
export function dedupeRatings(
  events: readonly SignedNostrEvent[],
  scope: { readonly librarian: string; readonly now: number },
): ParsedRating[] {
  return standingReviews(events, scope).map(toParsed);
}

/**
 * Trust-weighted view from an observer's vantage (ADR 0014, contract §8). A
 * reviewer counts from the rank-5 line; the mean runs over counted reviews
 * that give stars. Null when nobody with stars is counted.
 */
export function weightedRatings(
  deduped: readonly ParsedRating[],
  weights: Map<string, number>,
  observerNpub: string,
): WeightedRatings | null {
  const counted = deduped
    .map((r) => ({ r, w: weights.get(r.pubkey) ?? 0 }))
    .filter((x) => x.w >= REVIEW_WEIGHT_LINE)
    .sort((a, b) => b.w - a.w);
  const starred = counted.filter((x) => x.r.score !== null);
  if (starred.length === 0) return null;
  const sumW = starred.reduce((s, x) => s + x.w, 0);
  const average = starred.reduce((s, x) => s + x.w * (x.r.score as number), 0) / sumW;
  return {
    observer: observerNpub,
    average,
    trustedCount: starred.length,
    ratings: counted.map((x) => toPublic(x.r)),
  };
}
