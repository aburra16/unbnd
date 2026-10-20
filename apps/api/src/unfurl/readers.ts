// The live readers that back the unfurl router (Story 72 / ADR 0070). These
// adapt the existing relay-read building blocks into the three injected reads the
// router DI expects: book record, the house view's ratings (ADR 0092 §5) and the
// raw tag consensus. Kept beside the unfurl feature
// so `index.ts` wiring stays a one-liner and the address conventions match the
// existing routes (books.ts / ratings.ts / tags.ts).
import { npubEncode } from "nostr-tools/nip19";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import { parseBook, type PublicBook } from "../books/effective";
import { dedupeRatings, reviewScope, weightedRatings } from "../ratings/summary";
import { readBookReviews } from "../reviews/read";
import { aggregateBookTags, parseTaxonomy, type RawBookTags } from "../tags/aggregate";
import type { TrustProvider } from "../trust";
import type { CardRatings } from "./card";

const KIND = 39999;

export type UnfurlReaderDeps = {
  readonly config: Config;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  /** The house view's weights; absent → the card shows the count alone. */
  readonly trust?: TrustProvider;
};

export function buildUnfurlReaders(deps: UnfurlReaderDeps) {
  const lib = () => deps.config.librarianPubkey;
  const booksConcept = () => `39998:${lib()}:books`;
  const tagsConcept = () => `39998:${lib()}:book-tags`;
  const assertConcept = () => `39998:${lib()}:book-tag-assertions`;
  // A review names its book by the book-record address (books actions contract §2).
  const bookAddr = (slug: string) => `${KIND}:${lib()}:${slug}`;

  async function readBook(slug: string): Promise<PublicBook | null> {
    if (!lib()) return null;
    // The canonical catalog record (title/author/cover) — enough for a card.
    const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": [slug] });
    return events.map((e) => parseBook(e)).find((b): b is PublicBook => b !== null) ?? null;
  }

  async function readCardRatings(slug: string): Promise<CardRatings> {
    if (!lib()) return { count: 0, trusted: null };
    const events = await readBookReviews(deps.query, { book: bookAddr(slug) });
    const deduped = dedupeRatings(events, reviewScope(deps.config));
    const count = deduped.filter((r) => r.score !== null).length;
    const house = deps.config.houseObserverPubkey;
    if (!deps.trust || !house || deduped.length === 0) return { count, trusted: null };
    try {
      const weights = await deps.trust.weights(house, deduped.map((r) => r.pubkey));
      const w = weightedRatings(deduped, weights, npubEncode(house));
      return { count, trusted: w ? { average: w.average, count: w.trustedCount } : null };
    } catch {
      return { count, trusted: null };
    }
  }

  async function readRawTags(slug: string): Promise<RawBookTags> {
    if (!lib()) return { genres: [], styles: [], signals: [] };
    const [taxEvents, assertEvents] = await Promise.all([
      deps.query({ kinds: [KIND], "#z": [tagsConcept()] }),
      deps.query({ kinds: [KIND], "#z": [assertConcept()], "#a": [bookAddr(slug)] }),
    ]);
    return aggregateBookTags(assertEvents, parseTaxonomy(taxEvents));
  }

  return { readBook, readCardRatings, readRawTags };
}
