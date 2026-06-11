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

/**
 * Build a wire-realistic, signed rating RETRACTION (Story 79 / ADR 0077):
 * the SAME `rating--<slug>--<rater8>` d-tag, a `["retracted","true"]` marker,
 * NO score tag, empty content, a retracted payload sentinel. Hand-rolled (not
 * via the builder) so fixtures pin the wire contract independent of the
 * implementation under test.
 */
export function signedRetraction(opts: {
  sk: Uint8Array;
  bookSlug?: string;
  createdAt?: number;
}) {
  const sk = opts.sk;
  const pubkey = getPublicKey(sk);
  const bookSlug = opts.bookSlug ?? "orbital";
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
    ["z", `39998:${LIBRARIAN}:book-ratings`],
    ["t", bookSlug],
    ["a", bookAtag],
    ["p", pubkey],
    ["retracted", "true"],
    ["json", JSON.stringify(payload)],
  ];
  const signed = finalizeEvent(
    {
      kind: 39999,
      created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
      tags,
      content: "",
    },
    sk,
  );
  return {
    sk,
    pubkey: asHexPubkey(pubkey),
    event: JSON.parse(JSON.stringify(signed)) as typeof signed,
  };
}
