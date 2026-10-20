// FAILING TESTS — Story 99 / ADR 0089: which reviews stand (books-actions.md
// §4, §6) and whose stars count (§8). Letters name the contract's checks.
import { describe, expect, it } from "vitest";
import { REVIEW_WEIGHT_LINE, standingReviews, weightedRatings, dedupeRatings } from "../src";

const LIB = "1".repeat(63) + "a";
const BOOK = `39999:${LIB}:ol-orbital`;
const NOW = 1_790_000_000;
const A = "a".repeat(64);
const B = "b".repeat(64);

let seq = 0;
function review(o: {
  pubkey?: string;
  d?: string;
  a?: string | null;
  s?: string | null;
  rating?: string;
  words?: string;
  at?: number;
  id?: string;
  kind?: number;
}) {
  const tags: string[][] = [["d", o.d ?? `book:${BOOK}`]];
  if (o.a !== null) tags.push(["a", o.a ?? BOOK, "wss://dcosl.brainstorm.world"]);
  tags.push(["m", "book"]);
  if (o.rating) tags.push(["rating", o.rating]);
  if (o.s !== null) tags.push(["s", o.s ?? "4"]);
  seq++;
  return {
    id: o.id ?? seq.toString(16).padStart(64, "0"),
    pubkey: o.pubkey ?? A,
    created_at: o.at ?? NOW - 100,
    kind: o.kind ?? 34259,
    tags,
    content: o.words ?? "",
    sig: "f".repeat(128),
  };
}
function removal(o: { pubkey?: string; e?: string; a?: string; at?: number }) {
  const tags: string[][] = [];
  if (o.e) tags.push(["e", o.e]);
  if (o.a) tags.push(["a", o.a]);
  tags.push(["k", "34259"]);
  seq++;
  return {
    id: seq.toString(16).padStart(64, "0"),
    pubkey: o.pubkey ?? A,
    created_at: o.at ?? NOW - 50,
    kind: 5,
    tags,
    content: "",
    sig: "f".repeat(128),
  };
}
const stand = (events: unknown[]) => standingReviews(events as never, { librarian: LIB, now: NOW });

describe("standingReviews (contract §4)", () => {
  it("A: one review gives its stars, words and book", () => {
    const r = stand([review({ words: "Good." })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pubkey: A, bookAddress: BOOK, bookSlug: "ol-orbital", stars: 4, words: "Good." });
  });

  it("C: two records by one person for one book under two d forms: the newer stands", () => {
    const older = review({ d: BOOK, at: NOW - 86_400, s: "2" });
    const newer = review({ at: NOW - 10, s: "5" });
    expect(stand([older, newer]).map((r) => r.stars)).toEqual([5]);
  });

  it("D: a record dated a year ahead is ignored and does not replace the real one", () => {
    const real = review({ s: "3" });
    const future = review({ at: NOW + 365 * 86_400, s: "1" });
    expect(stand([real, future]).map((r) => r.stars)).toEqual([3]);
  });

  it("E: a kind 1111 comment with a rating is not a review", () => {
    expect(stand([review({ kind: 1111, pubkey: B })])).toEqual([]);
  });

  it("names the book by a, else by d; a review of anything outside the catalog is skipped", () => {
    expect(stand([review({ a: null })])).toHaveLength(1);
    expect(stand([review({ a: "30040:" + B + ":pg558", d: "book:30040:" + B + ":pg558" })])).toEqual([]);
    expect(stand([review({ a: `39999:${B}:ol-orbital`, d: `book:39999:${B}:ol-orbital` })])).toEqual([]);
  });

  it("of one person's records at one d, the newest stands; on a tie, the lowest id", () => {
    const lo = review({ at: NOW - 5, s: "2", id: "0".repeat(63) + "1" });
    const hi = review({ at: NOW - 5, s: "5", id: "f".repeat(64) });
    expect(stand([hi, lo]).map((r) => r.stars)).toEqual([2]);
  });

  it("one review per person per book; different people each stand", () => {
    expect(stand([review({ pubkey: A }), review({ pubkey: B, s: "2" })])).toHaveLength(2);
  });

  it("a review with words and no stars stands, with no stars", () => {
    expect(stand([review({ s: null, words: "Only words." })])[0]).toMatchObject({ stars: null, words: "Only words." });
  });
});

describe("removals (contract §6)", () => {
  it("F: a removal with e, a and k takes the review down", () => {
    const r = review({ at: NOW - 100 });
    expect(stand([r, removal({ e: r.id, a: `34259:${A}:book:${BOOK}`, at: NOW - 50 })])).toEqual([]);
  });

  it("J: a removal naming the review by e alone takes it down", () => {
    const r = review({});
    expect(stand([r, removal({ e: r.id })])).toEqual([]);
  });

  it("K: through a, a removal takes down only versions dated no later than itself", () => {
    const rem = removal({ a: `34259:${A}:book:${BOOK}`, at: NOW - 50 });
    const newer = review({ at: NOW - 10, s: "5" });
    expect(stand([rem, newer]).map((r) => r.stars)).toEqual([5]);
    expect(stand([review({ at: NOW - 60 }), rem])).toEqual([]);
  });

  it("only the review's author can remove it", () => {
    const r = review({});
    expect(stand([r, removal({ pubkey: B, e: r.id, a: `34259:${A}:book:${BOOK}` })])).toHaveLength(1);
  });

  it("a removal dated more than a day ahead is ignored", () => {
    const r = review({});
    expect(stand([r, removal({ a: `34259:${A}:book:${BOOK}`, at: NOW + 2 * 86_400 })])).toHaveLength(1);
  });
});

describe("whose stars count (contract §8; check H)", () => {
  it("the line is rank 5, a weight of 0.05", () => {
    expect(REVIEW_WEIGHT_LINE).toBe(0.05);
  });

  it("H: ranks 80, 30 and 4 giving 5, 3 and 1 stars make 4.45; the third is outside", () => {
    const C = "c".repeat(64);
    const deduped = dedupeRatings(
      [review({ pubkey: A, s: "5" }), review({ pubkey: B, s: "3" }), review({ pubkey: C, s: "1" })] as never,
      { librarian: LIB, now: NOW },
    );
    const w = weightedRatings(deduped, new Map([[A, 0.8], [B, 0.3], [C, 0.04]]), "npub1x");
    expect(w).not.toBeNull();
    expect(w!.average).toBeCloseTo(4.4545, 3);
    expect(w!.trustedCount).toBe(2);
  });

  it("a review without stars is listed among the trusted but enters no average", () => {
    const deduped = dedupeRatings(
      [review({ pubkey: A, s: "4" }), review({ pubkey: B, s: null, words: "Words." })] as never,
      { librarian: LIB, now: NOW },
    );
    const w = weightedRatings(deduped, new Map([[A, 0.5], [B, 0.9]]), "npub1x");
    expect(w!.average).toBe(4);
    expect(w!.ratings.map((r) => r.score)).toEqual([null, 4]);
  });

  it("nobody at or above the line: no weighted view", () => {
    const deduped = dedupeRatings([review({ pubkey: A })] as never, { librarian: LIB, now: NOW });
    expect(weightedRatings(deduped, new Map([[A, 0.04]]), "npub1x")).toBeNull();
  });
});
