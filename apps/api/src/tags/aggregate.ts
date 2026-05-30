// Aggregate tag assertions into honest raw consensus (ADR 0009). No trust
// weighting (Layer 2). Accusatory tags are dropped from surfaced output until
// the trust+role gate exists.
import {
  fromBookTagAssertionEvent,
  fromBookTagEvent,
  fromWireEvent,
  type SignedNostrEvent,
  type TagSensitivity,
  type TagType,
} from "@unbnd/schemas";

/** A taxonomy element as read back from the `book-tags` concept. */
export type TaxonomyElement = {
  readonly slug: string;
  readonly type: TagType;
  readonly name: string;
  readonly sensitivity: TagSensitivity;
};

/** Raw consensus for one tag on one book. */
export type TagConsensus = {
  readonly slug: string;
  readonly name: string;
  readonly type: TagType;
  readonly applies: number;
  readonly disputes: number;
};

export type BookTags = {
  readonly genres: TagConsensus[];
  readonly styles: TagConsensus[];
  readonly signals: TagConsensus[];
};

function parseAssertion(event: SignedNostrEvent) {
  const unsigned = fromWireEvent({
    kind: event.kind,
    content: event.content,
    tags: event.tags,
  });
  return fromBookTagAssertionEvent(unsigned as never);
}

export function parseTaxonomy(events: SignedNostrEvent[]): TaxonomyElement[] {
  const out: TaxonomyElement[] = [];
  for (const e of events) {
    try {
      const tag = fromBookTagEvent(
        fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
      );
      out.push({ slug: tag.slug, type: tag.type, name: tag.name, sensitivity: tag.sensitivity });
    } catch {
      // skip anything that isn't a well-formed tag element
    }
  }
  return out;
}

export function aggregateBookTags(
  assertions: SignedNostrEvent[],
  taxonomy: TaxonomyElement[],
): BookTags {
  const tax = new Map(taxonomy.map((t) => [t.slug, t]));
  // Dedup by (author, tagSlug) keeping the latest created_at.
  const latest = new Map<string, { slug: string; polarity: number; createdAt: number }>();
  for (const e of assertions) {
    let a;
    try {
      a = parseAssertion(e);
    } catch {
      continue;
    }
    const key = `${e.pubkey}|${a.tagSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, { slug: a.tagSlug, polarity: a.polarity, createdAt: e.created_at });
    }
  }

  const counts = new Map<string, { applies: number; disputes: number }>();
  for (const v of latest.values()) {
    const c = counts.get(v.slug) ?? { applies: 0, disputes: 0 };
    if (v.polarity === 1) c.applies++;
    else if (v.polarity === -1) c.disputes++;
    counts.set(v.slug, c);
  }

  const result: BookTags = { genres: [], styles: [], signals: [] };
  for (const [slug, c] of counts) {
    const el = tax.get(slug);
    if (!el || el.sensitivity === "accusatory") continue; // hide unknown + accusatory
    const consensus: TagConsensus = {
      slug,
      name: el.name,
      type: el.type,
      applies: c.applies,
      disputes: c.disputes,
    };
    if (el.type === "genre") result.genres.push(consensus);
    else if (el.type === "style") result.styles.push(consensus);
    else result.signals.push(consensus);
  }
  return result;
}

/**
 * Own-applied-tags count for the signed-in user's profile (ADR 0019 Decision 2,
 * AC-7). Single-author read, so latest-wins keys on the (bookSlug, tagSlug) PAIR
 * (author is fixed) rather than (author, tagSlug) as in `aggregateBookTags`.
 * Counts pairs whose latest assertion has polarity +1; disputes (latest -1) and
 * retractions are excluded by construction.
 */
export function countOwnAppliedTags(assertions: SignedNostrEvent[]): number {
  const latest = new Map<string, { polarity: number; createdAt: number }>();
  for (const e of assertions) {
    let a;
    try {
      a = parseAssertion(e);
    } catch {
      continue;
    }
    const key = `${a.bookSlug}|${a.tagSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, { polarity: a.polarity, createdAt: e.created_at });
    }
  }
  let applied = 0;
  for (const v of latest.values()) {
    if (v.polarity === 1) applied++;
  }
  return applied;
}

export function aggregateGenreBooks(assertions: SignedNostrEvent[]): string[] {
  // Dedup by (author, book) keeping latest; net = applies - disputes per book.
  const latest = new Map<string, { polarity: number; createdAt: number; book: string }>();
  for (const e of assertions) {
    let a;
    try {
      a = parseAssertion(e);
    } catch {
      continue;
    }
    const key = `${e.pubkey}|${a.bookSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, { polarity: a.polarity, createdAt: e.created_at, book: a.bookSlug });
    }
  }
  const net = new Map<string, number>();
  for (const v of latest.values()) {
    net.set(v.book, (net.get(v.book) ?? 0) + v.polarity);
  }
  return [...net.entries()].filter(([, n]) => n > 0).map(([book]) => book);
}
