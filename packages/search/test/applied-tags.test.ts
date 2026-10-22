// FAILING TESTS — Story 105 / ADR 0094 §3: the applied-tags rule extracted
// so the labels pass and its tests share one rule.
import { describe, expect, it } from "vitest";
import {
  buildBookAssertionEventsForTest,
  buildBookTagEventForTest,
} from "./_tag-fixtures";
import { appliedTags } from "../src";

const A = "a".repeat(64);
const B = "b".repeat(64);

describe("appliedTags", () => {
  const taxonomy = [
    buildBookTagEventForTest("fantasy", "genre", "Fantasy", "normal"),
    buildBookTagEventForTest("mystery", "genre", "Mystery", "normal"),
    buildBookTagEventForTest("lyrical", "style", "Lyrical", "normal"),
    buildBookTagEventForTest("plagiarised", "signal", "Plagiarised", "accusatory"),
  ];

  it("applies tags with a net count above zero, genres apart, never an accusatory one", () => {
    const assertions = buildBookAssertionEventsForTest("orbital", [
      [A, "fantasy", 1],
      [B, "fantasy", 1],
      [A, "mystery", 1],
      [B, "mystery", -1],
      [A, "lyrical", 1],
      [A, "plagiarised", 1],
    ]);
    const out = appliedTags(taxonomy, assertions);
    expect(out.genreSlugs).toEqual(["fantasy"]);
    expect(out.names.sort()).toEqual(["Fantasy", "Lyrical"]);
  });

  it("one person's latest assertion counts once", () => {
    const assertions = buildBookAssertionEventsForTest("orbital", [
      [A, "mystery", 1, 100],
      [A, "mystery", -1, 200],
    ]);
    expect(appliedTags(taxonomy, assertions).genreSlugs).toEqual([]);
  });
});
