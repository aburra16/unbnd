# Review: Story 62 — Periodic maintenance sweeper (ephemeral key-map idle-evict + wired DB sweepers)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-05
**Story:** `engineering-team/stories/done/62-maintenance-sweeper.md`
**Test plan:** `engineering-team/stories/done/62-maintenance-sweeper.test-plan.md`
**ADR:** `engineering-team/decisions/0061-maintenance-sweeper.md`
**Diff:** `git diff 6bc96fb..603d1d0` (head `603d1d0`); tester red `8ab908b`, green `603d1d0`. PR #107.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (all 11 workspaces Done; api `tsc --noEmit` clean).
- [x] `pnpm -r test` — **pass**. `apps/api` 822 passed | 10 skipped (92 files passed, 2 skipped); all other packages Done. (On one of four full-workspace runs, `test/routes/foryou.test.ts` showed 1 intermittent failure under concurrent workspace load; it passes in isolation and across three consecutive full api runs. It is a pre-existing timing flake — Story 62 touches no for-you code, see Scope.)
- [x] `pnpm --filter @unbnd/api build` — **pass** (`tsc`, exit 0).
- [x] `gh pr checks 107` — **all pass**: Typecheck/test/build, Validate Caddyfile, Visual regression. PR `MERGEABLE`.
- [ ] _Lint not configured — skipped._
- [ ] _`pnpm --filter @unbnd/web build` — N/A, no web change._

## Test integrity (extra scrutiny — tests were touched)

`git diff 8ab908b 603d1d0 -- '**/*.test.ts'` shows **exactly one test file changed**, `apps/api/test/auth/ephemeral-sweep.test.ts`, +7 lines, no deletions:

```diff
 import {
   NoSessionKeyError,
+  __resetSessionKeyStore,
   forgetSessionKey,
   rememberSessionKey,
   sweepExpiredSessionKeys,
@@
+// Isolate the process-local store per test (entries otherwise leak across the
+// `it` blocks below and pollute the store-wide count assertions).
+beforeEach(() => {
+  __resetSessionKeyStore();
+});
```

- **No existing assertion changed, removed, or weakened.** The change is purely additive: an import + a top-level `beforeEach` reset.
- **`config.test.ts` new block unchanged since red** — `git diff 8ab908b 603d1d0 -- apps/api/test/config.test.ts` is empty; the block was authored by the Tester at `8ab908b` and is untouched in green.
- **No other test file touched.** `maintenance.test.ts` and `config.test.ts` are byte-identical to the red commit.
- **The reset is legitimate isolation, not assertion-weakening.** The store is process-local + module-global. The suite asserts *store-wide* counts (`sweepExpiredSessionKeys` iterates the whole `Map`; e.g. `returns 0 when the store is empty`, `counts only the idle entries when some survive`). Without a per-test reset, entries left by a prior `it` block leak into a later sweep's count and would *inflate* `evicted` — making a passing assertion accidentally weaker or falsely red. Adding the reset makes the exact-count assertions sound. It removes nothing; the assertions still demand precise counts (`toBe(1)`, `toBe(0)`) and fail-closed `NoSessionKeyError`.

## The `__resetSessionKeyStore` seam

`apps/api/src/auth/ephemeral.ts:99` — `export function __resetSessionKeyStore(): void { store.clear(); }`.

- **Test-only, no production caller.** `grep -rn "__resetSessionKeyStore"` over `apps/` + `packages/` returns exactly three hits: the definition (`ephemeral.ts`) and the two uses in `ephemeral-sweep.test.ts` (import + `beforeEach`). No `src/` caller.
- **Does not alter production lifetime semantics.** It is a plain `store.clear()` reachable only from tests; the production store still lives for the process lifetime and is only mutated via `rememberSessionKey` / `useSessionKey` / `forgetSessionKey` / `sweepExpiredSessionKeys`. The `__` prefix + doc comment mark it as a test seam.

## Ephemeral sweep + `lastUsedAt` correctness

`apps/api/src/auth/ephemeral.ts`:
- Store value type changed `Uint8Array` → `{ blob: Uint8Array; lastUsedAt: number }` (per ADR; invisible to callers).
- `rememberSessionKey` stamps `lastUsedAt: Date.now()`.
- `useSessionKey` refreshes `entry.lastUsedAt = Date.now()` **after a successful unwrap, before invoking `fn`** — a key in active use is never swept. Wrap/unwrap/wipe semantics (the `try/finally` secret wipe) are otherwise unchanged; signatures of remember/use/forget/`NoSessionKeyError` are unchanged.
- `sweepExpiredSessionKeys(nowMs, ttlMs)` iterates the map; for each entry with **strict** `nowMs - entry.lastUsedAt > ttlMs` it does `entry.blob.fill(0)` then `store.delete(...)`, incrementing the count; returns the count. `nowMs` is injected (pure, deterministic). Exactly `>`, not `>=` — confirmed by the `exactly ttlMs old survives` test.
- Eviction wipes the ciphertext blob before delete; a subsequent `useSessionKey` fails closed with `NoSessionKeyError` (test `an evicted entry fails closed on a subsequent use`).
- Reasoned through: idle key swept (idle-evict test), actively-used key survives past remember+TTL because the refresh moves the clock forward (refresh-on-use test), mixed idle/fresh counts only the idle (counts-only-idle test).

## Maintenance timer

`apps/api/src/maintenance.ts` (new):
- `startMaintenanceSweeper(opts)` — each tick runs `keys` (sync thunk), then awaits `sessions`, then `challenges`. **Each sweep is fault-isolated** via `runSweep`, which `try/catch`es the (awaited) sweep, logs `[maintenance] <name> sweep failed: ...`, and returns `0` so the others still run. The tick never throws (the timer callback is `() => void tick()`). Tested for async reject, **sync throw** (`keys`), and timer-survives-across-failures.
- One-line summary logged: `[maintenance] swept N keys, M sessions, K challenges` (count-logging test asserts 3/5/7 appear).
- `setInterval(...)` handle is **`unref()`'d** (`handle.unref()`), so it never holds the event loop open — asserted by the unref spy test (`handles[0].unref` called once).
- `stop()` calls `clearInterval(handle)` — asserted (no further sweeps after stop).
- Sweeps are injected → unit-testable with mocks + fake clock, no real DB/time.
- `now?` option is accepted but unused (documented "reserved for callers/tests"); harmless, matches the ADR's optional seam. Non-blocking.

## DB sweepers wired, unchanged

- `git diff 8ab908b 603d1d0 -- apps/api/src/auth/sessions.ts apps/api/src/auth/challenges.ts` is **empty** — `sweepExpiredSessions(): Promise<number>` (sessions.ts:96) and `sweepExpiredChallenges(): Promise<number>` (challenges.ts:49) are byte-unchanged.
- They are now invoked from `apps/api/src/index.ts` `main()`, after `app.listen`, as background hygiene that does not touch request handling. The wiring passes:
  - `keys: () => sweepExpiredSessionKeys(Date.now(), ephemeralKeyTtlMs)`,
  - `sessions: () => sweepExpiredSessions()`,
  - `challenges: () => sweepExpiredChallenges()`,
  - `log: console.log`, `intervalMs: config.maintenanceIntervalMs ?? 1h`, `ephemeralTtlMs: config.ephemeralKeyTtlMs ?? SESSION_LIFETIME_MS`.
- This is the first time the two DB sweepers run periodically (was a latent unbounded-growth bug; folded in per the ADR's discovered-bug rationale).

## Config

`apps/api/src/config.ts`:
- `ephemeralKeyTtlMs` — env `EPHEMERAL_KEY_TTL_MS`, default `String(SESSION_LIFETIME_MS)` (imported from `./auth/sessions`, 30 days), validated positive integer (`!Number.isFinite || < 1 || !Number.isInteger` → throw).
- `maintenanceIntervalMs` — env `MAINTENANCE_INTERVAL_MS`, default `60*60*1000` (1h), same validation.
- Both follow the existing `withDefault` + parse + validate + spread-onto-Config style. Matches the unchanged `config.test.ts` block exactly (defaults, overrides, and the `"nope"`/`"0"`/`"abc"` throw cases).

## DList integrity
N/A — no event shapes, no kinds/d-tags, no librarian pubkey usage. In-memory store + DB row cleanup + a startup timer.

## UI integrity
N/A — no `apps/web` change.

## Things tests can't catch
- [x] No secrets committed. The wrapped-key blob is wiped (`fill(0)`) before delete on eviction.
- [x] No leftover debug logging; the two `console.log` references are the intended maintenance/boot logs, each with the existing `eslint-disable no-console` pattern used elsewhere in this file.
- [x] No commented-out code.
- [x] Error paths handled — each sweep fault-isolated; sweep is pure on injected `nowMs`.
- [x] Concurrency — the store is single-process, single-threaded JS; the sweep mutates a `Map` synchronously within one tick; the DB sweeps are awaited sequentially. No race introduced.
- [x] Security — no new input boundary; config knobs validated as positive integers; no crypto/signing change (only `lastUsedAt` bookkeeping added).

## House rules check
- [x] PRD §11.3 scope discipline — nothing out-of-scope; this is Block E hygiene (§2.11).
- [x] POV-first — N/A (process-local store + DB cleanup; no per-POV truth).
- [x] No new lint/typecheck/build tooling.

## Scope
Diff base→head touches only: `apps/api/src/auth/ephemeral.ts`, `apps/api/src/config.ts`, `apps/api/src/index.ts`, `apps/api/src/maintenance.ts` (new), the three test files, and the three engineering-team docs. No web/UI, no schema, no crypto/signing-flow change, no change to `sessions.ts`/`challenges.ts` logic. Exactly the ADR scope.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/api/src/maintenance.ts:33`** — the `now?` option is accepted but unused (reserved per its doc). Harmless; could be dropped in a later cleanup if it never finds a caller.

## Verdict
**PASS**
