// Wire-realistic signed AuthorVerifiedAssertion + BookAuthorOverlay fixtures for
// the route tests (Story 32 / ADR 0033). Mirrors apps/api/test/claims/_fixtures.ts:
// build the unsigned event via the schema, append the `json` payload tag, then
// sign with an audited keypair (nostr-tools/@noble — no hand-rolled crypto). JSON
// round-trips so no verifiedSymbol memo is carried into the route under test.
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  asHexPubkey,
  toAuthorVerifiedEvent,
  toBookAuthorOverlayEvent,
  type AuthorVerifiedAssertion,
  type BookAuthorOverlay,
  type DListAddress,
} from "@unbnd/schemas";

export const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");

function verifiedHeader(): DListAddress<39998> {
  return { kind: 39998, pubkey: LIBRARIAN, dTag: "author-verified" };
}
function editsHeader(): DListAddress<39998> {
  return { kind: 39998, pubkey: LIBRARIAN, dTag: "author-edits" };
}

// A curator-signed author-verified assertion targeting (author, book).
export function signedAuthorVerified(opts: {
  sk?: Uint8Array;
  authorPubkey: string;
  bookSlug?: string;
  polarity?: 1 | -1;
  createdAt?: number;
}) {
  const sk = opts.sk ?? generateSecretKey();
  const curatorPubkey = asHexPubkey(getPublicKey(sk));
  const bookSlug = opts.bookSlug ?? "orbital";
  const assertion: AuthorVerifiedAssertion = {
    bookSlug,
    bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: bookSlug },
    authorPubkey: asHexPubkey(opts.authorPubkey),
    curatorPubkey,
    polarity: opts.polarity ?? 1,
    parentHeader: verifiedHeader(),
  };
  const unsigned = toAuthorVerifiedEvent(assertion);
  const tags = [
    ...unsigned.tags.map((t: readonly string[]) => [...t]),
    ["json", JSON.stringify(unsigned.payload)],
  ];
  const signed = finalizeEvent(
    {
      kind: 39999,
      created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
      tags,
      content: unsigned.content,
    },
    sk,
  );
  return {
    sk,
    curatorPubkey,
    authorPubkey: opts.authorPubkey,
    bookSlug,
    event: JSON.parse(JSON.stringify(signed)) as typeof signed,
  };
}

// An author-signed book-author overlay (blurb / cover / purchase).
export function signedAuthorOverlay(opts: {
  sk?: Uint8Array;
  bookSlug?: string;
  blurb?: string | null;
  coverUrl?: string | null;
  purchaseUrl?: string | null;
  createdAt?: number;
}) {
  const sk = opts.sk ?? generateSecretKey();
  const authorPubkey = asHexPubkey(getPublicKey(sk));
  const bookSlug = opts.bookSlug ?? "orbital";
  const overlay: BookAuthorOverlay = {
    bookSlug,
    bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: bookSlug },
    authorPubkey,
    blurb: opts.blurb ?? null,
    coverUrl: opts.coverUrl ?? null,
    purchaseUrl: opts.purchaseUrl ?? null,
    parentHeader: editsHeader(),
  };
  const unsigned = toBookAuthorOverlayEvent(overlay);
  const tags = [
    ...unsigned.tags.map((t: readonly string[]) => [...t]),
    ["json", JSON.stringify(unsigned.payload)],
  ];
  const signed = finalizeEvent(
    {
      kind: 39999,
      created_at: opts.createdAt ?? Math.floor(Date.now() / 1000),
      tags,
      content: unsigned.content,
    },
    sk,
  );
  return {
    sk,
    authorPubkey,
    bookSlug,
    event: JSON.parse(JSON.stringify(signed)) as typeof signed,
  };
}
