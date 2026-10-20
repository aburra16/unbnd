// FAILING TESTS — Story 99 / ADR 0089 §4: what the submit and remove routes
// accept from a signer.
import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { validateSignedReview, validateSignedRemoval } from "../../src/ratings/validate";

const LIB = "1".repeat(63) + "a";
const BOOK = `39999:${LIB}:ol-orbital`;
const sk = generateSecretKey();
const me = getPublicKey(sk);
const sign = (kind: number, tags: string[][], content = "") =>
  JSON.parse(JSON.stringify(finalizeEvent({ kind, created_at: 1_790_000_000, tags, content }, sk)));
const reviewTags = (over: Record<string, string[]> = {}) =>
  Object.entries({
    d: ["d", `book:${BOOK}`],
    a: ["a", BOOK, "wss://dcosl.brainstorm.world"],
    m: ["m", "book"],
    rating: ["rating", "0.800"],
    s: ["s", "4"],
    ...over,
  }).map(([, v]) => v);

describe("validateSignedReview", () => {
  it("accepts the caller's own review of a catalog book, and names the book", () => {
    const r = validateSignedReview(sign(34259, reviewTags(), "Good."), me, LIB);
    expect(r).toMatchObject({ ok: true, bookSlug: "ol-orbital", stars: 4 });
  });

  it("refuses the wrong kind, someone else's key, a bad signature", () => {
    expect(validateSignedReview(sign(39999, reviewTags()), me, LIB)).toMatchObject({ ok: false, code: "wrong_kind" });
    expect(validateSignedReview(sign(34259, reviewTags()), "b".repeat(64), LIB)).toMatchObject({ code: "pubkey_mismatch" });
    const tampered = { ...sign(34259, reviewTags()), content: "changed" };
    expect(validateSignedReview(tampered, me, LIB)).toMatchObject({ code: "invalid_signature" });
  });

  it("refuses a review that is not of a catalog book, has no stars, or runs past 1,200 characters", () => {
    const other = reviewTags({ a: ["a", `39999:${"b".repeat(64)}:ol-orbital`], d: ["d", `book:39999:${"b".repeat(64)}:ol-orbital`] });
    expect(validateSignedReview(sign(34259, other), me, LIB)).toMatchObject({ code: "malformed" });
    expect(validateSignedReview(sign(34259, reviewTags({ s: ["s", "0"], rating: ["rating", "0"] })), me, LIB)).toMatchObject({ code: "malformed" });
    expect(validateSignedReview(sign(34259, reviewTags(), "x".repeat(1201)), me, LIB)).toMatchObject({ code: "malformed" });
    expect(validateSignedReview(sign(34259, reviewTags({ d: ["d", "rating--ol-orbital--x"] })), me, LIB)).toMatchObject({ code: "malformed" });
  });
});

describe("validateSignedRemoval", () => {
  const current = { id: "e".repeat(64), d: `book:${BOOK}` };
  it("accepts the caller's kind 5 naming their current review by e and a, with k", () => {
    const r = validateSignedRemoval(
      sign(5, [["e", current.id], ["a", `34259:${me}:book:${BOOK}`], ["k", "34259"]]),
      me,
      current,
    );
    expect(r).toEqual({ ok: true });
  });

  it("refuses a removal that names another review, or lacks k", () => {
    expect(
      validateSignedRemoval(sign(5, [["e", "0".repeat(64)], ["a", `34259:${me}:book:${BOOK}`], ["k", "34259"]]), me, current),
    ).toMatchObject({ code: "malformed" });
    expect(
      validateSignedRemoval(sign(5, [["e", current.id], ["a", `34259:${me}:book:${BOOK}`]]), me, current),
    ).toMatchObject({ code: "malformed" });
  });
});
