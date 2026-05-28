import type { DListAddress, UnsignedDListEvent } from "./envelope";

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

export function buildBookGenreDTag(_slug: string): string {
  throw new Error("buildBookGenreDTag not implemented");
}

export function toBookGenreEvent(_genre: BookGenre): BookGenreEvent {
  throw new Error("toBookGenreEvent not implemented");
}

export function fromBookGenreEvent(_event: BookGenreEvent): BookGenre {
  throw new Error("fromBookGenreEvent not implemented");
}
