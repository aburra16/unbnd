// Book tag assertion (ADR 0009): applies a tag (genre/style/signal) to a book
// target with polarity (apply/dispute). The unified classification mechanism,
// replacing BookGenreTag + BookQualitySignal. Kind-39999 item z-tagged to the
// `book-tag-assertions` concept.
import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";
import type { TagType } from "./BookTag";

export const BOOK_TAG_ASSERTION_KIND = 39999 as const;
export const BOOK_TAG_ASSERTION_WORD_TYPE = "bookTagAssertion" as const;

/** 1 = apply, -1 = dispute. Open range reserved for future graded valence. */
export type Polarity = 1 | -1;

export type BookTagAssertion = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly tagSlug: string;
  readonly tagType: TagType;
  readonly polarity: Polarity;
  readonly asserterPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookTagAssertionPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookTagAssertion", ...string[]];
  };
  readonly bookTagAssertion: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly tagSlug: string;
    readonly tagType: TagType;
    readonly polarity: Polarity;
  };
};

export type BookTagAssertionEvent = UnsignedDListEvent<
  39999,
  "bookTagAssertion",
  BookTagAssertionPayload["bookTagAssertion"]
>;

/** D-tag: `tagassert--<bookSlug>--<tagSlug>--<asserter8>`; identity (author, book, tag). */
export function buildBookTagAssertionDTag(
  bookSlug: string,
  tagSlug: string,
  asserterPubkey: HexPubkey,
): string {
  return `tagassert--${bookSlug}--${tagSlug}--${pubkeyPrefix(asserterPubkey)}`;
}

export function toBookTagAssertionEvent(
  assertion: BookTagAssertion,
): BookTagAssertionEvent {
  const dTag = buildBookTagAssertionDTag(
    assertion.bookSlug,
    assertion.tagSlug,
    assertion.asserterPubkey,
  );
  const bookAtag = formatAddress(assertion.bookAddress);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(assertion.parentHeader)],
    ["a", bookAtag],
    ["t", assertion.tagSlug],
    ["t", assertion.tagType],
    ["polarity", String(assertion.polarity)],
    ["p", assertion.asserterPubkey],
  ];
  const payload: BookTagAssertionPayload = {
    word: {
      slug: dTag,
      name: `tag: ${assertion.bookSlug} → ${assertion.tagSlug}`,
      title: `Tag: ${assertion.bookSlug} → ${assertion.tagSlug}`,
      wordTypes: ["word", "bookTagAssertion"],
    },
    bookTagAssertion: {
      bookSlug: assertion.bookSlug,
      bookAtag,
      tagSlug: assertion.tagSlug,
      tagType: assertion.tagType,
      polarity: assertion.polarity,
    },
  };
  return {
    kind: BOOK_TAG_ASSERTION_KIND,
    tags,
    content: "",
    payload,
    parentHeader: assertion.parentHeader,
  };
}

export function fromBookTagAssertionEvent(
  event: BookTagAssertionEvent,
): BookTagAssertion {
  const p = event.payload.bookTagAssertion;
  const asserterTag = event.tags.find((t) => t[0] === "p");
  if (!asserterTag || asserterTag.length < 2) {
    throw new Error(
      "fromBookTagAssertionEvent: missing `p` tag carrying the asserter pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    tagSlug: p.tagSlug,
    tagType: p.tagType,
    polarity: p.polarity,
    asserterPubkey: asHexPubkey(asserterTag[1]!),
    parentHeader: event.parentHeader,
  };
}
