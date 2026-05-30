// Aggregate rating events into an honest, raw (unweighted) summary. ADR 0005.
// No trust-weighting, no GrapeRank number — that is a later personalization
// cycle. Dedups by rater (latest created_at wins; strfry already keeps only
// the latest per (author, d-tag), this is defensive).
import { npubEncode } from "nostr-tools/nip19";
import {
  fromBookRatingEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";

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

/** Internal: a deduped rating with the rater's HEX pubkey (server-only). */
export type ParsedRating = {
  readonly pubkey: string;
  readonly createdAt: number;
  readonly score: number;
  readonly reviewText?: string;
  readonly reviewDate: string;
};

/** Trust-weighted summary (ADR 0014) — present only when ≥1 trusted rater. */
export type WeightedRatings = {
  /** The observer whose vantage produced this (npub for display). */
  readonly observer: string;
  /** Trust-weighted mean. */
  readonly average: number;
  /** Number of raters with a positive trust weight. */
  readonly trustedCount: number;
  /** Trusted reviews, ordered by reviewer trust (desc). */
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

/** Parse + keep the latest event per rater, newest first. */
export function dedupeRatings(events: SignedNostrEvent[]): ParsedRating[] {
  const latest = new Map<string, ParsedRating>();
  for (const event of events) {
    let parsed: ParsedRating;
    try {
      const rating = fromBookRatingEvent(
        fromWireEvent({
          kind: event.kind,
          content: event.content,
          tags: event.tags,
        }) as never,
      );
      parsed = {
        pubkey: event.pubkey,
        createdAt: event.created_at,
        score: rating.score,
        reviewText: rating.reviewText,
        reviewDate: rating.reviewDate,
      };
    } catch {
      continue; // skip anything that is not a well-formed rating
    }
    const prior = latest.get(parsed.pubkey);
    if (!prior || parsed.createdAt > prior.createdAt) {
      latest.set(parsed.pubkey, parsed);
    }
  }
  return [...latest.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function rawFromParsed(deduped: ParsedRating[]): RatingsSummary {
  const count = deduped.length;
  const average = count === 0 ? null : deduped.reduce((s, r) => s + r.score, 0) / count;
  return { count, average, ratings: deduped.map(toPublic) };
}

export function summarizeRatings(events: SignedNostrEvent[]): RatingsSummary {
  return rawFromParsed(dedupeRatings(events));
}

/**
 * Trust-weighted view from an observer's vantage (ADR 0014). Weighted mean over
 * raters with weight > 0; reviews ordered by trust. Returns null when no rater
 * is trusted (honest "no ratings from this view").
 */
export function weightedRatings(
  deduped: ParsedRating[],
  weights: Map<string, number>,
  observerNpub: string,
): WeightedRatings | null {
  const trusted = deduped
    .map((r) => ({ r, w: weights.get(r.pubkey) ?? 0 }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w);
  if (trusted.length === 0) return null;
  const sumW = trusted.reduce((s, x) => s + x.w, 0);
  const average = trusted.reduce((s, x) => s + x.w * x.r.score, 0) / sumW;
  return {
    observer: observerNpub,
    average,
    trustedCount: trusted.length,
    ratings: trusted.map((x) => toPublic(x.r)),
  };
}
