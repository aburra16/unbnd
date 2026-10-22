// Story 110 / ADR 0098 §4: the server-side profile cache.
import { describe, expect, it, vi } from "vitest";
import { createProfileCache } from "../../src/profile/cache";
import type { ProfileMeta } from "../../src/nostr/profile";

const MIN = 60_000;
const PK = "a".repeat(64);
const PIC: ProfileMeta = { name: "avi", picture: "https://x/p.gif" };

function setup(resolve: (hex: string) => Promise<ProfileMeta | null>, max?: number) {
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms: number) => (t += ms) };
  const fn = vi.fn(resolve);
  const cache = createProfileCache({ resolve: fn, now: clock.now, ...(max ? { max } : {}) });
  return { cache, fn, clock };
}

describe("the profile cache", () => {
  it("serves a profile found in the last 10 minutes without a relay read", async () => {
    const { cache, fn, clock } = setup(async () => PIC);
    expect(await cache.get(PK)).toEqual(PIC);
    clock.advance(9 * MIN);
    expect(await cache.get(PK)).toEqual(PIC);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("serves an older profile at once and refreshes it once in the background", async () => {
    let answer: ProfileMeta | null = PIC;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { cache, fn, clock } = setup(async () => {
      if (fn.mock.calls.length > 1) await gate;
      return answer;
    });
    await cache.get(PK);
    clock.advance(11 * MIN);
    answer = { name: "avi", picture: "https://x/new.jpg" };
    expect(await cache.get(PK)).toEqual(PIC);
    expect(await cache.get(PK)).toEqual(PIC);
    expect(fn).toHaveBeenCalledTimes(2);
    release();
    await vi.waitFor(async () => expect(await cache.get(PK)).toEqual({ name: "avi", picture: "https://x/new.jpg" }));
  });

  it("a refresh that finds nothing, or fails, keeps the profile", async () => {
    let mode: "found" | "empty" | "fail" = "found";
    const { cache, clock } = setup(async () => {
      if (mode === "fail") throw new Error("relays down");
      return mode === "found" ? PIC : null;
    });
    await cache.get(PK);
    for (const m of ["empty", "fail"] as const) {
      mode = m;
      clock.advance(11 * MIN);
      await cache.get(PK);
      await new Promise((r) => setTimeout(r, 0)); // let the background refresh settle
      expect(await cache.get(PK)).toEqual(PIC);
    }
  });

  it("remembers 'no profile' for a minute", async () => {
    const { cache, fn, clock } = setup(async () => null);
    expect(await cache.get(PK)).toBeNull();
    clock.advance(59_000);
    expect(await cache.get(PK)).toBeNull();
    expect(fn).toHaveBeenCalledTimes(1);
    clock.advance(2_000);
    await cache.get(PK);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("concurrent first lookups for one person share a read", async () => {
    const { cache, fn } = setup(async () => PIC);
    const [a, b] = await Promise.all([cache.get(PK), cache.get(PK)]);
    expect(a).toEqual(PIC);
    expect(b).toEqual(PIC);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("a first lookup that fails is not remembered", async () => {
    let fail = true;
    const { cache, fn } = setup(async () => {
      if (fail) throw new Error("down");
      return PIC;
    });
    expect(await cache.get(PK)).toBeNull();
    fail = false;
    expect(await cache.get(PK)).toEqual(PIC);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("a profile written through Unbnd replaces the entry", async () => {
    const { cache, fn } = setup(async () => PIC);
    await cache.get(PK);
    cache.set(PK, { name: "renamed" });
    expect(await cache.get(PK)).toEqual({ name: "renamed" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is bounded, least recently used out first", async () => {
    const { cache, fn } = setup(async (hex) => ({ name: hex.slice(0, 1) }), 2);
    const [A, B, C] = ["a", "b", "c"].map((c) => c.repeat(64));
    await cache.get(A!);
    await cache.get(B!);
    await cache.get(A!); // A is now the most recent
    await cache.get(C!); // B goes
    expect(cache.size()).toBe(2);
    await cache.get(A!);
    expect(fn).toHaveBeenCalledTimes(3);
    await cache.get(B!);
    expect(fn).toHaveBeenCalledTimes(4);
  });
});
