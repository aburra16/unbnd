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
  isRatingRetraction,
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
 * A retraction's book slug, read tag-level (the `t` routing tag) so the
 * score-required `fromBookRatingEvent` parse is never asked to parse one
 * (Story 79 / ADR 0077). Null when the tag is absent (malformed → skip).
 */
function retractionSlug(event: SignedNostrEvent): string | null {
  const t = event.tags.find((tag) => tag[0] === "t");
  return typeof t?.[1] === "string" && t[1] !== "" ? t[1] : null;
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
    { createdAt: number; reviewText?: string; retracted: boolean }
  >();
  for (const event of events) {
    let bookSlug: string;
    let reviewText: string | undefined;
    let retracted = false;
    if (isRatingRetraction(event)) {
      const slug = retractionSlug(event);
      if (!slug) continue;
      bookSlug = slug;
      retracted = true;
    } else {
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
    }
    const prior = latest.get(bookSlug);
    if (!prior || event.created_at > prior.createdAt) {
      latest.set(bookSlug, { createdAt: event.created_at, reviewText, retracted });
    }
  }
  let booksRated = 0;
  let reviews = 0;
  for (const v of latest.values()) {
    if (v.retracted) continue; // a retracted head = no current rating (ADR 0077)
    booksRated++;
    if ((v.reviewText ?? "").trim() !== "") reviews++;
  }
  return { booksRated, reviews };
}

/**
 * The SET of book slugs the signed-in user currently has a rating on (Story 36 /
 * ADR 0037 §3, AC-3). Sibling of `countOwnRatings`: the SAME author-scoped
 * latest-wins-by-slug fold (all events are the same author, so latest-wins keys
 * by BOOK, never by pubkey), but it returns which slugs rather than counts so
 * For-You can exclude books the user already rated. Malformed events are skipped;
 * a re-rating of the same book collapses to one slug. By construction
 * `ownRatedSlugs(events).size === countOwnRatings(events).booksRated`.
 */
export function ownRatedSlugs(events: SignedNostrEvent[]): Set<string> {
  const latest = new Map<string, { createdAt: number; retracted: boolean }>();
  for (const event of events) {
    let bookSlug: string;
    let retracted = false;
    if (isRatingRetraction(event)) {
      const slug = retractionSlug(event);
      if (!slug) continue;
      bookSlug = slug;
      retracted = true;
    } else {
      try {
        const rating = fromBookRatingEvent(
          fromWireEvent({
            kind: event.kind,
            content: event.content,
            tags: event.tags,
          }) as never,
        );
        bookSlug = rating.bookSlug;
      } catch {
        continue; // skip anything that is not a well-formed rating
      }
    }
    const prior = latest.get(bookSlug);
    if (!prior || event.created_at > prior.createdAt) {
      latest.set(bookSlug, { createdAt: event.created_at, retracted });
    }
  }
  const slugs = new Set<string>();
  for (const [slug, v] of latest) {
    if (!v.retracted) slugs.add(slug); // a retracted book is recommendable again
  }
  return slugs;
}

/**
 * Map each book the author currently rates to its score (Story 65 / ADR 0064).
 * The same author-scoped, latest-wins-by-slug fold as `countOwnRatings` (all
 * events share one author, so latest-wins keys by BOOK, never by pubkey), but it
 * keeps the score so the taste-match metric can intersect two users' rating maps.
 * Malformed events are skipped; a re-rating of the same book collapses to its
 * latest score.
 */
export function scoreBySlug(events: SignedNostrEvent[]): Map<string, number> {
  const latest = new Map<string, { createdAt: number; score: number | null }>();
  for (const event of events) {
    let bookSlug: string;
    let score: number | null;
    if (isRatingRetraction(event)) {
      const slug = retractionSlug(event);
      if (!slug) continue;
      bookSlug = slug;
      score = null; // a retracted head = no current rating (ADR 0077)
    } else {
      try {
        const rating = fromBookRatingEvent(
          fromWireEvent({
            kind: event.kind,
            content: event.content,
            tags: event.tags,
          }) as never,
        );
        bookSlug = rating.bookSlug;
        score = rating.score;
      } catch {
        continue; // skip anything that is not a well-formed rating
      }
    }
    const prior = latest.get(bookSlug);
    if (!prior || event.created_at > prior.createdAt) {
      latest.set(bookSlug, { createdAt: event.created_at, score });
    }
  }
  const out = new Map<string, number>();
  for (const [slug, v] of latest) {
    if (v.score !== null) out.set(slug, v.score);
  }
  return out;
}

/**
 * Group a multi-author set of rating events into a per-author score map (Story
 * 66 / ADR 0065): `authorHex -> (bookSlug -> latest score)`. Generalizes
 * `scoreBySlug` across authors so the book-detail taste-match can compute the
 * viewer vs each rater from a single batched read. Retraction-aware (Story 79 /
 * ADR 0077): a retracted head per (author, book) drops that entry.
 */
export function scoresByAuthor(
  events: SignedNostrEvent[],
): Map<string, Map<string, number>> {
  // authorHex -> (bookSlug -> { createdAt, score|null }), latest-wins per (author, book).
  const byAuthor = new Map<
    string,
    Map<string, { createdAt: number; score: number | null }>
  >();
  for (const event of events) {
    let bookSlug: string;
    let score: number | null;
    if (isRatingRetraction(event)) {
      const slug = retractionSlug(event);
      if (!slug) continue;
      bookSlug = slug;
      score = null;
    } else {
      try {
        const rating = fromBookRatingEvent(
          fromWireEvent({
            kind: event.kind,
            content: event.content,
            tags: event.tags,
          }) as never,
        );
        bookSlug = rating.bookSlug;
        score = rating.score;
      } catch {
        continue; // skip anything that is not a well-formed rating
      }
    }
    let books = byAuthor.get(event.pubkey);
    if (!books) {
      books = new Map();
      byAuthor.set(event.pubkey, books);
    }
    const prior = books.get(bookSlug);
    if (!prior || event.created_at > prior.createdAt) {
      books.set(bookSlug, { createdAt: event.created_at, score });
    }
  }
  const out = new Map<string, Map<string, number>>();
  for (const [author, books] of byAuthor) {
    const m = new Map<string, number>();
    for (const [slug, v] of books) {
      if (v.score !== null) m.set(slug, v.score);
    }
    out.set(author, m);
  }
  return out;
}

export function rawFromParsed(deduped: ParsedRating[]): RatingsSummary {
  const count = deduped.length;
  const average = count === 0 ? null : deduped.reduce((s, r) => s + r.score, 0) / count;
  return { count, average, ratings: deduped.map(toPublic) };
}

export function summarizeRatings(events: SignedNostrEvent[]): RatingsSummary {
  return rawFromParsed(dedupeRatings(events));
}
