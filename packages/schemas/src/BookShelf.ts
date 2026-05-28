import type {
  DListAddress,
  HexPubkey,
  UnsignedDListEvent,
} from "./envelope";

export const BOOK_SHELF_KIND = 39999 as const;
export const BOOK_SHELF_WORD_TYPE = "bookShelf" as const;

export type ShelfVisibility = "public" | "private";

/**
 * Domain type — what the UI consumes.
 *
 * Mirrors PRD §6.7. `bookSlugs` and `bookAddresses` are parallel arrays
 * (same length, same order). The Implementer asserts the invariant at
 * conversion time.
 */
export type BookShelf = {
  readonly slug: string;
  readonly name: string;
  readonly visibility: ShelfVisibility;
  readonly bookSlugs: readonly string[];
  readonly bookAddresses: readonly DListAddress<39999>[];
  readonly userPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookShelfPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookShelf", ...string[]];
  };
  readonly bookShelf: {
    readonly slug: string;
    readonly name: string;
    readonly visibility: ShelfVisibility;
    readonly books: readonly string[];
  };
};

export type BookShelfEvent = UnsignedDListEvent<
  39999,
  "bookShelf",
  BookShelfPayload["bookShelf"]
>;

/**
 * D-tag pattern: `shelf--<userPubkey.slice(0,8)>--<shelfSlug>`.
 * Composite identity (user, shelfSlug); re-publishing overwrites.
 */
export function buildBookShelfDTag(
  _userPubkey: HexPubkey,
  _shelfSlug: string,
): string {
  throw new Error("buildBookShelfDTag not implemented");
}

export function toBookShelfEvent(_shelf: BookShelf): BookShelfEvent {
  throw new Error("toBookShelfEvent not implemented");
}

export function fromBookShelfEvent(_event: BookShelfEvent): BookShelf {
  throw new Error("fromBookShelfEvent not implemented");
}
