// Red set for Story 63 (ADR 0062) — the up-sync sync-health check + monitor.
//
// Pins the ADR-0062 contract for `apps/api/src/health/upsync.ts`:
//
//   type RelayRead = (filter: NostrFilter) =>
//     Promise<{ ok: boolean; events: SignedNostrEvent[] }>;
//   type CheckDeps = {
//     readLocal: RelayRead;
//     readDcosl: RelayRead | null;     // null when dcosl/librarian unset
//     librarianPubkey: string | null;
//     now: () => number;               // injected clock (ms)
//     windowMs: number;                // UPSYNC_CHECK_WINDOW_MS
//     limit: number;                   // UPSYNC_CHECK_LIMIT
//   };
//   checkUpsyncBacklog(deps): Promise<UpsyncHealth (minus checkedAtMs)>
//
//   getUpsyncHealth(): UpsyncHealth                 // module-level cache
//   startUpsyncHealthMonitor(deps): { stop(): void } // dedicated unref()'d timer
//
// The check is PURE over injected reads + clock — no real network, no Date.now()
// inside. The `{ ok, events }` wrapper resolves the unreachable-vs-in-sync
// ambiguity: a failed read (ok:false) must NEVER read as in-sync/backlog-0.
//
// Result shape (ADR 0062 Decision §1):
//   status: "in-sync" | "backlog" | "unknown"
//   backlog: number                        // 0 unless status==="backlog"
//   oldestUnpropagatedAgeMs: number | null // null unless backlog>0
//   capped: boolean
//   windowMs: number
//   limit: number
//   reason?: string                        // present on "unknown"
//   checkedAtMs: number | null             // stamped by the timer, not the check
//
// SEAMS ASSUMED (flag for the Implementer):
//   - `checkUpsyncBacklog` takes the single `deps` bag above; the two reads are
//     the `{ ok, events }` wrapper (NOT bare `SignedNostrEvent[]`).
//   - The local read is issued with `{ kinds:[39999], "#z":[…ratings, …tags],
//     since, limit }`; the dcosl read uses `{ ids: localIds }` (preferred exact
//     membership form). These tests assert the local `since`/`limit` are honored
//     and that the dcosl read is keyed on the local ids; if the Implementer takes
//     the `#z`+`since` fallback for dcosl, retarget the dcosl filter assertion.
//   - `startUpsyncHealthMonitor` accepts an injected `check` so the timer is
//     testable without a real check; if the Implementer instead inlines
//     `checkUpsyncBacklog` + injected reads, retarget the spy onto those reads.
//   - The cache is module-level; `getUpsyncHealth()` reads it. Tests that touch
//     the cache run the monitor (the only public writer) rather than reaching a
//     private setter.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkUpsyncBacklog,
  getUpsyncHealth,
  startUpsyncHealthMonitor,
  type UpsyncHealth,
} from "../../src/health/upsync";
import type { NostrFilter } from "../../src/nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";

const LIBRARIAN = "1".repeat(64);
const RATINGS_Z = `39998:${LIBRARIAN}:book-ratings`;
const TAGS_Z = `39998:${LIBRARIAN}:book-tag-assertions`;

// A fixed clock so age math is deterministic. now = 2,000,000 ms.
const NOW_MS = 2_000_000;
const now = () => NOW_MS;
const WINDOW_MS = 1_800_000; // 30 min (ADR default)
const LIMIT = 500; // ADR default cap

// created_at is in SECONDS (nostr). Build an event at a given created_at second.
function ev(id: string, createdAtSec: number): SignedNostrEvent {
  return {
    id,
    created_at: createdAtSec,
    kind: 39999,
    pubkey: "reader",
    sig: "s",
    tags: [["z", RATINGS_Z]],
    content: "",
  } as SignedNostrEvent;
}

type RelayRead = (
  filter: NostrFilter,
) => Promise<{ ok: boolean; events: SignedNostrEvent[] }>;

const okRead = (events: SignedNostrEvent[]): RelayRead =>
  vi.fn(async () => ({ ok: true, events }));
const failRead = (): RelayRead => vi.fn(async () => ({ ok: false, events: [] }));

function baseDeps(over?: {
  readLocal?: RelayRead;
  readDcosl?: RelayRead | null;
  librarianPubkey?: string | null;
  windowMs?: number;
  limit?: number;
}) {
  return {
    readLocal: over?.readLocal ?? okRead([]),
    readDcosl:
      over && "readDcosl" in over ? over.readDcosl! : okRead([]),
    librarianPubkey:
      over && "librarianPubkey" in over
        ? (over.librarianPubkey as string | null)
        : LIBRARIAN,
    now,
    windowMs: over?.windowMs ?? WINDOW_MS,
    limit: over?.limit ?? LIMIT,
  };
}

describe("checkUpsyncBacklog — in-sync", () => {
  it("reports in-sync (backlog 0, no oldest age) when every local event is on dcosl", async () => {
    const locals = [ev("a", 1900), ev("b", 1800), ev("c", 1700)];
    const deps = baseDeps({
      readLocal: okRead(locals),
      readDcosl: okRead([...locals]), // all present on dcosl
    });

    const out = await checkUpsyncBacklog(deps);

    expect(out.status).toBe("in-sync");
    expect(out.backlog).toBe(0);
    expect(out.oldestUnpropagatedAgeMs).toBeNull();
  });

  it("reports in-sync when the local window is empty (nothing recent to propagate)", async () => {
    const dcosl = failRead(); // must not even be consulted in this clean-empty case
    const deps = baseDeps({ readLocal: okRead([]), readDcosl: dcosl });

    const out = await checkUpsyncBacklog(deps);

    expect(out.status).toBe("in-sync");
    expect(out.backlog).toBe(0);
    expect(out.oldestUnpropagatedAgeMs).toBeNull();
  });
});

describe("checkUpsyncBacklog — backlog", () => {
  it("reports the missing count and the oldest unpropagated age", async () => {
    // created_at is in SECONDS. now = 2,000,000 ms.
    const oldestMissingSec = 1500; // → 1500 * 1000 = 1,500,000 ms
    const locals = [
      ev("present", 1950),
      ev("missing-young", 1980),
      ev("missing-old", oldestMissingSec),
    ];
    const deps = baseDeps({
      readLocal: okRead(locals),
      readDcosl: okRead([ev("present", 1950)]), // two are missing from dcosl
    });

    const out = await checkUpsyncBacklog(deps);

    expect(out.status).toBe("backlog");
    expect(out.backlog).toBe(2);
    // now − (oldest missing created_at × 1000) = 2,000,000 − 1,500,000 = 500,000
    expect(out.oldestUnpropagatedAgeMs).toBe(NOW_MS - oldestMissingSec * 1000);
  });
});

describe("checkUpsyncBacklog — graceful degrade (the load-bearing cases)", () => {
  it("reports unknown with a reason when the dcosl read fails — NEVER a false in-sync/backlog-0", async () => {
    const locals = [ev("a", 1900), ev("b", 1800)];
    const deps = baseDeps({
      readLocal: okRead(locals),
      readDcosl: failRead(), // ok:false — unreachable/timeout
    });

    const out = await checkUpsyncBacklog(deps);

    expect(out.status).toBe("unknown");
    expect(typeof out.reason).toBe("string");
    expect(out.reason && out.reason.length).toBeGreaterThan(0);
    // The critical anti-false-positive guarantee: a failed dcosl read is NOT
    // in-sync and NOT a clean backlog-0 reading.
    expect(out.status).not.toBe("in-sync");
  });

  it("reports unknown when the local read fails (never a backlog off a failed local read)", async () => {
    const deps = baseDeps({
      readLocal: failRead(),
      readDcosl: okRead([]),
    });

    const out = await checkUpsyncBacklog(deps);

    expect(out.status).toBe("unknown");
    expect(typeof out.reason).toBe("string");
    expect(out.backlog).toBe(0);
  });

  it("reports unknown (no reads attempted) when readDcosl is null", async () => {
    const readLocal = okRead([ev("a", 1900)]);
    const deps = baseDeps({ readLocal, readDcosl: null });

    const out = await checkUpsyncBacklog(deps);

    expect(out.status).toBe("unknown");
    expect(typeof out.reason).toBe("string");
    expect(readLocal).not.toHaveBeenCalled();
  });

  it("reports unknown (no reads attempted) when librarianPubkey is null", async () => {
    const readLocal = okRead([ev("a", 1900)]);
    const readDcosl = okRead([]);
    const deps = baseDeps({ readLocal, readDcosl, librarianPubkey: null });

    const out = await checkUpsyncBacklog(deps);

    expect(out.status).toBe("unknown");
    expect(typeof out.reason).toBe("string");
    expect(readLocal).not.toHaveBeenCalled();
    expect(readDcosl).not.toHaveBeenCalled();
  });
});

describe("checkUpsyncBacklog — window + cap honored", () => {
  it("issues the local read with the decided since (now − window) and the cap limit", async () => {
    const readLocal = okRead([]);
    const deps = baseDeps({ readLocal, readDcosl: okRead([]) });

    await checkUpsyncBacklog(deps);

    expect(readLocal).toHaveBeenCalledTimes(1);
    const filter = (readLocal as unknown as { mock: { calls: NostrFilter[][] } })
      .mock.calls[0][0];
    expect(filter.kinds).toEqual([39999]);
    expect(filter.since).toBe(Math.floor((NOW_MS - WINDOW_MS) / 1000));
    expect(filter.limit).toBe(LIMIT);
    // Both up-sync #z handles requested.
    expect(filter["#z"]).toEqual(
      expect.arrayContaining([RATINGS_Z, TAGS_Z]),
    );
  });

  it("keys the dcosl read on the local event ids (exact membership form)", async () => {
    const locals = [ev("id-1", 1900), ev("id-2", 1800)];
    const readDcosl = okRead(locals);
    const deps = baseDeps({ readLocal: okRead(locals), readDcosl });

    await checkUpsyncBacklog(deps);

    expect(readDcosl).toHaveBeenCalledTimes(1);
    const filter = (readDcosl as unknown as { mock: { calls: NostrFilter[][] } })
      .mock.calls[0][0];
    expect(filter.ids).toEqual(expect.arrayContaining(["id-1", "id-2"]));
  });

  it("surfaces capped:true when the local window is at/over the cap", async () => {
    const limit = 3;
    const locals = [ev("a", 1900), ev("b", 1800), ev("c", 1700)]; // length === cap
    const deps = baseDeps({
      readLocal: okRead(locals),
      readDcosl: okRead([...locals]),
      limit,
    });

    const out = await checkUpsyncBacklog(deps);

    expect(out.capped).toBe(true);
  });

  it("reports capped:false when the local window is under the cap", async () => {
    const deps = baseDeps({
      readLocal: okRead([ev("a", 1900)]),
      readDcosl: okRead([ev("a", 1900)]),
      limit: 500,
    });

    const out = await checkUpsyncBacklog(deps);

    expect(out.capped).toBe(false);
  });
});

describe("checkUpsyncBacklog — deterministic / no real network", () => {
  it("never calls Date.now (uses the injected clock) for the age math", async () => {
    const dateNow = vi.spyOn(Date, "now");
    const missingSec = 1500;
    const deps = baseDeps({
      readLocal: okRead([ev("m", missingSec)]),
      readDcosl: okRead([]),
    });

    const out = await checkUpsyncBacklog(deps);

    expect(out.oldestUnpropagatedAgeMs).toBe(NOW_MS - missingSec * 1000);
    expect(dateNow).not.toHaveBeenCalled();
    dateNow.mockRestore();
  });
});

// --- The dedicated monitor timer -----------------------------------------------

describe("startUpsyncHealthMonitor — tick updates the cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const INTERVAL = 300_000; // 5 min (ADR default)

  it("computes on each tick and updates getUpsyncHealth() with a checkedAtMs stamp", async () => {
    const result: Omit<UpsyncHealth, "checkedAtMs"> = {
      status: "backlog",
      backlog: 2,
      oldestUnpropagatedAgeMs: 500_000,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
    };
    const check = vi.fn(async () => result);

    const handle = startUpsyncHealthMonitor({
      intervalMs: INTERVAL,
      check,
    });

    await vi.advanceTimersByTimeAsync(INTERVAL);

    const cached = getUpsyncHealth();
    expect(cached.status).toBe("backlog");
    expect(cached.backlog).toBe(2);
    expect(typeof cached.checkedAtMs).toBe("number");

    handle.stop();
  });
});

describe("startUpsyncHealthMonitor — fault isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const INTERVAL = 300_000;

  it("catches a throwing check, leaves the prior cache, keeps ticking", async () => {
    const good: Omit<UpsyncHealth, "checkedAtMs"> = {
      status: "in-sync",
      backlog: 0,
      oldestUnpropagatedAgeMs: null,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
    };
    let calls = 0;
    const check = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("check boom");
      return good;
    });
    const log = vi.fn();

    const handle = startUpsyncHealthMonitor({
      intervalMs: INTERVAL,
      check,
      log,
    });

    // Tick 1: good value cached.
    await vi.advanceTimersByTimeAsync(INTERVAL);
    const afterFirst = getUpsyncHealth();
    expect(afterFirst.status).toBe("in-sync");
    const stampAfterFirst = afterFirst.checkedAtMs;

    // Tick 2: throws — must not escape the timer, must not clobber the good cache.
    await expect(
      vi.advanceTimersByTimeAsync(INTERVAL),
    ).resolves.not.toThrow();
    const afterThrow = getUpsyncHealth();
    expect(afterThrow.status).toBe("in-sync"); // prior good value preserved
    expect(afterThrow.checkedAtMs).toBe(stampAfterFirst); // not re-stamped on throw
    const logged = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toMatch(/upsync|check|boom|error/i);

    // Tick 3: the timer survived and computes again.
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(calls).toBe(3);

    handle.stop();
  });
});

describe("startUpsyncHealthMonitor — unref() + stop()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const INTERVAL = 300_000;

  it("unref()'s the interval handle so it cannot keep the event loop alive", () => {
    const realSetInterval = globalThis.setInterval;
    const handles: Array<{ unref: ReturnType<typeof vi.fn> }> = [];
    const spy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation(((
        fn: (...a: unknown[]) => void,
        ms?: number,
        ...rest: unknown[]
      ) => {
        const real = (realSetInterval as typeof setInterval)(fn, ms, ...rest);
        const unref = vi.fn(() => real);
        Object.defineProperty(real, "unref", {
          value: unref,
          configurable: true,
        });
        handles.push(real as unknown as { unref: typeof unref });
        return real;
      }) as typeof setInterval);

    const check = vi.fn(async () => ({
      status: "unknown" as const,
      backlog: 0,
      oldestUnpropagatedAgeMs: null,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      reason: "x",
    }));

    const handle = startUpsyncHealthMonitor({ intervalMs: INTERVAL, check });

    expect(spy).toHaveBeenCalled();
    expect(handles.length).toBeGreaterThanOrEqual(1);
    expect(handles[0].unref).toHaveBeenCalledTimes(1);

    handle.stop();
  });

  it("stop() clears the interval — no further ticks after stop()", async () => {
    const check = vi.fn(async () => ({
      status: "in-sync" as const,
      backlog: 0,
      oldestUnpropagatedAgeMs: null,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
    }));

    const handle = startUpsyncHealthMonitor({ intervalMs: INTERVAL, check });

    await vi.advanceTimersByTimeAsync(INTERVAL);
    const callsAtStop = check.mock.calls.length;

    handle.stop();

    await vi.advanceTimersByTimeAsync(INTERVAL * 5);
    expect(check.mock.calls.length).toBe(callsAtStop);
  });
});
