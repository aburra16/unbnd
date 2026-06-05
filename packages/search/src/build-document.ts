// Pure per-book SearchDocument builder (Story 60 / ADR 0059 §1, Q3). Extracted
// VERBATIM from apps/indexer/src/build-documents.ts so the live index-on-write
// path and the batch indexer produce byte-identical docs from one
// implementation. Resolves a single book's applied community tags from the
// assertion consensus, mirroring the API's read-time rules: dedup by
// (author, book, tag) keeping the latest, net-positive wins, accusatory tags
// excluded. RAW consensus only — NO trust weighting (CLAUDE.md invariant #3).
// Returns null when the record is junk (isJunkRecord) → caller skips. Pure; no
// relay/provider I/O here.
import {
  fromBookRecordEvent,
  fromBookTagEvent,
  fromBookTagAssertionEvent,
  fromWireEvent,
  isJunkRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { SearchDocument } from "./types";

type TaxEl = { slug: string; name: string; type: string; sensitivity: string };

function parse<T>(e: SignedNostrEvent, fn: (u: never) => T): T | null {
  try {
    return fn(fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never);
  } catch {
    return null;
  }
}

function parseTaxonomy(events: readonly SignedNostrEvent[]): Map<string, TaxEl> {
  const out = new Map<string, TaxEl>();
  for (const e of events) {
    const t = parse(e, fromBookTagEvent);
    if (t) out.set(t.slug, { slug: t.slug, name: t.name, type: t.type, sensitivity: t.sensitivity });
  }
  return out;
}

/** Net polarity per tag slug for ONE book, from this book's assertions only.
 * Dedup by (author, book, tag) keeping the latest; then net polarity per tag. */
function netByTagForBook(
  assertions: readonly SignedNostrEvent[],
): Map<string, number> {
  const latest = new Map<string, { book: string; tag: string; polarity: number; at: number }>();
  for (const e of assertions) {
    const a = parse(e, fromBookTagAssertionEvent);
    if (!a) continue;
    const key = `${e.pubkey}|${a.bookSlug}|${a.tagSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.at) {
      latest.set(key, { book: a.bookSlug, tag: a.tagSlug, polarity: a.polarity, at: e.created_at });
    }
  }
  const byTag = new Map<string, number>();
  for (const v of latest.values()) {
    byTag.set(v.tag, (byTag.get(v.tag) ?? 0) + v.polarity);
  }
  return byTag;
}

/**
 * Build ONE SearchDocument for a single book from its record event, the
 * taxonomy, and THAT BOOK's assertion events. RAW consensus (net-positive,
 * accusatory-hidden, dedup-by-author). Returns null when the record is junk
 * (isJunkRecord) or the record cannot be parsed — the caller skips.
 */
export function buildBookDocument(
  bookEvent: SignedNostrEvent,
  taxonomyEvents: readonly SignedNostrEvent[],
  assertionEventsForBook: readonly SignedNostrEvent[],
  currentYear: number,
): SearchDocument | null {
  const rec = parse(bookEvent, fromBookRecordEvent);
  if (!rec) return null;
  if (isJunkRecord(rec, currentYear)) {
    // Read-time prune (Story 56, ADR 0055 §2): positive junk is never indexed.
    return null;
  }

  const tax = parseTaxonomy(taxonomyEvents);
  const tagNames: string[] = [];
  const genreSlugs: string[] = [];
  const netByTag = netByTagForBook(assertionEventsForBook);
  for (const [slug, net] of netByTag) {
    if (net <= 0) continue;
    const el = tax.get(slug);
    if (!el || el.sensitivity === "accusatory") continue; // hide accusatory
    tagNames.push(el.name);
    if (el.type === "genre") genreSlugs.push(slug);
  }

  return {
    id: rec.slug,
    title: rec.title,
    authorName: rec.authorName,
    isbn13: rec.isbn13,
    subjects: rec.subjects ?? [],
    tags: tagNames,
    genreSlugs,
    blurb: rec.blurb,
    format: rec.format,
    language: rec.language,
    publishYear: rec.publishYear,
    coverUrl: rec.coverUrl,
    openLibraryId: rec.openLibraryId,
  };
}
