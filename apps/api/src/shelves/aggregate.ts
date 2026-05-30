// Group a single user's own shelf-membership assertions into shelves (ADR 0018,
// AC-3/AC-5/AC-7). Latest-wins per (book, shelf); SHELF_OFF survivors drop out;
// survivors group by shelf slug. Default-shelf names come from the fixed
// constants; custom-shelf names resolve from the latest surviving apply in the
// group. Single-author read only — no trust weighting (Lane 1). Mirrors
// apps/api/src/tags/aggregate.ts latest-wins.
import {
  DEFAULT_SHELVES,
  DEFAULT_SHELF_SLUGS,
  SHELF_OFF,
  fromShelfAssertionEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";

export type ShelfBook = {
  readonly bookSlug: string;
  readonly bookAtag: string;
};

export type Shelf = {
  readonly slug: string;
  readonly name: string;
  readonly books: ShelfBook[];
  readonly count: number;
};

const DEFAULT_NAME = new Map<string, string>(
  DEFAULT_SHELVES.map((s) => [s.slug, s.name]),
);
const DEFAULT_ORDER = new Map<string, number>(
  DEFAULT_SHELF_SLUGS.map((slug, i) => [slug, i]),
);

function parseAssertion(event: SignedNostrEvent) {
  const unsigned = fromWireEvent({
    kind: event.kind,
    content: event.content,
    tags: event.tags,
  });
  return fromShelfAssertionEvent(unsigned as never);
}

type Survivor = {
  bookSlug: string;
  bookAtag: string;
  shelfSlug: string;
  shelfName?: string;
  polarity: number;
  createdAt: number;
};

export function groupOwnShelves(events: SignedNostrEvent[]): Shelf[] {
  // Dedup by (bookSlug, shelfSlug) keeping the latest created_at.
  const latest = new Map<string, Survivor>();
  for (const e of events) {
    let a;
    try {
      a = parseAssertion(e);
    } catch {
      continue;
    }
    const key = `${a.bookSlug}|${a.shelfSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, {
        bookSlug: a.bookSlug,
        bookAtag: a.bookAddress
          ? `${a.bookAddress.kind}:${a.bookAddress.pubkey}:${a.bookAddress.dTag}`
          : "",
        shelfSlug: a.shelfSlug,
        shelfName: a.shelfName,
        polarity: a.polarity,
        createdAt: e.created_at,
      });
    }
  }

  // Group survivors that are still on a shelf (latest polarity is SHELF_ON).
  type Group = { books: ShelfBook[]; name?: string; nameAt: number };
  const groups = new Map<string, Group>();
  for (const v of latest.values()) {
    if (v.polarity === SHELF_OFF) continue;
    const g = groups.get(v.shelfSlug) ?? { books: [], nameAt: -1 };
    g.books.push({ bookSlug: v.bookSlug, bookAtag: v.bookAtag });
    // Resolve the custom display name from the latest surviving apply.
    if (v.shelfName !== undefined && v.createdAt > g.nameAt) {
      g.name = v.shelfName;
      g.nameAt = v.createdAt;
    }
    groups.set(v.shelfSlug, g);
  }

  const shelves: Shelf[] = [];
  for (const [slug, g] of groups) {
    const name = DEFAULT_NAME.get(slug) ?? g.name ?? slug;
    shelves.push({ slug, name, books: g.books, count: g.books.length });
  }

  // Sort: the three defaults first in PRD order, then custom shelves
  // alphabetically by name.
  shelves.sort((a, b) => {
    const ai = DEFAULT_ORDER.get(a.slug);
    const bi = DEFAULT_ORDER.get(b.slug);
    if (ai !== undefined && bi !== undefined) return ai - bi;
    if (ai !== undefined) return -1;
    if (bi !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });

  return shelves;
}
