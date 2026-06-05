# ADR 0061: Periodic maintenance sweeper — ephemeral key idle-eviction + wiring the orphaned DB sweepers

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/62-maintenance-sweeper.md`

**Accepted 2026-06-05.** Add an idle-TTL sweep to the custodial ephemeral key store (`apps/api/src/auth/ephemeral.ts`) and a single periodic **maintenance timer** started in `main()` that runs three sweeps each tick: the ephemeral key sweep, the existing-but-unwired `sweepExpiredSessions()`, and `sweepExpiredChallenges()`. The timer is `unref()`'d (never holds the process open), fault-isolated (one sweep failing logs + does not stop the others), and configurable. Block E / PRD §2.11. No change to the wrap/unwrap crypto, the custodial signing flow, or the session/challenge lifetimes.

## Context

`apps/api/src/auth/ephemeral.ts` holds `Map<sessionIdHex, wrappedKey>` evicted only on logout/rotation/restart — an abandoned custodial session's wrapped nsec lingers indefinitely (encrypted under a process-local key, so bounded exposure, but unbounded memory). PRD §2.11 calls for an idle-expiry sweep. While scoping, `sweepExpiredSessions()` (`sessions.ts`, 30-day sliding lifetime) and `sweepExpiredChallenges()` (`challenges.ts`, 5-minute lifetime, high churn) were found **defined but with zero call sites** — never wired, so those tables grow unbounded. Since this story introduces exactly the periodic timer they need, it wires them in rather than leaving the timer half-used beside a known growth bug.

## Decision

### 1. Ephemeral key idle-TTL (`apps/api/src/auth/ephemeral.ts`)
- Each store value carries a `lastUsedAt` (ms). Set in `rememberSessionKey`; refreshed in `useSessionKey` on every successful unwrap (a key in active use is never swept).
- `export function sweepExpiredSessionKeys(nowMs: number, ttlMs: number): number` — for each entry, if `nowMs - lastUsedAt > ttlMs`: wipe the wrapped blob (`blob.fill(0)`) and `delete`; return the count evicted. `nowMs` injected → deterministic unit tests; no wall-clock inside the pure sweep.
- TTL via config `EPHEMERAL_KEY_TTL_MS`, default `SESSION_LIFETIME_MS` (30 days). Rationale: the key's `lastUsedAt` refreshes on each write and the session expiry slides on each touch, so a key idle past a full session lifetime belongs to an abandoned/expired session. (Edge: a session active-by-reads-only for > TTL with no writes would lose its key and re-login on the next write — at a 30-day idle window this is negligible and identical to the existing post-restart behavior.)
- `rememberSessionKey`/`useSessionKey`/`forgetSessionKey`/`NoSessionKeyError` keep their signatures + wrap/unwrap/wipe semantics; only the `lastUsedAt` bookkeeping is added. The internal `store` value type changes from `Uint8Array` to `{ blob: Uint8Array; lastUsedAt: number }` (or a parallel map — Implementer's call), invisible to callers.

### 2. The maintenance timer (`apps/api/src/maintenance.ts`, new)
- `startMaintenanceSweeper(opts: { intervalMs, ephemeralTtlMs, now?, sweeps: { keys, sessions, challenges }, log? }): { stop(): void }`. Each tick runs the three sweeps; the DB sweeps are awaited; **each is wrapped so a throw is caught + logged and the others still run**. Logs a one-line summary (`[maintenance] swept N keys, M sessions, K challenges`). The sweeps are INJECTED (the ephemeral sweep as a thunk binding `Date.now()`+ttl; the two DB sweepers passed in) so the tick is unit-testable with mocks + a fake clock and no real DB/time.
- `setInterval(...).unref()` so it never keeps the process alive; `stop()` clears it (for tests/shutdown). Optionally run one tick shortly after boot.
- Config: `MAINTENANCE_INTERVAL_MS` (default 1h) + `EPHEMERAL_KEY_TTL_MS` (default `SESSION_LIFETIME_MS`).
- Wired in `apps/api/src/index.ts` `main()` near `app.listen` — start it after the server is up; it is best-effort background hygiene and must never affect request handling.

### 3. Wiring the DB sweepers
`sweepExpiredSessions()` / `sweepExpiredChallenges()` are unchanged (already implemented + tested); they are simply passed into the maintenance timer as the `sessions`/`challenges` sweeps. This is the first time they run periodically.

## Consequences

- Abandoned custodial keys are evicted on an idle TTL; in-memory wrapped-nsec lifetime is bounded instead of until-restart.
- The `sessions` + `challenges` tables stop growing unbounded (the 5-minute challenges especially) — a latent bug fixed by wiring the existing sweepers.
- One small startup timer, `unref()`'d + fault-isolated, never affecting requests; a sweep failure self-logs and retries next tick.
- No crypto/flow change; the only behavioral edge is the rare re-login for a >30-day-idle-no-writes session, identical to the existing restart behavior.

## Risks
- A bug in the sweep could evict a live key (spurious re-login). Mitigated: `lastUsedAt` refresh on every use + a 30-day default TTL + unit tests for active-survives/idle-evicted.
- The DB sweeps run in the API process; a slow/failing DB sweep must not stall request handling. Mitigated: they run on the background interval, awaited only within the tick, each fault-isolated; `unref()`'d.
- Scope note: wiring the DB sweepers is beyond the literal PRD bullet, included deliberately as a discovered-bug fix sharing the new timer (flagged to the operator at the gate).
