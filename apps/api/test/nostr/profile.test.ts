import { describe, expect, it, vi } from "vitest";
import { parseKind0, fetchProfileMeta } from "../../src/nostr/profile";
import type { SignedNostrEvent } from "@unbnd/schemas";

function k0(content: unknown, created_at = 1): SignedNostrEvent {
  return {
    id: "x", pubkey: "a".repeat(64), sig: "s", kind: 0, created_at,
    tags: [], content: typeof content === "string" ? content : JSON.stringify(content),
  } as SignedNostrEvent;
}

describe("parseKind0", () => {
  it("extracts name/display_name/picture/nip05/about", () => {
    const m = parseKind0([
      k0({ name: "satoshi", display_name: "Satoshi", picture: "https://x/p.jpg", nip05: "s@x.com", about: "hi" }),
    ]);
    expect(m).toEqual({
      name: "satoshi", displayName: "Satoshi", picture: "https://x/p.jpg", nip05: "s@x.com", about: "hi",
    });
  });

  it("picks the newest kind-0 across events", () => {
    const m = parseKind0([
      k0({ name: "old" }, 100),
      k0({ name: "new" }, 200),
      k0({ name: "older" }, 50),
    ]);
    expect(m?.name).toBe("new");
  });

  it("falls back to legacy displayName key", () => {
    expect(parseKind0([k0({ displayName: "Legacy" })])?.displayName).toBe("Legacy");
  });

  it("returns null on malformed JSON, no kind-0, or empty content", () => {
    expect(parseKind0([k0("{not json")])).toBeNull();
    expect(parseKind0([{ ...k0({ name: "x" }), kind: 1 } as SignedNostrEvent])).toBeNull();
    expect(parseKind0([])).toBeNull();
    expect(parseKind0([k0({ foo: "bar" })])).toBeNull(); // no recognised fields
  });
});

describe("fetchProfileMeta", () => {
  it("fans out across relays and returns the newest, ignoring failures", async () => {
    const queryFn = vi.fn(async (url: string) => {
      if (url.includes("dead")) throw new Error("timeout");
      if (url.includes("primal")) return [k0({ name: "newer" }, 300)];
      return [k0({ name: "older" }, 100)];
    });
    const m = await fetchProfileMeta(
      ["wss://dead", "wss://relay.primal.net", "wss://nos.lol"],
      "a".repeat(64),
      queryFn as never,
    );
    expect(m?.name).toBe("newer");
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it("returns null when no relay has a kind-0", async () => {
    const m = await fetchProfileMeta(["wss://a"], "a".repeat(64), async () => []);
    expect(m).toBeNull();
  });
});
