import { describe, expect, it } from "vitest";
import {
  buildBookShelfDTag,
  fromBookShelfEvent,
  toBookShelfEvent,
  type BookShelf,
} from "../src/BookShelf";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const USER = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const BOOK_AUTHOR = hex64("3".repeat(63) + "b");

const SHELVES_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-shelves",
};

const wantToRead: BookShelf = {
  slug: "want-to-read",
  name: "Want to read",
  visibility: "public",
  bookSlugs: ["orbital", "north-woods", "the-bee-sting"],
  bookAddresses: [
    { kind: 39999, pubkey: BOOK_AUTHOR, dTag: "orbital" },
    { kind: 39999, pubkey: BOOK_AUTHOR, dTag: "north-woods" },
    { kind: 39999, pubkey: BOOK_AUTHOR, dTag: "the-bee-sting" },
  ],
  userPubkey: USER,
  parentHeader: SHELVES_HEADER,
};

describe("buildBookShelfDTag", () => {
  it("builds shelf--<user8>--<slug>", () => {
    expect(buildBookShelfDTag(USER, "want-to-read")).toBe(
      "shelf--9bf2eed5--want-to-read",
    );
  });
});

describe("toBookShelfEvent", () => {
  it("returns kind 39999 with the shelves parent header", () => {
    const event = toBookShelfEvent(wantToRead);
    expect(event.kind).toBe(39999);
    expect(event.parentHeader.dTag).toBe("book-shelves");
  });

  it("includes d, z, t, name, visibility tags", () => {
    const event = toBookShelfEvent(wantToRead);
    expect(event.tags).toContainEqual([
      "d",
      "shelf--9bf2eed5--want-to-read",
    ]);
    expect(event.tags).toContainEqual([
      "z",
      `39998:${LIBRARIAN}:book-shelves`,
    ]);
    expect(event.tags).toContainEqual(["t", "want-to-read"]);
    expect(event.tags).toContainEqual(["name", "Want to read"]);
    expect(event.tags).toContainEqual(["visibility", "public"]);
  });

  it("includes one `a` tag per book on the shelf", () => {
    const event = toBookShelfEvent(wantToRead);
    const aTags = event.tags.filter((t) => t[0] === "a");
    expect(aTags).toHaveLength(3);
    expect(aTags).toContainEqual(["a", `39999:${BOOK_AUTHOR}:orbital`]);
    expect(aTags).toContainEqual(["a", `39999:${BOOK_AUTHOR}:north-woods`]);
    expect(aTags).toContainEqual([
      "a",
      `39999:${BOOK_AUTHOR}:the-bee-sting`,
    ]);
  });

  it("rejects shelves where bookSlugs and bookAddresses are not parallel", () => {
    const bad: BookShelf = {
      ...wantToRead,
      bookSlugs: ["orbital", "north-woods"],
    };
    expect(() => toBookShelfEvent(bad)).toThrow();
  });
});

describe("fromBookShelfEvent", () => {
  it("round-trips the Want-to-read shelf", () => {
    expect(fromBookShelfEvent(toBookShelfEvent(wantToRead))).toEqual(
      wantToRead,
    );
  });

  it("round-trips an empty shelf", () => {
    const empty: BookShelf = {
      ...wantToRead,
      bookSlugs: [],
      bookAddresses: [],
    };
    expect(fromBookShelfEvent(toBookShelfEvent(empty))).toEqual(empty);
  });
});
