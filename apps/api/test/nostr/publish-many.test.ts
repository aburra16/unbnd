// Failing tests (red) for Story 22 AC-8 — the multi-relay fan-out primitive.
// ADR 0022 Implementation notes, addition to `apps/api/src/nostr/publish.ts`:
//   `publishToMany(relayUrls, event, publish = publishEvent)` =
//   Promise.all(relayUrls.map(publish per URL)), each wrapped so a thrown/failed
//   single-relay publish becomes an `{ ok: false, reason }` result rather than
//   rejecting the whole batch. This is the app's first WRITE to external public
//   relays; one relay's failure must not sink the others.
//
// The per-relay publisher is an INJECTED 3rd argument (defaulting to the real
// `publishEvent`). The route/index `publishKind0` keeps calling the 2-arg form
// and gets the default; tests pass a local spy directly. We inject rather than
// `vi.mock` the module because `publishToMany`'s intra-module call to
// `publishEvent` uses the real in-module reference, which an export-level mock
// cannot intercept (a known vitest/ESM limitation). Against the CURRENT 2-arg
// source the injected spy is ignored → these are red for the right reason.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";

import { publishToMany } from "../../src/nostr/publish";

const EV = { id: "e1" } as SignedNostrEvent;
const RELAYS = ["wss://a", "wss://b", "wss://c"];

afterEach(() => vi.clearAllMocks());

describe("publishToMany", () => {
  it("attempts a publish to every relay in the list", async () => {
    const publishEventMock = vi.fn().mockResolvedValue({ ok: true, id: "e1" });
    const results = await publishToMany(RELAYS, EV, publishEventMock);
    expect(publishEventMock).toHaveBeenCalledTimes(3);
    expect(publishEventMock).toHaveBeenCalledWith("wss://a", EV);
    expect(publishEventMock).toHaveBeenCalledWith("wss://b", EV);
    expect(publishEventMock).toHaveBeenCalledWith("wss://c", EV);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("a single relay failure does NOT sink the others (each gets its own result)", async () => {
    const publishEventMock = vi.fn(async (url: string) =>
      url === "wss://b"
        ? { ok: false, reason: "rate limited" }
        : { ok: true, id: "e1" },
    );
    const results = await publishToMany(RELAYS, EV, publishEventMock);
    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false });
  });

  it("a thrown publish is captured as an { ok: false } result, never a rejected batch", async () => {
    const publishEventMock = vi.fn(async (url: string) => {
      if (url === "wss://c") throw new Error("socket boom");
      return { ok: true, id: "e1" };
    });
    const results = await publishToMany(RELAYS, EV, publishEventMock);
    expect(results).toHaveLength(3);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("returns an empty array for an empty relay list (no publish attempts)", async () => {
    const publishEventMock = vi.fn();
    const results = await publishToMany([], EV, publishEventMock);
    expect(results).toEqual([]);
    expect(publishEventMock).not.toHaveBeenCalled();
  });
});
