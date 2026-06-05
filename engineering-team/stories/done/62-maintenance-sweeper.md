# Story 62: Periodic maintenance sweeper (ephemeral key-map + orphaned DB sweepers)

**Status:** Done
**Created:** 2026-06-05
**Type:** Hardening (Block E)

## Background

Block E, PRD §2.11: "Ephemeral key-map expiry sweeper: idle-expiry cleanup for custodial session key maps."

The custodial signing key store (`apps/api/src/auth/ephemeral.ts`) is a process-local `Map<sessionIdHex, wrappedKey>`. An entry is evicted only on **logout** (`forgetSessionKey`), **rotation**, or **process restart**. A custodial user who abandons a session (closes the tab without logging out) leaves their wrapped key in the map **indefinitely** until a restart. The key is encrypted (XChaCha20-Poly1305 under a process-local key that dies on restart), so the exposure is bounded, but holding wrapped nsecs for dead sessions forever is unnecessary and unbounded in memory. This story adds an **idle-expiry sweep** so a key whose session has gone idle past a TTL is evicted.

**Discovered while scoping (folded in):** `apps/api/src/auth/sessions.ts` `sweepExpiredSessions()` and `apps/api/src/auth/challenges.ts` `sweepExpiredChallenges()` are implemented (each `DELETE`s expired rows and returns a count) but have **zero call sites** — they are never wired to any timer or cron. So the `sessions` (30-day sliding lifetime) and especially the `challenges` (5-minute lifetime — high churn) tables grow without bound. Because this story introduces the periodic-maintenance timer those sweepers need, it wires them into the same loop rather than leaving the timer half-used next to a known unbounded-growth bug.

## User-facing description

No end-user-facing change. As the operator/security owner, I want abandoned custodial signing keys evicted from memory on an idle TTL, and the already-written expired-session/challenge DB sweepers actually running, so memory and the auth tables don't grow without bound.

## Acceptance criteria

**Ephemeral key-map idle sweep**
- [ ] Each store entry tracks a `lastUsedAt`, set on `rememberSessionKey` and refreshed on every successful `useSessionKey` (a key in active use is never swept).
- [ ] A pure-ish `sweepExpiredSessionKeys(nowMs, ttlMs): number` evicts every entry with `nowMs - lastUsedAt > ttlMs`, wipes the wrapped blob, and returns the count evicted; entries within the TTL survive. `nowMs` is injected so it is deterministically unit-testable.
- [ ] The TTL is configurable (env, e.g. `EPHEMERAL_KEY_TTL_MS`) and defaults to `SESSION_LIFETIME_MS` (30 days) — a key idle longer than a full session lifetime belongs to an abandoned/expired session. (A still-active session keeps its key via the `lastUsedAt` refresh on each write.)
- [ ] Existing `rememberSessionKey` / `useSessionKey` / `forgetSessionKey` / `NoSessionKeyError` behavior is otherwise unchanged (wrap/unwrap/wipe semantics intact).

**Periodic maintenance timer**
- [ ] A maintenance sweeper started at app boot (`apps/api/src/index.ts` `main()`) runs, on a configurable interval (env, e.g. `MAINTENANCE_INTERVAL_MS`, default hourly): the ephemeral key sweep, `sweepExpiredSessions()`, and `sweepExpiredChallenges()`. It returns a stop handle, is `unref()`'d (never keeps the process alive), and is testable without real time.
- [ ] Each tick is fault-isolated: a failure in one sweep (e.g. a DB error) is caught + logged and does NOT crash the timer or prevent the other sweeps; counts are logged (e.g. `[maintenance] swept N keys, M sessions, K challenges`).
- [ ] The two DB sweepers are now actually invoked periodically (they were defined but unwired); their existing logic/tests are unchanged.

**Gates**
- [ ] New unit tests: the ephemeral sweep eviction (idle-evicted, active-survives, count, blob wiped) with an injected clock; the maintenance tick calls all three sweeps with one mock failing → others still run + error logged + no throw; the timer is `unref()`'d. `pnpm -r typecheck` / `pnpm -r test` / api build green. No web/UI change; no auth/signing behavior change beyond the added sweep.

## DList shapes touched

None. In-memory store + DB row cleanup + a startup timer. No events, no schema.

## Out of scope

- Changing the wrap/unwrap crypto or the custodial signing flow (only adds eviction).
- The session sliding-expiry / challenge lifetimes themselves (unchanged; we only sweep what's already expired/idle).
- A distributed/cross-process sweeper (the ephemeral store is process-local by design; a restart already clears it).
- The up-sync cron verification (separate Block E story).

## Open questions

For the Architect: the exact `lastUsedAt` seam + clock injection for tests (a module clock vs `nowMs` params); whether `rememberSessionKey`/`useSessionKey` stamp via `Date.now()` directly or an injectable clock; the maintenance timer's home (a small `apps/api/src/maintenance.ts` started from `main()`) + how it takes the three sweeps as injected deps for fault-isolation testing; default interval value.

## Linked artifacts

- ADR: `engineering-team/decisions/0061-maintenance-sweeper.md`
- Review: `engineering-team/reviews/62-maintenance-sweeper.md`
