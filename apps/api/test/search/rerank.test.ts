// Story 34 / ADR 0035 — trust-weighted search re-ranking, the CORE unit.
//
// `rerankByTrust(result, { observerHex, blend, trust?, query, config })` is a
// pure async re-rank over the adapter's text-relevance hits. It computes each
// page book's trust-weighted average from the observer's vantage (reusing the
// shipped `weightedRatings` over a SINGLE batched `weights` call), normalizes
// text + trust to 0..1, blends linearly
//   final = (1 − w)·clamp01(score) + w·normTrust ,   normTrust = (avg − 1) / 4
// with NEUTRAL = 0.5 for a book with no trusted signal, and stable-sorts desc.
//
// These tests inject a real FixtureTrustProvider + a fake `query` keyed by the
// per-book `#a` address + a minimal Config — NO intra-module vi.mock, matching
// the DI style of the ratings/search route tests. They are FAILING until
// `apps/api/src/search/rerank.ts` exists.
import { describe, expect, it, vi } from "vitest";
import type { SearchResult, SearchHit } from "@unbnd/search";
import type { Config } from "../../src/config";
import type { NostrFilter } from "../../src/nostr/query";
import { FixtureTrustProvider } from "../../src/trust";
import { signedRating, LIBRARIAN } from "../ratings/_fixtures";
// The module under test — does not exist yet (intentionally red).
import { rerankByTrust } from "../../src/search/rerank";

// A deterministic house observer hex (the vantage). The fixture spec keys
// weights by this exact hex; a different observer hex sees a different row.
const HOUSE = "be7bf5de068c1d842ed34a7c270507ec940f5ea51671cfd062a95e9d09420d0a";
const OTHER_OBSERVER = "c".repeat(64);

// Minimal Config: only the fields the re-rank touches (librarianPubkey to build
// the book address; houseObserverPubkey for the default vantage). librarianPubkey
// MUST equal the fixtures' LIBRARIAN so the `#a` address matches the events.
const cfg = {
  librarianPubkey: LIBRARIAN,
  houseObserverPubkey: HOUSE,
} as unknown as Config;

const addr = (slug: string) => `39999:${LIBRARIAN}:${slug}`;

/** A hit with a known text-relevance score. */
function hit(slug: string, score: number): SearchHit {
  return { slug, title: slug, authorName: "x", format: "reference", score };
}

function resultOf(hits: SearchHit[]): SearchResult {
  return { hits, total: hits.length, offset: 0, limit: 20 };
}

/**
 * A fake `query` that returns the rating events registered for each book's
 * `#a` address. Records how many per-book reads it served, so AC-6 can assert
 * the page-bounded read count.
 */
function makeQuery(byAddr: Record<string, unknown[]>) {
  return vi.fn(async (filter: NostrFilter) => {
    const a = filter["#a"]?.[0];
    return ((a ? byAddr[a] : undefined) ?? []) as never;
  });
}

/** A fixture provider where `observer` trusts every (rater→weight) in `row`. */
function trustProvider(row: Record<string, number>, observer = HOUSE) {
  return new FixtureTrustProvider({ weights: { [observer]: row } });
}

describe("rerankByTrust — AC-1: blends a trust signal into ranking (in apps/api, after text)", () => {
  it("lifts the higher-trusted book above a slightly-better text match", async () => {
    // Book B matches text marginally better (0.82 > 0.80); but A is rated 5 by a
    // trusted rater and B is rated 1 by a trusted rater. With the default blend
    // the trust signal flips them: A rises above B.
    const ratedHigh = signedRating({ bookSlug: "a-book", score: 5 });
    const ratedLow = signedRating({ bookSlug: "b-book", score: 1 });
    const query = makeQuery({
      [addr("a-book")]: [ratedHigh.event],
      [addr("b-book")]: [ratedLow.event],
    });
    const trust = trustProvider({ [ratedHigh.pubkey]: 0.9, [ratedLow.pubkey]: 0.9 });

    const out = await rerankByTrust(resultOf([hit("b-book", 0.82), hit("a-book", 0.8)]), {
      observerHex: HOUSE,
      blend: 0.25,
      trust,
      query,
      config: cfg,
    });

    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["a-book", "b-book"]);
  });

  it("under text relevance ALONE (no blend) the better text match stays on top", async () => {
    // The same data with blend 0 must preserve text order — proves the reorder
    // above is the TRUST signal at work, not a fixture artifact.
    const ratedHigh = signedRating({ bookSlug: "a-book", score: 5 });
    const ratedLow = signedRating({ bookSlug: "b-book", score: 1 });
    const query = makeQuery({
      [addr("a-book")]: [ratedHigh.event],
      [addr("b-book")]: [ratedLow.event],
    });
    const trust = trustProvider({ [ratedHigh.pubkey]: 0.9, [ratedLow.pubkey]: 0.9 });

    const out = await rerankByTrust(resultOf([hit("b-book", 0.82), hit("a-book", 0.8)]), {
      observerHex: HOUSE,
      blend: 0,
      trust,
      query,
      config: cfg,
    });

    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["b-book", "a-book"]);
  });
});

describe("rerankByTrust — AC-2: observer-aware (house vantage; parametric seam)", () => {
  it("computes the trust signal from the supplied observer hex (house default)", async () => {
    const ratedHigh = signedRating({ bookSlug: "a-book", score: 5 });
    const ratedLow = signedRating({ bookSlug: "b-book", score: 1 });
    const query = makeQuery({
      [addr("a-book")]: [ratedHigh.event],
      [addr("b-book")]: [ratedLow.event],
    });
    const trust = trustProvider({ [ratedHigh.pubkey]: 0.9, [ratedLow.pubkey]: 0.9 }, HOUSE);
    const spy = vi.spyOn(trust, "weights");

    await rerankByTrust(resultOf([hit("a-book", 0.8), hit("b-book", 0.82)]), {
      observerHex: HOUSE,
      blend: 0.5,
      trust,
      query,
      config: cfg,
    });

    // The vantage passed to the trust seam is exactly the house observer hex.
    expect(spy).toHaveBeenCalledWith(HOUSE, expect.any(Array));
  });

  it("is parametric: a different observer (with a different weight row) yields a different order", async () => {
    // HOUSE trusts the rater of A (score 5); OTHER_OBSERVER trusts the rater of
    // B (score 5). Same hits, same text scores → the two vantages order differently.
    const aRater = signedRating({ bookSlug: "a-book", score: 5 });
    const bRater = signedRating({ bookSlug: "b-book", score: 5 });
    const byAddr = {
      [addr("a-book")]: [aRater.event],
      [addr("b-book")]: [bRater.event],
    };
    const hits = [hit("a-book", 0.8), hit("b-book", 0.8)]; // equal text

    const houseTrust = trustProvider({ [aRater.pubkey]: 0.9 }, HOUSE); // only A trusted
    const otherTrust = trustProvider({ [bRater.pubkey]: 0.9 }, OTHER_OBSERVER); // only B trusted

    const fromHouse = await rerankByTrust(resultOf([...hits]), {
      observerHex: HOUSE,
      blend: 1,
      trust: houseTrust,
      query: makeQuery(byAddr),
      config: cfg,
    });
    const fromOther = await rerankByTrust(resultOf([...hits]), {
      observerHex: OTHER_OBSERVER,
      blend: 1,
      trust: otherTrust,
      query: makeQuery(byAddr),
      config: cfg,
    });

    expect(fromHouse.hits[0].slug).toBe("a-book"); // A trusted-rated 5, B neutral
    expect(fromOther.hits[0].slug).toBe("b-book"); // B trusted-rated 5, A neutral
  });
});

describe("rerankByTrust — AC-3: configurable weight, both extremes", () => {
  it("w=0 → order is EXACTLY the incoming text order (trust has zero effect)", async () => {
    // A strong trust signal on the text-weaker book must NOT move it at w=0.
    const aRater = signedRating({ bookSlug: "a-book", score: 5 });
    const query = makeQuery({ [addr("a-book")]: [aRater.event] });
    const trust = trustProvider({ [aRater.pubkey]: 0.9 });

    const input = [hit("c-book", 0.9), hit("b-book", 0.85), hit("a-book", 0.8)];
    const out = await rerankByTrust(resultOf([...input]), {
      observerHex: HOUSE,
      blend: 0,
      trust,
      query,
      config: cfg,
    });
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["c-book", "b-book", "a-book"]);
  });

  it("high w → the trust-weighted average drives order among comparable-text hits", async () => {
    // Three near-equal text scores; trusted averages 5 / 3 / 1 → order high→low.
    const a5 = signedRating({ bookSlug: "a-book", score: 5 });
    const b3 = signedRating({ bookSlug: "b-book", score: 3 });
    const c1 = signedRating({ bookSlug: "c-book", score: 1 });
    const query = makeQuery({
      [addr("a-book")]: [a5.event],
      [addr("b-book")]: [b3.event],
      [addr("c-book")]: [c1.event],
    });
    const trust = trustProvider({ [a5.pubkey]: 0.9, [b3.pubkey]: 0.9, [c1.pubkey]: 0.9 });

    // Incoming text order is the REVERSE of the trust order, so only trust can
    // produce the expected result.
    const out = await rerankByTrust(
      resultOf([hit("c-book", 0.81), hit("b-book", 0.8), hit("a-book", 0.79)]),
      { observerHex: HOUSE, blend: 1, trust, query, config: cfg },
    );
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["a-book", "b-book", "c-book"]);
  });
});

describe("rerankByTrust — AC-4: a no-trusted-signal book is treated NEUTRAL (0.5), not sunk", () => {
  it("keeps an unrated-but-relevant book above a trusted-but-mediocre one when its text wins", async () => {
    // `unrated` has NO trusted rating (normTrust = NEUTRAL 0.5) and a strong text
    // score; `mediocre` is trusted-rated 2 (normTrust = 0.25). At w=0.5:
    //   unrated: 0.5·0.80 + 0.5·0.50 = 0.65
    //   mediocre:0.5·0.78 + 0.5·0.25 = 0.515
    // → the no-signal book is NOT buried beneath the trusted-mediocre one.
    const mediocre = signedRating({ bookSlug: "mediocre", score: 2 });
    const query = makeQuery({
      [addr("mediocre")]: [mediocre.event],
      [addr("unrated")]: [], // no rating events at all → no trusted signal
    });
    const trust = trustProvider({ [mediocre.pubkey]: 0.9 });

    const out = await rerankByTrust(
      resultOf([hit("mediocre", 0.78), hit("unrated", 0.8)]),
      { observerHex: HOUSE, blend: 0.5, trust, query, config: cfg },
    );
    expect(out.hits[0].slug).toBe("unrated");
  });

  it("does NOT inflate a no-signal book above a genuinely high-trusted one", async () => {
    // `excellent` is trusted-rated 5 (normTrust 1.0); `unrated` is NEUTRAL (0.5).
    // Equal text → the trusted-excellent book must stay on top (neutral ≠ inflated).
    const excellent = signedRating({ bookSlug: "excellent", score: 5 });
    const query = makeQuery({
      [addr("excellent")]: [excellent.event],
      [addr("unrated")]: [],
    });
    const trust = trustProvider({ [excellent.pubkey]: 0.9 });

    const out = await rerankByTrust(
      resultOf([hit("unrated", 0.8), hit("excellent", 0.8)]),
      { observerHex: HOUSE, blend: 0.5, trust, query, config: cfg },
    );
    expect(out.hits[0].slug).toBe("excellent");
  });
});

describe("rerankByTrust — normalization + stable sort", () => {
  it("maps trusted average 5→1.0, 3→0.5, 1→0.0 via (avg−1)/4 (asserted through ordering at w=1)", async () => {
    // Already covered structurally by AC-3 high-w; here we pin that a trusted
    // average of 3.0 lands at the SAME normalized value as a no-signal NEUTRAL
    // (both 0.5): equal text + equal normTrust ⇒ input order preserved (stable).
    const avg3 = signedRating({ bookSlug: "rated3", score: 3 });
    const query = makeQuery({
      [addr("rated3")]: [avg3.event],
      [addr("nosignal")]: [],
    });
    const trust = trustProvider({ [avg3.pubkey]: 0.9 });

    const out = await rerankByTrust(
      resultOf([hit("rated3", 0.8), hit("nosignal", 0.8)]),
      { observerHex: HOUSE, blend: 1, trust, query, config: cfg },
    );
    // normTrust(rated3) = (3−1)/4 = 0.5 == NEUTRAL(nosignal); equal text → stable.
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["rated3", "nosignal"]);
  });

  it("clamps an out-of-range text score into [0,1] before blending", async () => {
    // A defensive score > 1 must not let a book leapfrog purely on text. At w=0
    // (pure text) clamp(1.5)=1.0 and clamp(0.9)=0.9 → the 1.5 book is first, but
    // it does not gain MORE than a clean 1.0 would; compare against a 1.0 book.
    const query = makeQuery({});
    const trust = trustProvider({});
    const out = await rerankByTrust(
      resultOf([hit("over", 1.5), hit("clean", 1.0), hit("low", 0.2)]),
      { observerHex: HOUSE, blend: 0, trust, query, config: cfg },
    );
    // clamp does not reorder ties to text order here; `over` and `clean` both
    // clamp to ≤1 and keep input order; `low` stays last.
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["over", "clean", "low"]);
  });

  it("a stable sort keeps input order for hits with equal final scores", async () => {
    // All neutral (no trust dep rows) + equal text → identical finals → input order.
    const query = makeQuery({ [addr("x")]: [], [addr("y")]: [], [addr("z")]: [] });
    const trust = trustProvider({});
    const out = await rerankByTrust(
      resultOf([hit("x", 0.7), hit("y", 0.7), hit("z", 0.7)]),
      { observerHex: HOUSE, blend: 0.5, trust, query, config: cfg },
    );
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["x", "y", "z"]);
  });
});

describe("rerankByTrust — AC-6: bounded + batched (no N+1)", () => {
  it("calls trust.weights EXACTLY ONCE over the union of the page's raters", async () => {
    const a = signedRating({ bookSlug: "a-book", score: 5 });
    const b = signedRating({ bookSlug: "b-book", score: 4 });
    const c = signedRating({ bookSlug: "c-book", score: 2 });
    const query = makeQuery({
      [addr("a-book")]: [a.event],
      [addr("b-book")]: [b.event],
      [addr("c-book")]: [c.event],
    });
    const trust = trustProvider({ [a.pubkey]: 0.9, [b.pubkey]: 0.9, [c.pubkey]: 0.9 });
    const spy = vi.spyOn(trust, "weights");

    await rerankByTrust(
      resultOf([hit("a-book", 0.8), hit("b-book", 0.8), hit("c-book", 0.8)]),
      { observerHex: HOUSE, blend: 0.5, trust, query, config: cfg },
    );

    // ONE weights call for the whole page (not one-per-book)…
    expect(spy).toHaveBeenCalledTimes(1);
    // …over the UNION of the page's raters.
    const targets = spy.mock.calls[0]![1] as readonly string[];
    expect([...targets].sort()).toEqual([a.pubkey, b.pubkey, c.pubkey].sort());
  });

  it("reads ratings for ONLY the books on the page (per-book reads ≤ page size)", async () => {
    const a = signedRating({ bookSlug: "a-book", score: 5 });
    const b = signedRating({ bookSlug: "b-book", score: 4 });
    const query = makeQuery({
      [addr("a-book")]: [a.event],
      [addr("b-book")]: [b.event],
    });
    const trust = trustProvider({ [a.pubkey]: 0.9, [b.pubkey]: 0.9 });

    await rerankByTrust(resultOf([hit("a-book", 0.8), hit("b-book", 0.8)]), {
      observerHex: HOUSE,
      blend: 0.5,
      trust,
      query,
      config: cfg,
    });

    // Each per-book read targets exactly one book `#a`; total reads ≤ page size.
    expect(query.mock.calls.length).toBeLessThanOrEqual(2);
    for (const [filter] of query.mock.calls) {
      expect(filter.kinds).toContain(39999);
      expect(filter["#a"]).toHaveLength(1);
    }
  });

  it("leaves the page contract (total/offset/limit) untouched", async () => {
    const a = signedRating({ bookSlug: "a-book", score: 5 });
    const query = makeQuery({ [addr("a-book")]: [a.event], [addr("b-book")]: [] });
    const trust = trustProvider({ [a.pubkey]: 0.9 });
    const input: SearchResult = {
      hits: [hit("a-book", 0.8), hit("b-book", 0.82)],
      total: 137,
      offset: 40,
      limit: 20,
    };
    const out = await rerankByTrust(input, {
      observerHex: HOUSE,
      blend: 0.5,
      trust,
      query,
      config: cfg,
    });
    expect(out.total).toBe(137);
    expect(out.offset).toBe(40);
    expect(out.limit).toBe(20);
    expect(out.hits).toHaveLength(2); // reranking is confined to the page
  });
});

describe("rerankByTrust — degrade (no-op paths return text order untouched)", () => {
  it("blend ≤ 0 returns the result unchanged without touching trust", async () => {
    const trust = trustProvider({});
    const spy = vi.spyOn(trust, "weights");
    const input = resultOf([hit("a", 0.5), hit("b", 0.9)]);
    const out = await rerankByTrust(input, {
      observerHex: HOUSE,
      blend: 0,
      trust,
      query: makeQuery({}),
      config: cfg,
    });
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["a", "b"]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("a throwing trust.weights degrades to the adapter's text order (never throws)", async () => {
    const a = signedRating({ bookSlug: "a-book", score: 5 });
    const query = makeQuery({ [addr("a-book")]: [a.event], [addr("b-book")]: [] });
    const trust = trustProvider({ [a.pubkey]: 0.9 });
    vi.spyOn(trust, "weights").mockRejectedValue(new Error("trust backend down"));

    const out = await rerankByTrust(
      resultOf([hit("b-book", 0.82), hit("a-book", 0.8)]),
      { observerHex: HOUSE, blend: 0.5, trust, query, config: cfg },
    );
    // Untouched text order — the trust failure degraded silently.
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["b-book", "a-book"]);
  });

  it("no observer hex returns the result unchanged", async () => {
    const trust = trustProvider({});
    const out = await rerankByTrust(resultOf([hit("a", 0.5), hit("b", 0.9)]), {
      observerHex: null,
      blend: 0.5,
      trust,
      query: makeQuery({}),
      config: cfg,
    });
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["a", "b"]);
  });

  it("an empty weight map leaves every book NEUTRAL → text order preserved", async () => {
    const a = signedRating({ bookSlug: "a-book", score: 5 });
    const query = makeQuery({ [addr("a-book")]: [a.event], [addr("b-book")]: [] });
    // No trusted raters for HOUSE → weights() returns an empty map.
    const trust = trustProvider({});
    const out = await rerankByTrust(
      resultOf([hit("b-book", 0.82), hit("a-book", 0.8)]),
      { observerHex: HOUSE, blend: 0.5, trust, query, config: cfg },
    );
    expect(out.hits.map((h: SearchHit) => h.slug)).toEqual(["b-book", "a-book"]);
  });
});
