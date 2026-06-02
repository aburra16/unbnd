// Failing tests (red) for Story 31 / ADR 0032 §1 — the BookClaim schema. A claim
// is a claimant-signed kind-39999 event that `#a`-references the canonical book
// address (39999:<librarian>:<slug>), carries the claimant's pubkey in a `p` tag,
// z-tags to the NEW `book-claims` concept header, and lives under a per-(claimant,
// book) replaceable d-tag `claim--<slug>--<claimant8>`. It carries NO editable
// metadata (content ""). Mirrors BookTagAssertion.test / BookRating.test.
//
// This file is red until packages/schemas/src/BookClaim.ts exists (and the new
// `buildBookClaimsHeaderAddress` + BOOK_CLAIMS_HEADER_SLUG in concept-headers.ts).
import { describe, expect, it } from "vitest";
import {
  buildBookClaimDTag,
  fromBookClaimEvent,
  toBookClaimEvent,
  BOOK_CLAIM_KIND,
  type BookClaim,
} from "../src/BookClaim";
import { buildBookClaimsHeaderAddress } from "../src/concept-headers";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const CLAIMANT = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const CLAIMS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-claims",
};

const claim: BookClaim = {
  bookSlug: "ol-ol45804w",
  bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "ol-ol45804w" },
  claimantPubkey: CLAIMANT,
  parentHeader: CLAIMS_HEADER,
};

describe("BOOK_CLAIM_KIND", () => {
  it("is the kind-39999 DList item kind", () => {
    expect(BOOK_CLAIM_KIND).toBe(39999);
  });
});

describe("buildBookClaimsHeaderAddress", () => {
  it("builds the new `book-claims` concept header under the librarian", () => {
    const hdr = buildBookClaimsHeaderAddress(LIBRARIAN);
    expect(hdr).toEqual({ kind: 39998, pubkey: LIBRARIAN, dTag: "book-claims" });
  });
});

describe("buildBookClaimDTag", () => {
  it("builds claim--<bookSlug>--<claimant8> (identity = claimant + book)", () => {
    expect(buildBookClaimDTag("ol-ol45804w", CLAIMANT)).toBe(
      "claim--ol-ol45804w--9bf2eed5",
    );
  });

  it("is idempotent: the same (claimant, book) yields the same d-tag (re-claim replaces)", () => {
    const first = buildBookClaimDTag("ol-ol45804w", CLAIMANT);
    const second = buildBookClaimDTag("ol-ol45804w", CLAIMANT);
    expect(first).toBe(second);
  });

  it("differs by claimant (two claimants on one book do not collide)", () => {
    const other = hex64("a".repeat(64));
    expect(buildBookClaimDTag("ol-ol45804w", CLAIMANT)).not.toBe(
      buildBookClaimDTag("ol-ol45804w", other),
    );
  });
});

describe("toBookClaimEvent", () => {
  it("targets the book by #a, carries z(book-claims)/t(slug)/p(claimant), and an empty content", () => {
    const e = toBookClaimEvent(claim);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual(["d", "claim--ol-ol45804w--9bf2eed5"]);
    expect(e.tags).toContainEqual(["z", `39998:${LIBRARIAN}:book-claims`]);
    expect(e.tags).toContainEqual(["a", `39999:${LIBRARIAN}:ol-ol45804w`]);
    expect(e.tags).toContainEqual(["t", "ol-ol45804w"]);
    expect(e.tags).toContainEqual(["p", CLAIMANT]);
    // The claim carries no editable metadata — content is empty (ADR 0032 §1).
    expect(e.content).toBe("");
  });
});

describe("fromBookClaimEvent", () => {
  it("round-trips a claim", () => {
    expect(fromBookClaimEvent(toBookClaimEvent(claim))).toEqual(claim);
  });
});
