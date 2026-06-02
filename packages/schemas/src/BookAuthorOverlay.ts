// Book author overlay (Story 32 / ADR 0033 §4; the ADR-0032 §3 reserved design):
// an AUTHOR-signed kind-39999 event that `#a`-references the canonical book
// address, carries the author's pubkey in a `p` tag (author = signer), and z-tags
// to the RESERVED `author-edits` header. Lives under a per-(author, book)
// replaceable/reversible d-tag `authoredit--<slug>--<author8>`. Its payload carries
// ONLY three fields — blurb, coverUrl, purchaseUrl (AC-5 "and nothing else") — and
// a null/absent field means "no author value" (reverts to canonical at read time,
// AC-6 reversibility). content is "". Mirrors BookClaim.ts.
import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";

export const BOOK_AUTHOR_OVERLAY_KIND = 39999 as const;
export const BOOK_AUTHOR_OVERLAY_WORD_TYPE = "bookAuthorOverlay" as const;

export type BookAuthorOverlay = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly authorPubkey: HexPubkey;
  readonly blurb?: string | null;
  readonly coverUrl?: string | null;
  readonly purchaseUrl?: string | null;
  readonly parentHeader: DListAddress<39998>;
};

export type BookAuthorOverlayPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookAuthorOverlay", ...string[]];
  };
  readonly bookAuthorOverlay: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly blurb?: string;
    readonly coverUrl?: string;
    readonly purchaseUrl?: string;
  };
};

export type BookAuthorOverlayEvent = UnsignedDListEvent<
  39999,
  "bookAuthorOverlay",
  BookAuthorOverlayPayload["bookAuthorOverlay"]
>;

/** D-tag: `authoredit--<bookSlug>--<author8>`; identity (author, book). */
export function buildBookAuthorOverlayDTag(
  bookSlug: string,
  authorPubkey: HexPubkey,
): string {
  return `authoredit--${bookSlug}--${pubkeyPrefix(authorPubkey)}`;
}

export function toBookAuthorOverlayEvent(
  overlay: BookAuthorOverlay,
): BookAuthorOverlayEvent {
  const dTag = buildBookAuthorOverlayDTag(overlay.bookSlug, overlay.authorPubkey);
  const bookAtag = formatAddress(overlay.bookAddress);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(overlay.parentHeader)],
    ["a", bookAtag],
    ["t", overlay.bookSlug],
    ["p", overlay.authorPubkey],
  ];
  // A null/absent field is omitted from the payload — it carries no author
  // value and reverts to canonical at read time (AC-6 reversibility). Never
  // emit an empty string that would overwrite the canonical value.
  const inner: {
    bookSlug: string;
    bookAtag: string;
    blurb?: string;
    coverUrl?: string;
    purchaseUrl?: string;
  } = { bookSlug: overlay.bookSlug, bookAtag };
  if (overlay.blurb != null) inner.blurb = overlay.blurb;
  if (overlay.coverUrl != null) inner.coverUrl = overlay.coverUrl;
  if (overlay.purchaseUrl != null) inner.purchaseUrl = overlay.purchaseUrl;

  const payload: BookAuthorOverlayPayload = {
    word: {
      slug: dTag,
      name: `author edit: ${overlay.bookSlug}`,
      title: `Author edit: ${overlay.bookSlug}`,
      wordTypes: ["word", "bookAuthorOverlay"],
    },
    bookAuthorOverlay: inner,
  };
  return {
    kind: BOOK_AUTHOR_OVERLAY_KIND,
    tags,
    content: "",
    payload,
    parentHeader: overlay.parentHeader,
  };
}

export function fromBookAuthorOverlayEvent(
  event: BookAuthorOverlayEvent,
): BookAuthorOverlay {
  const p = event.payload.bookAuthorOverlay;
  const authorTag = event.tags.find((t) => t[0] === "p");
  if (!authorTag || authorTag.length < 2) {
    throw new Error(
      "fromBookAuthorOverlayEvent: missing `p` tag carrying the author pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    authorPubkey: asHexPubkey(authorTag[1]!),
    blurb: p.blurb,
    coverUrl: p.coverUrl,
    purchaseUrl: p.purchaseUrl,
    parentHeader: event.parentHeader,
  };
}
