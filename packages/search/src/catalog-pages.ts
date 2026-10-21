// The catalog in pages (Story 108 / ADR 0096 §2): the librarian's book records
// a page at a time, each page with only its own books' tag assertions, so a
// worker's memory follows the page size rather than the catalog size.
import { forEachPage, queryAllPages } from "@unbnd/relay";
import {
  buildBookRecordsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
  fromBookTagAssertionEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";

export type CatalogQuery = (filter: {
  kinds: number[];
  authors?: string[];
  "#z": string[];
  "#a"?: string[];
  until?: number;
  limit?: number;
}) => Promise<SignedNostrEvent[]>;

/** Addresses per assertion read: keeps a REQ well under relays' filter limits. */
const ADDRESSES_PER_READ = 250;

export async function forEachCatalogPage(opts: {
  readonly query: CatalogQuery;
  readonly librarian: string;
  readonly pageSize?: number;
  readonly onPage: (
    records: SignedNostrEvent[],
    assertionsBySlug: Map<string, SignedNostrEvent[]>,
  ) => Promise<void>;
}): Promise<{ pages: number; events: number; stuck: boolean }> {
  const { query, librarian } = opts;
  const booksZ = formatAddress(buildBookRecordsHeaderAddress(librarian as never));
  const assertZ = formatAddress(buildBookTagAssertionsHeaderAddress(librarian as never));

  const result = await forEachPage(
    (cursor) => query({ kinds: [39999], authors: [librarian], "#z": [booksZ], ...cursor }),
    async (records) => {
      const addresses = [
        ...new Set(
          records
            .map((r) => r.tags.find((t) => t[0] === "d")?.[1])
            .filter((d): d is string => Boolean(d))
            .map((d) => `39999:${librarian}:${d}`),
        ),
      ];
      const bySlug = new Map<string, SignedNostrEvent[]>();
      for (let i = 0; i < addresses.length; i += ADDRESSES_PER_READ) {
        const chunk = addresses.slice(i, i + ADDRESSES_PER_READ);
        // Paged: a relay answers at most 500 events per request.
        const { events } = await queryAllPages(
          (cursor) => query({ kinds: [39999], "#z": [assertZ], "#a": chunk, ...cursor }),
          { pageSize: 500, maxPages: Infinity, totalBudgetMs: Infinity },
        );
        for (const e of events) {
          let slug: string;
          try {
            slug = fromBookTagAssertionEvent(fromWireEvent(e) as never).bookSlug;
          } catch {
            continue;
          }
          const list = bySlug.get(slug) ?? [];
          list.push(e);
          bySlug.set(slug, list);
        }
      }
      await opts.onPage(records, bySlug);
    },
    { pageSize: opts.pageSize ?? 500, maxPages: Infinity, totalBudgetMs: Infinity },
  );
  return { pages: result.pages, events: result.events, stuck: result.stuck };
}
