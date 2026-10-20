// Shared rating fixtures (Story 99 / ADR 0089): wire-realistic, signed book
// reviews (kind 34259) and their removals (kind 5), hand-built so the fixtures
// pin the shared record independently of the builders under test.
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { asHexPubkey } from "@unbnd/schemas";

export const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");

export const bookAddress = (bookSlug: string) => `39999:${LIBRARIAN}:${bookSlug}`;

/** A signed review of a catalog book by a fresh (or given) key. */
export function signedRating(opts?: {
  sk?: Uint8Array;
  bookSlug?: string;
  /** Whole stars 1 to 5; `null` for a review that gives none. */
  score?: number | null;
  reviewText?: string;
  createdAt?: number;
}) {
  const sk = opts?.sk ?? generateSecretKey();
  const pubkey = asHexPubkey(getPublicKey(sk));
  const address = bookAddress(opts?.bookSlug ?? "orbital");
  const score = opts?.score === undefined ? 4 : opts.score;
  const tags: string[][] = [
    ["d", `book:${address}`],
    ["a", address, "wss://dcosl.brainstorm.world"],
    ["m", "book"],
  ];
  if (score !== null) tags.push(["rating", (score / 5).toFixed(3)], ["s", String(score)]);
  const signed = finalizeEvent(
    {
      kind: 34259,
      created_at: opts?.createdAt ?? Math.floor(Date.now() / 1000),
      tags,
      content: opts?.reviewText ?? "",
    },
    sk,
  );
  return { sk, pubkey, event: JSON.parse(JSON.stringify(signed)) as typeof signed };
}

/** A signed removal (kind 5) of the key's review of a book: by address, and by id when given. */
export function signedRemoval(opts: {
  sk: Uint8Array;
  bookSlug?: string;
  reviewId?: string;
  createdAt?: number;
}) {
  const pubkey = asHexPubkey(getPublicKey(opts.sk));
  const address = bookAddress(opts.bookSlug ?? "orbital");
  const tags: string[][] = [];
  if (opts.reviewId) tags.push(["e", opts.reviewId]);
  tags.push(["a", `34259:${pubkey}:book:${address}`], ["k", "34259"]);
  const signed = finalizeEvent(
    { kind: 5, created_at: opts.createdAt ?? Math.floor(Date.now() / 1000), tags, content: "" },
    opts.sk,
  );
  return { sk: opts.sk, pubkey, event: JSON.parse(JSON.stringify(signed)) as typeof signed };
}
