// Failing tests (red) for Story 22 AC-8 — the multi-relay fan-out primitive.
// ADR 0022 Implementation notes, addition to `apps/api/src/nostr/publish.ts`:
//   `publishToMany(relayUrls, event)` = Promise.all(relayUrls.map(publishEvent
//   per URL)), each wrapped so a thrown/failed single-relay publish becomes an
//   `{ ok: false, reason }` result rather than rejecting the whole batch. This
//   is the app's first WRITE to external public relays; one relay's failure must
//   not sink the others. `publishToMany` does not exist yet → import fails → red.
//
// We mock the underlying `publishEvent` so these are pure unit tests (no socket).
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";

const publishEventMock = vi.fn();
vi.mock("../../src/nostr/publish", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/nostr/publish")>();
  return { ...actual, publishEvent: (...a: unknown[]) => publishEventMock(...a) };
});

import { publishToMany } from "../../src/nostr/publish";

const EV = { id: "e1" } as SignedNostrEvent;
const RELAYS = ["wss://a", "wss://b", "wss://c"];

afterEach(() => vi.clearAllMocks());

describe("publishToMany", () => {
  it("attempts a publish to every relay in the list", async () => {
    publishEventMock.mockResolvedValue({ ok: true, id: "e1" });
    const results = await publishToMany(RELAYS, EV);
    expect(publishEventMock).toHaveBeenCalledTimes(3);
    expect(publishEventMock).toHaveBeenCalledWith("wss://a", EV);
    expect(publishEventMock).toHaveBeenCalledWith("wss://b", EV);
    expect(publishEventMock).toHaveBeenCalledWith("wss://c", EV);
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("a single relay failure does NOT sink the others (each gets its own result)", async () => {
    publishEventMock.mockImplementation(async (url: string) =>
      url === "wss://b"
        ? { ok: false, reason: "rate limited" }
        : { ok: true, id: "e1" },
    );
    const results = await publishToMany(RELAYS, EV);
    expect(results).toHaveLength(3);
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false });
  });

  it("a thrown publish is captured as an { ok: false } result, never a rejected batch", async () => {
    publishEventMock.mockImplementation(async (url: string) => {
      if (url === "wss://c") throw new Error("socket boom");
      return { ok: true, id: "e1" };
    });
    const results = await publishToMany(RELAYS, EV);
    expect(results).toHaveLength(3);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("returns an empty array for an empty relay list (no publish attempts)", async () => {
    const results = await publishToMany([], EV);
    expect(results).toEqual([]);
    expect(publishEventMock).not.toHaveBeenCalled();
  });
});
