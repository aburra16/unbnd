import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
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
  userPubkey: HexPubkey,
  shelfSlug: string,
): string {
  return `shelf--${pubkeyPrefix(userPubkey)}--${shelfSlug}`;
}

export function toBookShelfEvent(shelf: BookShelf): BookShelfEvent {
  if (shelf.bookSlugs.length !== shelf.bookAddresses.length) {
    throw new Error(
      `toBookShelfEvent: bookSlugs and bookAddresses must be parallel; got ${shelf.bookSlugs.length} slugs vs ${shelf.bookAddresses.length} addresses`,
    );
  }
  const dTag = buildBookShelfDTag(shelf.userPubkey, shelf.slug);

  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(shelf.parentHeader)],
    ["t", shelf.slug],
    ["name", shelf.name],
    ["visibility", shelf.visibility],
    ["p", shelf.userPubkey],
  ];
  for (const addr of shelf.bookAddresses) {
    tags.push(["a", formatAddress(addr)]);
  }

  const payload: BookShelfPayload = {
    word: {
      slug: dTag,
      name: `shelf: ${shelf.name}`,
      title: `Shelf: ${shelf.name}`,
      wordTypes: ["word", "bookShelf"],
    },
    bookShelf: {
      slug: shelf.slug,
      name: shelf.name,
      visibility: shelf.visibility,
      books: shelf.bookSlugs,
    },
  };

  return {
    kind: BOOK_SHELF_KIND,
    tags,
    content: "",
    payload,
    parentHeader: shelf.parentHeader,
  };
}

export function fromBookShelfEvent(event: BookShelfEvent): BookShelf {
  const p = event.payload.bookShelf;
  const userTag = event.tags.find((t) => t[0] === "p");
  if (!userTag || userTag.length < 2) {
    throw new Error(
      "fromBookShelfEvent: missing `p` tag carrying the shelf owner pubkey",
    );
  }
  const aTags = event.tags.filter((t) => t[0] === "a");
  const bookAddresses = aTags.map((t) => parseAddressOfKind(t[1]!, 39999));
  return {
    slug: p.slug,
    name: p.name,
    visibility: p.visibility,
    bookSlugs: p.books,
    bookAddresses,
    userPubkey: asHexPubkey(userTag[1]!),
    parentHeader: event.parentHeader,
  };
}
