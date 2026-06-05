// Red set for Story 62 (ADR 0061) — the periodic maintenance timer.
//
// Pins the ADR-0061 contract:
//   startMaintenanceSweeper(opts: {
//     intervalMs: number;
//     ephemeralTtlMs: number;
//     now?: () => number;
//     sweeps: { keys; sessions; challenges };
//     log?: (line: string) => void;
//   }): { stop(): void }
//
// Each tick runs ALL THREE injected sweeps; the DB sweeps are awaited; each is
// fault-isolated (a throw/reject is caught + logged and the others still run);
// a one-line summary with the counts is logged; the interval is unref()'d so it
// never holds the process open; stop() clears it.
//
// SEAMS ASSUMED (flag for the Implementer):
//   - The three sweeps are INJECTED via `sweeps`. `keys` is a sync thunk
//     (`() => number`, the ephemeral sweep bound to Date.now()+ttl); `sessions`
//     and `challenges` are async (`() => Promise<number>`, the DB sweepers).
//   - unref() OBSERVABILITY: these tests spy on the global `setInterval` and
//     assert `.unref()` was called on the handle it returns. If the Implementer
//     instead accepts an injected `setInterval` on the opts bag, retarget the spy
//     onto that injected fn — the assertion (handle.unref called once) is the same.
//   - `ephemeralTtlMs` is threaded to the `keys` thunk by the CALLER (per the
//     ADR), so it is opaque to the timer; we still pass it to satisfy the type.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startMaintenanceSweeper } from "../src/maintenance";

const INTERVAL = 60_000; // 1 min — arbitrary; the test drives the fake clock

function makeSweeps(over?: {
  keys?: () => number;
  sessions?: () => Promise<number>;
  challenges?: () => Promise<number>;
}) {
  return {
    keys: vi.fn(over?.keys ?? (() => 0)),
    sessions: vi.fn(over?.sessions ?? (async () => 0)),
    challenges: vi.fn(over?.challenges ?? (async () => 0)),
  };
}

describe("startMaintenanceSweeper — tick cadence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs all three sweeps once per interval", async () => {
    const sweeps = makeSweeps();
    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
    });

    expect(sweeps.keys).not.toHaveBeenCalled();
    expect(sweeps.sessions).not.toHaveBeenCalled();
    expect(sweeps.challenges).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(sweeps.keys).toHaveBeenCalledTimes(1);
    expect(sweeps.sessions).toHaveBeenCalledTimes(1);
    expect(sweeps.challenges).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(INTERVAL);

    expect(sweeps.keys).toHaveBeenCalledTimes(2);
    expect(sweeps.sessions).toHaveBeenCalledTimes(2);
    expect(sweeps.challenges).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it("does not run any sweep before the first interval elapses", async () => {
    const sweeps = makeSweeps();
    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL - 1);
    expect(sweeps.keys).not.toHaveBeenCalled();
    expect(sweeps.sessions).not.toHaveBeenCalled();
    expect(sweeps.challenges).not.toHaveBeenCalled();

    handle.stop();
  });
});

describe("startMaintenanceSweeper — fault isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("runs the other two sweeps and logs the error when one rejects", async () => {
    const log = vi.fn();
    const sweeps = makeSweeps({
      sessions: async () => {
        throw new Error("db down");
      },
    });

    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
      log,
    });

    // The tick must not throw out of the timer.
    await expect(vi.advanceTimersByTimeAsync(INTERVAL)).resolves.not.toThrow();

    // The other two still ran despite `sessions` failing.
    expect(sweeps.keys).toHaveBeenCalledTimes(1);
    expect(sweeps.challenges).toHaveBeenCalledTimes(1);

    // The failure was logged (assert on the injected log, not console).
    const logged = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/db down|sessions|error/i);

    handle.stop();
  });

  it("keeps ticking after a sweep failure (the timer survives)", async () => {
    let calls = 0;
    const sweeps = makeSweeps({
      challenges: async () => {
        calls += 1;
        throw new Error("transient");
      },
    });

    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
      log: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    await vi.advanceTimersByTimeAsync(INTERVAL);

    // A throw on the first tick did not stop the second tick.
    expect(sweeps.keys).toHaveBeenCalledTimes(2);
    expect(calls).toBe(2);

    handle.stop();
  });

  it("runs a synchronously-throwing keys sweep without stopping the others", async () => {
    const log = vi.fn();
    const sweeps = makeSweeps({
      keys: () => {
        throw new Error("sync boom");
      },
    });

    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
      log,
    });

    await expect(vi.advanceTimersByTimeAsync(INTERVAL)).resolves.not.toThrow();
    expect(sweeps.sessions).toHaveBeenCalledTimes(1);
    expect(sweeps.challenges).toHaveBeenCalledTimes(1);

    handle.stop();
  });
});

describe("startMaintenanceSweeper — count logging", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("logs the per-sweep counts on a tick", async () => {
    const log = vi.fn();
    const sweeps = makeSweeps({
      keys: () => 3,
      sessions: async () => 5,
      challenges: async () => 7,
    });

    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
      log,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL);

    const logged = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/3/);
    expect(logged).toMatch(/5/);
    expect(logged).toMatch(/7/);

    handle.stop();
  });
});

describe("startMaintenanceSweeper — stop()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("clears the interval — no further sweeps after stop()", async () => {
    const sweeps = makeSweeps();
    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(sweeps.keys).toHaveBeenCalledTimes(1);

    handle.stop();

    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(sweeps.keys).toHaveBeenCalledTimes(1); // unchanged after stop
    expect(sweeps.sessions).toHaveBeenCalledTimes(1);
    expect(sweeps.challenges).toHaveBeenCalledTimes(1);
  });
});

describe("startMaintenanceSweeper — unref() (never holds the process open)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("unref()'s the interval handle so it cannot keep the event loop alive", () => {
    // Spy on the global setInterval and capture the handle it returns so we can
    // assert .unref() was called on it. (Under fake timers the handle is a
    // Timeout-like object exposing unref().)
    const realSetInterval = globalThis.setInterval;
    const handles: Array<{ unref: ReturnType<typeof vi.fn> }> = [];
    const spy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) => {
        const real = (realSetInterval as typeof setInterval)(fn, ms, ...rest);
        const unref = vi.fn(() => real);
        // Preserve the real handle's behavior for stop()/clearInterval while
        // making unref() observable.
        Object.defineProperty(real, "unref", { value: unref, configurable: true });
        handles.push(real as unknown as { unref: typeof unref });
        return real;
      }) as typeof setInterval);

    const sweeps = makeSweeps();
    const handle = startMaintenanceSweeper({
      intervalMs: INTERVAL,
      ephemeralTtlMs: 1000,
      sweeps,
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(handles).toHaveLength(1);
    expect(handles[0].unref).toHaveBeenCalledTimes(1);

    handle.stop();
  });
});
