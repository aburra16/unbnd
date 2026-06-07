// The live RAW readers that back the unfurl router (Story 72 / ADR 0070). These
// adapt the existing relay-read building blocks into the three injected reads the
// router DI expects — book record, raw rating summary, raw tag consensus — all
// viewer-independent (no observer, no trust call). Kept beside the unfurl feature
// so `index.ts` wiring stays a one-liner and the address conventions match the
// existing routes (books.ts / ratings.ts / tags.ts).
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../config";
import type { NostrFilter } from "../nostr/query";
import { parseBook, type PublicBook } from "../books/effective";
import { dedupeRatings, rawFromParsed } from "../ratings/summary";
import { aggregateBookTags, parseTaxonomy, type RawBookTags } from "../tags/aggregate";
import type { RawRatingSummary } from "./card";

const KIND = 39999;

export type UnfurlReaderDeps = {
  readonly config: Config;
  readonly query: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
};

export function buildUnfurlReaders(deps: UnfurlReaderDeps) {
  const lib = () => deps.config.librarianPubkey;
  const booksConcept = () => `39998:${lib()}:books`;
  const tagsConcept = () => `39998:${lib()}:book-tags`;
  const assertConcept = () => `39998:${lib()}:book-tag-assertions`;
  // A rating event tags its book by the book-record address (ratings.ts:72).
  const bookAddr = (slug: string) => `${KIND}:${lib()}:${slug}`;

  async function readBook(slug: string): Promise<PublicBook | null> {
    if (!lib()) return null;
    // The canonical catalog record (title/author/cover) — enough for a card.
    const events = await deps.query({ kinds: [KIND], "#z": [booksConcept()], "#d": [slug] });
    return events.map((e) => parseBook(e)).find((b): b is PublicBook => b !== null) ?? null;
  }

  async function readRawRatings(slug: string): Promise<RawRatingSummary> {
    if (!lib()) return { count: 0, average: null };
    const events = await deps.query({ kinds: [KIND], "#a": [bookAddr(slug)] });
    const { count, average } = rawFromParsed(dedupeRatings(events));
    return { count, average };
  }

  async function readRawTags(slug: string): Promise<RawBookTags> {
    if (!lib()) return { genres: [], styles: [], signals: [] };
    const [taxEvents, assertEvents] = await Promise.all([
      deps.query({ kinds: [KIND], "#z": [tagsConcept()] }),
      deps.query({ kinds: [KIND], "#z": [assertConcept()], "#a": [bookAddr(slug)] }),
    ]);
    return aggregateBookTags(assertEvents, parseTaxonomy(taxEvents));
  }

  return { readBook, readRawRatings, readRawTags };
}
