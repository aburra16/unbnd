// Map catalog events → provider-neutral SearchDocuments (ADR 0013). Resolves
// each book's applied community tags from the assertion consensus, mirroring
// the API's read-time rules: dedup by (author, tag), net-positive wins,
// accusatory tags excluded. Pure + testable; no relay/provider I/O here.
//
// Story 60 / ADR 0059 Q3: the per-book logic now lives in @unbnd/search
// (`buildBookDocument`), so the batch builder and the live index-on-write path
// share ONE implementation and can never diverge. This stays the full-rebuild
// source of truth; it just maps over the shared helper now.
import {
  fromBookTagAssertionEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { buildBookDocument, type SearchDocument } from "@unbnd/search";

/** Group assertion events by their parsed bookSlug, so each book is built from
 * only its own assertions (the same per-book scope the incremental path reads). */
function groupAssertionsByBook(
  assertions: SignedNostrEvent[],
): Map<string, SignedNostrEvent[]> {
  const byBook = new Map<string, SignedNostrEvent[]>();
  for (const e of assertions) {
    let slug: string;
    try {
      const a = fromBookTagAssertionEvent(
        fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
      );
      slug = a.bookSlug;
    } catch {
      continue;
    }
    const list = byBook.get(slug) ?? [];
    list.push(e);
    byBook.set(slug, list);
  }
  return byBook;
}

/** The book record's `d` tag IS the slug (buildBookRecordDTag is identity). */
function slugOf(bookEvent: SignedNostrEvent): string {
  return bookEvent.tags.find((t) => t[0] === "d")?.[1] ?? "";
}

export function buildSearchDocuments(
  bookEvents: SignedNostrEvent[],
  taxonomyEvents: SignedNostrEvent[],
  assertionEvents: SignedNostrEvent[],
  currentYear: number = new Date().getUTCFullYear(),
): SearchDocument[] {
  const byBook = groupAssertionsByBook(assertionEvents);
  const docs: SearchDocument[] = [];
  let skipped = 0;

  for (const e of bookEvents) {
    const doc = buildBookDocument(
      e,
      taxonomyEvents,
      byBook.get(slugOf(e)) ?? [],
      currentYear,
    );
    if (!doc) {
      // Read-time prune (Story 56, ADR 0055 §2) or an unparseable record: a
      // null build is skipped, identical to the pre-extraction behavior.
      skipped++;
      continue;
    }
    docs.push(doc);
  }
  if (skipped > 0) {
    console.log(`[indexer] skipped ${skipped} junk records`);
  }
  return docs;
}
