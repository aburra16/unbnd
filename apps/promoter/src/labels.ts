// The labels pass (Story 105 / ADR 0094 §4): keep each catalog record's NIP-32
// labels (genre, format, language) equal to its facets, so a relay filter can
// narrow a search over records. Genres are the applied tag consensus, the same
// rule the search index uses (`appliedTags`); format and language come from the
// record's own tags. A record whose labels differ is republished by the
// librarian with its content and every other tag unchanged. Fully injected:
// no LIBRARIAN_NSEC, no relay here.
import {
  bookLabels,
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
  /** The `book-tags` taxonomy (the librarian's). */
  readonly readTaxonomy: () => Promise<SignedNostrEvent[]>;
  /** Whether any `book-tag-assertions` item exists at all. */
  readonly hasAssertions: () => Promise<boolean>;
  /**
   * The librarian's records a page at a time, each page with its books'
   * assertions by slug (Story 108 / ADR 0096 §3).
   */
  readonly eachCatalogPage: (
    onPage: (records: SignedNostrEvent[], assertionsBySlug: Map<string, SignedNostrEvent[]>) => Promise<void>,
  ) => Promise<void>;
  /**
   * The librarian's versions of a slug's record on the hub and on Unbnd's relay,
   * read just before signing. The newest wins: a write may have reached only one.
   */
  readonly readCurrent: (slug: string) => Promise<SignedNostrEvent[]>;
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

function newest(events: readonly SignedNostrEvent[]): SignedNostrEvent | null {
  return [...events].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0] ?? null;
}


export async function runLabelsCycle(deps: LabelsDeps): Promise<LabelsSummary> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const [taxonomy, anyAssertion] = await Promise.all([deps.readTaxonomy(), deps.hasAssertions()]);
  const summary: LabelsSummary = { checked: 0, relabelled: 0, failed: 0 };
  // A failed read must never look like a catalog with no genres (ADR 0094 §5).
  const empty = taxonomy.length === 0 ? "tag" : !anyAssertion ? "assertion" : null;
  if (empty) {
    summary.stopped = `the ${empty} list read empty`;
    log(`[labels] stopped: ${summary.stopped}`);
    return summary;
  }
  await deps.eachCatalogPage(async (records, byBook) => {
    await relabelPage(deps, log, taxonomy, records, byBook, summary);
  });
  if (summary.checked === 0) {
    summary.stopped = "the book list read empty";
    log(`[labels] stopped: ${summary.stopped}`);
    return summary;
  }
  log(`[labels] checked ${summary.checked}, relabelled ${summary.relabelled}, failed ${summary.failed}`);
  return summary;
}

async function relabelPage(
  deps: LabelsDeps,
  log: (message: string) => void,
  taxonomy: readonly SignedNostrEvent[],
  books: readonly SignedNostrEvent[],
  byBook: Map<string, SignedNostrEvent[]>,
  summary: LabelsSummary,
): Promise<void> {
  const labelsFor = (record: SignedNostrEvent) =>
    bookLabels({
      genres: appliedTags(taxonomy, byBook.get(tagValue(record, "d") ?? "") ?? []).genreSlugs,
      format: tagValue(record, "format"),
      language: tagValue(record, "lang"),
      isbn13: tagValue(record, "isbn") ?? tagValue(record, "isbn10"),
    });

  for (const snapshot of currentRecords(books, deps.librarianPubkey)) {
    summary.checked++;
    const slug = tagValue(snapshot, "d") ?? "";
    if (sameBookLabels(snapshot.tags, labelsFor(snapshot))) continue;

    let signed: SignedNostrEvent;
    try {
      // The snapshot can be minutes old; build on the hub's version (ADR 0094 §5).
      const record = newest(await deps.readCurrent(slug));
      if (!record) throw new Error("neither relay returned a current record");
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
}
