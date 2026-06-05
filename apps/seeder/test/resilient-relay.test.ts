// Failing tests for Story 57 (seeder relay-publish resilience), per ADR 0056
// §2 "connectResilientRelay (the self-healing wrapper)".
//
// The resilient layer wraps a RelayConnection: a transport REJECTION triggers a
// reconnect + bounded exponential-backoff retry of the SAME event; a RESOLVED
// result ({ok:true} or a relay NACK {ok:false}) is returned as-is with no
// reconnect; exhausting the attempt budget THROWS a clear error so the run
// exits cleanly (the checkpoint resumes on the operator's re-run).
//
// All seams are injected for determinism (ADR §2): a fake `connect` returning a
// scripted RelayConnection, and a fake `sleep` that records the delays it is
// asked to wait and resolves immediately — so the backoff schedule is asserted
// without any real timers or sockets.
//
// `resilient-relay` is loaded via the opaque specifier loader (see _load.ts) so
// the not-yet-existing module is a clean assertion-level red ("module not
// found" as a readable test failure), not a tsc TS2307 compile wall.
import { describe, expect, it, vi } from "vitest";
import { loadSeederModule } from "./_load";
import type { PublishResult, RelayConnection } from "../src/publish";
import type { SignedNostrEvent } from "@unbnd/schemas";

type ConnectResilientRelayOpts = {
  url: string;
  connect?: (url: string) => Promise<RelayConnection>;
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onReconnect?: (info: unknown) => void;
};

type ResilientRelayModule = {
  connectResilientRelay: (
    opts: ConnectResilientRelayOpts,
  ) => Promise<RelayConnection>;
};

const load = () => loadSeederModule<ResilientRelayModule>("resilient-relay");

// A minimal signed event; only `.id` is read by the publish path under test.
const EVENT = { id: "evt-1" } as unknown as SignedNostrEvent;

/**
 * A scripted RelayConnection whose `publish` plays back the supplied steps in
 * order. Each step is either a resolved PublishResult or a rejection (an Error
 * standing in for a transport failure). `close` is a spy.
 */
type Step = { resolve: PublishResult } | { reject: Error };
function scriptedConnection(steps: Step[]): RelayConnection & {
  publishCalls: number;
  close: ReturnType<typeof vi.fn>;
} {
  let i = 0;
  const close = vi.fn();
  const conn = {
    publishCalls: 0,
    publish(): Promise<PublishResult> {
      conn.publishCalls += 1;
      const step = steps[i++];
      if (!step) return Promise.reject(new Error("scripted connection exhausted"));
      return "reject" in step
        ? Promise.reject(step.reject)
        : Promise.resolve(step.resolve);
    },
    close,
  };
  return conn;
}

/** A fake sleep that records every delay it was asked to wait and resolves now. */
function fakeSleep() {
  const delays: number[] = [];
  const sleep = vi.fn((ms: number) => {
    delays.push(ms);
    return Promise.resolve();
  });
  return { sleep, delays };
}

describe("connectResilientRelay — transient reject is ridden through", () => {
  it("reconnects and retries when the first publish rejects, then surfaces a single {ok:true}", async () => {
    const { connectResilientRelay } = await load();

    // First underlying connection: its publish rejects (transport drop).
    const first = scriptedConnection([{ reject: new Error("broken pipe") }]);
    // Second connection (after reconnect): its publish resolves ok.
    const second = scriptedConnection([{ resolve: { ok: true, id: "evt-1" } }]);
    const conns = [first, second];
    const connect = vi.fn(() => Promise.resolve(conns.shift()!));
    const { sleep, delays } = fakeSleep();

    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      attempts: 6,
      baseMs: 500,
      maxMs: 8000,
      sleep,
    });

    const result = await relay.publish(EVENT);

    // The caller sees one successful publish; the rejection is hidden.
    expect(result).toEqual({ ok: true, id: "evt-1" });
    // connect ran twice: once up front, once to reconnect after the reject.
    expect(connect).toHaveBeenCalledTimes(2);
    // Exactly one backoff wait, at baseMs (attempt index 0).
    expect(delays).toEqual([500]);
  });
});

describe("connectResilientRelay — sustained outage exhausts then throws", () => {
  it("retries up to `attempts` with capped exponential backoff, then throws a clear error", async () => {
    const { connectResilientRelay } = await load();

    // Every underlying publish rejects: a genuine sustained outage.
    const makeDead = () =>
      scriptedConnection([{ reject: new Error("ECONNRESET") }]);
    const connect = vi.fn(() => Promise.resolve(makeDead()));
    const { sleep, delays } = fakeSleep();

    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      attempts: 4,
      baseMs: 500,
      maxMs: 8000,
      sleep,
    });

    await expect(relay.publish(EVENT)).rejects.toThrow(/relay unreachable/i);

    // 4 total attempts → the initial connect + 3 reconnects.
    expect(connect).toHaveBeenCalledTimes(4);
    // Backoff between the 4 attempts: min(maxMs, baseMs*2^i) for i=0,1,2.
    // 500, 1000, 2000 — none hit the 8000 cap at this size.
    expect(delays).toEqual([500, 1000, 2000]);
  });

  it("caps the backoff at maxMs once baseMs*2^i would exceed it", async () => {
    const { connectResilientRelay } = await load();

    const connect = vi.fn(() =>
      Promise.resolve(scriptedConnection([{ reject: new Error("down") }])),
    );
    const { sleep, delays } = fakeSleep();

    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      attempts: 6,
      baseMs: 500,
      maxMs: 2000,
      sleep,
    });

    await expect(relay.publish(EVENT)).rejects.toThrow();

    // i=0..4 → 500, 1000, 2000, then capped: 2000, 2000.
    expect(delays).toEqual([500, 1000, 2000, 2000, 2000]);
  });
});

describe("connectResilientRelay — a relay NACK is not a transport failure", () => {
  it("returns a resolved {ok:false} as-is without reconnecting or sleeping", async () => {
    const { connectResilientRelay } = await load();

    const only = scriptedConnection([
      { resolve: { ok: false, reason: "blocked" } },
    ]);
    const connect = vi.fn(() => Promise.resolve(only));
    const { sleep, delays } = fakeSleep();

    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      attempts: 6,
      baseMs: 500,
      maxMs: 8000,
      sleep,
    });

    const result = await relay.publish(EVENT);

    expect(result).toEqual({ ok: false, reason: "blocked" });
    // No reconnect: only the initial connect ran.
    expect(connect).toHaveBeenCalledTimes(1);
    // A NACK is the relay's answer, not a drop — no backoff wait.
    expect(sleep).not.toHaveBeenCalled();
    expect(delays).toEqual([]);
    expect(only.publishCalls).toBe(1);
  });
});

describe("connectResilientRelay — happy path does not reconnect", () => {
  it("returns {ok:true} on the first try with no extra connect and no sleep", async () => {
    const { connectResilientRelay } = await load();

    const only = scriptedConnection([{ resolve: { ok: true, id: "evt-1" } }]);
    const connect = vi.fn(() => Promise.resolve(only));
    const { sleep, delays } = fakeSleep();

    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      attempts: 6,
      baseMs: 500,
      maxMs: 8000,
      sleep,
    });

    const result = await relay.publish(EVENT);

    expect(result).toEqual({ ok: true, id: "evt-1" });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(delays).toEqual([]);
  });
});

describe("connectResilientRelay — ADR defaults apply when knobs are omitted", () => {
  it("defaults to 6 attempts / 500ms base / 8000ms cap (asserted via the exhaustion schedule)", async () => {
    const { connectResilientRelay } = await load();

    const connect = vi.fn(() =>
      Promise.resolve(scriptedConnection([{ reject: new Error("down") }])),
    );
    const { sleep, delays } = fakeSleep();

    // attempts / baseMs / maxMs all omitted → ADR defaults 6 / 500 / 8000.
    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      sleep,
    });

    await expect(relay.publish(EVENT)).rejects.toThrow();

    // Default 6 attempts → initial connect + 5 reconnects.
    expect(connect).toHaveBeenCalledTimes(6);
    // 5 backoff waits between 6 attempts: 500,1000,2000,4000,8000 (the last
    // exactly at the default 8000 cap).
    expect(delays).toEqual([500, 1000, 2000, 4000, 8000]);
  });
});

describe("connectResilientRelay — close() delegates to the current connection", () => {
  it("closes the underlying connection that is currently held", async () => {
    const { connectResilientRelay } = await load();

    const only = scriptedConnection([{ resolve: { ok: true, id: "evt-1" } }]);
    const connect = vi.fn(() => Promise.resolve(only));
    const { sleep } = fakeSleep();

    const relay = await connectResilientRelay({
      url: "wss://test",
      connect,
      sleep,
    });

    relay.close();
    expect(only.close).toHaveBeenCalledTimes(1);
  });
});
