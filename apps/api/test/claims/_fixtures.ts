// Wire-realistic signed BookClaim fixtures for the claims-route tests (Story 31 /
// ADR 0032). Mirrors apps/api/test/ratings/_fixtures.ts: build the unsigned claim
// via the schema, append the `json` payload tag, then sign with an audited
// keypair (nostr-tools/@noble — no hand-rolled crypto). JSON round-trips the event
// so no verifiedSymbol memo is carried into the route under test.
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  asHexPubkey,
  toBookClaimEvent,
  type BookClaim,
  type DListAddress,
} from "@unbnd/schemas";

export const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");

function claimsHeader(): DListAddress<39998> {
  return { kind: 39998, pubkey: LIBRARIAN, dTag: "book-claims" };
}

export function signedClaim(opts?: {
  sk?: Uint8Array;
  bookSlug?: string;
  createdAt?: number;
}) {
  const sk = opts?.sk ?? generateSecretKey();
  const claimantPubkey = asHexPubkey(getPublicKey(sk));
  const bookSlug = opts?.bookSlug ?? "orbital";
  const claim: BookClaim = {
    bookSlug,
    bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: bookSlug },
    claimantPubkey,
    parentHeader: claimsHeader(),
  };
  const unsigned = toBookClaimEvent(claim);
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
    pubkey: claimantPubkey,
    bookSlug,
    event: JSON.parse(JSON.stringify(signed)) as typeof signed,
  };
}
