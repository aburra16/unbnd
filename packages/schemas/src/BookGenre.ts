import {
  formatAddress,
  type DListAddress,
  type UnsignedDListEvent,
} from "./envelope";

export const BOOK_GENRE_KIND = 39999 as const;
export const BOOK_GENRE_WORD_TYPE = "bookGenre" as const;

/**
 * Domain type — what the UI and fixtures consume.
 *
 * Mirrors PRD §6.3. Subgenre containment is a string field for MVP; an
 * addressable graph relationship is deferred per ADR 0001's "Out of scope".
 */
export type BookGenre = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly parentGenreSlug?: string;
  readonly parentHeader: DListAddress<39998>;
};

export type BookGenrePayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookGenre", ...string[]];
  };
  readonly bookGenre: {
    readonly slug: string;
    readonly name: string;
    readonly description: string;
    readonly parentGenre?: string;
  };
};

export type BookGenreEvent = UnsignedDListEvent<
  39999,
  "bookGenre",
  BookGenrePayload["bookGenre"]
>;

export function buildBookGenreDTag(slug: string): string {
  return slug;
}

export function toBookGenreEvent(genre: BookGenre): BookGenreEvent {
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", buildBookGenreDTag(genre.slug)],
    ["z", formatAddress(genre.parentHeader)],
    ["t", genre.slug],
    ["name", genre.name],
  ];
  if (genre.parentGenreSlug) {
    tags.push(["parent-genre", genre.parentGenreSlug]);
  }

  const payload: BookGenrePayload = {
    word: {
      slug: genre.slug,
      name: genre.name,
      title: genre.name,
      wordTypes: ["word", "bookGenre"],
    },
    bookGenre: {
      slug: genre.slug,
      name: genre.name,
      description: genre.description,
      parentGenre: genre.parentGenreSlug,
    },
  };

  return {
    kind: BOOK_GENRE_KIND,
    tags,
    content: genre.description,
    payload,
    parentHeader: genre.parentHeader,
  };
}

export function fromBookGenreEvent(event: BookGenreEvent): BookGenre {
  const p = event.payload.bookGenre;
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    parentGenreSlug: p.parentGenre,
    parentHeader: event.parentHeader,
  };
}
