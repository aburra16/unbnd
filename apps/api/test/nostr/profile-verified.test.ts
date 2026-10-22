// Story 110 / ADR 0098 §2–§3: profile reads keep only verified events from the
// author asked for, and a display lookup stops waiting once one relay answers.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { fetchProfileMeta, fetchRawKind0, fetchRawKind3, fetchWriteRelays } from "../../src/nostr/profile";

const sk = generateSecretKey();
const AUTHOR = getPublicKey(sk);
const other = generateSecretKey();

const signed = (kind: number, content: unknown, created_at: number, key = sk) =>
  finalizeEvent({ kind, created_at, tags: [], content: JSON.stringify(content) }, key) as unknown as SignedNostrEvent;

describe("profile reads keep only verified events from the author", () => {
  it("drops an event with a bad signature, even when it is the newest", async () => {
    const good = signed(0, { name: "real" }, 100);
    const forged = { ...signed(0, { name: "forged" }, 200), sig: "0".repeat(128) };
    const m = await fetchProfileMeta(["wss://a", "wss://b"], AUTHOR, async (url) => (url === "wss://a" ? [good] : [forged]));
    expect(m?.name).toBe("real");
  });

  it("drops a validly signed event by someone else", async () => {
    const good = signed(0, { name: "real" }, 100);
    const impostor = signed(0, { name: "impostor" }, 200, other);
    const m = await fetchProfileMeta(["wss://a"], AUTHOR, async () => [good, impostor]);
    expect(m?.name).toBe("real");
  });

  it("the raw reads before a write verify too", async () => {
    const good = signed(0, { name: "real", lud16: "x@y" }, 100);
    const forged = { ...signed(0, { name: "forged" }, 200), sig: "0".repeat(128) };
    const raw = await fetchRawKind0(["wss://a"], AUTHOR, async () => [good, forged]);
    expect(raw.content).toMatchObject({ name: "real" });
    const k3good = finalizeEvent({ kind: 3, created_at: 100, tags: [["p", "b".repeat(64)]], content: "" }, sk) as unknown as SignedNostrEvent;
    const k3bad = { ...k3good, created_at: 300, sig: "0".repeat(128) } as SignedNostrEvent;
    const k3 = await fetchRawKind3(["wss://a"], AUTHOR, async () => [k3good, k3bad]);
    expect(k3.createdAt).toBe(100);
  });
});

describe("write relays (review round 1)", () => {
  it("come only from a verified kind 10002", async () => {
    const list = finalizeEvent({ kind: 10002, created_at: 100, tags: [["r", "wss://mine.example"]], content: "" }, sk) as unknown as SignedNostrEvent;
    const other = finalizeEvent({ kind: 1, created_at: 200, tags: [["r", "wss://not-a-list.example"]], content: "" }, sk) as unknown as SignedNostrEvent;
    expect(await fetchWriteRelays(["wss://a"], AUTHOR, async () => [list, other])).toEqual(["wss://mine.example"]);
  });
});

describe("a display lookup does not wait on a dead relay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("finishes shortly after the first relay returns a profile", async () => {
    const good = signed(0, { name: "real", picture: "https://x/p.jpg" }, 100);
    let done = false;
    const p = fetchProfileMeta(["wss://dead", "wss://live"], AUTHOR, (url) =>
      url === "wss://dead" ? new Promise<SignedNostrEvent[]>(() => {}) : Promise.resolve([good]),
    ).then((m) => {
      done = true;
      return m;
    });
    await vi.advanceTimersByTimeAsync(399);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
    expect((await p)?.picture).toBe("https://x/p.jpg");
  });

  it("takes a newer profile that arrives within the grace", async () => {
    const older = signed(0, { name: "older" }, 100);
    const newer = signed(0, { name: "newer" }, 200);
    const p = fetchProfileMeta(["wss://fast", "wss://slow", "wss://dead"], AUTHOR, (url) =>
      url === "wss://fast"
        ? Promise.resolve([older])
        : url === "wss://slow"
          ? new Promise<SignedNostrEvent[]>((r) => setTimeout(() => r([newer]), 200))
          : new Promise<SignedNostrEvent[]>(() => {}),
    );
    await vi.advanceTimersByTimeAsync(500);
    expect((await p)?.name).toBe("newer");
  });

  it("gives up at the timeout when no relay answers", async () => {
    let done = false;
    const p = fetchProfileMeta(["wss://dead"], AUTHOR, () => new Promise<SignedNostrEvent[]>(() => {})).then((m) => {
      done = true;
      return m;
    });
    await vi.advanceTimersByTimeAsync(2999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toBeNull();
  });

  it("the raw read before a write waits for every relay", async () => {
    const older = signed(0, { name: "older" }, 100);
    const newer = signed(0, { name: "newer" }, 200);
    let done = false;
    const p = fetchRawKind0(["wss://fast", "wss://slow"], AUTHOR, (url) =>
      url === "wss://fast" ? Promise.resolve([older]) : new Promise<SignedNostrEvent[]>((r) => setTimeout(() => r([newer]), 1500)),
    ).then((r) => {
      done = true;
      return r;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect((await p).content).toMatchObject({ name: "newer" });
  });
});
