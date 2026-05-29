import { describe, expect, it } from "vitest";
import {
  buildBookTagAssertionDTag,
  fromBookTagAssertionEvent,
  toBookTagAssertionEvent,
  type BookTagAssertion,
} from "../src/BookTagAssertion";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const ASSERTER = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const ASSERTIONS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-tag-assertions",
};

const apply: BookTagAssertion = {
  bookSlug: "ol-ol45804w",
  bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "ol-ol45804w" },
  tagSlug: "literary-fiction",
  tagType: "genre",
  polarity: 1,
  asserterPubkey: ASSERTER,
  parentHeader: ASSERTIONS_HEADER,
};

describe("buildBookTagAssertionDTag", () => {
  it("builds tagassert--<bookSlug>--<tagSlug>--<asserter8> (identity author+book+tag)", () => {
    expect(
      buildBookTagAssertionDTag("ol-ol45804w", "literary-fiction", ASSERTER),
    ).toBe("tagassert--ol-ol45804w--literary-fiction--9bf2eed5");
  });
});

describe("toBookTagAssertionEvent", () => {
  it("targets the book by #a and carries t(slug)/t(type)/polarity/p tags", () => {
    const e = toBookTagAssertionEvent(apply);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual([
      "d",
      "tagassert--ol-ol45804w--literary-fiction--9bf2eed5",
    ]);
    expect(e.tags).toContainEqual([
      "z",
      `39998:${LIBRARIAN}:book-tag-assertions`,
    ]);
    expect(e.tags).toContainEqual(["a", `39999:${LIBRARIAN}:ol-ol45804w`]);
    expect(e.tags).toContainEqual(["t", "literary-fiction"]);
    expect(e.tags).toContainEqual(["t", "genre"]);
    expect(e.tags).toContainEqual(["polarity", "1"]);
    expect(e.tags).toContainEqual(["p", ASSERTER]);
  });

  it("encodes dispute polarity as -1", () => {
    const dispute: BookTagAssertion = { ...apply, polarity: -1 };
    expect(toBookTagAssertionEvent(dispute).tags).toContainEqual([
      "polarity",
      "-1",
    ]);
  });
});

describe("fromBookTagAssertionEvent", () => {
  it("round-trips an apply and a dispute", () => {
    expect(fromBookTagAssertionEvent(toBookTagAssertionEvent(apply))).toEqual(
      apply,
    );
    const dispute: BookTagAssertion = { ...apply, polarity: -1 };
    expect(
      fromBookTagAssertionEvent(toBookTagAssertionEvent(dispute)),
    ).toEqual(dispute);
  });
});
