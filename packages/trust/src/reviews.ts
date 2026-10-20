// Which book reviews stand (Story 99 / ADR 0089), by the books actions
// contract's §4 and §6: one function every rating read in the API and the
// workers goes through. Pure: a mixed batch of kind 34259 reviews and kind 5
// removals in, one standing review per person per catalog book out. Signatures
// are checked where events enter Unbnd's relay, not here.
import { BOOK_REVIEW_KIND, reviewedAddressOf, starsOf, wordsOf } from "@unbnd/schemas";

/** A review is dated at most this far ahead of the reader's clock. */
const AHEAD_SECONDS = 86_400;

type EventLike = {
  readonly id: string;
  readonly pubkey: string;
  readonly kind: number;
  readonly created_at: number;
  readonly tags: ReadonlyArray<readonly string[]>;
  readonly content: string;
};

export type StandingReview = {
  readonly id: string;
  readonly pubkey: string;
  /** The review's `d`, which a removal through `a` names. */
  readonly d: string;
  readonly bookAddress: string;
  readonly bookSlug: string;
  /** Whole or fractional stars; null for a review that gives none. */
  readonly stars: number | null;
  readonly words: string;
  readonly createdAt: number;
};

const newer = (x: EventLike, y: EventLike) =>
  x.created_at !== y.created_at ? x.created_at > y.created_at : x.id < y.id;

export function standingReviews(
  events: readonly EventLike[],
  scope: { readonly librarian: string; readonly now: number },
): StandingReview[] {
  const prefix = `39999:${scope.librarian}:`;
  const limit = scope.now + AHEAD_SECONDS;

  // 1-4: catalog-book reviews not from the future, newest per (person, d).
  const perD = new Map<string, { event: EventLike; d: string; address: string }>();
  for (const e of events) {
    if (e.kind !== BOOK_REVIEW_KIND || e.created_at > limit) continue;
    const address = reviewedAddressOf(e);
    if (!address || !address.startsWith(prefix) || address.length === prefix.length) continue;
    const d = e.tags.find((t) => t[0] === "d")?.[1];
    if (!d) continue;
    const key = `${e.pubkey} ${d}`;
    const prior = perD.get(key);
    if (!prior || newer(e, prior.event)) perD.set(key, { event: e, d, address });
  }

  // 5: one per person per book.
  const perBook = new Map<string, { event: EventLike; d: string; address: string }>();
  for (const entry of perD.values()) {
    const key = `${entry.event.pubkey} ${entry.address}`;
    const prior = perBook.get(key);
    if (!prior || newer(entry.event, prior.event)) perBook.set(key, entry);
  }

  // 6: the author's own removals, not from the future.
  const removedIds = new Set<string>();
  const removedThrough = new Map<string, number>(); // "pubkey a-address" → latest removal date
  for (const e of events) {
    if (e.kind !== 5 || e.created_at > limit) continue;
    for (const t of e.tags) {
      if (t[0] === "e" && t[1]) removedIds.add(`${e.pubkey} ${t[1]}`);
      if (t[0] === "a" && t[1]?.startsWith(`${BOOK_REVIEW_KIND}:${e.pubkey}:`)) {
        const key = `${e.pubkey} ${t[1]}`;
        removedThrough.set(key, Math.max(removedThrough.get(key) ?? 0, e.created_at));
      }
    }
  }

  const out: StandingReview[] = [];
  for (const { event, d, address } of perBook.values()) {
    if (removedIds.has(`${event.pubkey} ${event.id}`)) continue;
    const through = removedThrough.get(`${event.pubkey} ${BOOK_REVIEW_KIND}:${event.pubkey}:${d}`);
    if (through !== undefined && through >= event.created_at) continue;
    out.push({
      id: event.id,
      pubkey: event.pubkey,
      d,
      bookAddress: address,
      bookSlug: address.slice(prefix.length),
      stars: starsOf(event),
      words: wordsOf(event),
      createdAt: event.created_at,
    });
  }
  return out.sort((x, y) => y.createdAt - x.createdAt);
}
