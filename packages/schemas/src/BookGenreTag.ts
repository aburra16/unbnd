import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";

export const BOOK_GENRE_TAG_KIND = 39999 as const;
export const BOOK_GENRE_TAG_WORD_TYPE = "bookGenreTag" as const;

/**
 * Domain type — what the UI consumes.
 *
 * Mirrors PRD §6.5. Two typed cross-references: one to the book record,
 * one to the genre. Both flow through the shared `DListAddress<39999>`
 * type per ADR 0001 AC-3.
 */
export type BookGenreTag = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly genreSlug: string;
  readonly genreAddress: DListAddress<39999>;
  readonly taggerPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookGenreTagPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookGenreTag", ...string[]];
  };
  readonly bookGenreTag: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly genreSlug: string;
    readonly genreAtag: string;
  };
};

export type BookGenreTagEvent = UnsignedDListEvent<
  39999,
  "bookGenreTag",
  BookGenreTagPayload["bookGenreTag"]
>;

/**
 * D-tag pattern: `genre-tag--<bookSlug>--<genreSlug>--<taggerPubkey.slice(0,8)>`.
 * Composite identity (tagger, book, genre); re-publishing overwrites.
 */
export function buildBookGenreTagDTag(
  bookSlug: string,
  genreSlug: string,
  taggerPubkey: HexPubkey,
): string {
  return `genre-tag--${bookSlug}--${genreSlug}--${pubkeyPrefix(taggerPubkey)}`;
}

export function toBookGenreTagEvent(tag: BookGenreTag): BookGenreTagEvent {
  const dTag = buildBookGenreTagDTag(
    tag.bookSlug,
    tag.genreSlug,
    tag.taggerPubkey,
  );
  const bookAtag = formatAddress(tag.bookAddress);
  const genreAtag = formatAddress(tag.genreAddress);

  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(tag.parentHeader)],
    ["t", tag.bookSlug],
    ["t", tag.genreSlug],
    ["a", bookAtag],
    ["a", genreAtag],
    ["p", tag.taggerPubkey],
  ];

  const payload: BookGenreTagPayload = {
    word: {
      slug: dTag,
      name: `genre tag: ${tag.bookSlug} → ${tag.genreSlug}`,
      title: `Genre tag: ${tag.bookSlug} → ${tag.genreSlug}`,
      wordTypes: ["word", "bookGenreTag"],
    },
    bookGenreTag: {
      bookSlug: tag.bookSlug,
      bookAtag,
      genreSlug: tag.genreSlug,
      genreAtag,
    },
  };

  return {
    kind: BOOK_GENRE_TAG_KIND,
    tags,
    content: "",
    payload,
    parentHeader: tag.parentHeader,
  };
}

export function fromBookGenreTagEvent(
  event: BookGenreTagEvent,
): BookGenreTag {
  const p = event.payload.bookGenreTag;
  const taggerTag = event.tags.find((t) => t[0] === "p");
  if (!taggerTag || taggerTag.length < 2) {
    throw new Error(
      "fromBookGenreTagEvent: missing `p` tag carrying the tagger pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    genreSlug: p.genreSlug,
    genreAddress: parseAddressOfKind(p.genreAtag, 39999),
    taggerPubkey: asHexPubkey(taggerTag[1]!),
    parentHeader: event.parentHeader,
  };
}
