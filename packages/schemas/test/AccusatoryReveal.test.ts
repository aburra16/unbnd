// FAILING TESTS (red) — Story 33 / ADR 0034 §3. The librarian-signed
// `AccusatoryReveal` event: a kind-39999 addressable/replaceable event that
// reveals (or withdraws) a single accusatory tag on a single book at read time.
// Identity is (book, tag): the d-tag is `reveal--<bookSlug>--<tagSlug>`, so a
// `withdrawn` event replaces the `revealed` one at the SAME address (reversible
// by replace, no separate tombstone kind — ADR 0034 §3 / AC-6). It `#a`-targets
// the book (filter), `#t`-targets the tag slug (filter), carries a
// `["state","revealed"|"withdrawn"]` tag, and z-tags to the NEW
// `accusatory-reveals` concept header. content is "". Author = the librarian
// (the only signer; attribution is the signature itself). Mirrors
// AuthorVerifiedAssertion.test / BookTagAssertion.test.
//
// Red until packages/schemas/src/AccusatoryReveal.ts exists (and the new
// BOOK_ACCUSATORY_REVEALS_HEADER_SLUG + buildBookAccusatoryRevealsHeaderAddress
// in concept-headers.ts, exported from index.ts).
import { describe, expect, it } from "vitest";
import {
  ACCUSATORY_REVEAL_KIND,
  buildAccusatoryRevealDTag,
  fromAccusatoryRevealEvent,
  toAccusatoryRevealEvent,
  type AccusatoryReveal,
} from "../src/AccusatoryReveal";
import {
  BOOK_ACCUSATORY_REVEALS_HEADER_SLUG,
  buildBookAccusatoryRevealsHeaderAddress,
} from "../src/concept-headers";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const REVEALS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "accusatory-reveals",
};

const revealed: AccusatoryReveal = {
  bookSlug: "ol-ol45804w",
  bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "ol-ol45804w" },
  tagSlug: "ai-generated",
  state: "revealed",
  parentHeader: REVEALS_HEADER,
};

describe("ACCUSATORY_REVEAL_KIND", () => {
  it("is the kind-39999 DList item kind", () => {
    expect(ACCUSATORY_REVEAL_KIND).toBe(39999);
  });
});

describe("accusatory-reveals concept header", () => {
  it("exposes the NEW `accusatory-reveals` header slug", () => {
    expect(BOOK_ACCUSATORY_REVEALS_HEADER_SLUG).toBe("accusatory-reveals");
  });

  it("builds the header address under the librarian", () => {
    const hdr = buildBookAccusatoryRevealsHeaderAddress(LIBRARIAN);
    expect(hdr).toEqual({
      kind: 39998,
      pubkey: LIBRARIAN,
      dTag: "accusatory-reveals",
    });
  });
});

describe("buildAccusatoryRevealDTag", () => {
  it("builds reveal--<bookSlug>--<tagSlug> (identity = book + tag, NOT the actor)", () => {
    expect(buildAccusatoryRevealDTag("ol-ol45804w", "ai-generated")).toBe(
      "reveal--ol-ol45804w--ai-generated",
    );
  });

  it("is deterministic: a reveal and a later withdraw share the SAME address (replaceable-to-state, AC-6)", () => {
    expect(buildAccusatoryRevealDTag("ol-ol45804w", "ai-generated")).toBe(
      buildAccusatoryRevealDTag("ol-ol45804w", "ai-generated"),
    );
  });

  it("differs by tag (two accusatory tags on one book do not collide)", () => {
    expect(buildAccusatoryRevealDTag("ol-ol45804w", "ai-generated")).not.toBe(
      buildAccusatoryRevealDTag("ol-ol45804w", "possibly-ai-generated"),
    );
  });

  it("differs by book (one tag revealed on two books does not collide)", () => {
    expect(buildAccusatoryRevealDTag("ol-ol45804w", "ai-generated")).not.toBe(
      buildAccusatoryRevealDTag("ol-other", "ai-generated"),
    );
  });
});

describe("toAccusatoryRevealEvent", () => {
  it("targets the book by #a, the tag by #t, carries state, z(accusatory-reveals), empty content", () => {
    const e = toAccusatoryRevealEvent(revealed);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual(["d", "reveal--ol-ol45804w--ai-generated"]);
    expect(e.tags).toContainEqual(["z", `39998:${LIBRARIAN}:accusatory-reveals`]);
    expect(e.tags).toContainEqual(["a", `39999:${LIBRARIAN}:ol-ol45804w`]);
    expect(e.tags).toContainEqual(["t", "ai-generated"]);
    expect(e.tags).toContainEqual(["state", "revealed"]);
    expect(e.content).toBe("");
  });

  it("encodes a withdraw with state `withdrawn` at the SAME address (reversal, AC-6)", () => {
    const withdrawn: AccusatoryReveal = { ...revealed, state: "withdrawn" };
    const e = toAccusatoryRevealEvent(withdrawn);
    expect(e.tags).toContainEqual(["state", "withdrawn"]);
    // The d-tag (address) is identical to the reveal → a withdraw REPLACES.
    expect(e.tags).toContainEqual(["d", "reveal--ol-ol45804w--ai-generated"]);
  });
});

describe("fromAccusatoryRevealEvent", () => {
  it("round-trips a reveal and a withdraw", () => {
    expect(fromAccusatoryRevealEvent(toAccusatoryRevealEvent(revealed))).toEqual(
      revealed,
    );
    const withdrawn: AccusatoryReveal = { ...revealed, state: "withdrawn" };
    expect(
      fromAccusatoryRevealEvent(toAccusatoryRevealEvent(withdrawn)),
    ).toEqual(withdrawn);
  });
});
