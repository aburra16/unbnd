// FAILING TESTS — Story 105: the cached rows read back into a shelf set,
// Hidden Gems and Recently added included.
import { describe, expect, it } from "vitest";
import { shelfSetFromRows } from "../../src/db/shelf-set";

describe("shelfSetFromRows", () => {
  it("rebuilds every shelf in position order", () => {
    const at = new Date("2026-10-20T12:00:00Z");
    const set = shelfSetFromRows([
      { kind: "recent", position: 1, bookSlug: "r2", computedAt: at },
      { kind: "recent", position: 0, bookSlug: "r1", computedAt: at },
      { kind: "hidden-gems", position: 0, bookSlug: "g1", computedAt: at },
      { kind: "trending", position: 0, bookSlug: "t1", computedAt: at },
      { kind: "favorites", position: 0, bookSlug: "f1", computedAt: at },
      { kind: "genre:fantasy", position: 0, bookSlug: "x1", computedAt: at },
    ]);
    expect(set).toEqual({
      computedAt: at.toISOString(),
      trending: ["t1"],
      favorites: ["f1"],
      hiddenGems: ["g1"],
      recent: ["r1", "r2"],
      genres: [{ slug: "fantasy", name: "Fantasy", books: ["x1"] }],
    });
  });

  it("no rows: an honest empty set", () => {
    expect(shelfSetFromRows([])).toEqual({ computedAt: null, trending: [], favorites: [], hiddenGems: [], recent: [], genres: [] });
  });
});
