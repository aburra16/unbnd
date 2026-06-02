// Failing tests (red) for Story 32 / ADR 0033 §4 — the BookAuthorOverlay schema
// (the ADR-0032 §3 reserved design, now built). An AUTHOR-signed kind-39999 event
// that `#a`-references the canonical book address, carries the author's pubkey in
// a `p` tag (author = signer), z-tags to the RESERVED `author-edits` header, and
// lives under a per-(author, book) replaceable/reversible d-tag
// `authoredit--<slug>--<author8>`. Its payload carries ONLY three fields — blurb,
// coverUrl, purchaseUrl (AC-5 "and nothing else") — and a null/absent field means
// "no author value for this field" (reverts to canonical at read time, AC-6
// reversibility). content is "". Mirrors BookClaim.test.
//
// Red until packages/schemas/src/BookAuthorOverlay.ts exists (and the new
// buildBookAuthorEditsHeaderAddress for the already-declared
// BOOK_AUTHOR_EDITS_HEADER_SLUG in concept-headers.ts).
import { describe, expect, it } from "vitest";
import {
  buildBookAuthorOverlayDTag,
  fromBookAuthorOverlayEvent,
  toBookAuthorOverlayEvent,
  BOOK_AUTHOR_OVERLAY_KIND,
  type BookAuthorOverlay,
} from "../src/BookAuthorOverlay";
import { buildBookAuthorEditsHeaderAddress } from "../src/concept-headers";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const AUTHOR = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const EDITS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "author-edits",
};

const overlay: BookAuthorOverlay = {
  bookSlug: "ol-ol45804w",
  bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "ol-ol45804w" },
  authorPubkey: AUTHOR,
  blurb: "The author's own blurb.",
  coverUrl: "https://covers.example/ol45804w.jpg",
  purchaseUrl: "https://bookshop.org/ol45804w",
  parentHeader: EDITS_HEADER,
};

describe("BOOK_AUTHOR_OVERLAY_KIND", () => {
  it("is the kind-39999 DList item kind", () => {
    expect(BOOK_AUTHOR_OVERLAY_KIND).toBe(39999);
  });
});

describe("buildBookAuthorEditsHeaderAddress", () => {
  it("builds the reserved `author-edits` concept header under the librarian", () => {
    const hdr = buildBookAuthorEditsHeaderAddress(LIBRARIAN);
    expect(hdr).toEqual({ kind: 39998, pubkey: LIBRARIAN, dTag: "author-edits" });
  });
});

describe("buildBookAuthorOverlayDTag", () => {
  it("builds authoredit--<slug>--<author8> (identity = author + book, replaceable)", () => {
    expect(buildBookAuthorOverlayDTag("ol-ol45804w", AUTHOR)).toBe(
      "authoredit--ol-ol45804w--9bf2eed5",
    );
  });

  it("is idempotent: same (author, book) yields the same d-tag (re-save replaces / reverses)", () => {
    expect(buildBookAuthorOverlayDTag("ol-ol45804w", AUTHOR)).toBe(
      buildBookAuthorOverlayDTag("ol-ol45804w", AUTHOR),
    );
  });
});

describe("toBookAuthorOverlayEvent", () => {
  it("targets the book by #a, carries #p(author), z(author-edits), empty content", () => {
    const e = toBookAuthorOverlayEvent(overlay);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual(["d", "authoredit--ol-ol45804w--9bf2eed5"]);
    expect(e.tags).toContainEqual(["z", `39998:${LIBRARIAN}:author-edits`]);
    expect(e.tags).toContainEqual(["a", `39999:${LIBRARIAN}:ol-ol45804w`]);
    expect(e.tags).toContainEqual(["p", AUTHOR]);
    expect(e.content).toBe("");
  });

  it("carries ONLY blurb / coverUrl / purchaseUrl in the payload (AC-5 'and nothing else')", () => {
    const e = toBookAuthorOverlayEvent(overlay);
    const payload = e.payload.bookAuthorOverlay as Record<string, unknown>;
    expect(payload.blurb).toBe("The author's own blurb.");
    expect(payload.coverUrl).toBe("https://covers.example/ol45804w.jpg");
    expect(payload.purchaseUrl).toBe("https://bookshop.org/ol45804w");
    // No title, author name, ISBN, page count, year, tags, ratings, reviews.
    const allowed = new Set(["bookSlug", "bookAtag", "blurb", "coverUrl", "purchaseUrl"]);
    for (const key of Object.keys(payload)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});

describe("fromBookAuthorOverlayEvent", () => {
  it("round-trips a full overlay", () => {
    expect(fromBookAuthorOverlayEvent(toBookAuthorOverlayEvent(overlay))).toEqual(
      overlay,
    );
  });

  it("round-trips a CLEARED field as null/absent (reversibility — reverts to canonical)", () => {
    // Author clears their blurb (re-save with blurb null); cover/purchase kept.
    const cleared: BookAuthorOverlay = { ...overlay, blurb: null };
    const back = fromBookAuthorOverlayEvent(toBookAuthorOverlayEvent(cleared));
    // A null field round-trips as "no author value" (null or undefined), never an
    // empty string that would overwrite the canonical blurb with "".
    expect(back.blurb == null).toBe(true);
    expect(back.coverUrl).toBe(overlay.coverUrl);
    expect(back.purchaseUrl).toBe(overlay.purchaseUrl);
  });
});
