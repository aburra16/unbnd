// Raw (unweighted) rating summary + the signed-in user's own-rating counts
// (ADR 0005/0019). The SHARED trust-weighting helpers (`dedupeRatings`,
// `weightedRatings`) + their rating types moved to `@unbnd/trust` (ADR 0036 A1)
// so the off-path workers reuse one implementation; this module re-exports them
// so apps/api callers keep importing from `../ratings/summary` unchanged. The
// raw-summary / own-counts helpers below are apps/api-only and stay here.
import { npubEncode } from "nostr-tools/nip19";
import {
  fromBookRatingEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import {
  dedupeRatings,
  type ParsedRating,
  type PublicRating,
} from "@unbnd/trust";

// Re-export the shared weighting surface (ADR 0036 A2 shim) so existing apps/api
// import sites (`../ratings/summary`) resolve unchanged.
export { dedupeRatings, weightedRatings } from "@unbnd/trust";
export type { ParsedRating, PublicRating, WeightedRatings } from "@unbnd/trust";

export type RatingsSummary = {
  readonly count: number;
  /** Raw arithmetic mean of scores; null when there are no ratings. */
  readonly average: number | null;
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

/**
 * Own-ratings counts for the signed-in user's profile (ADR 0019 Decision 2,
 * AC-5/AC-6). All events are the SAME author here, so latest-wins must key by
 * BOOK (not pubkey, which `dedupeRatings` uses — that would collapse the user's
 * whole history to one entry). `booksRated` = distinct books with a current
 * rating; `reviews` = the subset whose latest rating carries non-empty trimmed
 * review text.
 */
export function countOwnRatings(events: SignedNostrEvent[]): {
  booksRated: number;
  reviews: number;
} {
  const latest = new Map<
    string,
    { createdAt: number; reviewText?: string }
  >();
  for (const event of events) {
    let bookSlug: string;
    let reviewText: string | undefined;
    try {
      const rating = fromBookRatingEvent(
        fromWireEvent({
          kind: event.kind,
          content: event.content,
          tags: event.tags,
        }) as never,
      );
      bookSlug = rating.bookSlug;
      reviewText = rating.reviewText;
    } catch {
      continue; // skip anything that is not a well-formed rating
    }
    const prior = latest.get(bookSlug);
    if (!prior || event.created_at > prior.createdAt) {
      latest.set(bookSlug, { createdAt: event.created_at, reviewText });
    }
  }
  let reviews = 0;
  for (const v of latest.values()) {
    if ((v.reviewText ?? "").trim() !== "") reviews++;
  }
  return { booksRated: latest.size, reviews };
}

export function rawFromParsed(deduped: ParsedRating[]): RatingsSummary {
  const count = deduped.length;
  const average = count === 0 ? null : deduped.reduce((s, r) => s + r.score, 0) / count;
  return { count, average, ratings: deduped.map(toPublic) };
}

export function summarizeRatings(events: SignedNostrEvent[]): RatingsSummary {
  return rawFromParsed(dedupeRatings(events));
}
