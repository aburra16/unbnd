# Test Plan: Story 63 — Up-sync cron verification + sync-health monitoring

**Story:** `engineering-team/stories/63-upsync-monitoring.md`
**ADR:** `engineering-team/decisions/0062-upsync-monitoring.md`
**Date:** 2026-06-05

## Scope

The buildable core of Story 63: a pure, injectable sync-health check, a
success-signalling relay read, a cached monitor timer, and a `GET /health/sync`
endpoint — all pinned to **ADR 0062**. The operator-runbook acceptance criterion
(`ops/sync-runbook.md`) is doc-only and verified by review, not by an automated
test (noted under "Not automated" below).

Names/signatures pinned from ADR 0062:

- `apps/api/src/health/upsync.ts`
  - `checkUpsyncBacklog(deps): Promise<Omit<UpsyncHealth, "checkedAtMs">>` where
    `deps = { readLocal: RelayRead; readDcosl: RelayRead | null; librarianPubkey: string | null; now: () => number; windowMs: number; limit: number }`
    and `RelayRead = (filter: NostrFilter) => Promise<{ ok: boolean; events: SignedNostrEvent[] }>`.
  - `UpsyncHealth = { status: "in-sync" | "backlog" | "unknown"; backlog: number; oldestUnpropagatedAgeMs: number | null; capped: boolean; windowMs: number; limit: number; reason?: string; checkedAtMs: number | null }`.
  - `getUpsyncHealth(): UpsyncHealth` (module-level cache; pre-first-run `unknown`/`checkedAtMs:null`).
  - `startUpsyncHealthMonitor(deps): { stop(): void }` (dedicated `unref()`'d `setInterval`, fault-isolated tick).
- `apps/api/src/nostr/query.ts`
  - `queryRelayUrlChecked(relayUrl, filter, timeoutMs): Promise<{ ok: boolean; events: SignedNostrEvent[] }>` (`ok:true` on EOSE, `ok:false` on timeout/error).
  - `NostrFilter` gains `ids?: string[]` and `since?: number`.
  - `queryRelayUrl` / `queryEvents` unchanged (resolve-on-error, bare array).
- `apps/api/src/routes/health.ts`
  - `HealthDeps` gains optional `readUpsyncHealth?: () => UpsyncHealth`.
  - `GET /health/sync` serves the cached value verbatim, **always HTTP 200**.

## Coverage map

| Acceptance criterion (story) | Test name | Test file | Level |
|---|---|---|---|
| In-sync: all local events on dcosl → backlog 0, no oldest age | `it("reports in-sync (backlog 0, no oldest age) when every local event is on dcosl")` | `apps/api/test/health/upsync.test.ts` | unit |
| In-sync: empty local window is a clean reading | `it("reports in-sync when the local window is empty (nothing recent to propagate)")` | `apps/api/test/health/upsync.test.ts` | unit |
| Backlog: missing count + oldest unpropagated age | `it("reports the missing count and the oldest unpropagated age")` | `apps/api/test/health/upsync.test.ts` | unit |
| Degrade: dcosl read fails → `unknown` w/ reason, NEVER false in-sync (load-bearing) | `it("reports unknown with a reason when the dcosl read fails — NEVER a false in-sync/backlog-0")` | `apps/api/test/health/upsync.test.ts` | unit |
| Degrade: local read fails → `unknown`, never a backlog | `it("reports unknown when the local read fails (never a backlog off a failed local read)")` | `apps/api/test/health/upsync.test.ts` | unit |
| Degrade: `readDcosl===null` → `unknown`, no reads attempted | `it("reports unknown (no reads attempted) when readDcosl is null")` | `apps/api/test/health/upsync.test.ts` | unit |
| Degrade: `librarianPubkey===null` → `unknown`, no reads attempted | `it("reports unknown (no reads attempted) when librarianPubkey is null")` | `apps/api/test/health/upsync.test.ts` | unit |
| Bounded: local read issued with `since` (window) + `limit` (cap) + both `#z` handles | `it("issues the local read with the decided since (now − window) and the cap limit")` | `apps/api/test/health/upsync.test.ts` | unit |
| Bounded: dcosl read keyed on local ids (exact membership) | `it("keys the dcosl read on the local event ids (exact membership form)")` | `apps/api/test/health/upsync.test.ts` | unit |
| Bounded: at/over cap → `capped:true` | `it("surfaces capped:true when the local window is at/over the cap")` | `apps/api/test/health/upsync.test.ts` | unit |
| Bounded: under cap → `capped:false` | `it("reports capped:false when the local window is under the cap")` | `apps/api/test/health/upsync.test.ts` | unit |
| Pure/deterministic: injected clock, no `Date.now` | `it("never calls Date.now (uses the injected clock) for the age math")` | `apps/api/test/health/upsync.test.ts` | unit |
| Off the request hot path: cached compute on a periodic tick | `it("computes on each tick and updates getUpsyncHealth() with a checkedAtMs stamp")` | `apps/api/test/health/upsync.test.ts` | unit |
| Fault isolation: throwing check caught, prior cache kept, timer survives | `it("catches a throwing check, leaves the prior cache, keeps ticking")` | `apps/api/test/health/upsync.test.ts` | unit |
| Never holds the loop open: `unref()`'d | `it("unref()'s the interval handle so it cannot keep the event loop alive")` | `apps/api/test/health/upsync.test.ts` | unit |
| Lifecycle: `stop()` clears the interval | `it("stop() clears the interval — no further ticks after stop()")` | `apps/api/test/health/upsync.test.ts` | unit |
| Success-signalling read: `ok:true` on EOSE | `it("resolves { ok:true, events } when EOSE is seen")` | `apps/api/test/nostr/query-checked.test.ts` | unit (mocked ws) |
| Success-signalling read: `ok:false` on socket error | `it("resolves { ok:false, events:[] } on a socket error")` | `apps/api/test/nostr/query-checked.test.ts` | unit (mocked ws) |
| Success-signalling read: `ok:false` on timeout (no EOSE) | `it("resolves { ok:false, events:[] } on timeout (no EOSE within the budget)")` | `apps/api/test/nostr/query-checked.test.ts` | unit (mocked ws) |
| `NostrFilter` `ids`/`since` typecheck + forwarded into REQ | `it("forwards ids and since on the REQ filter via queryRelayUrlChecked")` | `apps/api/test/nostr/query-checked.test.ts` | unit (mocked ws) |
| `queryRelayUrl` UNCHANGED (resolve-on-error, bare array) | `it("resolves with the collected (bare) array on EOSE")` + `it("resolves (does not throw) with an empty array on a socket error")` | `apps/api/test/nostr/query-checked.test.ts` | unit (mocked ws) |
| Endpoint shape: serves cached value, status/backlog/age/checkedAtMs | `it("returns 200 with an in-sync reading from the injected cache reader")` | `apps/api/test/routes/health-sync.test.ts` | route |
| Endpoint: always 200 on backlog, carries count + oldest age | `it("returns 200 (NOT an HTTP error) on a backlog reading, carrying count + oldest age")` | `apps/api/test/routes/health-sync.test.ts` | route |
| Endpoint: always 200 on unknown, carries reason | `it("returns 200 on an unknown reading, carrying the reason")` | `apps/api/test/routes/health-sync.test.ts` | route |
| Endpoint: pre-first-run → `unknown`, `checkedAtMs:null`, still 200 | `it("pre-first-run (no readUpsyncHealth dep) → unknown with checkedAtMs:null, still 200")` | `apps/api/test/routes/health-sync.test.ts` | route |
| Non-flap: `/health` unaffected | `it("/health stays a trivial 200 liveness payload")` | `apps/api/test/routes/health-sync.test.ts` | route |
| Non-flap: sync `unknown` does NOT flip `/health/data` to 503 | `it("a sync 'unknown' does NOT flip /health/data's aggregate to 503")` | `apps/api/test/routes/health-sync.test.ts` | route |
| Non-flap: sync `backlog` does NOT flip `/health/data` to 503 | `it("a sync 'backlog' does NOT flip /health/data's aggregate to 503")` | `apps/api/test/routes/health-sync.test.ts` | route |

## Edge cases

- [x] Empty local window (clean in-sync, dcosl not consulted).
- [x] dcosl unreachable / timeout / errored read → `unknown`, never false in-sync (the load-bearing correctness property).
- [x] Unconfigured (`readDcosl===null` / `librarianPubkey===null`) → `unknown`, no reads attempted.
- [x] Local read failure → `unknown`, never a backlog off a failed local read.
- [x] Cap-clipping → `capped:true` at/over the limit.
- [x] Age math uses the injected clock (created_at seconds → ms), not wall-clock.
- [x] Monitor fault isolation: a throwing check leaves the prior cache, does not re-stamp `checkedAtMs`, timer keeps ticking.
- [x] Endpoint always 200 regardless of `status` (backlog/unknown are not liveness failures).
- [x] `/health` and `/health/data` provably unaffected by the sync signal (non-flap regression).

## Not automated (verified by review)

- The `ops/sync-runbook.md` "Sync-health monitoring" section (cron presence + recent-activity check; how to read/interpret the signal; what to do when stalled). Doc-only AC — confirm by review against the real cron file + the real endpoint shape.

## Test infrastructure

- Runner: Vitest (`apps/api/test/**/*.test.ts`), node environment.
- `checkUpsyncBacklog` + `startUpsyncHealthMonitor`: pure/deterministic — injected `{ ok, events }` reads, an injected `now` clock, fake timers (`vi.useFakeTimers`), and a `setInterval` spy for the `unref()` assertion (mirrors `apps/api/test/maintenance.test.ts`). No real relay, DB, or wall-clock.
- `queryRelayUrlChecked` / `queryRelayUrl`: the `ws` `WebSocket` is mocked via `vi.mock("ws")` with a tiny in-memory fake (class defined inside the hoisted factory; instances tracked on the mocked export) so a test drives open → message(s) → EOSE / error / timeout. No real network.
- `GET /health/sync`: `supertest` against `buildHealthRouter` with an injected `readUpsyncHealth` (mirrors `apps/api/test/routes/health.test.ts`). No real cache/timer.

## How to run

```
pnpm --filter @unbnd/api test
pnpm -r test
pnpm -r typecheck
```

## Verification

Confirmed RED on 2026-06-05 at commit `29151db` (branch `story-63-upsync-monitoring`).

Scoped run of the three new files:

```
 ✓ test/nostr/query-paged.test.ts (9 tests)        # existing — unchanged, green
 ✓ test/routes/health.test.ts (6 tests)            # existing — unchanged, green
 ❯ test/health/upsync.test.ts (0 test)             # suite fails to load: missing src/health/upsync
 ❯ test/nostr/query-checked.test.ts (6 tests | 4 failed)  # queryRelayUrlChecked is not a function
 ❯ test/routes/health-sync.test.ts (7 tests | 4 failed)   # GET /health/sync → 404 (route not added)
```

Full `pnpm --filter @unbnd/api test`: `Test Files 3 failed | 92 passed | 2 skipped (97)`, `Tests 8 failed | 827 passed | 10 skipped (845)` — only the three new Story-63 files fail; every existing suite (including `health.test.ts` and `query-paged.test.ts`) stays green.

Failures are all for the right reason — the feature is unimplemented:

- `test/health/upsync.test.ts` — `Failed to load url ../../src/health/upsync … Does the file exist?` (module not yet created; the canonical missing-module red — no `src/` written per the Tester contract).
- `test/nostr/query-checked.test.ts` — `TypeError: queryRelayUrlChecked is not a function` ×4 (export missing). The two `queryRelayUrl`-unchanged cases PASS, confirming the ws mock works and existing behavior holds.
- `test/routes/health-sync.test.ts` — `expected 404 to be 200` ×4 (`GET /health/sync` route not yet added). The non-flap `/health` + `/health/data` cases pass on the existing router (the regression baseline).

`pnpm -r typecheck`: every other package is `Done`; `apps/api` reports ONLY the intended missing-contract errors:

```
test/health/upsync.test.ts: Cannot find module '../../src/health/upsync'
test/health/upsync.test.ts: Property 'since'/'ids' does not exist on type 'NostrFilter'
test/nostr/query-checked.test.ts: Module '../../src/nostr/query' has no exported member 'queryRelayUrlChecked'
test/nostr/query-checked.test.ts: 'ids'/'since' do not exist in/on type 'NostrFilter'
test/routes/health-sync.test.ts: Cannot find module '../../src/health/upsync'
test/routes/health-sync.test.ts: 'readUpsyncHealth' does not exist in type 'Partial<HealthDeps>'
```

No stray (non-contract) type errors — the red set is clean apart from the missing exports/properties the Implementer will add.
