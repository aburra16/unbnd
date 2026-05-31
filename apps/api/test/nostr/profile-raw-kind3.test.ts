// Failing tests (red) for Story 23 — the RAW kind-3 read helper the safe-merge
// follow write needs. ADR 0023 Decision 1 / Implementation notes:
// `apps/api/src/nostr/profile.ts` gains, alongside the kind-0 helpers:
//   - `fetchRawKind3(relays, pubkeyHex, queryFn?)` — same best-effort fan-out +
//     3s timeout + limit:1 as `fetchRawKind0`, but returns the freshest event's
//     UNTOUCHED `tags` array + `content` string + `createdAt` (the follow data
//     lives in `tags`, not `content`). `{ tags: null, content: "", createdAt:
//     null }` when no relay has a kind-3. Reuses the newest-by-created_at
//     selector (kind-parametric or a kind-3 twin of pickNewestKind0).
//
// `fetchRawKind3` does not exist yet → the import fails to resolve → red. The
// critical contract: the relay-hint/petname positions and any non-`p` tags come
// back verbatim, so the downstream merge can preserve the whole follow graph.
import { describe, expect, it, vi } from "vitest";
import { fetchRawKind3 } from "../../src/nostr/profile";
import type { SignedNostrEvent } from "@unbnd/schemas";

function k3(tags: string[][], created_at = 1, content = ""): SignedNostrEvent {
  return {
    id: "x",
    pubkey: "a".repeat(64),
    sig: "s",
    kind: 3,
    created_at,
    tags,
    content,
  } as SignedNostrEvent;
}

describe("fetchRawKind3", () => {
  it("fans out across relays and returns the FRESHEST event's tags + content + createdAt", async () => {
    const queryFn = vi.fn(async (url: string) => {
      if (url.includes("dead")) throw new Error("timeout");
      if (url.includes("primal"))
        return [k3([["p", "b".repeat(64), "wss://r", "bob"]], 300, "legacy")];
      return [k3([["p", "c".repeat(64)]], 100)];
    });
    const got = await fetchRawKind3(
      ["wss://dead", "wss://relay.primal.net", "wss://nos.lol"],
      "a".repeat(64),
      queryFn as never,
    );
    expect(got.tags).toEqual([["p", "b".repeat(64), "wss://r", "bob"]]);
    expect(got.content).toBe("legacy");
    expect(got.createdAt).toBe(300);
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it("preserves relay-hints, petnames, AND non-p tags verbatim (no projection/loss)", async () => {
    const rich = [
      ["p", "b".repeat(64)],
      ["p", "c".repeat(64), "wss://relay.damus.io"],
      ["p", "d".repeat(64), "wss://nos.lol", "alice"],
      ["t", "books"],
    ];
    const got = await fetchRawKind3(["wss://a"], "a".repeat(64), async () => [
      k3(rich, 200),
    ]);
    expect(got.tags).toEqual(rich);
  });

  it("returns null tags + '' content + null createdAt when no relay has a kind-3", async () => {
    const got = await fetchRawKind3(["wss://a"], "a".repeat(64), async () => []);
    expect(got.tags).toBeNull();
    expect(got.content).toBe("");
    expect(got.createdAt).toBeNull();
  });

  it("ignores non-kind-3 events when choosing the freshest", async () => {
    const got = await fetchRawKind3(["wss://a"], "a".repeat(64), async () => [
      { ...k3([["p", "z".repeat(64)]], 999), kind: 1 } as SignedNostrEvent,
      k3([["p", "b".repeat(64)]], 5),
    ]);
    expect(got.tags).toEqual([["p", "b".repeat(64)]]);
    expect(got.createdAt).toBe(5);
  });
});
