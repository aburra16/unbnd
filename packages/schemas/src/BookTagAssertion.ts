// Book tag assertion (ADR 0009): applies a tag (genre/style/signal) to a book
// target with polarity (apply/dispute). The unified classification mechanism,
// replacing BookGenreTag + BookQualitySignal. Kind-39999 item z-tagged to the
// `book-tag-assertions` concept. IMPLEMENTATION PENDING (stubs throw).
import {
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
  _bookSlug: string,
  _tagSlug: string,
  _asserterPubkey: HexPubkey,
): string {
  throw new Error("buildBookTagAssertionDTag not implemented");
}

export function toBookTagAssertionEvent(
  _assertion: BookTagAssertion,
): BookTagAssertionEvent {
  throw new Error("toBookTagAssertionEvent not implemented");
}

export function fromBookTagAssertionEvent(
  _event: BookTagAssertionEvent,
): BookTagAssertion {
  throw new Error("fromBookTagAssertionEvent not implemented");
}
