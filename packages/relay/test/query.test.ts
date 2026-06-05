// NEW for Story 59 (ADR 0058 §Q3): a relay-layer unit test for the one-shot
// `REQ` read folded into the union `RelayConnection`. The promoter's local
// relay.ts carried `query` but had no relay-layer test; this adds that coverage
// in the audited package. Nothing is weakened — it is purely new.
//
// Pins (ADR 0058 §Q1):
//   - `query(filter, timeoutMs?)` sends `["REQ", subId, filter]` with the filter
//     passed verbatim.
//   - `EVENT` frames for that subId accumulate into the result array.
//   - `EOSE` resolves the accumulated `SignedNostrEvent[]` and sends
//     `["CLOSE", subId]`.
//   - the bounded timeout resolves whatever has accumulated (`[]` if nothing).
//   - `connectResilientRelay.query` is a thin PASS-THROUGH: it delegates to the
//     current connection's `query` with NO reconnect/retry on a read.
//
// RED reason (Story 59): `../src/connect`, `../src/resilient`, `../src/types`
// do NOT exist yet — the Implementer creates them. The imports fail to resolve,
// so every test fails with a readable module-not-found, not a tsc wall.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRelay } from "../src/connect";
import { connectResilientRelay } from "../src/resilient";
import type { RelayConnection, RelayFilter } from "../src/types";
import type { SignedNostrEvent } from "@unbnd/schemas";

type Handler = (...args: unknown[]) => void;

/**
 * The same minimal fake WebSocket as the publish suite, extended with helpers to
 * emit `EVENT` / `EOSE` frames for a subscription. No real socket, no network.
 */
function fakeWebSocket() {
  const handlers = new Map<string, Handler[]>();
  const sent: string[] = [];

  const add = (ev: string, fn: Handler) => {
    const list = handlers.get(ev) ?? [];
    list.push(fn);
    handlers.set(ev, list);
  };
  const emit = (ev: string, ...args: unknown[]) => {
    for (const fn of handlers.get(ev) ?? []) fn(...args);
  };

  const ws = {
    on: vi.fn((ev: string, fn: Handler) => add(ev, fn)),
    once: vi.fn((ev: string, fn: Handler) => {
      const wrap: Handler = (...a) => {
        const list = handlers.get(ev) ?? [];
        handlers.set(
          ev,
          list.filter((h) => h !== wrap),
        );
        fn(...a);
      };
      add(ev, wrap);
    }),
    send: vi.fn((data: string) => {
      sent.push(data);
    }),
    close: vi.fn(),

    // test helpers
    sent,
    emitOpen: () => emit("open"),
    emitMessage: (payload: unknown) => emit("message", Buffer.from(JSON.stringify(payload))),
    emitEvent: (subId: string, event: SignedNostrEvent) =>
      emit("message", Buffer.from(JSON.stringify(["EVENT", subId, event]))),
    emitEose: (subId: string) =>
      emit("message", Buffer.from(JSON.stringify(["EOSE", subId]))),
  };
  return ws;
}

// The hardened union signature ADR 0058 pins:
//   connectRelay(url, opts?: { createWebSocket?: (url) => WebSocketLike })
// Pinned locally + cast so the suite stays a module-level red (missing
// ../src/connect) rather than a tsc arity trip once the module exists.
type UnionConnectRelay = (
  url: string,
  opts?: { createWebSocket?: (url: string) => unknown },
) => Promise<RelayConnection>;
const connect = connectRelay as unknown as UnionConnectRelay;

/** Connect through an injected fake ws, emitting `open` so connect resolves. */
async function connectWithFakeWs(
  ws: ReturnType<typeof fakeWebSocket>,
): Promise<RelayConnection> {
  const pending = connect("wss://test", { createWebSocket: () => ws });
  ws.emitOpen();
  return pending;
}

/** Parse the most recent frame that starts with `verb` off the fake's sent log. */
function lastFrame(ws: ReturnType<typeof fakeWebSocket>, verb: string): unknown[] {
  for (let i = ws.sent.length - 1; i >= 0; i--) {
    const parsed = JSON.parse(ws.sent[i]) as unknown[];
    if (Array.isArray(parsed) && parsed[0] === verb) return parsed;
  }
  throw new Error(`no ${verb} frame was sent`);
}

const FILTER: RelayFilter = { kinds: [3], authors: ["abc"], limit: 1 };
const EV_A = { id: "a" } as unknown as SignedNostrEvent;
const EV_B = { id: "b" } as unknown as SignedNostrEvent;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("connectRelay.query — REQ is sent with the filter", () => {
  it("sends [\"REQ\", subId, filter] with the filter passed verbatim", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    void relay.query(FILTER);

    const req = lastFrame(ws, "REQ");
    expect(typeof req[1]).toBe("string"); // a subId string
    expect(req[2]).toEqual(FILTER);
  });
});

describe("connectRelay.query — EVENT frames accumulate, EOSE resolves and CLOSEs", () => {
  it("accumulates EVENT frames for the subId, resolves on EOSE, and sends CLOSE", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    const p = relay.query(FILTER);
    const subId = String(lastFrame(ws, "REQ")[1]);

    ws.emitEvent(subId, EV_A);
    ws.emitEvent(subId, EV_B);
    ws.emitEose(subId);

    await expect(p).resolves.toEqual([EV_A, EV_B]);

    // EOSE triggers a CLOSE of the subscription.
    const close = lastFrame(ws, "CLOSE");
    expect(close[1]).toBe(subId);
  });
});

describe("connectRelay.query — bounded timeout resolves what accumulated", () => {
  it("resolves [] when nothing arrives before the timeout", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    const p = relay.query(FILTER, 10_000);
    // No EVENT, no EOSE; let the bounded timeout fire.
    await vi.advanceTimersByTimeAsync(10_001);

    await expect(p).resolves.toEqual([]);
  });

  it("resolves the partial accumulation when the timeout fires after some EVENTs", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    const p = relay.query(FILTER, 10_000);
    const subId = String(lastFrame(ws, "REQ")[1]);
    ws.emitEvent(subId, EV_A); // arrives, but no EOSE
    await vi.advanceTimersByTimeAsync(10_001);

    await expect(p).resolves.toEqual([EV_A]);
  });
});

describe("connectResilientRelay.query — thin pass-through (no reconnect on read)", () => {
  it("delegates to the current connection's query without reconnecting", async () => {
    const queried: RelayFilter[] = [];
    const conn: RelayConnection = {
      publish: vi.fn(),
      query: vi.fn((filter: RelayFilter) => {
        queried.push(filter);
        return Promise.resolve([EV_A]);
      }),
      close: vi.fn(),
    };
    const connect = vi.fn(() => Promise.resolve(conn));

    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      sleep: () => Promise.resolve(),
    });

    const result = await relay.query(FILTER);

    expect(result).toEqual([EV_A]);
    // The read delegated to the single current connection — no reconnect.
    expect(queried).toEqual([FILTER]);
    expect(conn.query).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
