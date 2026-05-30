// Book shelf membership assertion (ADR 0018, Story 18). One small kind-39999
// event per (user, book, shelf), mirroring BookTagAssertion's apply/retract
// polarity (SHELF_ON = on the shelf, SHELF_OFF = removed). Replaces the prior
// single-big-list shelf model. Item z-tagged to the `book-shelves` concept.
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

export const BOOK_SHELF_KIND = 39999 as const;
export const BOOK_SHELF_WORD_TYPE = "bookShelfAssertion" as const;

/** Readable polarity aliases for shelf membership. */
export const SHELF_ON: Polarity = 1;
export const SHELF_OFF: Polarity = -1;

/** The three reading-state defaults (PRD §5.6, fixed names). */
export const DEFAULT_SHELVES = [
  { slug: "want-to-read", name: "Want to Read" },
  { slug: "reading", name: "Reading" },
  { slug: "read", name: "Read" },
] as const;

export const DEFAULT_SHELF_SLUGS = ["want-to-read", "reading", "read"] as const;
export type DefaultShelfSlug = (typeof DEFAULT_SHELF_SLUGS)[number];

/**
 * Normalize a custom shelf's display name to a slug: lowercase, trim, collapse
 * runs of non-alphanumerics to single hyphens, strip leading/trailing hyphens.
 * Deterministic so the same display name regenerates the same slug. Throws when
 * the name normalizes to empty.
 */
export function toShelfSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error("toShelfSlug: name normalizes to an empty slug");
  }
  return slug;
}

export type BookShelfAssertion = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly shelfSlug: string;
  readonly shelfName?: string; // omitted for default shelves
  readonly polarity: Polarity; // SHELF_ON | SHELF_OFF
  readonly ownerPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookShelfAssertionPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookShelfAssertion", ...string[]];
  };
  readonly bookShelfAssertion: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly shelfSlug: string;
    readonly shelfName?: string;
    readonly polarity: Polarity;
  };
};

export type BookShelfAssertionEvent = UnsignedDListEvent<
  39999,
  "bookShelfAssertion",
  BookShelfAssertionPayload["bookShelfAssertion"]
>;

/** D-tag: `shelf--<bookSlug>--<shelfSlug>--<owner8>`; identity (owner, book, shelf). */
export function buildBookShelfDTag(
  ownerPubkey: HexPubkey,
  bookSlug: string,
  shelfSlug: string,
): string {
  return `shelf--${bookSlug}--${shelfSlug}--${pubkeyPrefix(ownerPubkey)}`;
}

export function toShelfAssertionEvent(
  assertion: BookShelfAssertion,
): BookShelfAssertionEvent {
  const dTag = buildBookShelfDTag(
    assertion.ownerPubkey,
    assertion.bookSlug,
    assertion.shelfSlug,
  );
  const bookAtag = formatAddress(assertion.bookAddress);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(assertion.parentHeader)],
    ["a", bookAtag],
    ["t", assertion.shelfSlug],
    ["polarity", String(assertion.polarity)],
    ["p", assertion.ownerPubkey],
  ];
  // The display name rides only on custom-shelf applies; default shelf names
  // are fixed constants resolved at render time, never written to the wire.
  if (assertion.shelfName !== undefined) {
    tags.push(["name", assertion.shelfName]);
  }
  const payload: BookShelfAssertionPayload = {
    word: {
      slug: dTag,
      name: `shelf: ${assertion.bookSlug} → ${assertion.shelfSlug}`,
      title: `Shelf: ${assertion.bookSlug} → ${assertion.shelfSlug}`,
      wordTypes: ["word", "bookShelfAssertion"],
    },
    bookShelfAssertion: {
      bookSlug: assertion.bookSlug,
      bookAtag,
      shelfSlug: assertion.shelfSlug,
      ...(assertion.shelfName !== undefined
        ? { shelfName: assertion.shelfName }
        : {}),
      polarity: assertion.polarity,
    },
  };
  return {
    kind: BOOK_SHELF_KIND,
    tags,
    content: "",
    payload,
    parentHeader: assertion.parentHeader,
  };
}

export function fromShelfAssertionEvent(
  event: BookShelfAssertionEvent,
): BookShelfAssertion {
  const p = event.payload.bookShelfAssertion;
  const ownerTag = event.tags.find((t) => t[0] === "p");
  if (!ownerTag || ownerTag.length < 2) {
    throw new Error(
      "fromShelfAssertionEvent: missing `p` tag carrying the owner pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    shelfSlug: p.shelfSlug,
    ...(p.shelfName !== undefined ? { shelfName: p.shelfName } : {}),
    polarity: p.polarity,
    ownerPubkey: asHexPubkey(ownerTag[1]!),
    parentHeader: event.parentHeader,
  };
}
