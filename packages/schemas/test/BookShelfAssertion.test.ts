// Failing tests (red) for Story 18 — Shelves as membership assertions.
// Mirrors BookTagAssertion.test.ts. Targets the REWORKED BookShelf.ts assertion
// model per ADR 0018 (the old single-big-list model is removed). These import
// names do not exist yet; the Implementer adds them.
import { describe, expect, it } from "vitest";
import {
  buildBookShelfDTag,
  fromShelfAssertionEvent,
  toShelfAssertionEvent,
  toShelfSlug,
  DEFAULT_SHELVES,
  DEFAULT_SHELF_SLUGS,
  SHELF_ON,
  SHELF_OFF,
  BOOK_SHELF_WORD_TYPE,
  type BookShelfAssertion,
} from "../src/BookShelf";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const OWNER = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const SHELVES_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-shelves",
};

const apply: BookShelfAssertion = {
  bookSlug: "ol-ol45804w",
  bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "ol-ol45804w" },
  shelfSlug: "want-to-read",
  polarity: SHELF_ON,
  ownerPubkey: OWNER,
  parentHeader: SHELVES_HEADER,
};

const customApply: BookShelfAssertion = {
  ...apply,
  shelfSlug: "beach-reads",
  shelfName: "Beach Reads",
};

describe("shelf default constants (PRD §5.6, fixed names)", () => {
  it("exposes the three reading-state defaults in PRD order", () => {
    expect(DEFAULT_SHELVES).toEqual([
      { slug: "want-to-read", name: "Want to Read" },
      { slug: "reading", name: "Reading" },
      { slug: "read", name: "Read" },
    ]);
    expect(DEFAULT_SHELF_SLUGS).toEqual(["want-to-read", "reading", "read"]);
  });

  it("exposes readable polarity aliases SHELF_ON=1 and SHELF_OFF=-1", () => {
    expect(SHELF_ON).toBe(1);
    expect(SHELF_OFF).toBe(-1);
  });

  it("uses the bookShelfAssertion word type", () => {
    expect(BOOK_SHELF_WORD_TYPE).toBe("bookShelfAssertion");
  });
});

describe("toShelfSlug", () => {
  it("normalizes a display name to a slug (lowercase, hyphenated)", () => {
    expect(toShelfSlug("Beach Reads")).toBe("beach-reads");
  });

  it("collapses runs of non-alphanumerics and trims edge hyphens", () => {
    expect(toShelfSlug("  Sci-Fi & Fantasy!! ")).toBe("sci-fi-fantasy");
  });

  it("is deterministic so the same name regenerates the same slug", () => {
    expect(toShelfSlug("Beach Reads")).toBe(toShelfSlug("beach   reads"));
  });

  it("rejects a name that normalizes to empty", () => {
    expect(() => toShelfSlug("   ***   ")).toThrow();
  });
});

describe("buildBookShelfDTag", () => {
  it("builds shelf--<bookSlug>--<shelfSlug>--<owner8> (identity user+book+shelf)", () => {
    expect(buildBookShelfDTag(OWNER, "ol-ol45804w", "want-to-read")).toBe(
      "shelf--ol-ol45804w--want-to-read--9bf2eed5",
    );
  });

  it("varies by book and by shelf so a book can sit on several shelves", () => {
    const onReading = buildBookShelfDTag(OWNER, "ol-ol45804w", "reading");
    const onRead = buildBookShelfDTag(OWNER, "ol-ol45804w", "read");
    expect(onReading).not.toBe(onRead);
  });
});

describe("toShelfAssertionEvent", () => {
  it("targets the book by #a and carries d/z/t/polarity/p tags", () => {
    const e = toShelfAssertionEvent(apply);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual([
      "d",
      "shelf--ol-ol45804w--want-to-read--9bf2eed5",
    ]);
    expect(e.tags).toContainEqual(["z", `39998:${LIBRARIAN}:book-shelves`]);
    expect(e.tags).toContainEqual(["a", `39999:${LIBRARIAN}:ol-ol45804w`]);
    expect(e.tags).toContainEqual(["t", "want-to-read"]);
    expect(e.tags).toContainEqual(["polarity", "1"]);
    expect(e.tags).toContainEqual(["p", OWNER]);
  });

  it("omits the name tag for a default shelf", () => {
    const e = toShelfAssertionEvent(apply);
    expect(e.tags.find((t) => t[0] === "name")).toBeUndefined();
  });

  it("carries a name tag only on a custom-shelf apply", () => {
    const e = toShelfAssertionEvent(customApply);
    expect(e.tags).toContainEqual(["t", "beach-reads"]);
    expect(e.tags).toContainEqual(["name", "Beach Reads"]);
  });

  it("encodes a retract (removal) as polarity -1", () => {
    const retract: BookShelfAssertion = { ...apply, polarity: SHELF_OFF };
    expect(toShelfAssertionEvent(retract).tags).toContainEqual([
      "polarity",
      "-1",
    ]);
  });
});

describe("fromShelfAssertionEvent", () => {
  it("round-trips a default-shelf apply and a retract", () => {
    expect(fromShelfAssertionEvent(toShelfAssertionEvent(apply))).toEqual(apply);
    const retract: BookShelfAssertion = { ...apply, polarity: SHELF_OFF };
    expect(fromShelfAssertionEvent(toShelfAssertionEvent(retract))).toEqual(
      retract,
    );
  });

  it("round-trips a custom-shelf apply carrying the display name", () => {
    expect(fromShelfAssertionEvent(toShelfAssertionEvent(customApply))).toEqual(
      customApply,
    );
  });
});
