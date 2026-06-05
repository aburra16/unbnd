// Red set for Story 63 (ADR 0062) — the success-signalling relay read
// `queryRelayUrlChecked` + the `NostrFilter` `ids`/`since` additions.
//
// ADR 0062 Decision §2: `queryRelayUrl` resolves-on-error, so a failed/timed-out
// read is indistinguishable from "0 events = in-sync" — the load-bearing flaw the
// sync-health check must avoid. The resolution is a thin success-signalling
// variant:
//
//   queryRelayUrlChecked(relayUrl, filter, timeoutMs):
//     Promise<{ ok: boolean; events: SignedNostrEvent[] }>
//       → { ok: true,  events }   on EOSE (read demonstrably succeeded)
//       → { ok: false, events: [] } on timeout / socket error
//
// `queryRelayUrl` / `queryEvents` stay byte-identical (resolve-on-error,
// returning a bare array). The `NostrFilter` type gains `ids?: string[]` and
// `since?: number` (standard nostr filter fields it simply didn't list), and the
// query path forwards them into the REQ frame.
//
// The relay/WebSocket is mocked via `vi.mock("ws")` — a tiny in-memory fake that
// lets a test drive open → message(s) → EOSE / error / timeout. No real network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";

// --- ws mock -------------------------------------------------------------------
// One controllable fake socket per construction. Tests reach the latest instance
// via `lastSocket()` and fire its handlers to simulate relay behavior. The class
// is defined INSIDE the (hoisted) vi.mock factory to avoid the hoisting TDZ; the
// constructed instances are tracked on the mocked module's exported registry.
type Handler = (...args: unknown[]) => void;
type FakeWebSocket = {
  url: string;
  sent: string[];
  terminated: boolean;
  closed: boolean;
  on(event: string, cb: Handler): FakeWebSocket;
  send(data: string): void;
  close(): void;
  terminate(): void;
  emit(event: string, ...args: unknown[]): void;
};

vi.mock("ws", () => {
  const instances: FakeWebSocket[] = [];
  class WebSocket implements FakeWebSocket {
    static instances = instances;
    url: string;
    sent: string[] = [];
    terminated = false;
    closed = false;
    private handlers: Record<string, Handler[]> = {};
    constructor(url: string) {
      this.url = url;
      instances.push(this);
    }
    on(event: string, cb: Handler) {
      (this.handlers[event] ??= []).push(cb);
      return this;
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed = true;
    }
    terminate() {
      this.terminated = true;
    }
    emit(event: string, ...args: unknown[]) {
      for (const cb of this.handlers[event] ?? []) cb(...args);
    }
  }
  return { WebSocket };
});

// Imported AFTER the mock is registered.
import { WebSocket as MockedWebSocket } from "ws";
import {
  queryRelayUrl,
  queryRelayUrlChecked,
  type NostrFilter,
} from "../../src/nostr/query";

const SUB_ID = "unbnd-read";

function instances(): FakeWebSocket[] {
  return (MockedWebSocket as unknown as { instances: FakeWebSocket[] }).instances;
}

function lastSocket(): FakeWebSocket {
  const s = instances().at(-1);
  if (!s) throw new Error("no FakeWebSocket constructed");
  return s;
}

function ev(id: string): SignedNostrEvent {
  return {
    id,
    created_at: 1,
    kind: 39999,
    pubkey: "p",
    sig: "s",
    tags: [],
    content: "",
  } as SignedNostrEvent;
}

// Drive a freshly-constructed socket: open it, then run `script` against it.
async function driveLatest(script: (ws: FakeWebSocket) => void) {
  // Let the constructor + `.on(...)` registrations run.
  await Promise.resolve();
  const ws = lastSocket();
  ws.emit("open");
  script(ws);
}

describe("queryRelayUrlChecked — success signalling", () => {
  beforeEach(() => {
    instances().length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves { ok:true, events } when EOSE is seen", async () => {
    const promise = queryRelayUrlChecked("ws://x", { kinds: [39999] }, 5000);
    await driveLatest((ws) => {
      ws.emit("message", JSON.stringify(["EVENT", SUB_ID, ev("a")]));
      ws.emit("message", JSON.stringify(["EVENT", SUB_ID, ev("b")]));
      ws.emit("message", JSON.stringify(["EOSE", SUB_ID]));
    });
    const out = await promise;
    expect(out.ok).toBe(true);
    expect(out.events.map((e: SignedNostrEvent) => e.id)).toEqual(["a", "b"]);
  });

  it("resolves { ok:false, events:[] } on a socket error", async () => {
    const promise = queryRelayUrlChecked("ws://x", { kinds: [39999] }, 5000);
    await driveLatest((ws) => {
      ws.emit("error", new Error("ECONNREFUSED"));
    });
    const out = await promise;
    expect(out.ok).toBe(false);
    expect(out.events).toEqual([]);
  });

  it("resolves { ok:false, events:[] } on timeout (no EOSE within the budget)", async () => {
    const promise = queryRelayUrlChecked("ws://x", { kinds: [39999] }, 5000);
    await driveLatest((ws) => {
      // events arrive but EOSE never does
      ws.emit("message", JSON.stringify(["EVENT", SUB_ID, ev("a")]));
    });
    await vi.advanceTimersByTimeAsync(5000);
    const out = await promise;
    expect(out.ok).toBe(false);
    expect(out.events).toEqual([]);
  });
});

describe("NostrFilter ids/since — forwarded into the REQ frame", () => {
  beforeEach(() => {
    instances().length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("forwards ids and since on the REQ filter via queryRelayUrlChecked", async () => {
    const filter: NostrFilter = {
      kinds: [39999],
      ids: ["id-1", "id-2"],
      since: 1234,
    };
    const promise = queryRelayUrlChecked("ws://x", filter, 5000);
    await driveLatest((ws) => {
      ws.emit("message", JSON.stringify(["EOSE", SUB_ID]));
    });
    await promise;

    const ws = lastSocket();
    const req = JSON.parse(ws.sent[0]) as [string, string, NostrFilter];
    expect(req[0]).toBe("REQ");
    expect(req[2].ids).toEqual(["id-1", "id-2"]);
    expect(req[2].since).toBe(1234);
  });
});

// Pins that the existing one-shot read is UNCHANGED: it still resolves (never
// rejects) on a socket error, returning a bare array.
describe("queryRelayUrl — unchanged resolve-on-error behavior", () => {
  beforeEach(() => {
    instances().length = 0;
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("resolves with the collected (bare) array on EOSE", async () => {
    const promise = queryRelayUrl("ws://x", { kinds: [39999] }, 5000);
    await driveLatest((ws) => {
      ws.emit("message", JSON.stringify(["EVENT", SUB_ID, ev("a")]));
      ws.emit("message", JSON.stringify(["EOSE", SUB_ID]));
    });
    const out = await promise;
    expect(Array.isArray(out)).toBe(true);
    expect(out.map((e) => e.id)).toEqual(["a"]);
  });

  it("resolves (does not throw) with an empty array on a socket error", async () => {
    const promise = queryRelayUrl("ws://x", { kinds: [39999] }, 5000);
    await driveLatest((ws) => {
      ws.emit("error", new Error("boom"));
    });
    await expect(promise).resolves.toEqual([]);
  });
});
