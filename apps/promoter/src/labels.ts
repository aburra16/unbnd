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
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  /** The hub first: the record's home, and the source Unbnd's relay syncs from. */
  readonly publishDcosl: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly publishLocal: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly now: () => number;
  readonly log?: (message: string) => void;
};

export type LabelsSummary = { checked: number; relabelled: number; failed: number };

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
  const byBook = assertionsByBook(assertions);
  const summary: LabelsSummary = { checked: 0, relabelled: 0, failed: 0 };

  for (const record of currentRecords(books, deps.librarianPubkey)) {
    summary.checked++;
    const slug = tagValue(record, "d") ?? "";
    const labels = bookLabels({
      genres: appliedTags(taxonomy, byBook.get(slug) ?? []).genreSlugs,
      format: tagValue(record, "format"),
      language: tagValue(record, "lang"),
    });
    if (sameBookLabels(record.tags, labels)) continue;

    try {
      const signed = deps.sign({
        kind: record.kind,
        created_at: Math.max(deps.now(), record.created_at + 1),
        content: record.content,
        tags: withBookLabels(record.tags, labels),
      });
      const hub = await deps.publishDcosl(signed);
      if (!hub.ok) throw new Error(`hub refused: ${hub.reason}`);
      const local = await deps.publishLocal(signed);
      if (!local.ok) log(`[labels] ${slug}: Unbnd's relay refused (${local.reason}); the down-sync brings it`);
      summary.relabelled++;
    } catch (err) {
      summary.failed++;
      log(`[labels] ${slug}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  log(`[labels] checked ${summary.checked}, relabelled ${summary.relabelled}, failed ${summary.failed}`);
  return summary;
}
