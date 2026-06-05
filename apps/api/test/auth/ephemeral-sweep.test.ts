// Red set for Story 62 (ADR 0061) — ephemeral key-map idle sweep.
//
// Pins the ADR-0061 contract for the custodial ephemeral key store:
//   - export function sweepExpiredSessionKeys(nowMs: number, ttlMs: number): number
//   - each store entry carries a `lastUsedAt` stamped in rememberSessionKey and
//     REFRESHED on every successful useSessionKey; a key in active use is never swept.
//   - sweep evicts every entry with `nowMs - lastUsedAt > ttlMs`, wipes the wrapped
//     blob, and returns the count evicted; entries within the TTL survive.
//
// CLOCK SEAM ASSUMED (flag for the Implementer): the ADR pins `nowMs` as an
// explicit param to `sweepExpiredSessionKeys` but does NOT pin an injectable
// clock for the remember/use timestamps — the ADR text says the stamp is set in
// rememberSessionKey and refreshed in useSessionKey, i.e. via `Date.now()`. These
// tests therefore drive the remember/use stamps with vi.useFakeTimers() +
// vi.setSystemTime() and pass `nowMs` to the sweep directly. If the Implementer
// instead exposes an injectable clock on remember/use, these tests still hold as
// long as Date.now() is the default seam; otherwise the seam must be threaded.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  NoSessionKeyError,
  forgetSessionKey,
  rememberSessionKey,
  sweepExpiredSessionKeys,
  useSessionKey,
} from "../../src/auth/ephemeral";

const TTL = 1000; // ms; small + explicit, the sweep takes ttlMs as a param
const T0 = 1_700_000_000_000; // fixed wall-clock anchor for the remember stamp

function secret() {
  return Uint8Array.from({ length: 32 }, (_, i) => (i + 1) & 0xff);
}

// Distinct ids per case so the process-local store does not leak between tests.
let n = 0;
function freshSid() {
  n += 1;
  return n.toString(16).padStart(64, "0");
}

describe("sweepExpiredSessionKeys — idle eviction (ADR 0061)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("evicts an entry whose lastUsedAt is older than ttlMs and returns the count", async () => {
    const sid = freshSid();
    rememberSessionKey(sid, secret()); // lastUsedAt = T0

    // now is past T0 by more than the TTL → evicted.
    const evicted = sweepExpiredSessionKeys(T0 + TTL + 1, TTL);

    expect(evicted).toBe(1);
    await expect(useSessionKey(sid, () => 1)).rejects.toBeInstanceOf(
      NoSessionKeyError,
    );
  });

  it("keeps an entry within the ttlMs window (use still works)", async () => {
    const sid = freshSid();
    rememberSessionKey(sid, secret()); // lastUsedAt = T0

    // now is within the TTL window → survives.
    const evicted = sweepExpiredSessionKeys(T0 + TTL, TTL);

    expect(evicted).toBe(0);
    const back = await useSessionKey(sid, (s) => Uint8Array.from(s));
    expect(Array.from(back)).toEqual(Array.from(secret()));
  });

  it("uses a strict '>' boundary: exactly ttlMs old survives", async () => {
    const sid = freshSid();
    rememberSessionKey(sid, secret()); // lastUsedAt = T0
    // nowMs - lastUsedAt === ttlMs is NOT '> ttlMs' → survives.
    expect(sweepExpiredSessionKeys(T0 + TTL, TTL)).toBe(0);
    await expect(useSessionKey(sid, () => 1)).resolves.toBe(1);
  });

  it("counts only the idle entries when some survive", async () => {
    const idle = freshSid();
    rememberSessionKey(idle, secret()); // lastUsedAt = T0

    vi.setSystemTime(T0 + TTL); // a later remember, still fresh at sweep time
    const fresh = freshSid();
    rememberSessionKey(fresh, secret()); // lastUsedAt = T0 + TTL

    // Sweep at T0 + TTL + 1: idle is (TTL+1) old → evicted; fresh is 1ms old → survives.
    const evicted = sweepExpiredSessionKeys(T0 + TTL + 1, TTL);

    expect(evicted).toBe(1);
    await expect(useSessionKey(idle, () => 1)).rejects.toBeInstanceOf(
      NoSessionKeyError,
    );
    await expect(useSessionKey(fresh, () => 1)).resolves.toBe(1);
  });
});

describe("sweepExpiredSessionKeys — lastUsedAt refresh-on-use (ADR 0061)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a key used recently is NOT evicted even past the original remember-time + TTL", async () => {
    const sid = freshSid();
    rememberSessionKey(sid, secret()); // lastUsedAt = T0

    // Touch it just before it would have aged out → lastUsedAt refreshes to T0+TTL-1.
    vi.setSystemTime(T0 + TTL - 1);
    await useSessionKey(sid, () => 1);

    // A sweep at a now that is > (T0 + TTL) but < (lastUsedAt-of-the-use + TTL)
    // must keep it: idle measured from the LAST use, not the remember.
    const evicted = sweepExpiredSessionKeys(T0 + TTL + 1, TTL);

    expect(evicted).toBe(0);
    await expect(useSessionKey(sid, () => 1)).resolves.toBe(1);
  });

  it("a key NOT touched ages out from its remember-time", async () => {
    const used = freshSid();
    const untouched = freshSid();
    rememberSessionKey(used, secret()); // lastUsedAt = T0
    rememberSessionKey(untouched, secret()); // lastUsedAt = T0

    // Refresh only `used` near the end of its window.
    vi.setSystemTime(T0 + TTL - 1);
    await useSessionKey(used, () => 1); // lastUsedAt(used) = T0 + TTL - 1

    // At now = T0 + TTL + 1: used is 2ms idle (survives); untouched is TTL+1 idle (evicted).
    const evicted = sweepExpiredSessionKeys(T0 + TTL + 1, TTL);

    expect(evicted).toBe(1);
    await expect(useSessionKey(used, () => 1)).resolves.toBe(1);
    await expect(useSessionKey(untouched, () => 1)).rejects.toBeInstanceOf(
      NoSessionKeyError,
    );
  });
});

describe("sweepExpiredSessionKeys — eviction hygiene + no-op cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 when the store is empty", () => {
    expect(sweepExpiredSessionKeys(T0 + 10 * TTL, TTL)).toBe(0);
  });

  it("an evicted entry fails closed on a subsequent use (blob is gone)", async () => {
    const sid = freshSid();
    rememberSessionKey(sid, secret());
    expect(sweepExpiredSessionKeys(T0 + TTL + 1, TTL)).toBe(1);
    // The wrapped blob is wiped + deleted; the only observable contract for a
    // caller is the fail-closed NoSessionKeyError.
    await expect(useSessionKey(sid, () => 1)).rejects.toBeInstanceOf(
      NoSessionKeyError,
    );
    // A second sweep finds nothing left to evict.
    expect(sweepExpiredSessionKeys(T0 + 10 * TTL, TTL)).toBe(0);
  });

  it("forgetSessionKey before a sweep means the sweep evicts nothing for that id", async () => {
    const sid = freshSid();
    rememberSessionKey(sid, secret());
    forgetSessionKey(sid);
    expect(sweepExpiredSessionKeys(T0 + 10 * TTL, TTL)).toBe(0);
    await expect(useSessionKey(sid, () => 1)).rejects.toBeInstanceOf(
      NoSessionKeyError,
    );
  });
});
