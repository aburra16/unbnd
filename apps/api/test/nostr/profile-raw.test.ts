// Failing tests (red) for Story 22 — the RAW kind-0 read helpers that the
// safe-merge write path needs. ADR 0022 Decision 1 / Implementation notes:
// `apps/api/src/nostr/profile.ts` gains, alongside the lossy `parseKind0`:
//   - `pickNewestKind0(events)` — newest-by-created_at selector (null when none).
//   - `parseRawKind0Content(event)` — JSON.parse of the content, returned
//     UNTOUCHED (every field, including ones Unbnd has no schema for). null on
//     no-event / parse failure.
//   - `fetchRawKind0(relays, pubkeyHex, queryFn?)` — same fan-out as
//     fetchProfileMeta, returns `{ content, createdAt }` for the freshest event.
//
// These do not exist yet, so the import below fails to resolve → red. The
// critical contract here is the "trap": the lossy parseKind0 DROPS unknown
// fields (lud16, banner, website, …); the raw read must PRESERVE them, or the
// downstream merge clobbers the user's profile (AC-3).
import { describe, expect, it, vi } from "vitest";
import {
  parseKind0,
  pickNewestKind0,
  parseRawKind0Content,
  fetchRawKind0,
} from "../../src/nostr/profile";
import type { SignedNostrEvent } from "@unbnd/schemas";

function k0(content: unknown, created_at = 1): SignedNostrEvent {
  return {
    id: "x",
    pubkey: "a".repeat(64),
    sig: "s",
    kind: 0,
    created_at,
    tags: [],
    content: typeof content === "string" ? content : JSON.stringify(content),
  } as SignedNostrEvent;
}

describe("pickNewestKind0", () => {
  it("picks the kind-0 with the highest created_at", () => {
    const newest = k0({ name: "new" }, 300);
    const got = pickNewestKind0([
      k0({ name: "old" }, 100),
      newest,
      k0({ name: "older" }, 50),
    ]);
    expect(got?.created_at).toBe(300);
    expect(got?.content).toBe(newest.content);
  });

  it("ignores non-kind-0 events", () => {
    const got = pickNewestKind0([
      { ...k0({ name: "x" }, 999), kind: 1 } as SignedNostrEvent,
      k0({ name: "y" }, 5),
    ]);
    expect(got?.created_at).toBe(5);
  });

  it("returns null when there is no kind-0", () => {
    expect(pickNewestKind0([])).toBeNull();
    expect(
      pickNewestKind0([{ ...k0({ name: "x" }), kind: 1 } as SignedNostrEvent]),
    ).toBeNull();
  });
});

describe("parseRawKind0Content — preserves EVERY field, including unknown ones", () => {
  it("returns the raw content object with all fields untouched", () => {
    const raw = {
      name: "mira",
      about: "writes things",
      picture: "https://x/p.jpg",
      website: "https://mira.example",
      lud16: "mira@walletofsatoshi.com",
      banner: "https://x/banner.jpg",
      nip05: "mira@example.com",
      // A field Unbnd has no schema for.
      myCustomClientField: { nested: true, n: 7 },
    };
    const got = parseRawKind0Content(k0(raw));
    expect(got).toEqual(raw);
  });

  it("the raw read keeps fields the lossy parseKind0 SILENTLY DROPS (the AC-3 trap)", () => {
    // lud16 / banner / website are NOT in ProfileMeta — parseKind0 drops them.
    const ev = k0({ name: "mira", lud16: "mira@wallet.com", banner: "https://x/b" });
    const lossy = parseKind0([ev]) as Record<string, unknown>;
    expect(lossy).not.toHaveProperty("lud16");
    expect(lossy).not.toHaveProperty("banner");

    const raw = parseRawKind0Content(ev);
    expect(raw?.lud16).toBe("mira@wallet.com");
    expect(raw?.banner).toBe("https://x/b");
  });

  it("returns null on a null event", () => {
    expect(parseRawKind0Content(null)).toBeNull();
  });

  it("returns null on malformed JSON content", () => {
    expect(parseRawKind0Content(k0("{not json"))).toBeNull();
  });
});

describe("fetchRawKind0", () => {
  it("fans out across relays and returns the freshest content + its createdAt", async () => {
    const queryFn = vi.fn(async (url: string) => {
      if (url.includes("dead")) throw new Error("timeout");
      if (url.includes("primal")) return [k0({ name: "newer", lud16: "x@y" }, 300)];
      return [k0({ name: "older" }, 100)];
    });
    const got = await fetchRawKind0(
      ["wss://dead", "wss://relay.primal.net", "wss://nos.lol"],
      "a".repeat(64),
      queryFn as never,
    );
    expect(got.content).toEqual({ name: "newer", lud16: "x@y" });
    expect(got.createdAt).toBe(300);
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it("returns null content + null createdAt when no relay has a kind-0", async () => {
    const got = await fetchRawKind0(["wss://a"], "a".repeat(64), async () => []);
    expect(got.content).toBeNull();
    expect(got.createdAt).toBeNull();
  });
});
