// The tags applied to one book (Story 105 / ADR 0094 §3), from the assertion
// consensus, mirroring the API's read-time rules: dedup by (author, book, tag)
// keeping the latest, net-positive wins, accusatory tags excluded. RAW
// consensus only, with no trust weighting (CLAUDE.md invariant #3). The labels
// pass writes the result onto each record, where the search relay filters on
// it (ADR 0100). Pure; no relay I/O here.
import {
  fromBookTagEvent,
  fromBookTagAssertionEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";

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
 * The tags applied to ONE book (Story 105 / ADR 0094 §3): RAW consensus, dedup by author
 * keeping the latest, net count above zero, accusatory tags never.
 */
export function appliedTags(
  taxonomyEvents: readonly SignedNostrEvent[],
  assertionEventsForBook: readonly SignedNostrEvent[],
): { names: string[]; genreSlugs: string[] } {
  const tax = parseTaxonomy(taxonomyEvents);
  const names: string[] = [];
  const genreSlugs: string[] = [];
  for (const [slug, net] of netByTagForBook(assertionEventsForBook)) {
    if (net <= 0) continue;
    const el = tax.get(slug);
    if (!el || el.sensitivity === "accusatory") continue; // hide accusatory
    names.push(el.name);
    if (el.type === "genre") genreSlugs.push(slug);
  }
  return { names, genreSlugs };
}
