// A NIP-50 search relay as the catalog's search backend (Story 106 / ADR 0095).
// The relay indexes the librarian's book records on the hub by itself, so this
// adapter only reads. A relay pages by date, but search results are ranked, so
// the adapter loads one ranked window per query and pages within it. The relay
// read is injected: the API passes a read that throws on failure, never one
// that answers "no events" for a dead relay.
import {
  buildBookRecordsHeaderAddress,
  credibleYear,
  formatAddress,
  fromBookRecordEvent,
  fromWireEvent,
  isDelistedRecord,
  isJunkRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type {
  ProviderHealth,
  SearchDocument,
  SearchHit,
  SearchProvider,
  SearchQuery,
  SearchResult,
} from "./types";

/** The relay filter the adapter sends: NIP-01 plus NIP-50's `search`. */
export type Nip50Filter = {
  readonly kinds: number[];
  readonly authors: string[];
  readonly "#z": string[];
  readonly "#l"?: string[];
  readonly search: string;
  readonly limit: number;
};

export type Nip50Options = {
  /** The librarian's key: its `books` list is what this index searches. */
  readonly librarian: string;
  /** One read against the search relay; throws when the relay does not answer. */
  readonly query: (filter: Nip50Filter) => Promise<SignedNostrEvent[]>;
  readonly now?: () => number;
};

/** How many results one query loads: the furthest a search pages. */
export const SEARCH_WINDOW = 100;
const WINDOW_TTL_MS = 2 * 60 * 1000;
const MAX_WINDOWS = 500;
/** Brainstorm's search relay answers an unauthenticated search only with this option. */
const OPEN_READ = "include:spam";

type Window = { readonly hits: SearchHit[]; readonly full: boolean; readonly at: number };

const tagValue = (e: SignedNostrEvent, name: string) => e.tags.find((t) => t[0] === name)?.[1];

export class Nip50Provider implements SearchProvider {
  readonly name = "nip50" as const;
  readonly #librarian: string;
  readonly #booksZ: string;
  readonly #query: Nip50Options["query"];
  readonly #now: () => number;
  readonly #windows = new Map<string, Window>();

  constructor(opts: Nip50Options) {
    this.#librarian = opts.librarian;
    this.#booksZ = formatAddress(buildBookRecordsHeaderAddress(opts.librarian as never));
    this.#query = opts.query;
    this.#now = opts.now ?? (() => Date.now());
  }

  async health(): Promise<ProviderHealth> {
    const start = this.#now();
    try {
      await this.#query({ kinds: [39999], authors: [this.#librarian], "#z": [this.#booksZ], search: OPEN_READ, limit: 1 });
      return { ok: true, provider: this.name, latencyMs: this.#now() - start };
    } catch (err) {
      return { ok: false, provider: this.name, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // The relay indexes the hub's records itself (ADR 0095 §5).
  async configureIndex(): Promise<void> {}
  async index(_docs: readonly SearchDocument[]): Promise<void> {}
  async delete(_ids: readonly string[]): Promise<void> {}
  async deleteAll(): Promise<void> {}

  async search(query: SearchQuery): Promise<SearchResult> {
    const window = await this.#window(query);
    return {
      hits: window.hits.slice(query.offset, query.offset + query.limit),
      total: window.hits.length,
      offset: query.offset,
      limit: query.limit,
      capped: window.full,
    };
  }

  async #window(query: SearchQuery): Promise<Window> {
    const f = query.filters ?? {};
    const key = JSON.stringify([query.q, f.genre ?? "", f.format ?? "", f.language ?? ""]);
    const now = this.#now();
    const cached = this.#windows.get(key);
    if (cached && now - cached.at < WINDOW_TTL_MS) return cached;

    const events = await this.#query({
      kinds: [39999],
      authors: [this.#librarian],
      "#z": [this.#booksZ],
      ...(f.genre ? { "#l": [f.genre] } : {}),
      search: `${query.q} ${OPEN_READ}`,
      limit: SEARCH_WINDOW,
    });
    const records = this.#currentRecords(events).filter(
      (e) => (!f.format || tagValue(e, "format") === f.format) && (!f.language || tagValue(e, "lang") === f.language),
    );
    const parsed = records.map((e) => this.#hit(e)).filter((h): h is Omit<SearchHit, "score"> => h !== null);
    const n = parsed.length;
    const window: Window = {
      hits: parsed.map((h, i) => ({ ...h, score: (n - i) / n })),
      full: events.length >= SEARCH_WINDOW,
      at: now,
    };
    this.#remember(key, window);
    return window;
  }

  /** The librarian's newest version of each record, in the relay's order of first appearance. */
  #currentRecords(events: readonly SignedNostrEvent[]): SignedNostrEvent[] {
    const order: string[] = [];
    const newest = new Map<string, SignedNostrEvent>();
    for (const e of events) {
      if (e.pubkey !== this.#librarian) continue;
      const slug = tagValue(e, "d");
      if (!slug) continue;
      const prior = newest.get(slug);
      if (!prior) order.push(slug);
      if (!prior || e.created_at > prior.created_at) newest.set(slug, e);
    }
    return order.map((slug) => newest.get(slug)!).filter((e) => !isDelistedRecord(e));
  }

  #hit(e: SignedNostrEvent): Omit<SearchHit, "score"> | null {
    let rec;
    try {
      rec = fromBookRecordEvent(fromWireEvent(e) as never);
    } catch {
      return null;
    }
    if (isJunkRecord(rec, new Date().getUTCFullYear())) return null;
    return {
      slug: rec.slug,
      title: rec.title,
      authorName: rec.authorName,
      blurb: rec.blurb,
      coverUrl: rec.coverUrl,
      publishYear: credibleYear(rec.publishYear),
      isbn13: rec.isbn13,
      format: rec.format,
    };
  }

  #remember(key: string, window: Window): void {
    this.#windows.delete(key);
    this.#windows.set(key, window);
    while (this.#windows.size > MAX_WINDOWS) {
      const oldest = this.#windows.keys().next().value;
      if (oldest === undefined) break;
      this.#windows.delete(oldest);
    }
  }
}
