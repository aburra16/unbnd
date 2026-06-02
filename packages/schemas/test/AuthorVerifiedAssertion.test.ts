// Failing tests (red) for Story 32 / ADR 0033 §1 — the AuthorVerifiedAssertion
// schema. A curator-signed kind-39999 event that `#a`-references the canonical
// book address (39999:<librarian>:<slug>), carries the AUTHOR being verified in a
// `p` tag (the (author, book) target — NOT the signer), the slug in a `t` tag, an
// apply/dispute `polarity`, z-tags to the NEW `author-verified` concept header,
// and lives under a per-(curator, author, book) replaceable d-tag
// `authorverified--<slug>--<author8>--<curator8>` (so a curator re-asserting /
// flipping polarity on the same (author, book) replaces — idempotent, AC-1).
// content is "". Mirrors BookTagAssertion.test / BookClaim.test.
//
// Red until packages/schemas/src/AuthorVerifiedAssertion.ts exists (and the new
// BOOK_AUTHOR_VERIFIED_HEADER_SLUG + buildBookAuthorVerifiedHeaderAddress in
// concept-headers.ts).
import { describe, expect, it } from "vitest";
import {
  buildAuthorVerifiedDTag,
  fromAuthorVerifiedEvent,
  toAuthorVerifiedEvent,
  AUTHOR_VERIFIED_KIND,
  type AuthorVerifiedAssertion,
} from "../src/AuthorVerifiedAssertion";
import { buildBookAuthorVerifiedHeaderAddress } from "../src/concept-headers";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
// The claimant whose authorship is being verified (the #p target).
const AUTHOR = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
// The curator asserting verification (the signer; carried into the d-tag).
const CURATOR = hex64("c".repeat(64));
const VERIFIED_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "author-verified",
};

const apply: AuthorVerifiedAssertion = {
  bookSlug: "ol-ol45804w",
  bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "ol-ol45804w" },
  authorPubkey: AUTHOR,
  curatorPubkey: CURATOR,
  polarity: 1,
  parentHeader: VERIFIED_HEADER,
};

describe("AUTHOR_VERIFIED_KIND", () => {
  it("is the kind-39999 DList item kind", () => {
    expect(AUTHOR_VERIFIED_KIND).toBe(39999);
  });
});

describe("buildBookAuthorVerifiedHeaderAddress", () => {
  it("builds the NEW `author-verified` concept header under the librarian", () => {
    const hdr = buildBookAuthorVerifiedHeaderAddress(LIBRARIAN);
    expect(hdr).toEqual({ kind: 39998, pubkey: LIBRARIAN, dTag: "author-verified" });
  });
});

describe("buildAuthorVerifiedDTag", () => {
  it("builds authorverified--<slug>--<author8>--<curator8> (identity = curator + author + book)", () => {
    expect(buildAuthorVerifiedDTag("ol-ol45804w", AUTHOR, CURATOR)).toBe(
      "authorverified--ol-ol45804w--9bf2eed5--cccccccc",
    );
  });

  it("is idempotent: same (curator, author, book) yields the same d-tag (re-assert/flip replaces)", () => {
    expect(buildAuthorVerifiedDTag("ol-ol45804w", AUTHOR, CURATOR)).toBe(
      buildAuthorVerifiedDTag("ol-ol45804w", AUTHOR, CURATOR),
    );
  });

  it("differs by curator (two curators verifying one author do not collide)", () => {
    const other = hex64("d".repeat(64));
    expect(buildAuthorVerifiedDTag("ol-ol45804w", AUTHOR, CURATOR)).not.toBe(
      buildAuthorVerifiedDTag("ol-ol45804w", AUTHOR, other),
    );
  });

  it("differs by author (one curator verifying two authors does not collide)", () => {
    const otherAuthor = hex64("e".repeat(64));
    expect(buildAuthorVerifiedDTag("ol-ol45804w", AUTHOR, CURATOR)).not.toBe(
      buildAuthorVerifiedDTag("ol-ol45804w", otherAuthor, CURATOR),
    );
  });
});

describe("toAuthorVerifiedEvent", () => {
  it("targets the book by #a, carries #p(author), t(slug), polarity, z(author-verified), empty content", () => {
    const e = toAuthorVerifiedEvent(apply);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual([
      "d",
      "authorverified--ol-ol45804w--9bf2eed5--cccccccc",
    ]);
    expect(e.tags).toContainEqual(["z", `39998:${LIBRARIAN}:author-verified`]);
    expect(e.tags).toContainEqual(["a", `39999:${LIBRARIAN}:ol-ol45804w`]);
    // The #p target is the AUTHOR being verified, not the curator/signer.
    expect(e.tags).toContainEqual(["p", AUTHOR]);
    expect(e.tags).toContainEqual(["t", "ol-ol45804w"]);
    expect(e.tags).toContainEqual(["polarity", "1"]);
    expect(e.content).toBe("");
  });

  it("encodes dispute polarity as -1", () => {
    const dispute: AuthorVerifiedAssertion = { ...apply, polarity: -1 };
    expect(toAuthorVerifiedEvent(dispute).tags).toContainEqual(["polarity", "-1"]);
  });
});

describe("fromAuthorVerifiedEvent", () => {
  it("round-trips an apply and a dispute", () => {
    expect(fromAuthorVerifiedEvent(toAuthorVerifiedEvent(apply))).toEqual(apply);
    const dispute: AuthorVerifiedAssertion = { ...apply, polarity: -1 };
    expect(fromAuthorVerifiedEvent(toAuthorVerifiedEvent(dispute))).toEqual(dispute);
  });
});
