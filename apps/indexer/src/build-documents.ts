// Map catalog events → provider-neutral SearchDocuments (ADR 0013). Resolves
// each book's applied community tags from the assertion consensus, mirroring
// the API's read-time rules: dedup by (author, tag), net-positive wins,
// accusatory tags excluded. Pure + testable; no relay/provider I/O here.
import {
  fromBookRecordEvent,
  fromBookTagEvent,
  fromBookTagAssertionEvent,
  fromWireEvent,
  isJunkRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { SearchDocument } from "@unbnd/search";

type TaxEl = { slug: string; name: string; type: string; sensitivity: string };

function parse<T>(e: SignedNostrEvent, fn: (u: never) => T): T | null {
  try {
    return fn(fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never);
  } catch {
    return null;
  }
}

function parseTaxonomy(events: SignedNostrEvent[]): Map<string, TaxEl> {
  const out = new Map<string, TaxEl>();
  for (const e of events) {
    const t = parse(e, fromBookTagEvent);
    if (t) out.set(t.slug, { slug: t.slug, name: t.name, type: t.type, sensitivity: t.sensitivity });
  }
  return out;
}

/** bookSlug → set of net-positive applied tag slugs (any type). */
function appliedTagsByBook(assertions: SignedNostrEvent[]): Map<string, Map<string, number>> {
  // Dedup by (author, book, tag) keeping the latest; then net polarity per (book, tag).
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
  const byBook = new Map<string, Map<string, number>>();
  for (const v of latest.values()) {
    const tags = byBook.get(v.book) ?? new Map<string, number>();
    tags.set(v.tag, (tags.get(v.tag) ?? 0) + v.polarity);
    byBook.set(v.book, tags);
  }
  return byBook;
}

export function buildSearchDocuments(
  bookEvents: SignedNostrEvent[],
  taxonomyEvents: SignedNostrEvent[],
  assertionEvents: SignedNostrEvent[],
  currentYear: number = new Date().getUTCFullYear(),
): SearchDocument[] {
  const tax = parseTaxonomy(taxonomyEvents);
  const applied = appliedTagsByBook(assertionEvents);
  const docs: SearchDocument[] = [];
  let skipped = 0;

  for (const e of bookEvents) {
    const rec = parse(e, fromBookRecordEvent);
    if (!rec) continue;
    if (isJunkRecord(rec, currentYear)) {
      // Read-time prune (Story 56, ADR 0055 §2): positive junk is never indexed.
      skipped++;
      continue;
    }

    const tagNames: string[] = [];
    const genreSlugs: string[] = [];
    const netByTag = applied.get(rec.slug);
    if (netByTag) {
      for (const [slug, net] of netByTag) {
        if (net <= 0) continue;
        const el = tax.get(slug);
        if (!el || el.sensitivity === "accusatory") continue; // hide accusatory
        tagNames.push(el.name);
        if (el.type === "genre") genreSlugs.push(slug);
      }
    }

    docs.push({
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
    });
  }
  if (skipped > 0) {
    console.log(`[indexer] skipped ${skipped} junk records`);
  }
  return docs;
}
