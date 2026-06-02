// Book claim (Story 31 / ADR 0032 §1): an author-signed kind-39999 event that
// `#a`-references the canonical book address (39999:<librarian>:<slug>), carries
// the claimant's pubkey in a `p` tag, and z-tags to the NEW `book-claims` concept
// header. It carries NO editable metadata (content ""); the badge and "Books by
// this author" are read off claim events alone. Lives under a per-(claimant, book)
// replaceable d-tag `claim--<slug>--<claimant8>`, so a re-claim replaces (idempotent).
// Mirrors BookTagAssertion.ts.
import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";

export const BOOK_CLAIM_KIND = 39999 as const;
export const BOOK_CLAIM_WORD_TYPE = "bookClaim" as const;

export type BookClaim = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly claimantPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookClaimPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookClaim", ...string[]];
  };
  readonly bookClaim: {
    readonly bookSlug: string;
    readonly bookAtag: string;
  };
};

export type BookClaimEvent = UnsignedDListEvent<
  39999,
  "bookClaim",
  BookClaimPayload["bookClaim"]
>;

/** D-tag: `claim--<bookSlug>--<claimant8>`; identity (claimant, book). */
export function buildBookClaimDTag(
  bookSlug: string,
  claimantPubkey: HexPubkey,
): string {
  return `claim--${bookSlug}--${pubkeyPrefix(claimantPubkey)}`;
}

export function toBookClaimEvent(claim: BookClaim): BookClaimEvent {
  const dTag = buildBookClaimDTag(claim.bookSlug, claim.claimantPubkey);
  const bookAtag = formatAddress(claim.bookAddress);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(claim.parentHeader)],
    ["a", bookAtag],
    ["t", claim.bookSlug],
    ["p", claim.claimantPubkey],
  ];
  const payload: BookClaimPayload = {
    word: {
      slug: dTag,
      name: `claim: ${claim.bookSlug}`,
      title: `Claim: ${claim.bookSlug}`,
      wordTypes: ["word", "bookClaim"],
    },
    bookClaim: {
      bookSlug: claim.bookSlug,
      bookAtag,
    },
  };
  return {
    kind: BOOK_CLAIM_KIND,
    tags,
    content: "",
    payload,
    parentHeader: claim.parentHeader,
  };
}

export function fromBookClaimEvent(event: BookClaimEvent): BookClaim {
  const p = event.payload.bookClaim;
  const claimantTag = event.tags.find((t) => t[0] === "p");
  if (!claimantTag || claimantTag.length < 2) {
    throw new Error(
      "fromBookClaimEvent: missing `p` tag carrying the claimant pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    claimantPubkey: asHexPubkey(claimantTag[1]!),
    parentHeader: event.parentHeader,
  };
}
