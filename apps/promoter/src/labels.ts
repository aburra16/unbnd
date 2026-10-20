// The labels pass (Story 105 / ADR 0094 §4): keep each catalog record's NIP-32
// labels (genre, format, language) equal to its facets, so a relay filter can
// narrow a search over records. Genres are the applied tag consensus, the same
// rule the search index uses (`appliedTags`); format and language come from the
// record's own tags. A record whose labels differ is republished by the
// librarian with its content and every other tag unchanged. Fully injected:
// no LIBRARIAN_NSEC, no relay here.
import {
  bookLabels,
  fromBookTagAssertionEvent,
  fromWireEvent,
  isDelistedRecord,
  sameBookLabels,
  withBookLabels,
  type HexPubkey,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { PublishResult } from "@unbnd/relay";
import { appliedTags } from "@unbnd/search";

export type LabelsDeps = {
  readonly librarianPubkey: HexPubkey;
  /** The book records in the librarian's `books` list. */
  readonly readBooks: () => Promise<SignedNostrEvent[]>;
  /** The `book-tags` taxonomy. */
  readonly readTaxonomy: () => Promise<SignedNostrEvent[]>;
  /** Every `book-tag-assertions` item. */
  readonly readAssertions: () => Promise<SignedNostrEvent[]>;
  /** The librarian's current record for a slug on the hub, read just before signing; null when absent. */
  readonly readCurrent: (slug: string) => Promise<SignedNostrEvent | null>;
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  /** The hub first: the record's home, and the source Unbnd's relay syncs from. */
  readonly publishDcosl: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly publishLocal: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly now: () => number;
  readonly log?: (message: string) => void;
};

export type LabelsSummary = { checked: number; relabelled: number; failed: number; stopped?: string };

const tagValue = (e: SignedNostrEvent, name: string) => e.tags.find((t) => t[0] === name)?.[1];

/** The librarian's newest version of each listed (not delisted) record. */
function currentRecords(events: readonly SignedNostrEvent[], librarian: string): SignedNostrEvent[] {
  const bySlug = new Map<string, SignedNostrEvent>();
  for (const e of events) {
    if (e.pubkey !== librarian) continue;
    const slug = tagValue(e, "d");
    if (!slug) continue;
    const prior = bySlug.get(slug);
    if (!prior || e.created_at > prior.created_at) bySlug.set(slug, e);
  }
  return [...bySlug.values()].filter((e) => !isDelistedRecord(e));
}

function assertionsByBook(events: readonly SignedNostrEvent[]): Map<string, SignedNostrEvent[]> {
  const out = new Map<string, SignedNostrEvent[]>();
  for (const e of events) {
    let slug: string;
    try {
      slug = fromBookTagAssertionEvent(fromWireEvent(e) as never).bookSlug;
    } catch {
      continue;
    }
    const list = out.get(slug) ?? [];
    list.push(e);
    out.set(slug, list);
  }
  return out;
}

export async function runLabelsCycle(deps: LabelsDeps): Promise<LabelsSummary> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const [books, taxonomy, assertions] = await Promise.all([
    deps.readBooks(),
    deps.readTaxonomy(),
    deps.readAssertions(),
  ]);
  const summary: LabelsSummary = { checked: 0, relabelled: 0, failed: 0 };
  // A failed read must never look like a catalog with no genres (ADR 0094 §5).
  if (books.length === 0 || taxonomy.length === 0) {
    summary.stopped = books.length === 0 ? "the book list read empty" : "the tag list read empty";
    log(`[labels] stopped: ${summary.stopped}`);
    return summary;
  }
  const byBook = assertionsByBook(assertions);
  const labelsFor = (record: SignedNostrEvent) =>
    bookLabels({
      genres: appliedTags(taxonomy, byBook.get(tagValue(record, "d") ?? "") ?? []).genreSlugs,
      format: tagValue(record, "format"),
      language: tagValue(record, "lang"),
    });

  for (const snapshot of currentRecords(books, deps.librarianPubkey)) {
    summary.checked++;
    const slug = tagValue(snapshot, "d") ?? "";
    if (sameBookLabels(snapshot.tags, labelsFor(snapshot))) continue;

    let signed: SignedNostrEvent;
    try {
      // The snapshot can be minutes old; build on the hub's version (ADR 0094 §5).
      const record = await deps.readCurrent(slug);
      if (!record) throw new Error("the hub returned no current record");
      if (isDelistedRecord(record)) continue;
      const labels = labelsFor(record);
      if (sameBookLabels(record.tags, labels)) continue;
      const added = tagValue(record, "added") ? [] : [["added", String(record.created_at)]];
      signed = deps.sign({
        kind: record.kind,
        created_at: Math.max(deps.now(), record.created_at + 1),
        content: record.content,
        tags: withBookLabels([...record.tags, ...added], labels),
      });
      const hub = await deps.publishDcosl(signed);
      if (!hub.ok) throw new Error(`hub refused: ${hub.reason}`);
    } catch (err) {
      summary.failed++;
      log(`[labels] ${slug}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    summary.relabelled++;
    try {
      const local = await deps.publishLocal(signed);
      if (!local.ok) log(`[labels] ${slug}: Unbnd's relay refused (${local.reason}); the down-sync brings it`);
    } catch (err) {
      log(`[labels] ${slug}: Unbnd's relay failed (${err instanceof Error ? err.message : String(err)}); the down-sync brings it`);
    }
  }
  log(`[labels] checked ${summary.checked}, relabelled ${summary.relabelled}, failed ${summary.failed}`);
  return summary;
}
