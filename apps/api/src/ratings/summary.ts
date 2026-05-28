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

type Parsed = {
  readonly pubkey: string;
  readonly createdAt: number;
  readonly score: number;
  readonly reviewText?: string;
  readonly reviewDate: string;
};

export function summarizeRatings(events: SignedNostrEvent[]): RatingsSummary {
  // Parse + keep the latest event per rater.
  const latest = new Map<string, Parsed>();
  for (const event of events) {
    let parsed: Parsed;
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

  const deduped = [...latest.values()].sort((a, b) => b.createdAt - a.createdAt);
  const count = deduped.length;
  const average =
    count === 0
      ? null
      : deduped.reduce((sum, r) => sum + r.score, 0) / count;

  const ratings: PublicRating[] = deduped.map((r) => ({
    npub: npubEncode(r.pubkey),
    score: r.score,
    reviewText: r.reviewText,
    reviewDate: r.reviewDate,
  }));

  return { count, average, ratings };
}
