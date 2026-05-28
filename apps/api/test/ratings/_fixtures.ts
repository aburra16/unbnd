import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  asHexPubkey,
  toBookRatingEvent,
  type BookRating,
  type DListAddress,
} from "@unbnd/schemas";

export const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");

function ratingsHeader(): DListAddress<39998> {
  return { kind: 39998, pubkey: LIBRARIAN, dTag: "book-ratings" };
}

/**
 * Build a wire-realistic, signed kind-39999 BookRating event for a fresh
 * keypair. Hand-rolls the json tag (instead of `toWireTemplate`) so these
 * fixtures don't depend on the bridge implementation under test. JSON
 * round-trips the event so no nostr-tools verifiedSymbol memo is carried.
 */
export function signedRating(opts?: {
  sk?: Uint8Array;
  bookSlug?: string;
  score?: number;
  reviewText?: string;
  reviewDate?: string;
  createdAt?: number;
}) {
  const sk = opts?.sk ?? generateSecretKey();
  const raterPubkey = asHexPubkey(getPublicKey(sk));
  const bookSlug = opts?.bookSlug ?? "orbital";
  const rating: BookRating = {
    bookSlug,
    bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: bookSlug },
    raterPubkey,
    score: (opts?.score ?? 4) as BookRating["score"],
    reviewText: opts?.reviewText,
    reviewDate: opts?.reviewDate ?? "2026-05-27",
    parentHeader: ratingsHeader(),
  };
  const unsigned = toBookRatingEvent(rating);
  const tags = [
    ...unsigned.tags.map((t) => [...t]),
    ["json", JSON.stringify(unsigned.payload)],
  ];
  const signed = finalizeEvent(
    {
      kind: 39999,
      created_at: opts?.createdAt ?? Math.floor(Date.now() / 1000),
      tags,
      content: unsigned.content,
    },
    sk,
  );
  return {
    sk,
    pubkey: raterPubkey,
    event: JSON.parse(JSON.stringify(signed)) as typeof signed,
  };
}
