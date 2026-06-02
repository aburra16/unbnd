// Author-verified assertion (Story 32 / ADR 0033 §1): a CURATOR-signed kind-39999
// event that `#a`-references the canonical book address (39999:<librarian>:<slug>),
// carries the AUTHOR being verified in a `p` tag (the (author, book) target — NOT
// the signer), the slug in a `t` tag, an apply/dispute `polarity`, and z-tags to
// the NEW `author-verified` concept header. Lives under a per-(curator, author,
// book) replaceable d-tag `authorverified--<slug>--<author8>--<curator8>`, so a
// curator re-asserting / flipping polarity on the same (author, book) replaces
// (idempotent, AC-1). content is "". Mirrors BookTagAssertion.ts.
import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";
import type { Polarity } from "./BookTagAssertion";

export const AUTHOR_VERIFIED_KIND = 39999 as const;
export const AUTHOR_VERIFIED_WORD_TYPE = "authorVerified" as const;

export type AuthorVerifiedAssertion = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  /** The claimant whose authorship is being verified (the #p target, not the signer). */
  readonly authorPubkey: HexPubkey;
  /** The curator asserting verification (the signer; carried into the d-tag). */
  readonly curatorPubkey: HexPubkey;
  readonly polarity: Polarity;
  readonly parentHeader: DListAddress<39998>;
};

export type AuthorVerifiedPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "authorVerified", ...string[]];
  };
  readonly authorVerified: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly authorPubkey: HexPubkey;
    readonly curatorPubkey: HexPubkey;
    readonly polarity: Polarity;
  };
};

export type AuthorVerifiedEvent = UnsignedDListEvent<
  39999,
  "authorVerified",
  AuthorVerifiedPayload["authorVerified"]
>;

/** D-tag: `authorverified--<bookSlug>--<author8>--<curator8>`; identity (curator, author, book). */
export function buildAuthorVerifiedDTag(
  bookSlug: string,
  authorPubkey: HexPubkey,
  curatorPubkey: HexPubkey,
): string {
  return `authorverified--${bookSlug}--${pubkeyPrefix(authorPubkey)}--${pubkeyPrefix(curatorPubkey)}`;
}

export function toAuthorVerifiedEvent(
  assertion: AuthorVerifiedAssertion,
): AuthorVerifiedEvent {
  const dTag = buildAuthorVerifiedDTag(
    assertion.bookSlug,
    assertion.authorPubkey,
    assertion.curatorPubkey,
  );
  const bookAtag = formatAddress(assertion.bookAddress);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(assertion.parentHeader)],
    ["a", bookAtag],
    ["t", assertion.bookSlug],
    ["polarity", String(assertion.polarity)],
    ["p", assertion.authorPubkey],
  ];
  const payload: AuthorVerifiedPayload = {
    word: {
      slug: dTag,
      name: `verify: ${assertion.bookSlug} → ${pubkeyPrefix(assertion.authorPubkey)}`,
      title: `Verify: ${assertion.bookSlug} → ${pubkeyPrefix(assertion.authorPubkey)}`,
      wordTypes: ["word", "authorVerified"],
    },
    authorVerified: {
      bookSlug: assertion.bookSlug,
      bookAtag,
      authorPubkey: assertion.authorPubkey,
      curatorPubkey: assertion.curatorPubkey,
      polarity: assertion.polarity,
    },
  };
  return {
    kind: AUTHOR_VERIFIED_KIND,
    tags,
    content: "",
    payload,
    parentHeader: assertion.parentHeader,
  };
}

export function fromAuthorVerifiedEvent(
  event: AuthorVerifiedEvent,
): AuthorVerifiedAssertion {
  const p = event.payload.authorVerified;
  const authorTag = event.tags.find((t) => t[0] === "p");
  if (!authorTag || authorTag.length < 2) {
    throw new Error(
      "fromAuthorVerifiedEvent: missing `p` tag carrying the author pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    authorPubkey: asHexPubkey(authorTag[1]!),
    curatorPubkey: asHexPubkey(p.curatorPubkey),
    polarity: p.polarity,
    parentHeader: event.parentHeader,
  };
}
