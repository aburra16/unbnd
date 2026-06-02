// The shelves worker COMPUTE core (Story 35 / ADR 0036 §1/§4). A PURE function
// of injected deps — a fake-able relay read, the trust seam, an injected clock,
// and the shelf knobs — so it is fully fixture-testable with no live relay/DB.
// It REUSES the shipped `weightedRatings`/`dedupeRatings` from `@unbnd/trust`
// (NOT a cross-app source import) — no new trust/ranking math. The house-PoV
// trust signal is resolved via ONE bounded, batched `trust.weights` call over
// the union of all raters (AC-7), never per-book/per-genre. Honest empty + honest
// degrade: an empty/throwing weight map or a missing observer yields empty
// shelves (zero rows) and never throws.
//
// NO Brainstorm/NIP-85 specifics live here — the worker depends only on the
// neutral `TrustProvider.weights` seam (the architecture guard enforces it).
import { npubEncode } from "nostr-tools/nip19";
import {
  buildBookRatingsHeaderAddress,
  buildBookRecordsHeaderAddress,
  buildBookTagsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
  fromBookRatingEvent,
  fromBookTagAssertionEvent,
  fromBookTagEvent,
  fromWireEvent,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import {
  dedupeRatings,
  weightedRatings,
  type ParsedRating,
  type TrustProvider,
} from "@unbnd/trust";
import type { ShelfDefs } from "./config";

const DAY_SECONDS = 86_400;

/** A single ordered shelf entry — a book slug (the API hydrates display). */
export type ShelfRow = { readonly bookSlug: string };

/** A genre row: the genre identity + its ordered top trust-weighted books. */
export type ShelfGenre = {
  readonly slug: string;
  readonly name: string;
  readonly books: ShelfRow[];
};

/** The computed house-PoV shelf set. Empty arrays = honest empty (no fabrication). */
export type ShelfSet = {
  readonly trending: ShelfRow[];
  readonly favorites: ShelfRow[];
  readonly genres: ShelfGenre[];
};

export type ShelfComputeConfig = {
  readonly librarianPubkey?: string;
  readonly houseObserverPubkey?: string;
};

export type ShelfComputeDeps = {
  readonly config: ShelfComputeConfig;
  /** Reads the canned/live events for a `#z` concept address. */
  readonly readConcept: (z: string) => Promise<SignedNostrEvent[]>;
  /** The neutral trust seam (ADR 0014). Never throws per its contract; we still
   * wrap the call so a surprise rejection degrades to an empty map. */
  readonly trust: TrustProvider;
  /** Injected clock (seconds). The Trending window is computed against THIS. */
  readonly now: () => number;
  readonly defs: ShelfDefs;
};

/**
 * A recording callable: the atomic-replace write (ADR 0036 §2) plus a `mock`
 * member exposing the (observerHex, shelves) call records. Production reads
 * `mock` for nothing — it only invokes the call — but recording the writes is a
 * cheap, honest observability hook; tests inject a `vi.fn` (whose `.mock` has the
 * same shape) and read the records directly off the seam.
 */
export interface ReplaceShelvesFn {
  (observerHex: string, shelves: ShelfSet): Promise<void>;
  readonly mock: { readonly calls: ReadonlyArray<readonly [string, ShelfSet]> };
}

/** The cache writer seam (ADR 0036 §2) — a single atomic replace per refresh. */
export type ShelvesCache = {
  replaceShelves: ReplaceShelvesFn;
};

export type ShelfCycleDeps = ShelfComputeDeps & {
  readonly cache: ShelvesCache;
};

const EMPTY: ShelfSet = { trending: [], favorites: [], genres: [] };

/** The bookSlug a rating event targets (the `["t", <bookSlug>]` tag / payload). */
function ratingBookSlug(event: SignedNostrEvent): string | null {
  try {
    const rating = fromBookRatingEvent(
      fromWireEvent({ kind: event.kind, content: event.content, tags: event.tags }) as never,
    );
    return rating.bookSlug;
  } catch {
    return null;
  }
}

/** Parse the genre taxonomy elements (keep `type === "genre"`). */
function parseGenres(events: SignedNostrEvent[]): Array<{ slug: string; name: string }> {
  const out: Array<{ slug: string; name: string }> = [];
  for (const e of events) {
    try {
      const tag = fromBookTagEvent(
        fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
      );
      if (tag.type === "genre") out.push({ slug: tag.slug, name: tag.name });
    } catch {
      // skip anything not a well-formed tag element
    }
  }
  return out;
}

/**
 * Net-positive genre membership per genre slug (mirrors `aggregateGenreBooks`,
 * ADR 0009): dedup by (asserter, book) keeping latest, net = applies − disputes
 * per (genre, book); a book is a member of a genre when its net is > 0.
 * Returns `Map<genreSlug, Set<bookSlug>>`.
 */
function genreMembership(assertions: SignedNostrEvent[]): Map<string, Set<string>> {
  // (genre|asserter|book) → { polarity, createdAt }
  const latest = new Map<string, { polarity: number; createdAt: number; genre: string; book: string }>();
  for (const e of assertions) {
    let a;
    try {
      a = fromBookTagAssertionEvent(
        fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
      );
    } catch {
      continue;
    }
    if (a.tagType !== "genre") continue;
    const key = `${a.tagSlug}|${e.pubkey}|${a.bookSlug}`;
    const prior = latest.get(key);
    if (!prior || e.created_at > prior.createdAt) {
      latest.set(key, { polarity: a.polarity, createdAt: e.created_at, genre: a.tagSlug, book: a.bookSlug });
    }
  }
  const net = new Map<string, Map<string, number>>(); // genre → (book → net)
  for (const v of latest.values()) {
    const g = net.get(v.genre) ?? new Map<string, number>();
    g.set(v.book, (g.get(v.book) ?? 0) + v.polarity);
    net.set(v.genre, g);
  }
  const out = new Map<string, Set<string>>();
  for (const [genre, books] of net) {
    const members = new Set<string>();
    for (const [book, n] of books) if (n > 0) members.add(book);
    out.set(genre, members);
  }
  return out;
}

export async function computeShelves(deps: ShelfComputeDeps): Promise<ShelfSet> {
  const observer = deps.config.houseObserverPubkey;
  const lib = deps.config.librarianPubkey;
  // Honest no-vantage / no-catalog: empty shelves, no compute (AC-6).
  if (!observer || !lib) return EMPTY;

  const booksZ = formatAddress(buildBookRecordsHeaderAddress(lib as never));
  const ratingsZ = formatAddress(buildBookRatingsHeaderAddress(lib as never));
  const tagsZ = formatAddress(buildBookTagsHeaderAddress(lib as never));
  const assertsZ = formatAddress(buildBookTagAssertionsHeaderAddress(lib as never));

  const [bookEvents, ratingEvents, taxonomyEvents, assertionEvents] = await Promise.all([
    deps.readConcept(booksZ),
    deps.readConcept(ratingsZ),
    deps.readConcept(tagsZ),
    deps.readConcept(assertsZ),
  ]);

  // The candidate book set (catalog membership).
  const catalogSlugs = new Set<string>();
  for (const e of bookEvents) {
    try {
      const rec = fromBookRecordEventSlug(e);
      if (rec) catalogSlugs.add(rec);
    } catch {
      // skip
    }
  }

  // Group rating events by book slug (only catalog members).
  const ratingsByBook = new Map<string, SignedNostrEvent[]>();
  for (const e of ratingEvents) {
    const slug = ratingBookSlug(e);
    if (!slug || !catalogSlugs.has(slug)) continue;
    const arr = ratingsByBook.get(slug) ?? [];
    arr.push(e);
    ratingsByBook.set(slug, arr);
  }

  // Dedup per (rater, book); collect the UNION of all rater hexes for ONE
  // batched weights call (AC-7).
  const dedupedByBook = new Map<string, ParsedRating[]>();
  const raterUnion = new Set<string>();
  for (const [slug, events] of ratingsByBook) {
    const deduped = dedupeRatings(events);
    dedupedByBook.set(slug, deduped);
    for (const r of deduped) raterUnion.add(r.pubkey);
  }

  // ONE bounded, batched weights call from the HOUSE vantage. Wrapped so a
  // surprise rejection degrades to an empty map (honest degrade, AC-6).
  let weights: Map<string, number>;
  try {
    weights = await deps.trust.weights(observer, [...raterUnion]);
  } catch {
    weights = new Map();
  }

  const observerNpub = npubEncode(observer);
  const window = deps.defs.trendingWindowDays * DAY_SECONDS;
  const windowStart = deps.now() - window;

  // ── Trending: Σ(weight × score) over TRUSTED ratings inside the window ──
  const trendingScores: Array<{ slug: string; activity: number }> = [];
  for (const [slug, deduped] of dedupedByBook) {
    let activity = 0;
    for (const r of deduped) {
      if (r.createdAt < windowStart) continue; // out of window
      const w = weights.get(r.pubkey) ?? 0;
      if (w > 0) activity += w * r.score;
    }
    if (activity > 0) trendingScores.push({ slug, activity });
  }
  trendingScores.sort((a, b) => b.activity - a.activity || a.slug.localeCompare(b.slug));
  const trending: ShelfRow[] = trendingScores
    .slice(0, deps.defs.booksPerRow)
    .map((x) => ({ bookSlug: x.slug }));

  // ── Community Favorites: weightedRatings.average, gated by min trusted count ──
  const favScores: Array<{ slug: string; average: number }> = [];
  for (const [slug, deduped] of dedupedByBook) {
    const weighted = weightedRatings(deduped, weights, observerNpub);
    if (!weighted) continue;
    if (weighted.trustedCount < deps.defs.favoritesMinRatings) continue;
    favScores.push({ slug, average: weighted.average });
  }
  favScores.sort((a, b) => b.average - a.average || a.slug.localeCompare(b.slug));
  const favorites: ShelfRow[] = favScores
    .slice(0, deps.defs.booksPerRow)
    .map((x) => ({ bookSlug: x.slug }));

  // ── Genre shelves: per genre, books ranked by weightedRatings.average ──
  const genres = parseGenres(taxonomyEvents);
  const membership = genreMembership(assertionEvents);
  const genreRows: Array<{ slug: string; name: string; books: ShelfRow[]; qualifying: number }> = [];
  for (const genre of genres) {
    const members = membership.get(genre.slug) ?? new Set<string>();
    const ranked: Array<{ slug: string; average: number }> = [];
    for (const slug of members) {
      if (!catalogSlugs.has(slug)) continue;
      const deduped = dedupedByBook.get(slug);
      if (!deduped) continue;
      const weighted = weightedRatings(deduped, weights, observerNpub);
      if (!weighted) continue; // no trusted signal → not surfaced (honest empty)
      ranked.push({ slug, average: weighted.average });
    }
    ranked.sort((a, b) => b.average - a.average || a.slug.localeCompare(b.slug));
    const books = ranked.slice(0, deps.defs.booksPerRow).map((x) => ({ bookSlug: x.slug }));
    if (books.length === 0) continue; // a genre with no trusted signal contributes zero rows
    genreRows.push({ slug: genre.slug, name: genre.name, books, qualifying: books.length });
  }
  // Top SHELF_GENRE_COUNT genres by qualifying-book count, tie-broken by slug.
  genreRows.sort((a, b) => b.qualifying - a.qualifying || a.slug.localeCompare(b.slug));
  const genresOut: ShelfGenre[] = genreRows
    .slice(0, deps.defs.genreCount)
    .map((g) => ({ slug: g.slug, name: g.name, books: g.books }));

  return { trending, favorites, genres: genresOut };
}

/** The catalog book slug from a kind-39999 book record event, or null. */
function fromBookRecordEventSlug(event: SignedNostrEvent): string | null {
  // The d-tag IS the slug for a book record (ADR 0010). Cheap + parse-free.
  const d = event.tags.find((t) => t[0] === "d")?.[1];
  return d ?? null;
}

/**
 * One worker cycle (ADR 0036 §1): compute the house-PoV shelves, then ATOMICALLY
 * replace the cache for the house observer. A fatal error during compute (e.g. a
 * relay read throwing mid-cycle) propagates BEFORE the replace — the cache writer
 * is never called, so the previous good cache is left intact (no partial write).
 */
export async function runShelvesCycle(deps: ShelfCycleDeps): Promise<void> {
  const observer = deps.config.houseObserverPubkey;
  const shelves = await computeShelves(deps);
  // No vantage → nothing to write (computeShelves already returned empty).
  if (!observer) return;
  await deps.cache.replaceShelves(observer, shelves);
}
