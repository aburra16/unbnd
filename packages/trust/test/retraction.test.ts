// FAILING TESTS — Story 79 / ADR 0077 (the dedupe fold, seams 1–2).
//
// `dedupeRatings` must admit retractions into the per-pubkey latest-wins race:
// a retracted head means the rater has NO current rating (dropped from the
// deduped set, so the raw summary AND `weightedRatings` both exclude it); a
// rating newer than the retraction (re-rate) restores it. The fixtures
// hand-roll the wire shape (same d-tag, ["retracted","true"], no score) so
// this pins the wire contract, not the builder under test.
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { asHexPubkey, toBookRatingEvent, type BookRating } from "@unbnd/schemas";
import { dedupeRatings } from "../src";

const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");
const HEADER_ATAG = `39998:${LIBRARIAN}:book-ratings`;

function signedRating(sk: Uint8Array, createdAt: number, score = 4, bookSlug = "orbital") {
  const raterPubkey = asHexPubkey(getPublicKey(sk));
  const rating: BookRating = {
    bookSlug,
    bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: bookSlug },
    raterPubkey,
    score: score as BookRating["score"],
    reviewDate: "2026-06-01",
    parentHeader: { kind: 39998, pubkey: LIBRARIAN, dTag: "book-ratings" },
  };
  const unsigned = toBookRatingEvent(rating);
  const tags = [...unsigned.tags.map((t) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  const signed = finalizeEvent(
    { kind: 39999, created_at: createdAt, tags, content: unsigned.content },
    sk,
  );
  return JSON.parse(JSON.stringify(signed)) as typeof signed;
}

// Hand-rolled retraction wire shape (ADR 0077 §2): SAME d-tag, retracted
// marker, no score tag, retracted payload sentinel.
function signedRetraction(sk: Uint8Array, createdAt: number, bookSlug = "orbital") {
  const pubkey = getPublicKey(sk);
  const dTag = `rating--${bookSlug}--${pubkey.slice(0, 8)}`;
  const bookAtag = `39999:${LIBRARIAN}:${bookSlug}`;
  const payload = {
    word: {
      slug: dTag,
      name: `rating: ${bookSlug}`,
      title: `Rating: ${bookSlug}`,
      wordTypes: ["word", "bookRating"],
    },
    bookRating: { bookSlug, bookAtag, retracted: true },
  };
  const tags = [
    ["d", dTag],
    ["z", HEADER_ATAG],
    ["t", bookSlug],
    ["a", bookAtag],
    ["p", pubkey],
    ["retracted", "true"],
    ["json", JSON.stringify(payload)],
  ];
  const signed = finalizeEvent({ kind: 39999, created_at: createdAt, tags, content: "" }, sk);
  return JSON.parse(JSON.stringify(signed)) as typeof signed;
}

describe("dedupeRatings — retraction-aware latest-wins (ADR 0077 §3)", () => {
  it("a retraction newer than the rating drops the rater from the deduped set", () => {
    const sk = generateSecretKey();
    const deduped = dedupeRatings([signedRating(sk, 100), signedRetraction(sk, 200)]);
    expect(deduped).toEqual([]);
  });

  it("a rating newer than the retraction (re-rate) restores the current rating", () => {
    const sk = generateSecretKey();
    const deduped = dedupeRatings([
      signedRating(sk, 100, 4),
      signedRetraction(sk, 200),
      signedRating(sk, 300, 5),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.score).toBe(5);
  });

  it("one rater's retraction never affects another rater's rating", () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const deduped = dedupeRatings([
      signedRating(skA, 100, 5),
      signedRating(skB, 100, 2),
      signedRetraction(skA, 200),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.pubkey).toBe(getPublicKey(skB));
    expect(deduped[0]?.score).toBe(2);
  });

  it("a retraction with no prior rating yields no current rating (not a crash)", () => {
    const sk = generateSecretKey();
    expect(dedupeRatings([signedRetraction(sk, 100)])).toEqual([]);
  });
});
