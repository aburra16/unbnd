// Failing tests (red) for Story 18 AC-3, AC-5, AC-7 — the own-shelves grouped
// read. Mirrors apps/api/test/tags/aggregate.test.ts. Targets the new
// apps/api/src/shelves/aggregate.ts (groupOwnShelves), which does not exist yet.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toShelfAssertionEvent,
  toWireTemplate,
  SHELF_ON,
  SHELF_OFF,
  type Polarity,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { groupOwnShelves } from "../../src/shelves/aggregate";

const LIB = asHexPubkey("1".repeat(63) + "a");
const OWNER = asHexPubkey(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const HDR = { kind: 39998 as const, pubkey: LIB, dTag: "book-shelves" };

function assertion(opts: {
  bookSlug: string;
  shelfSlug: string;
  shelfName?: string;
  polarity: Polarity;
  createdAt?: number;
}): SignedNostrEvent {
  const a = {
    bookSlug: opts.bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: opts.bookSlug },
    shelfSlug: opts.shelfSlug,
    shelfName: opts.shelfName,
    polarity: opts.polarity,
    ownerPubkey: OWNER,
    parentHeader: HDR,
  };
  const t = toWireTemplate(toShelfAssertionEvent(a), opts.createdAt ?? 1);
  return {
    id: `${opts.bookSlug}-${opts.shelfSlug}-${opts.createdAt ?? 1}`,
    pubkey: OWNER,
    sig: "x",
    ...t,
  } as SignedNostrEvent;
}

describe("groupOwnShelves — honest empty (AC-7)", () => {
  it("returns an empty list for a user with no shelf assertions", () => {
    expect(groupOwnShelves([])).toEqual([]);
  });
});

describe("groupOwnShelves — grouping & latest-wins (AC-3, AC-7)", () => {
  it("groups books by shelf slug and reports a real per-shelf count", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: SHELF_ON }),
      assertion({ bookSlug: "north-woods", shelfSlug: "want-to-read", polarity: SHELF_ON }),
      assertion({ bookSlug: "the-bee-sting", shelfSlug: "reading", polarity: SHELF_ON }),
    ]);
    const want = shelves.find((s) => s.slug === "want-to-read")!;
    expect(want.count).toBe(2);
    expect(want.books.map((b) => b.bookSlug).sort()).toEqual([
      "north-woods",
      "orbital",
    ]);
    expect(shelves.find((s) => s.slug === "reading")!.count).toBe(1);
  });

  it("keeps the latest assertion per (book, shelf) so re-adding stays single (AC-3 idempotent)", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: SHELF_ON, createdAt: 1 }),
      assertion({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: SHELF_ON, createdAt: 5 }),
    ]);
    const want = shelves.find((s) => s.slug === "want-to-read")!;
    expect(want.count).toBe(1);
    expect(want.books).toHaveLength(1);
  });
});

describe("groupOwnShelves — retract resolution (AC-2)", () => {
  it("drops a book whose latest assertion is SHELF_OFF", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: SHELF_ON, createdAt: 1 }),
      assertion({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: SHELF_OFF, createdAt: 5 }),
    ]);
    expect(shelves.find((s) => s.slug === "want-to-read")).toBeUndefined();
  });

  it("keeps a book re-applied after a retract (latest apply wins)", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "orbital", shelfSlug: "reading", polarity: SHELF_ON, createdAt: 1 }),
      assertion({ bookSlug: "orbital", shelfSlug: "reading", polarity: SHELF_OFF, createdAt: 2 }),
      assertion({ bookSlug: "orbital", shelfSlug: "reading", polarity: SHELF_ON, createdAt: 3 }),
    ]);
    expect(shelves.find((s) => s.slug === "reading")!.count).toBe(1);
  });
});

describe("groupOwnShelves — move = retract-old + apply-new (AC-5)", () => {
  it("after a retract from Reading and an apply to Read, the book lives on exactly one default", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "orbital", shelfSlug: "reading", polarity: SHELF_ON, createdAt: 1 }),
      // move: retract old default, then apply new default
      assertion({ bookSlug: "orbital", shelfSlug: "reading", polarity: SHELF_OFF, createdAt: 2 }),
      assertion({ bookSlug: "orbital", shelfSlug: "read", polarity: SHELF_ON, createdAt: 3 }),
    ]);
    expect(shelves.find((s) => s.slug === "reading")).toBeUndefined();
    expect(shelves.find((s) => s.slug === "read")!.count).toBe(1);
  });
});

describe("groupOwnShelves — name resolution (AC-4)", () => {
  it("resolves a default shelf's display name from the fixed constant, not the wire", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "orbital", shelfSlug: "want-to-read", polarity: SHELF_ON }),
    ]);
    expect(shelves.find((s) => s.slug === "want-to-read")!.name).toBe(
      "Want to Read",
    );
  });

  it("resolves a custom shelf's name from the latest surviving apply in the group", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "orbital", shelfSlug: "beach-reads", shelfName: "Beach Reads", polarity: SHELF_ON, createdAt: 1 }),
      assertion({ bookSlug: "north-woods", shelfSlug: "beach-reads", shelfName: "Beach Reads", polarity: SHELF_ON, createdAt: 2 }),
    ]);
    const custom = shelves.find((s) => s.slug === "beach-reads")!;
    expect(custom.name).toBe("Beach Reads");
    expect(custom.count).toBe(2);
  });
});

describe("groupOwnShelves — ordering", () => {
  it("lists the three defaults first in PRD order, then custom shelves alphabetically", () => {
    const shelves = groupOwnShelves([
      assertion({ bookSlug: "b1", shelfSlug: "zelda-books", shelfName: "Zelda Books", polarity: SHELF_ON }),
      assertion({ bookSlug: "b2", shelfSlug: "alpha-books", shelfName: "Alpha Books", polarity: SHELF_ON }),
      assertion({ bookSlug: "b3", shelfSlug: "read", polarity: SHELF_ON }),
      assertion({ bookSlug: "b4", shelfSlug: "want-to-read", polarity: SHELF_ON }),
    ]);
    expect(shelves.map((s) => s.slug)).toEqual([
      "want-to-read",
      "read",
      "alpha-books",
      "zelda-books",
    ]);
  });
});
