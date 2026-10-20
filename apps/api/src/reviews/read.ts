// Reading book reviews with their removals (Story 99 / ADR 0089 §3). One read
// for the reviews in a scope, one for those authors' kind 5 removals of book
// reviews; the fold in @unbnd/trust decides which stand.
import { BOOK_REVIEW_KIND, BOOK_REVIEW_MARK, type SignedNostrEvent } from "@unbnd/schemas";
import type { NostrFilter } from "../nostr/query";

/**
 * Where reviews are published and read besides the writer's own relays: the
 * index, then two general relays (books actions contract §5). Never the hub.
 */
export const REVIEW_RELAYS: readonly string[] = [
  "wss://search.brainstorm.world",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

export type ReviewScope =
  | { readonly book: string }
  | { readonly authors: readonly string[] }
  | { readonly all: true };

type Query = (filter: NostrFilter) => Promise<SignedNostrEvent[]>;

function reviewFilter(scope: ReviewScope): NostrFilter {
  if ("book" in scope) return { kinds: [BOOK_REVIEW_KIND], "#a": [scope.book] };
  if ("authors" in scope) return { kinds: [BOOK_REVIEW_KIND], authors: [...scope.authors], "#m": [BOOK_REVIEW_MARK] };
  return { kinds: [BOOK_REVIEW_KIND], "#m": [BOOK_REVIEW_MARK] };
}

/** The reviews in a scope, followed by their authors' removals of book reviews. */
export async function readBookReviews(query: Query, scope: ReviewScope): Promise<SignedNostrEvent[]> {
  const reviews = await query(reviewFilter(scope));
  if (reviews.length === 0) return reviews;
  const authors = [...new Set(reviews.map((e) => e.pubkey))];
  const removals = await query({ kinds: [5], authors, "#k": [String(BOOK_REVIEW_KIND)] });
  return [...reviews, ...removals];
}
