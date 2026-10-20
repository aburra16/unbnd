// Rating summaries for the API (ADR 0014/0019; Story 99 / ADR 0089). Every
// helper here derives from the one rule for which book reviews stand
// (`standingReviews`, books actions contract §4 and §6), so "newest per
// person per book" and removals are decided in exactly one place.
import { npubEncode } from "nostr-tools/nip19";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { dedupeRatings, type ParsedRating, type PublicRating } from "@unbnd/trust";
import type { Config } from "../config";

export { dedupeRatings, weightedRatings } from "@unbnd/trust";
export type { ParsedRating, PublicRating, WeightedRatings } from "@unbnd/trust";

/** The catalog and the clock the rules read against. */
export type ReviewScope = { readonly librarian: string; readonly now: number };

export function reviewScope(config: Pick<Config, "librarianPubkey">, now = Date.now()): ReviewScope {
  return { librarian: config.librarianPubkey ?? "", now: Math.floor(now / 1000) };
}

/**
 * A book's standing reviews without any trust weighting. It carries no mean:
 * the only figure Unbnd shows comes from the trusted view (ADR 0092 §3).
 */
export type RatingsSummary = {
  /** Reviews that give stars. */
  readonly count: number;
  /** Every standing review, stars or not, newest first. */
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
 * The signed-in user's own counts (ADR 0019 Decision 2): `booksRated` = books
 * with a standing review that gives stars; `reviews` = those with words.
 */
export function countOwnRatings(
  events: readonly SignedNostrEvent[],
  scope: ReviewScope,
): { booksRated: number; reviews: number } {
  const standing = dedupeRatings(events, scope);
  return {
    booksRated: standing.filter((r) => r.score !== null).length,
    reviews: standing.filter((r) => (r.reviewText ?? "").trim() !== "").length,
  };
}

/** The books a person has a standing review of (For You excludes them). */
export function ownRatedSlugs(events: readonly SignedNostrEvent[], scope: ReviewScope): Set<string> {
  return new Set(dedupeRatings(events, scope).map((r) => r.bookSlug));
}

/** One person's stars by book (taste match reads two of these). */
export function scoreBySlug(events: readonly SignedNostrEvent[], scope: ReviewScope): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of dedupeRatings(events, scope)) if (r.score !== null) out.set(r.bookSlug, r.score);
  return out;
}

/** Stars by book for each author in one batched read (book-page taste matches). */
export function scoresByAuthor(
  events: readonly SignedNostrEvent[],
  scope: ReviewScope,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of dedupeRatings(events, scope)) {
    let books = out.get(r.pubkey);
    if (!books) {
      books = new Map();
      out.set(r.pubkey, books);
    }
    if (r.score !== null) books.set(r.bookSlug, r.score);
  }
  return out;
}

export function summaryFromParsed(deduped: readonly ParsedRating[]): RatingsSummary {
  return { count: deduped.filter((r) => r.score !== null).length, ratings: deduped.map(toPublic) };
}

export function summarizeRatings(events: readonly SignedNostrEvent[], scope: ReviewScope): RatingsSummary {
  return summaryFromParsed(dedupeRatings(events, scope));
}
