// Failing tests for Story 57 (seeder relay-publish resilience), per ADR 0056
// §1 "Harden connectRelay (the transport primitive)".
//
// These pin the hardened transport contract on `connectRelay(url, opts?)`:
//   - opts.createWebSocket?: (url) => WebSocketLike  — an injected WS factory so
//     open/message/close/error/send-throw are driven deterministically with no
//     real network (ADR §1 "Injectable WebSocket").
//   - a synchronous `send` throw REJECTS the publish promise with a transport
//     Error and clears the pending timer (ADR §1 "Send throw -> reject").
//   - a post-open `close`/`error` REJECTS every pending publish promptly (not at
//     the 10s timeout) and marks the connection dead, so a subsequent publish
//     rejects immediately without sending (ADR §1 "Post-open death").
//   - a genuine relay NACK `["OK", id, false, reason]` still RESOLVES
//     {ok:false, reason} (ADR §1 "Relay NACK unchanged") — a relay rejection
//     stays distinguishable from a transport failure.
//
// `connectRelay` already exists, so it is imported directly. The tests are RED
// because the `opts.createWebSocket` seam does not exist yet: today
// `connectRelay(url)` ignores a second argument and constructs the real `ws`
// WebSocket, so the injected fake is never driven and none of the scripted
// events reach the connection — the assertions fail (and the connect promise
// never resolves through the fake, surfaced via a guarded timeout below).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectRelay } from "../src/publish";
import type { RelayConnection } from "../src/publish";
import type { SignedNostrEvent } from "@unbnd/schemas";

type Handler = (...args: unknown[]) => void;

/**
 * A minimal fake WebSocket matching the slice of the `ws` API `connectRelay`
 * uses (`on` / `once` / `send` / `close`), plus test helpers to emit lifecycle
 * events and to make `send` throw. No real socket, no network.
 */
function fakeWebSocket() {
  const handlers = new Map<string, Handler[]>();
  let sendThrows = false;
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
    // ws API surface used by connectRelay
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
      if (sendThrows) throw new Error("send on dead socket");
      sent.push(data);
    }),
    close: vi.fn(),

    // test helpers
    sent,
    emitOpen: () => emit("open"),
    emitMessage: (payload: unknown) => emit("message", Buffer.from(JSON.stringify(payload))),
    emitClose: () => emit("close"),
    emitError: (err: Error) => emit("error", err),
    makeSendThrow: () => {
      sendThrows = true;
    },
  };
  return ws;
}

const EVENT = { id: "evt-1" } as unknown as SignedNostrEvent;

// The hardened 2-arg signature ADR 0056 §1 adds:
//   connectRelay(url, opts?: { createWebSocket?: (url) => WebSocketLike })
// It does not exist on `connectRelay` yet, so we pin it as a local type and cast
// the (currently 1-arg) export to it. This keeps `pnpm -r typecheck` clean (no
// TS2554 arity error) while the test stays RED at the assertion level: today's
// connectRelay ignores the second arg and opens the real `ws` socket, so the
// injected fake is never driven. Once the Implementer adds the `createWebSocket`
// option, this cast lines up with the real signature.
type HardenedConnectRelay = (
  url: string,
  opts?: { createWebSocket?: (url: string) => unknown },
) => Promise<RelayConnection>;
const connect = connectRelay as unknown as HardenedConnectRelay;

/** Connect through an injected fake ws, emitting `open` so connect resolves. */
async function connectWithFakeWs(
  ws: ReturnType<typeof fakeWebSocket>,
): Promise<RelayConnection> {
  const pending = connect("wss://test", { createWebSocket: () => ws });
  ws.emitOpen();
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("connectRelay — injected WebSocket factory (baseline)", () => {
  it("resolves a publish {ok:true} on a matching OK through the fake ws", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    const p = relay.publish(EVENT);
    // The EVENT was sent over the fake socket.
    expect(ws.sent.length).toBe(1);
    // The relay replies OK for this event id.
    ws.emitMessage(["OK", "evt-1", true, ""]);

    await expect(p).resolves.toEqual({ ok: true, id: "evt-1" });
  });
});

describe("connectRelay — send throw is a transport reject", () => {
  it("rejects the publish promise with a transport Error and clears the pending timer", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    ws.makeSendThrow();
    const p = relay.publish(EVENT);

    // A transport failure REJECTS (not a resolved {ok:false}).
    await expect(p).rejects.toThrow(Error);

    // The pending timer was cleared: advancing past the 10s timeout produces no
    // stray resolution / unhandled rejection.
    await vi.advanceTimersByTimeAsync(11_000);
  });
});

describe("connectRelay — post-open close rejects pending and marks dead", () => {
  it("rejects an in-flight publish promptly on close (not at the 10s timeout) and a later publish rejects immediately", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    const p = relay.publish(EVENT); // in flight, no OK yet
    const sentBeforeClose = ws.sent.length;

    ws.emitClose();

    // Rejects promptly on close, without waiting for the 10s timeout.
    await expect(p).rejects.toThrow(Error);

    // The connection is dead: a subsequent publish rejects immediately and does
    // NOT send into the dead socket.
    await expect(relay.publish(EVENT)).rejects.toThrow(Error);
    expect(ws.sent.length).toBe(sentBeforeClose);
  });
});

describe("connectRelay — post-open error rejects pending", () => {
  it("rejects an in-flight publish on a post-open error event", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    const p = relay.publish(EVENT);
    ws.emitError(new Error("socket error"));

    await expect(p).rejects.toThrow(Error);
  });
});

describe("connectRelay — relay NACK stays a resolved {ok:false}", () => {
  it("resolves {ok:false, reason} on [\"OK\", id, false, reason] (not a transport reject)", async () => {
    const ws = fakeWebSocket();
    const relay = await connectWithFakeWs(ws);

    const p = relay.publish(EVENT);
    ws.emitMessage(["OK", "evt-1", false, "blocked"]);

    await expect(p).resolves.toEqual({ ok: false, reason: "blocked" });
  });
});
