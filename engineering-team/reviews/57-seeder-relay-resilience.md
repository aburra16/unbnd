# Review: Story 57 — Seeder relay-publish resilience (auto-reconnect + bounded retry)

**Reviewer:** Claude (acting as Reviewer, independent / fresh context)
**Date:** 2026-06-05
**Story:** `engineering-team/stories/done/57-seeder-relay-resilience.md`
**ADR:** `engineering-team/decisions/0056-seeder-relay-resilience.md`
**Test plan:** `engineering-team/stories/done/57-seeder-relay-resilience.test-plan.md`
**Diff:** `git diff 83aa675...HEAD` (head `4701c5c`); red set `b2ac01d`, green `4701c5c`. PR #101.

## Verdict: **PASS**

A tight, correctly-scoped hardening change. The resilient layer's retry/backoff/exhaustion logic is correct and matches the ADR exactly; the transport hardening handles the once-vs-on connect/post-open distinction without a double-handling or leak bug; scope is clean (no promoter, web, API, schema, or checkpoint change). All gates green. No blocking findings.

## Test integrity

- `git diff b2ac01d HEAD -- apps/seeder/test/` is **EMPTY**. The Implementer modified, weakened, or deleted no test file. No other suite was touched.
- Red commit `b2ac01d` added exactly the three new test files (`resilient-relay.test.ts`, `publish-resilience.test.ts`, `resilient-wiring.test.ts`) + the planning docs. Green commit `4701c5c` touched only `apps/seeder/src/{publish,resilient-relay,index}.ts` + `.env.production.example` + `docker-compose.prod.yml` + `docs/DEPLOY.md`. Nothing else.
- `apps/seeder/test/_load.ts` (the opaque loader) is unmodified — reused, not weakened.
- Re-ran `pnpm --filter @unbnd/seeder test`: **133 passed (16 files)** — 16 new (resilient-relay 7 + publish-resilience 5 + resilient-wiring 4) + 117 pre-existing.
- Story-55 scope guard `test/scope-guard.test.ts` (4 tests) still **green**.

## Quality gates (run by reviewer)

- [x] `pnpm -r typecheck` — **pass**, all 10 workspace projects Done, clean.
- [x] `pnpm -r test` — **pass**. seeder 133, web 307, api 784 (+10 skipped), schemas 112, promoter 28, ui 20, trust 23, shelves 26, indexer 6, search 11. Zero failures. (api stderr lines are intentional fail-open / errorSanitizer test logging, not failures.)
- [x] `pnpm --filter @unbnd/seeder build` — **pass** (`tsc` clean).
- [x] `pnpm --filter @unbnd/web build` — n/a, no front-end change. Visual regression CI green (zero diff).
- [x] `gh pr checks 101` — all green: Typecheck/test/build, Validate Caddyfile, Visual regression.
- Lint — not configured, skipped.

## Resilient layer correctness (`resilient-relay.ts`) — independent verdict

Traced the retry loop (`for i in 0..attempts-1`) line by line:

- **(a) Resolved `{ok:false}` (NACK) returned as-is, no reconnect/no sleep.** `return await current.publish(...)` (line 92) returns any resolved result, ok true OR false, immediately. Confirmed by the `attempts=1` connect count + empty `delays` in the NACK test. Correct — no retry storm on a genuine relay rejection.
- **(b) Rejected (transport) publish → sleep → reconnect → retry SAME event.** A reject is caught (line 93-96), `lastError` set, loop continues. Next iteration (`i>0`) sleeps `backoff(i-1)`, best-effort `close()`, `connect(url)`, re-publishes the same `event`. Correct.
- **(c) Backoff schedule `min(maxMs, baseMs*2**i)` with `i` = 0-based first-wait index.** First wait is `backoff(0)=baseMs`. Verified the three pinned schedules: `attempts=4` → connect ×4, delays `[500,1000,2000]`; defaults `6/500/8000` → connect ×6, delays `[500,1000,2000,4000,8000]` (last exactly at cap); cap `maxMs=2000` → `[500,1000,2000,2000,2000]`. All match the tests exactly.
- **(d) Exhaustion throws `/relay unreachable/i` after exactly `attempts` tries.** Loop bound is `i < attempts`; after the last failed attempt the loop ends and throws `relay unreachable after ${attempts} attempts: ${lastError?.message}`. Correct.
- **(e) Thrown `connect()` during reconnect (Implementer-flagged, not directly test-covered).** Reasoned independently: a throw from `connect(url)` (line 78) is caught, `lastError` is set, and `continue` skips the publish of a stale/closed `current` — it does NOT publish into a dead connection. The loop remains bounded by `i < attempts`, so it **cannot infinite-loop**. If `connect` throws on the final attempt, `lastError` carries that error and it is surfaced by the final throw — **not swallowed**. Correct and safe. (Minor: a thrown reconnect skips the `onReconnect` log via `continue`, so a failed reconnect attempt is not logged; observability nit, non-blocking — the terminal throw still reports it.)
- **(f) No unhandled rejection / dangling timer.** The wrapper holds no timers (sleep is injected). Caught rejects are stored, not re-thrown until exhaustion. No leak.
- **(g) `close()` delegates to the current connection.** `close()` reads `current` at call time (line 103), so after reconnects it closes the live socket. Verified by the close-delegation test.

## Transport hardening correctness (`publish.ts`) — independent verdict

- **Send-throw path** (lines 99-105): `ws.send` wrapped in try/catch; on throw clears the timer, deletes the waiter, and **rejects** (not a resolved `{ok:false}`). No timer leak. Test advances 11s after the throw and observes no stray resolution — timer is genuinely cleared.
- **Post-open close/error → reject every pending + mark dead** (`killPending`, lines 55-63; `close` handler 121-123; `error` handler 127-133): sets `dead=true`, clears each pending timer, rejects each waiter, clears the map. A later `publish` hits the `if (dead)` guard (line 90-92) and rejects immediately **without sending** — test asserts `ws.sent.length` is unchanged after the dead publish. Correct; converts a silent drop into a fast reject instead of a 10s grind.
- **once-vs-on connect/post-open distinction (the subtle one):** `open` is `once` (line 85) — fires exactly once. `close` and `error` are `on` (live for the connection's life). The `error` handler routes on `if (opened)`: pre-open → `reject(connect promise)`; post-open → `killPending`. Because it's a single `on` handler with the `opened` guard, there is **no** double-handling bug: the connect-time error cannot also reject pending post-open (guard routes it to `killPending`), and a post-open error cannot reject the already-settled connect promise meaningfully (a second `reject` on a resolved promise is a no-op, and the guard prevents reaching it anyway). Correct.
- **Relay NACK + 10s timeout still resolve `{ok:false}`** (lines 78-82, 94-97): unchanged. NACK test resolves `{ok:false, reason:"blocked"}`; transport failures stay distinguishable.
- **Injected `createWebSocket` honored, defaults to real `ws`** (lines 36-37). Baseline test drives the full open→send→OK→`{ok:true}` happy path through the fake — no behavioral regression.
- **`WebSocketLike` type** (lines 19-25) covers only `on`/`once`/`send`/`close` — exactly the slice used. No over-broad surface.

## Spec / ADR adherence

- [x] Every acceptance criterion maps to a passing test (transport ×5, resilient ×7 incl. defaults + close delegation, wiring ×4). Coverage map in the test plan is accurate.
- [x] `index.ts` swaps `connectResilientRelay` in with the same `relay.publish` / `relay.close` calls; the seed loop, checkpoint, gate, dedup, blurb path, rate limiting, and politeness (`sleep(rateMs)`) are byte-for-byte unchanged. Reconnects logged via `onReconnect` → `console.warn("[seeder] relay reconnect attempt i/N …")` (ADR §3).
- [x] Three env knobs read with ADR defaults (`RELAY_RECONNECT_ATTEMPTS`=6, `_BASE_MS`=500, `_MAX_MS`=8000) and documented in `docker-compose.prod.yml`, `.env.production.example`, and `docs/DEPLOY.md`. Idempotency note (re-send-after-reconnect is safe; kind-39999 replaces by d-tag; checkpoint records only on confirmed `{ok:true}`) present in both DEPLOY.md and the module header.
- [x] No new dependencies. No new build/lint/typecheck tooling.

## Scope

- [x] `apps/promoter` **NOT touched** — its duplicate `connectRelay` is unchanged (scope boundary deliberate; shared-client extraction is the logged follow-up). Confirmed no diff under `apps/promoter/`.
- [x] No web / API / `@unbnd/schemas` / checkpoint / event-shape change.
- [x] DList integrity n/a — no event kinds, d-tags, or word-wrapper shapes changed.
- [x] No secrets, no leftover debug `console.log` (the new `console.warn`/`console.log` are intentional operator logging), no commented-out code.

## Findings

**Blocking:** none.

**Non-blocking (informational):**
1. A thrown `connect()` during reconnect skips the `onReconnect` log (via `continue` before the log call). The terminal `relay unreachable` throw still surfaces the error, so this is purely an observability nit; a sustained outage where `connect` itself throws would be visible only at the final throw, not per-attempt. Not worth blocking; could be tightened in the follow-up shared-client extraction.

## Verdict

**PASS** — mergeable as-is.
