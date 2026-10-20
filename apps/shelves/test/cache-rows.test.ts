// FAILING TESTS — Story 105: every computed shelf reaches the cache, Recently
// added included. Hidden Gems were computed (Story 71) but never written.
import { describe, expect, it } from "vitest";
import { toRows } from "../src/cache";

describe("toRows", () => {
  it("writes each shelf in order under its kind", () => {
    const rows = toRows("h".repeat(64), {
      trending: [{ bookSlug: "t1" }],
      favorites: [{ bookSlug: "f1" }],
      hiddenGems: [{ bookSlug: "g1" }, { bookSlug: "g2" }],
      recent: [{ bookSlug: "r1" }, { bookSlug: "r2" }],
      genres: [{ slug: "fantasy", name: "Fantasy", books: [{ bookSlug: "x1" }] }],
    });
    expect(rows.map((r) => `${r.kind}:${r.position}:${r.book_slug}`)).toEqual([
      "trending:0:t1",
      "favorites:0:f1",
      "hidden-gems:0:g1",
      "hidden-gems:1:g2",
      "recent:0:r1",
      "recent:1:r2",
      "genre:fantasy:0:x1",
    ]);
  });
});
