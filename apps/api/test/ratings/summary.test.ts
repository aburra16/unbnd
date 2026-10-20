import { describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { summarizeRatings } from "../../src/ratings/summary";
import { signedRating, LIBRARIAN } from "./_fixtures";

/** The catalog and clock the review rules read against (Story 99). */
const SCOPE = { librarian: LIBRARIAN, now: Math.floor(Date.now() / 1000) + 10 };

function events(...evs: { event: unknown }[]): SignedNostrEvent[] {
  return evs.map((e) => e.event) as SignedNostrEvent[];
}

describe("summarizeRatings", () => {
  it("returns a raw count and raw arithmetic mean", () => {
    const a = signedRating({ score: 5 });
    const b = signedRating({ score: 3 });
    const s = summarizeRatings(events(a, b), SCOPE);
    expect(s.count).toBe(2);
    expect(s.average).toBe(4);
  });

  it("dedups by rater, keeping the latest rating", () => {
    const sk = generateSecretKey();
    const older = signedRating({ sk, score: 2, createdAt: 1000 });
    const newer = signedRating({ sk, score: 5, createdAt: 2000 });
    const s = summarizeRatings(events(older, newer), SCOPE);
    expect(s.count).toBe(1);
    expect(s.average).toBe(5);
  });

  it("reports an empty book honestly: count 0, average null", () => {
    const s = summarizeRatings([], SCOPE);
    expect(s.count).toBe(0);
    expect(s.average).toBeNull();
    expect(s.ratings).toEqual([]);
  });

  it("exposes npub, never the hex pubkey, and carries no trust field", () => {
    const a = signedRating({ score: 4, reviewText: "Good." });
    const s = summarizeRatings(events(a), SCOPE);
    expect(s.ratings[0]!.npub.startsWith("npub1")).toBe(true);
    expect(s.ratings[0]!.npub).not.toMatch(/^[0-9a-f]{64}$/);
    expect(s.ratings[0]!.score).toBe(4);
    // No trust-weighted / GrapeRank field leaks into the summary.
    expect(JSON.stringify(s)).not.toMatch(/weight|graperank|trust/i);
  });
});
