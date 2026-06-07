// Story 35 / ADR 0036 — the shelves worker COMPUTE core, the deterministic unit.
//
// `computeShelves(deps): ShelfSet` is a PURE function of injected deps:
//   - a fake relay read (canned catalog + ratings + taxonomy + genre membership),
//   - a FixtureTrustProvider (known house weights over known rater keys, ADR 0017),
//   - an injected `now` (so the Trending window is deterministic — no Date.now),
//   - the shelf-definition knobs (SHELF_* values, pinned to fixture values).
// It reuses the shipped `weightedRatings` (apps/api/src/ratings/summary) over a
// SINGLE batched `weights` call — no new trust/ranking math.
//
// These tests inject a real FixtureTrustProvider + fakes — NO intra-module
// vi.mock, matching the DI style of the ratings/search route + indexer tests.
// They are FAILING until `apps/shelves/src/compute.ts` exists (the module-under-
// test import below resolves to a not-yet-built module).
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  buildBookRatingsHeaderAddress,
  buildBookRecordsHeaderAddress,
  buildBookTagsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
  toBookRatingEvent,
  toBookRecordEvent,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookRecord,
  type BookRating,
  type SignedNostrEvent,
} from "@unbnd/schemas";
// The trust + weighted-view machinery the worker REUSES (no new math). These
// live in the shared @unbnd/trust package; the worker composes over them. The
// fixture provider gives the house observer known weights over known rater keys
// (ADR 0017).
import { FixtureTrustProvider } from "@unbnd/trust";
// The module UNDER TEST — does not exist yet (intentionally red).
import {
  computeShelves,
  runShelvesCycle,
  type ShelfComputeDeps,
  type ShelfCycleDeps,
  type ShelfSet,
  type ShelfRow,
  type ShelfGenre,
} from "../src/compute";

// ── Fixtures ────────────────────────────────────────────────────────────────

const LIB = asHexPubkey("1".repeat(63) + "a");
// The house observer the shelves are computed FROM. The fixture spec keys the
// weight row by this exact hex; a different observer sees a different row.
const HOUSE = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";

// A fixed clock. Trending windows are computed against THIS, never wall time.
const NOW = 1_750_000_000; // seconds
const DAY = 86_400;

const BOOKS_Z = formatAddress(buildBookRecordsHeaderAddress(LIB));
const RATINGS_Z = formatAddress(buildBookRatingsHeaderAddress(LIB));
const TAGS_Z = formatAddress(buildBookTagsHeaderAddress(LIB));
const ASSERTS_Z = formatAddress(buildBookTagAssertionsHeaderAddress(LIB));

const SHELF_DEFS = {
  trendingWindowDays: 7,
  favoritesMinRatings: 3,
  genreCount: 5,
  booksPerRow: 10,
  hiddenGemsMargin: 0.5,
} as const;

/** A signed kind-39999 book record under the `books` concept (catalog member). */
function bookEvent(slug: string, title: string): SignedNostrEvent {
  const rec: BookRecord = {
    slug,
    title,
    authorName: `Author of ${title}`,
    format: "reference",
    source: "openlibrary",
    parentHeader: { kind: 39998, pubkey: LIB, dTag: "books" },
    subjects: ["fiction"],
    publishYear: 2000,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: `book-${slug}`, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

/** A taxonomy genre element under the `book-tags` concept. */
function genreTaxEvent(slug: string, name: string): SignedNostrEvent {
  const t = toWireTemplate(
    toBookTagEvent({
      slug,
      type: "genre",
      name,
      sensitivity: "normal",
      parentHeader: { kind: 39998, pubkey: LIB, dTag: "book-tags" },
    }),
    1,
  );
  return { id: `tax-${slug}`, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

/** A signed genre membership assertion (book ∈ genre) by `sk`. */
function genreAssertionEvent(
  sk: Uint8Array,
  bookSlug: string,
  genreSlug: string,
  polarity: 1 | -1 = 1,
): SignedNostrEvent {
  const a = {
    bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug: genreSlug,
    tagType: "genre" as const,
    polarity,
    asserterPubkey: asHexPubkey(getPublicKey(sk)),
    parentHeader: { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" },
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), 2);
  return JSON.parse(JSON.stringify(finalizeEvent(t as never, sk))) as SignedNostrEvent;
}

/** A signed kind-39999 rating for `bookSlug` at `score`, created at `createdAt`. */
function ratingEvent(opts: {
  sk?: Uint8Array;
  bookSlug: string;
  score: number;
  createdAt: number;
}): { pubkey: string; event: SignedNostrEvent } {
  const sk = opts.sk ?? generateSecretKey();
  const raterPubkey = asHexPubkey(getPublicKey(sk));
  const rating: BookRating = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999, pubkey: LIB, dTag: opts.bookSlug },
    raterPubkey,
    score: opts.score as BookRating["score"],
    reviewDate: "2026-05-27",
    parentHeader: { kind: 39998, pubkey: LIB, dTag: "book-ratings" },
  };
  const unsigned = toBookRatingEvent(rating);
  const tags = [
    ...unsigned.tags.map((t) => [...t]),
    ["json", JSON.stringify(unsigned.payload)],
  ];
  const signed = finalizeEvent(
    { kind: 39999, created_at: opts.createdAt, tags, content: unsigned.content },
    sk,
  );
  return {
    pubkey: raterPubkey,
    event: JSON.parse(JSON.stringify(signed)) as SignedNostrEvent,
  };
}

/**
 * A fake relay read keyed by the `#z` concept address — returns the canned
 * events for each concept. Mirrors the worker's `queryAllPages` reads (catalog,
 * ratings, taxonomy, genre membership), but with no live relay. Records how many
 * reads it served so we can assert the scan is bounded.
 */
function makeReadConcept(byZ: Record<string, SignedNostrEvent[]>) {
  return vi.fn(async (z: string) => byZ[z] ?? []);
}

/** The house fixture provider: HOUSE trusts every (rater→weight) in `row`. */
function trustProvider(row: Record<string, number>, observer = HOUSE) {
  return new FixtureTrustProvider({ weights: { [observer]: row } });
}

/** A fake cache writer (the worker's `ShelvesCache` seam) that captures the
 * rows that WOULD be written — no real Postgres. */
function makeCacheWriter(): ShelfCycleDeps["cache"] & {
  calls: Array<{ observerHex: string; shelves: ShelfSet }>;
} {
  const calls: Array<{ observerHex: string; shelves: ShelfSet }> = [];
  const replaceShelves = vi.fn(async (observerHex: string, shelves: ShelfSet) => {
    calls.push({ observerHex, shelves });
  });
  return { replaceShelves, calls };
}

function baseDeps(overrides: Partial<ShelfComputeDeps> = {}): ShelfComputeDeps {
  return {
    config: { librarianPubkey: LIB, houseObserverPubkey: HOUSE },
    readConcept: makeReadConcept({}),
    trust: trustProvider({}),
    now: () => NOW,
    defs: SHELF_DEFS,
    ...overrides,
  } as ShelfComputeDeps;
}

const slugsOf = (rows: readonly ShelfRow[]) => rows.map((r) => r.bookSlug);

// ── AC-1: Trending — trust-weighted activity within the window ───────────────

describe("computeShelves — AC-1: Trending ranks by trust-weighted activity in the window", () => {
  it("ranks books by the weighted sum of TRUSTED ratings inside SHELF_TRENDING_WINDOW_DAYS", async () => {
    // Two trusted raters; A gets a strong recent trusted rating, B a weak one.
    // Within the 7-day window from NOW, A's weighted activity > B's, so A ranks first.
    const aRater = ratingEvent({ bookSlug: "a-book", score: 5, createdAt: NOW - DAY });
    const bRater = ratingEvent({ bookSlug: "b-book", score: 2, createdAt: NOW - DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("a-book", "Alpha"), bookEvent("b-book", "Beta")],
      [RATINGS_Z]: [aRater.event, bRater.event],
    });
    const trust = trustProvider({ [aRater.pubkey]: 0.9, [bRater.pubkey]: 0.9 });

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(slugsOf(out.trending)).toEqual(["a-book", "b-book"]);
  });

  it("excludes a book whose only trusted rating is OUTSIDE the window", async () => {
    // `recent` is rated inside the window; `stale` is rated 30 days ago (outside).
    const recent = ratingEvent({ bookSlug: "recent", score: 5, createdAt: NOW - 2 * DAY });
    const stale = ratingEvent({ bookSlug: "stale", score: 5, createdAt: NOW - 30 * DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("recent", "Recent"), bookEvent("stale", "Stale")],
      [RATINGS_Z]: [recent.event, stale.event],
    });
    const trust = trustProvider({ [recent.pubkey]: 0.9, [stale.pubkey]: 0.9 });

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(slugsOf(out.trending)).toEqual(["recent"]);
  });

  it("an UNTRUSTED-rating flood does NOT inflate a book onto Trending", async () => {
    // `loved` has ONE trusted recent 5. `spammed` has TEN untrusted recent 5s
    // (none carry weight). Trusted activity must win — `spammed` stays off-shelf.
    const loved = ratingEvent({ bookSlug: "loved", score: 5, createdAt: NOW - DAY });
    const spamEvents = Array.from({ length: 10 }, () =>
      ratingEvent({ bookSlug: "spammed", score: 5, createdAt: NOW - DAY }),
    );
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("loved", "Loved"), bookEvent("spammed", "Spammed")],
      [RATINGS_Z]: [loved.event, ...spamEvents.map((s) => s.event)],
    });
    // Only the `loved` rater carries weight; the 10 spam raters are untrusted.
    const trust = trustProvider({ [loved.pubkey]: 0.9 });

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(slugsOf(out.trending)).toEqual(["loved"]);
    expect(slugsOf(out.trending)).not.toContain("spammed");
  });
});

// ── AC-2: Community Favorites — weighted average above a min-count threshold ──

describe("computeShelves — AC-2: Community Favorites ranks by weighted average, min trusted count", () => {
  it("ranks by weightedRatings.average and excludes books below SHELF_FAVORITES_MIN_RATINGS", async () => {
    // `popular` has 3 trusted ratings averaging high; `thin` has ONE trusted 5
    // (below the min-count of 3). Only `popular` qualifies, even though `thin`'s
    // single rating is a perfect 5 — a thinly-rated book never tops the shelf.
    const p1 = ratingEvent({ bookSlug: "popular", score: 5, createdAt: NOW - 2 * DAY });
    const p2 = ratingEvent({ bookSlug: "popular", score: 4, createdAt: NOW - 2 * DAY });
    const p3 = ratingEvent({ bookSlug: "popular", score: 5, createdAt: NOW - 2 * DAY });
    const thin = ratingEvent({ bookSlug: "thin", score: 5, createdAt: NOW - 2 * DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("popular", "Popular"), bookEvent("thin", "Thin")],
      [RATINGS_Z]: [p1.event, p2.event, p3.event, thin.event],
    });
    const trust = trustProvider({
      [p1.pubkey]: 0.9,
      [p2.pubkey]: 0.9,
      [p3.pubkey]: 0.9,
      [thin.pubkey]: 0.9,
    });

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(slugsOf(out.favorites)).toEqual(["popular"]);
    expect(slugsOf(out.favorites)).not.toContain("thin");
  });

  it("orders two qualifying books by their trust-weighted average (higher first)", async () => {
    // Both clear the min-count of 3. `high` averages 5; `mid` averages 3.
    const high = [5, 5, 5].map((s) =>
      ratingEvent({ bookSlug: "high", score: s, createdAt: NOW - 2 * DAY }),
    );
    const mid = [3, 3, 3].map((s) =>
      ratingEvent({ bookSlug: "mid", score: s, createdAt: NOW - 2 * DAY }),
    );
    const all = [...high, ...mid];
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("high", "High"), bookEvent("mid", "Mid")],
      [RATINGS_Z]: all.map((r) => r.event),
    });
    const trust = trustProvider(Object.fromEntries(all.map((r) => [r.pubkey, 0.9])));

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(slugsOf(out.favorites)).toEqual(["high", "mid"]);
  });
});

// ── AC-3: Genre shelves — top trust-weighted per genre, honest-empty genres ──

describe("computeShelves — AC-3: genre shelves are top trust-weighted per genre", () => {
  it("ranks each genre's books by trust-weighted average from the house vantage", async () => {
    // sci-fi has two member books; `great` averages 5, `okay` averages 2 (both
    // ≥1 trusted rating). The genre row lists `great` first.
    const g1 = ratingEvent({ bookSlug: "great", score: 5, createdAt: NOW - 2 * DAY });
    const g2 = ratingEvent({ bookSlug: "okay", score: 2, createdAt: NOW - 2 * DAY });
    const memberSk = generateSecretKey();
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("great", "Great"), bookEvent("okay", "Okay")],
      [RATINGS_Z]: [g1.event, g2.event],
      [TAGS_Z]: [genreTaxEvent("sci-fi", "Science Fiction")],
      [ASSERTS_Z]: [
        genreAssertionEvent(memberSk, "great", "sci-fi"),
        genreAssertionEvent(memberSk, "okay", "sci-fi"),
      ],
    });
    const trust = trustProvider({ [g1.pubkey]: 0.9, [g2.pubkey]: 0.9 });

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    const sciFi = out.genres.find((g: ShelfGenre) => g.slug === "sci-fi");
    expect(sciFi).toBeDefined();
    expect(sciFi!.name).toBe("Science Fiction");
    expect(slugsOf(sciFi!.books)).toEqual(["great", "okay"]);
  });

  it("a genre with NO trust signal is honest-empty (NOT filled with raw books)", async () => {
    // `mystery` has member books but NONE has a trusted rating from HOUSE. The
    // genre must contribute zero rows — never raw/arbitrary books dressed as
    // trust-ranked (AC-5 within a genre).
    const memberSk = generateSecretKey();
    // a rating exists, but its rater carries NO weight from HOUSE.
    const untrusted = ratingEvent({ bookSlug: "m1", score: 5, createdAt: NOW - 2 * DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("m1", "M One"), bookEvent("m2", "M Two")],
      [RATINGS_Z]: [untrusted.event],
      [TAGS_Z]: [genreTaxEvent("mystery", "Mystery")],
      [ASSERTS_Z]: [
        genreAssertionEvent(memberSk, "m1", "mystery"),
        genreAssertionEvent(memberSk, "m2", "mystery"),
      ],
    });
    const trust = trustProvider({}); // HOUSE trusts nobody → no trusted signal

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    const mystery = out.genres.find((g: ShelfGenre) => g.slug === "mystery");
    // Either the genre is absent, or present with an empty (honest) book list.
    if (mystery) expect(mystery.books).toEqual([]);
    else expect(out.genres.map((g: ShelfGenre) => g.slug)).not.toContain("mystery");
  });

  it("surfaces at most SHELF_GENRE_COUNT genres and SHELF_BOOKS_PER_ROW books per row", async () => {
    // Build 6 genres each with 1 qualifying book, and a 7th genre — only the top
    // SHELF_GENRE_COUNT (5) surface. Within sci-fi, 12 qualifying books cap at 10.
    const memberSk = generateSecretKey();
    const taxonomy = ["g1", "g2", "g3", "g4", "g5", "g6"].map((s) =>
      genreTaxEvent(s, s.toUpperCase()),
    );
    const books: SignedNostrEvent[] = [];
    const ratings: SignedNostrEvent[] = [];
    const asserts: SignedNostrEvent[] = [];
    const weightRow: Record<string, number> = {};
    // sci-fi-like first genre g1 gets 12 books; g2..g6 get 1 each.
    const perGenre: Record<string, number> = { g1: 12, g2: 1, g3: 1, g4: 1, g5: 1, g6: 1 };
    for (const [genre, count] of Object.entries(perGenre)) {
      for (let i = 0; i < count; i++) {
        const slug = `${genre}-b${i}`;
        books.push(bookEvent(slug, slug));
        const r = ratingEvent({ bookSlug: slug, score: 5, createdAt: NOW - 2 * DAY });
        ratings.push(r.event);
        weightRow[r.pubkey] = 0.9;
        asserts.push(genreAssertionEvent(memberSk, slug, genre));
      }
    }
    const readConcept = makeReadConcept({
      [BOOKS_Z]: books,
      [RATINGS_Z]: ratings,
      [TAGS_Z]: taxonomy,
      [ASSERTS_Z]: asserts,
    });
    const trust = trustProvider(weightRow);

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(out.genres.length).toBeLessThanOrEqual(SHELF_DEFS.genreCount);
    for (const g of out.genres) {
      expect(g.books.length).toBeLessThanOrEqual(SHELF_DEFS.booksPerRow);
    }
    // g1 (12 qualifying) is among the surfaced top-5 and is capped at 10.
    const g1 = out.genres.find((g: ShelfGenre) => g.slug === "g1");
    expect(g1).toBeDefined();
    expect(g1!.books.length).toBe(SHELF_DEFS.booksPerRow);
  });
});

// ── AC-7: bounded + batched single weights call ──────────────────────────────

describe("computeShelves — AC-7: house vantage, ONE batched weights call (no fan-out)", () => {
  it("calls trust.weights EXACTLY ONCE over the union of all raters", async () => {
    const a = ratingEvent({ bookSlug: "a-book", score: 5, createdAt: NOW - DAY });
    const b = ratingEvent({ bookSlug: "b-book", score: 4, createdAt: NOW - DAY });
    const c = ratingEvent({ bookSlug: "c-book", score: 3, createdAt: NOW - DAY });
    const memberSk = generateSecretKey();
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("a-book", "A"), bookEvent("b-book", "B"), bookEvent("c-book", "C")],
      [RATINGS_Z]: [a.event, b.event, c.event],
      [TAGS_Z]: [genreTaxEvent("sci-fi", "Science Fiction")],
      [ASSERTS_Z]: [
        genreAssertionEvent(memberSk, "a-book", "sci-fi"),
        genreAssertionEvent(memberSk, "b-book", "sci-fi"),
        genreAssertionEvent(memberSk, "c-book", "sci-fi"),
      ],
    });
    const trust = trustProvider({ [a.pubkey]: 0.9, [b.pubkey]: 0.9, [c.pubkey]: 0.9 });
    const spy = vi.spyOn(trust, "weights");

    await computeShelves(baseDeps({ readConcept, trust }));

    // ONE weights call for the WHOLE compute — not per-book, not per-genre.
    expect(spy).toHaveBeenCalledTimes(1);
    // …from the HOUSE vantage…
    expect(spy.mock.calls[0]![0]).toBe(HOUSE);
    // …over the UNION of every rater across all candidate books.
    const targets = spy.mock.calls[0]![1] as readonly string[];
    expect([...targets].sort()).toEqual([a.pubkey, b.pubkey, c.pubkey].sort());
  });

  it("computes the house-PoV signal from config.houseObserverPubkey", async () => {
    const a = ratingEvent({ bookSlug: "a-book", score: 5, createdAt: NOW - DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("a-book", "A")],
      [RATINGS_Z]: [a.event],
    });
    const trust = trustProvider({ [a.pubkey]: 0.9 });
    const spy = vi.spyOn(trust, "weights");

    await computeShelves(baseDeps({ readConcept, trust }));

    expect(spy).toHaveBeenCalledWith(HOUSE, expect.any(Array));
  });
});

// ── AC-6: honest degrade — empty / throwing trust → empty shelves, no crash ──

describe("computeShelves — AC-6: honest degrade (no throw, no fabricated shelf)", () => {
  it("an empty weight map yields empty shelves (no trusted signal anywhere)", async () => {
    const a = ratingEvent({ bookSlug: "a-book", score: 5, createdAt: NOW - DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("a-book", "A")],
      [RATINGS_Z]: [a.event],
      [TAGS_Z]: [genreTaxEvent("sci-fi", "Science Fiction")],
    });
    const trust = trustProvider({}); // HOUSE trusts nobody

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(out.trending).toEqual([]);
    expect(out.favorites).toEqual([]);
    // No genre row is fabricated from raw books.
    for (const g of out.genres) expect(g.books).toEqual([]);
  });

  it("a throwing trust.weights degrades to empty shelves and does NOT throw", async () => {
    const a = ratingEvent({ bookSlug: "a-book", score: 5, createdAt: NOW - DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("a-book", "A")],
      [RATINGS_Z]: [a.event],
    });
    const trust = trustProvider({ [a.pubkey]: 0.9 });
    vi.spyOn(trust, "weights").mockRejectedValue(new Error("trust backend down"));

    const out = await computeShelves(baseDeps({ readConcept, trust }));

    expect(out.trending).toEqual([]);
    expect(out.favorites).toEqual([]);
    expect(out.genres.every((g: ShelfGenre) => g.books.length === 0)).toBe(true);
  });

  it("no house observer configured yields empty shelves (honest no-vantage)", async () => {
    const a = ratingEvent({ bookSlug: "a-book", score: 5, createdAt: NOW - DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("a-book", "A")],
      [RATINGS_Z]: [a.event],
    });
    const trust = trustProvider({ [a.pubkey]: 0.9 });

    const out = await computeShelves(
      baseDeps({
        readConcept,
        trust,
        config: { librarianPubkey: LIB, houseObserverPubkey: undefined },
      }),
    );

    expect(out.trending).toEqual([]);
    expect(out.favorites).toEqual([]);
  });
});

// ── AC-6 (atomic replace): a fatal mid-compute error never writes a partial set ─

describe("runShelvesCycle — AC-6: atomic replace leaves the prior cache intact on a fatal error", () => {
  it("does NOT call the cache writer when the relay read throws mid-compute", async () => {
    // The catalog read throws. The cycle must surface the error WITHOUT writing a
    // partial/garbage shelf set — the previous good cache is left untouched.
    const readConcept = vi.fn(async () => {
      throw new Error("relay unreachable mid-compute");
    });
    const trust = trustProvider({});
    const cache = makeCacheWriter();

    await expect(
      runShelvesCycle({
        ...baseDeps({ readConcept, trust }),
        cache,
      }),
    ).rejects.toThrow();

    // The atomic replace was NEVER attempted — no partial write.
    expect(cache.replaceShelves).not.toHaveBeenCalled();
  });

  it("writes the computed set in ONE atomic replace on a clean run", async () => {
    const a = ratingEvent({ bookSlug: "a-book", score: 5, createdAt: NOW - DAY });
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("a-book", "A")],
      [RATINGS_Z]: [a.event],
    });
    const trust = trustProvider({ [a.pubkey]: 0.9 });
    const cache = makeCacheWriter();

    await runShelvesCycle({ ...baseDeps({ readConcept, trust }), cache });

    expect(cache.replaceShelves).toHaveBeenCalledTimes(1);
    expect(cache.replaceShelves.mock.calls[0]![0]).toBe(HOUSE);
  });
});

// ── Story 71 / ADR 0069: Hidden Gems — highest positive hype-gap ──────────────
// A book's hype-gap = trusted average − the crowd's raw average. A gem is a book
// the trusted network rates well above the crowd. Mix trusted + untrusted raters
// so the trusted average diverges from the all-ratings raw mean.

/** N trusted (weighted) + N untrusted (zero-weight) raters at the given scores. */
function gemBook(slug: string, trustedScore: number, untrustedScore: number) {
  const trusted = [0, 1, 2].map(() =>
    ratingEvent({ bookSlug: slug, score: trustedScore, createdAt: NOW - 2 * DAY }),
  );
  const untrusted = [0, 1, 2].map(() =>
    ratingEvent({ bookSlug: slug, score: untrustedScore, createdAt: NOW - 2 * DAY }),
  );
  return { slug, trusted, untrusted };
}

function gemDeps(gems: ReturnType<typeof gemBook>[], trustOn = true) {
  const readConcept = makeReadConcept({
    [BOOKS_Z]: gems.map((g) => bookEvent(g.slug, g.slug)),
    [RATINGS_Z]: gems.flatMap((g) => [...g.trusted, ...g.untrusted].map((r) => r.event)),
  });
  const weightRow = trustOn
    ? Object.fromEntries(gems.flatMap((g) => g.trusted.map((r) => [r.pubkey, 0.9])))
    : {};
  return baseDeps({ readConcept, trust: trustProvider(weightRow) });
}

describe("computeShelves — Hidden Gems: positive hype-gap, gated + ranked", () => {
  it("ranks by gap (trusted above crowd) desc; excludes consensus and overhyped", async () => {
    const out = await computeShelves(
      gemDeps([
        gemBook("gem", 5, 2), // trusted 5, raw 3.5 → gap 1.5
        gemBook("big-gem", 5, 1), // trusted 5, raw 3.0 → gap 2.0 (ranks first)
        gemBook("consensus", 4, 4), // gap 0 → excluded
        gemBook("overhyped", 2, 5), // gap negative → excluded
      ]),
    );
    expect(slugsOf(out.hiddenGems)).toEqual(["big-gem", "gem"]);
  });

  it("excludes a wide-gap book below the trusted-rater minimum", async () => {
    // 1 trusted 5 + 3 untrusted 1 → a wide gap, but trustedCount 1 < favoritesMinRatings 3.
    const thinTrusted = [ratingEvent({ bookSlug: "thin", score: 5, createdAt: NOW - 2 * DAY })];
    const thinUntrusted = [0, 1, 2].map(() =>
      ratingEvent({ bookSlug: "thin", score: 1, createdAt: NOW - 2 * DAY }),
    );
    const readConcept = makeReadConcept({
      [BOOKS_Z]: [bookEvent("thin", "Thin")],
      [RATINGS_Z]: [...thinTrusted, ...thinUntrusted].map((r) => r.event),
    });
    const out = await computeShelves(
      baseDeps({ readConcept, trust: trustProvider({ [thinTrusted[0]!.pubkey]: 0.9 }) }),
    );
    expect(slugsOf(out.hiddenGems)).toEqual([]);
  });

  it("honest empty when there is no trusted signal", async () => {
    const out = await computeShelves(gemDeps([gemBook("gem", 5, 2)], false));
    expect(out.hiddenGems).toEqual([]);
  });
});
