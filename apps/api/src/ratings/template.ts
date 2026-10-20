// Unsigned book review and removal templates (Story 99 / ADR 0089 §4), built
// on the person's current review so an edit carries over what other apps set,
// and dated so it outranks the version, or the removal, it follows.
import {
  BOOK_REVIEW_KIND,
  BOOK_REVIEW_WORDS_MAX,
  buildBookReviewRemoval,
  buildBookReviewTemplate,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import { dedupeRatings, reviewScope, type ParsedRating } from "./summary";

export type RatingErrorCode =
  | "score_out_of_range"
  | "words_too_long"
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

type Query = (filter: NostrFilter) => Promise<SignedNostrEvent[]>;

export function bookAddressOf(config: Pick<Config, "librarianPubkey">, slug: unknown): string {
  if (!config.librarianPubkey) {
    throw new RatingError("feature_unavailable", "Reviews are not configured (no librarian pubkey).");
  }
  if (typeof slug !== "string" || slug === "" || /[\s:]/.test(slug)) {
    throw new RatingError("invalid_book", "A book slug is required.");
  }
  return `39999:${config.librarianPubkey}:${slug}`;
}

/** One person's own events at a book's review address: their reviews and removals. */
async function ownHistory(query: Query, pubkey: string, address: string): Promise<SignedNostrEvent[]> {
  const [reviews, removals] = await Promise.all([
    query({ kinds: [BOOK_REVIEW_KIND], authors: [pubkey], "#d": [`book:${address}`] }),
    query({ kinds: [5], authors: [pubkey], "#a": [`${BOOK_REVIEW_KIND}:${pubkey}:book:${address}`] }),
  ]);
  return [...reviews, ...removals];
}

/** The person's standing review of a book, if any, with its raw event. */
export async function currentReview(
  config: Config,
  query: Query,
  pubkey: string,
  address: string,
): Promise<{ standing: ParsedRating | null; history: SignedNostrEvent[] }> {
  const history = await ownHistory(query, pubkey, address);
  const standing = dedupeRatings(history, reviewScope(config)).find((r) => r.bookAddress === address) ?? null;
  return { standing, history };
}

export async function buildReviewTemplateFor(
  config: Config,
  query: Query,
  input: { readonly pubkey: string; readonly bookSlug: unknown; readonly score: unknown; readonly reviewText?: unknown },
  nowSec: number,
): Promise<NostrEventTemplate> {
  const address = bookAddressOf(config, input.bookSlug);
  const stars = input.score;
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new RatingError("score_out_of_range", "Rating score must be an integer from 1 to 5.");
  }
  const words = typeof input.reviewText === "string" ? input.reviewText.trim() : "";
  if (words.length > BOOK_REVIEW_WORDS_MAX) {
    throw new RatingError("words_too_long", `A review can be at most ${BOOK_REVIEW_WORDS_MAX} characters.`);
  }

  const [book] = await query({
    kinds: [39999],
    authors: [config.librarianPubkey as string],
    "#d": [input.bookSlug as string],
  });
  const title = book?.tags.find((t) => t[0] === "title")?.[1];
  if (!book || !title) throw new RatingError("invalid_book", "That book is not in the catalog.");

  const { standing, history } = await currentReview(config, query, input.pubkey, address);
  const previous = standing ? history.find((e) => e.id === standing.id) : undefined;
  // After a removal, a new review must be dated past it, or the removal takes it down too.
  const lastRemoval = Math.max(0, ...history.filter((e) => e.kind === 5).map((e) => e.created_at));
  const now = Math.max(nowSec, lastRemoval + 1);

  return buildBookReviewTemplate({ bookAddress: address, title, stars, words, now, previous });
}

export function buildRemovalTemplateFor(current: ParsedRating, pubkey: string, nowSec: number): NostrEventTemplate {
  // Dated no earlier than the review, so the removal takes it down by address as well as by id.
  return buildBookReviewRemoval({ id: current.id, pubkey, d: current.d }, Math.max(nowSec, current.createdAt));
}
