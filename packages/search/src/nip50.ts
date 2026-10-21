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
  isbn13Of,
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
  readonly "#i"?: string[];
  readonly search: string;
  readonly limit: number;
};

export type Nip50Options = {
  /** The librarian's key: its `books` list is what this index searches. */
  readonly librarian: string;
  /** One read against the search relay; throws when the relay does not answer. */
  readonly query: (filter: Nip50Filter) => Promise<SignedNostrEvent[]>;
  /** Signature check for each event the relay returns: it is not Unbnd's relay. */
  readonly verify: (event: SignedNostrEvent) => boolean;
  readonly now?: () => number;
};

/** How many results one query loads: the furthest a search pages. */
export const SEARCH_WINDOW = 100;
const WINDOW_TTL_MS = 2 * 60 * 1000;
const MAX_WINDOWS = 500;
const MAX_QUERY_CHARS = 200;
/** NIP-50 options (`key:value`) a reader might type; only the adapter sets those. */
const SEARCH_OPTION = /(^|\s)(include|exclude|domain|language|lang|sentiment|nsfw|observer|spam):\S*/gi;
/** Brainstorm's search relay answers an unauthenticated search only with this option. */
const OPEN_READ = "include:spam";

type Window = { readonly hits: SearchHit[]; readonly full: boolean; readonly at: number };

const tagValue = (e: SignedNostrEvent, name: string) => e.tags.find((t) => t[0] === name)?.[1];

export class Nip50Provider implements SearchProvider {
  readonly name = "nip50" as const;
  readonly #librarian: string;
  readonly #booksZ: string;
  readonly #query: Nip50Options["query"];
  readonly #verify: Nip50Options["verify"];
  readonly #pending = new Map<string, Promise<Window>>();
  readonly #now: () => number;
  readonly #windows = new Map<string, Window>();

  constructor(opts: Nip50Options) {
    this.#librarian = opts.librarian;
    this.#booksZ = formatAddress(buildBookRecordsHeaderAddress(opts.librarian as never));
    this.#query = opts.query;
    this.#verify = opts.verify;
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
    // An ISBN is an exact identifier lookup (NIP-73 `i`), not a text search (ADR 0095 §7).
    const isbn = isbn13Of(query.q);
    const text = isbn ? "" : query.q.replace(SEARCH_OPTION, " ").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_CHARS);
    const key = JSON.stringify([isbn ?? "", text, f.genre ?? "", f.format ?? "", f.language ?? ""]);
    const cached = this.#windows.get(key);
    if (cached && this.#now() - cached.at < WINDOW_TTL_MS) return cached;
    if (!isbn && text === "") return { hits: [], full: false, at: this.#now() };
    const inFlight = this.#pending.get(key);
    if (inFlight) return inFlight;

    const load = this.#load(key, isbn, text, f).finally(() => this.#pending.delete(key));
    this.#pending.set(key, load);
    return load;
  }

  async #load(
    key: string,
    isbn: string | null,
    text: string,
    f: NonNullable<SearchQuery["filters"]>,
  ): Promise<Window> {
    const now = this.#now();
    const fetched = await this.#query({
      kinds: [39999],
      authors: [this.#librarian],
      "#z": [this.#booksZ],
      ...(f.genre ? { "#l": [f.genre] } : {}),
      ...(isbn ? { "#i": [`isbn:${isbn}`] } : {}),
      search: isbn ? OPEN_READ : `${text} ${OPEN_READ}`,
      limit: SEARCH_WINDOW,
    });
    const events = fetched.filter((e) => this.#verify(e));
    const records = this.#currentRecords(events).filter(
      (e) => (!f.format || tagValue(e, "format") === f.format) && (!f.language || tagValue(e, "lang") === f.language),
    );
    const parsed = records.map((e) => this.#hit(e)).filter((h): h is Omit<SearchHit, "score"> => h !== null);
    const n = parsed.length;
    const window: Window = {
      hits: parsed.map((h, i) => ({ ...h, score: (n - i) / n })),
      full: fetched.length >= SEARCH_WINDOW,
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
