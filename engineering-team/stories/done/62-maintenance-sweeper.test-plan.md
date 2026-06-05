# Test Plan: Story 62 — Periodic maintenance sweeper (ephemeral key-map + orphaned DB sweepers)

**Story:** `engineering-team/stories/done/62-maintenance-sweeper.md`
**ADR:** `engineering-team/decisions/0061-maintenance-sweeper.md`
**Date:** 2026-06-05
**Base commit:** `6bc96fb` (branch `story-62-maintenance-sweeper`)

## Names pinned from ADR 0061

- `sweepExpiredSessionKeys(nowMs: number, ttlMs: number): number` — exported from `apps/api/src/auth/ephemeral.ts`. Evicts every entry where `nowMs - lastUsedAt > ttlMs`, wipes the wrapped blob, returns the count.
- `lastUsedAt` stamped in `rememberSessionKey`, refreshed on every successful `useSessionKey`.
- `startMaintenanceSweeper(opts: { intervalMs, ephemeralTtlMs, now?, sweeps: { keys, sessions, challenges }, log? }): { stop(): void }` — exported from `apps/api/src/maintenance.ts` (new).
- Config knobs `EPHEMERAL_KEY_TTL_MS` (default `SESSION_LIFETIME_MS` = 30d) and `MAINTENANCE_INTERVAL_MS` (default 1h), routed through `loadConfig` onto `config.ephemeralKeyTtlMs` / `config.maintenanceIntervalMs`.

## Coverage map

| Criterion (story AC) | Test name | Test file | Level |
|---|---|---|---|
| Sweep evicts idle entry + returns count | `evicts an entry whose lastUsedAt is older than ttlMs and returns the count` | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| Entry within TTL survives | `keeps an entry within the ttlMs window (use still works)` | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| `>` boundary (not `>=`) | `uses a strict '>' boundary: exactly ttlMs old survives` | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| Count reflects only idle entries | `counts only the idle entries when some survive` | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| `lastUsedAt` refresh-on-use keeps an active key | `a key used recently is NOT evicted even past the original remember-time + TTL` | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| Untouched key ages out from remember-time | `a key NOT touched ages out from its remember-time` | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| `nowMs` injected → deterministic | (all cases above pass `nowMs` explicitly) | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| Eviction wipes blob / fails closed | `an evicted entry fails closed on a subsequent use (blob is gone)` | `apps/api/test/auth/ephemeral-sweep.test.ts` | unit |
| Existing remember/use/forget/NoSessionKeyError unchanged | (existing `apps/api/test/auth/ephemeral.test.ts`, left untouched, stays green) | `apps/api/test/auth/ephemeral.test.ts` | unit |
| Timer runs all three sweeps per interval | `runs all three sweeps once per interval` | `apps/api/test/maintenance.test.ts` | unit |
| No sweep before first interval | `does not run any sweep before the first interval elapses` | `apps/api/test/maintenance.test.ts` | unit |
| Fault isolation (async reject) | `runs the other two sweeps and logs the error when one rejects` | `apps/api/test/maintenance.test.ts` | unit |
| Fault isolation (timer survives) | `keeps ticking after a sweep failure (the timer survives)` | `apps/api/test/maintenance.test.ts` | unit |
| Fault isolation (sync throw) | `runs a synchronously-throwing keys sweep without stopping the others` | `apps/api/test/maintenance.test.ts` | unit |
| Counts logged | `logs the per-sweep counts on a tick` | `apps/api/test/maintenance.test.ts` | unit |
| `stop()` clears interval | `clears the interval — no further sweeps after stop()` | `apps/api/test/maintenance.test.ts` | unit |
| Interval `unref()`'d | `unref()'s the interval handle so it cannot keep the event loop alive` | `apps/api/test/maintenance.test.ts` | unit |
| `EPHEMERAL_KEY_TTL_MS` default = `SESSION_LIFETIME_MS` | `defaults EPHEMERAL_KEY_TTL_MS to SESSION_LIFETIME_MS (30 days)` | `apps/api/test/config.test.ts` | unit |
| `EPHEMERAL_KEY_TTL_MS` override + validation | `respects an explicit EPHEMERAL_KEY_TTL_MS override`, `throws when EPHEMERAL_KEY_TTL_MS is not a positive integer` | `apps/api/test/config.test.ts` | unit |
| `MAINTENANCE_INTERVAL_MS` default 1h + override + validation | `defaults MAINTENANCE_INTERVAL_MS to one hour`, `respects an explicit MAINTENANCE_INTERVAL_MS override`, `throws when MAINTENANCE_INTERVAL_MS is not a positive integer` | `apps/api/test/config.test.ts` | unit |

## Edge cases covered

- [x] Empty store → sweep returns 0 (`returns 0 when the store is empty`).
- [x] Strict `>` boundary (exactly `ttlMs` old survives) — pins the comparator the ADR specifies.
- [x] `forgetSessionKey` before a sweep → that id is already gone, sweep does not double-count it.
- [x] A second sweep after eviction finds nothing left.
- [x] Mixed idle + fresh entries in one sweep → only the idle ones counted/evicted.
- [x] Synchronous throw in the `keys` thunk (not just async rejection) is fault-isolated.
- [x] Timer keeps ticking across repeated failures.

## Seams assumed — FLAG FOR THE IMPLEMENTER

The ADR pins the public signatures but leaves three injection seams to the Implementer. The tests assume the following; if the Implementer chooses differently, the noted tests must be retargeted (the assertions themselves stay valid):

1. **Ephemeral clock seam.** The ADR pins `sweepExpiredSessionKeys(nowMs, ttlMs)` with `nowMs` injected, but specifies the `lastUsedAt` stamp on `rememberSessionKey`/`useSessionKey` is set/refreshed without an explicit clock param — i.e. via `Date.now()`. The refresh-on-use tests therefore control those stamps with `vi.useFakeTimers()` + `vi.setSystemTime()` and pass `nowMs` to the sweep directly. If the Implementer adds an injectable clock to remember/use, these tests still hold as long as `Date.now()` remains the default; otherwise the seam must be threaded into the tests.

2. **`unref()` observability.** The ADR says `setInterval(...).unref()`. The unref test spies on the global `setInterval`, captures the returned handle, and asserts `.unref()` was called on it once. If the Implementer instead accepts an injected `setInterval` on the opts bag, retarget the spy onto that injected fn — the assertion (handle's `unref` called once) is unchanged.

3. **Config vs. constants for the knobs.** The tests assume `EPHEMERAL_KEY_TTL_MS` / `MAINTENANCE_INTERVAL_MS` are routed through `loadConfig` onto `config.ephemeralKeyTtlMs` / `config.maintenanceIntervalMs` (consistent with every other tunable in `config.ts`). The ADR allows the Implementer to keep them as `maintenance.ts` constants instead; if so, move the `loadConfig — maintenance sweeper knobs` block out of `config.test.ts` and assert the constants in `maintenance.test.ts`.

Sweep shape assumed: `sweeps.keys` is a synchronous thunk (`() => number`); `sweeps.sessions` / `sweeps.challenges` are async (`() => Promise<number>`), matching `sweepExpiredSessions()` / `sweepExpiredChallenges()`. `ephemeralTtlMs` is threaded to the `keys` thunk by the caller (per the ADR) so it is opaque to the timer; the tests still pass it to satisfy the type.

## Test infrastructure

- Runner: Vitest (`apps/api/test/**/*.test.ts`, per `apps/api/vitest.config.ts` `include`). No new framework.
- No real DB, no real wall-clock, no real leaking `setInterval`: fake timers + injected mock sweeps + an injected `log`.
- No `docker compose` dependency — these are pure unit tests of the sweep function, the timer unit, and config parsing. `main()` wiring in `apps/api/src/index.ts` is intentionally NOT tested here (the timer unit is tested directly, per the ADR).

## How to run

```
pnpm --filter @unbnd/api test
pnpm -r typecheck
```

## Verification (RED confirmed)

Confirmed on 2026-06-05 at base commit `6bc96fb`. With no production change, the new tests fail for the right reason and the existing suites stay green.

`pnpm --filter @unbnd/api test`:

```
 Test Files  3 failed | 89 passed | 2 skipped (94)
      Tests  15 failed | 799 passed | 10 skipped (824)
```

Failure reasons (all missing-symbol / unimplemented, not typos or import noise):
- `test/auth/ephemeral-sweep.test.ts` — `TypeError: sweepExpiredSessionKeys is not a function` (9 cases).
- `test/maintenance.test.ts` — `Failed to load url ../src/maintenance` (module does not exist yet; whole suite red).
- `test/config.test.ts` (new block only) — `expected undefined to be …` for `ephemeralKeyTtlMs` / `maintenanceIntervalMs`, and `expected [Function] to throw` for the validation cases (config knobs unwired).

`pnpm --filter @unbnd/api typecheck` reports exactly the expected missing-export errors and nothing else:

```
test/auth/ephemeral-sweep.test.ts(23,3): error TS2305: Module '"../../src/auth/ephemeral"' has no exported member 'sweepExpiredSessionKeys'.
test/config.test.ts(278,14): error TS2339: Property 'ephemeralKeyTtlMs' does not exist on type 'Config'.
test/config.test.ts(279,21): error TS2339: Property 'ephemeralKeyTtlMs' does not exist on type 'Config'.
test/config.test.ts(284,14): error TS2339: Property 'ephemeralKeyTtlMs' does not exist on type 'Config'.
test/config.test.ts(298,14): error TS2339: Property 'maintenanceIntervalMs' does not exist on type 'Config'.
test/config.test.ts(303,14): error TS2339: Property 'maintenanceIntervalMs' does not exist on type 'Config'.
test/maintenance.test.ts(28,41): error TS2307: Cannot find module '../src/maintenance' or its corresponding type declarations.
```

These all resolve once the Implementer adds the `sweepExpiredSessionKeys` export, the `apps/api/src/maintenance.ts` module, and the two config keys. No production `src/` was written, nothing committed.
