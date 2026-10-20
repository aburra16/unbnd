// FAILING TESTS — Story 101 / ADR 0092 §1: the crowd is reviewers with any
// standing (weight above zero), each counted once.
import { describe, expect, it } from "vitest";
import { dedupeRatings, weightedRatings } from "../src";

const LIB = "1".repeat(63) + "a";
const BOOK = `39999:${LIB}:ol-orbital`;
const NOW = 1_790_000_000;
const key = (c: string) => c.repeat(64);

let seq = 0;
function review(pubkey: string, stars: number | null) {
  const tags: string[][] = [["d", `book:${BOOK}`], ["a", BOOK, "wss://dcosl.brainstorm.world"], ["m", "book"]];
  if (stars !== null) tags.push(["s", String(stars)]);
  seq++;
  return {
    id: seq.toString(16).padStart(64, "0"),
    pubkey,
    created_at: NOW - 100,
    kind: 34259,
    tags,
    content: stars === null ? "Words only." : "",
    sig: "f".repeat(128),
  };
}
const fold = (events: unknown[], weights: Record<string, number>) =>
  weightedRatings(
    dedupeRatings(events as never, { librarian: LIB, now: NOW }),
    new Map(Object.entries(weights)),
    "npub1x",
  );

describe("the crowd on the trusted view (ADR 0092 §1)", () => {
  it("counts everyone with weight above zero once each, the counted reviewers included", () => {
    const w = fold(
      [review(key("a"), 5), review(key("b"), 5), review(key("c"), 1), review(key("d"), 3)],
      { [key("a")]: 0.9, [key("b")]: 0.3, [key("c")]: 0.02, [key("d")]: 0.01 },
    );
    expect(w!.crowdCount).toBe(4);
    expect(w!.crowdAverage).toBeCloseTo((5 + 5 + 1 + 3) / 4, 6);
  });

  it("a reviewer with no standing never enters the crowd", () => {
    const strangers = [key("e"), key("f"), key("0")].map((k) => review(k, 1));
    const w = fold([review(key("a"), 5), review(key("b"), 4), ...strangers], { [key("a")]: 0.9, [key("b")]: 0.6 });
    expect(w!.crowdCount).toBe(2);
    expect(w!.crowdAverage).toBeCloseTo(4.5, 6);
  });

  it("a review without stars is outside the crowd mean", () => {
    const w = fold([review(key("a"), 4), review(key("b"), null)], { [key("a")]: 0.9, [key("b")]: 0.04 });
    expect(w!.crowdCount).toBe(1);
    expect(w!.crowdAverage).toBe(4);
  });

  it("with nobody counted there is still no trusted view, crowd or not", () => {
    expect(fold([review(key("c"), 5)], { [key("c")]: 0.04 })).toBeNull();
  });
});
