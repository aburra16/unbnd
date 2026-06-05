# Test Plan: Story 57 — Seeder relay-publish resilience (auto-reconnect + bounded retry)

**Story:** `engineering-team/stories/done/57-seeder-relay-resilience.md`
**ADR:** `engineering-team/decisions/0056-seeder-relay-resilience.md` (Accepted)
**Date:** 2026-06-05
**Branch:** `story-57-seeder-relay-resilience`

## Scope

Tests only (TDD red). Three surfaces, all in `apps/seeder/test/`, all deterministic with no real network, sockets, sleeps, or crypto:

1. **`connectResilientRelay`** — the new self-healing wrapper (`apps/seeder/src/resilient-relay.ts`, ADR §2). `apps/seeder/test/resilient-relay.test.ts`.
2. **`connectRelay` hardening** — the transport primitive (`apps/seeder/src/publish.ts`, ADR §1): injectable WebSocket factory, send-throw → reject, post-open close/error → reject pending + mark dead, relay NACK still resolves. `apps/seeder/test/publish-resilience.test.ts`.
3. **Wiring guard (light)** — `index.ts` adopts the resilient layer and reads the three env knobs (ADR §3/§4). `apps/seeder/test/resilient-wiring.test.ts`.

Out of scope for the Tester (Implementer/orchestrator own these): `apps/seeder/src/resilient-relay.ts`, the `connectRelay` hardening in `apps/seeder/src/publish.ts`, the `index.ts` wiring, and the docs/env-file changes (`docker-compose.prod.yml`, `.env.production.example`, `docs/DEPLOY.md`). None were touched. The `apps/promoter` duplicate `connectRelay` is explicitly out of scope (story + ADR) and is not tested here.

## Contracts under test (pinned from ADR 0056)

### `connectResilientRelay` (ADR §2)

```
connectResilientRelay(opts: {
  url: string;
  connect?: (url) => Promise<RelayConnection>;   // default connectRelay; injectable
  attempts?: number;     // RELAY_RECONNECT_ATTEMPTS, default 6
  baseMs?: number;       // RELAY_RECONNECT_BASE_MS, default 500
  maxMs?: number;        // RELAY_RECONNECT_MAX_MS, default 8000
  sleep?: (ms) => Promise<void>;                 // injectable
  onReconnect?: (info) => void;                  // logging hook
}): Promise<RelayConnection>           // same { publish, close } interface
```

- `publish(event)` is a retry loop, up to `attempts` **total** tries.
- A **resolved** result (`{ok:true}` or `{ok:false}`) is returned as-is — no reconnect, no sleep (a relay NACK is the relay's answer, not a transport problem).
- A **rejected** (transport) attempt consumes a try; if tries remain, `sleep(backoff(i))` then reconnect (`current.close()` best-effort, then `current = await connect(url)`) and retry the SAME event.
- `backoff(i) = min(maxMs, baseMs * 2^i)`, `i` 0-based. No jitter.
- After `attempts` exhausted → **throw** `Error` matching `/relay unreachable/i` (ADR: `relay unreachable after N attempts: …`).
- `close()` → delegates to the current underlying `close()`.

### `connectRelay` hardening (ADR §1)

```
connectRelay(url, opts?: { createWebSocket?: (url) => WebSocketLike }): Promise<RelayConnection>
```

- Injected `createWebSocket` factory (default real `ws`) so `open`/`message`/`close`/`error`/`send`-throw are driven deterministically.
- `ws.send` wrapped in try/catch: on throw, clear the pending timer, delete the waiter, **reject** the publish promise with a transport `Error` (not a resolved `{ok:false}`).
- Live `ws.on("close")` / `ws.on("error")` (not `once`-on-connect): on either, **reject every pending publish** with a transport `Error` and set a `dead` flag. Once dead, `publish` rejects immediately without sending.
- A relay NACK `["OK", id, false, reason]` still **resolves** `{ok:false, reason}` (distinguishable from a transport failure). The 10s timeout still resolves `{ok:false,"publish timed out"}` (unchanged).

### Wiring + env (ADR §3/§4)

- `index.ts` connects via `connectResilientRelay({ url, attempts, baseMs, maxMs, onReconnect })` (not the bare `connectRelay`).
- Reads `RELAY_RECONNECT_ATTEMPTS` (6), `RELAY_RECONNECT_BASE_MS` (500), `RELAY_RECONNECT_MAX_MS` (8000).

## Fixtures / seams

- **Fake `connect`** (resilient-relay suite): a `vi.fn` returning a *scripted* `RelayConnection` whose `publish` plays back an ordered list of steps — each step is either a resolved `PublishResult` or a rejected `Error` (a transport failure stand-in). `close` is a `vi.fn` spy. The wrapper's reconnect is observed by counting `connect` calls.
- **Fake `sleep`** (resilient-relay suite): a `vi.fn` that records every delay into an array and resolves immediately. The backoff schedule is asserted by deep-equalling that array — tests run instantly with no real timers.
- **Fake WebSocket** (publish-resilience suite): a minimal object implementing the `ws` slice `connectRelay` uses (`on` / `once` / `send` / `close`) plus helpers `emitOpen` / `emitMessage` / `emitClose` / `emitError` / `makeSendThrow`, and a `sent` array. `send` throws when armed. Injected through `opts.createWebSocket`. Vitest fake timers (`vi.useFakeTimers`) prove "rejects promptly on close, not at the 10s timeout" and that the send-throw path clears the pending timer (advancing 11s yields no stray resolution).
- **Source-read guard** (wiring suite): reads `apps/seeder/src/index.ts` as text and asserts the resilient call + env-name references are present — structural, not executed (running `main()` needs an nsec + network).

## Coverage map (AC → test)

| Acceptance criterion (story) | Test name | File |
|---|---|---|
| Transport: `send`-throw rejects with a transport error (not `{ok:false}`), timer cleared | `rejects the publish promise with a transport Error and clears the pending timer` | `publish-resilience.test.ts` |
| Transport: post-open `close` rejects pending promptly + marks dead; later publish rejects immediately without sending | `rejects an in-flight publish promptly on close (not at the 10s timeout) and a later publish rejects immediately` | `publish-resilience.test.ts` |
| Transport: post-open `error` rejects pending | `rejects an in-flight publish on a post-open error event` | `publish-resilience.test.ts` |
| Transport: relay NACK still resolves `{ok:false, reason}` | `resolves {ok:false, reason} on ["OK", id, false, reason] (not a transport reject)` | `publish-resilience.test.ts` |
| Transport: `connectRelay` accepts an injected WS factory (unit-testable) | `resolves a publish {ok:true} on a matching OK through the fake ws` (baseline proving the factory seam) | `publish-resilience.test.ts` |
| Resilient: reject-then-succeed reconnects + retries to a single `{ok:true}` | `reconnects and retries when the first publish rejects, then surfaces a single {ok:true}` | `resilient-relay.test.ts` |
| Resilient: always-reject retries to `attempts` with capped exponential backoff, then throws | `retries up to attempts with capped exponential backoff, then throws a clear error` + `caps the backoff at maxMs once baseMs*2^i would exceed it` | `resilient-relay.test.ts` |
| Resilient: resolved `{ok:false}` returned as-is, no reconnect/retry | `returns a resolved {ok:false} as-is without reconnecting or sleeping` | `resilient-relay.test.ts` |
| Resilient: happy path does not reconnect | `returns {ok:true} on the first try with no extra connect and no sleep` | `resilient-relay.test.ts` |
| Resilient: same `RelayConnection` interface (`publish`, `close`); `close` delegates | `closes the underlying connection that is currently held` | `resilient-relay.test.ts` |
| Resilient: ADR defaults (6 / 500 / 8000) when knobs omitted | `defaults to 6 attempts / 500ms base / 8000ms cap (asserted via the exhaustion schedule)` | `resilient-relay.test.ts` |
| Wiring: `index.ts` uses the resilient layer | `connects via connectResilientRelay (not the bare connectRelay)` | `resilient-wiring.test.ts` |
| Wiring: new env knobs read | `reads RELAY_RECONNECT_ATTEMPTS` / `…BASE_MS` / `…MAX_MS` | `resilient-wiring.test.ts` |

### Backoff schedules pinned (exact)

- `attempts=4, baseMs=500, maxMs=8000` → 4 attempts (1 initial connect + 3 reconnects), delays `[500, 1000, 2000]`.
- `attempts=6, baseMs=500, maxMs=2000` → 5 backoff waits, delays `[500, 1000, 2000, 2000, 2000]` (cap engaged).
- Defaults `6 / 500 / 8000` → `connect` called 6×, delays `[500, 1000, 2000, 4000, 8000]` (last exactly at the 8000 cap).

## Why the red is for the right reason, not a tsc wall

- **`resilient-relay.test.ts`** loads the not-yet-existing module via the opaque specifier loader (`apps/seeder/test/_load.ts` → `await import("../src/resilient-relay")`). tsc never resolves it (no TS2307), so `pnpm -r typecheck` stays clean; each test fails at `await load()` with the readable `Failed to load url ../src/resilient-relay. Does the file exist?` — an assertion-level red. Once `resilient-relay.ts` exists, the import resolves and the scripted-connect / fake-sleep assertions run against the real export.
- **`publish-resilience.test.ts`** imports the *existing* `connectRelay` directly. The hardened 2-arg signature (`opts.createWebSocket`) does not exist yet, so the test pins it as a local `HardenedConnectRelay` type and casts the export to it (`connectRelay as unknown as HardenedConnectRelay`). This keeps `tsc` clean (no TS2554 arity error) while the test is genuinely RED: today's `connectRelay` ignores the second arg and opens the real `ws` socket to `wss://test`, so the injected fake is never driven and the connect fails fast with `getaddrinfo ENOTFOUND test` — i.e. the missing `createWebSocket` seam, exactly the unimplemented behavior. When the Implementer honors the factory, the fake drives the lifecycle and the assertions exercise the hardened paths.
- **`resilient-wiring.test.ts`** reads `index.ts` as text; it is red because `index.ts` still calls `connectRelay(relayUrl)` and references none of the `RELAY_RECONNECT_*` names. No types involved.

## Test infrastructure

- Runner: Vitest (workspace default), seeder config `apps/seeder/vitest.config.ts` (`environment: "node"`, `include: ["test/**/*.test.ts"]`).
- No relay / Docker / Neo4j / network / crypto dependency. The `publish-resilience` suite uses `vi.useFakeTimers()` to assert prompt rejection vs. the 10s timeout and cleared timers.
- Opaque module loader: `apps/seeder/test/_load.ts` (reused, not modified).

## How to run

```
pnpm --filter @unbnd/seeder test
pnpm -r typecheck
```

## Verification (RED for the right reason)

Confirmed on 2026-06-05 (branch `story-57-seeder-relay-resilience`).

### `pnpm --filter @unbnd/seeder test`

```
❯ test/resilient-relay.test.ts     (7 tests | 7 failed)  → Failed to load url ../src/resilient-relay. Does the file exist?
❯ test/publish-resilience.test.ts  (5 tests | 5 failed)  → getaddrinfo ENOTFOUND test (createWebSocket seam not honored; real socket attempted)
❯ test/resilient-wiring.test.ts    (4 tests | 4 failed)  → index.ts has no connectResilientRelay( / no RELAY_RECONNECT_* names
Test Files  3 failed | 13 passed (16)
     Tests  16 failed | 117 passed (133)
```

The 13 pre-existing seeder suites (117 tests), including the Story-55 scope guard, stay green.

### `pnpm -r typecheck`

```
… apps/seeder typecheck: Done … (all workspace projects Done, clean)
```

The red set typechecks cleanly: the opaque-specifier loader keeps `resilient-relay` out of tsc's resolver, and the `HardenedConnectRelay` cast keeps the 2-arg `connectRelay` call from tripping TS2554.

## Red → green expectation for the Implementer

- Create `apps/seeder/src/resilient-relay.ts` exporting `connectResilientRelay` with the ADR §2 signature → the 7 resilient-relay tests go green (scripted connect + recorded sleep delays match the pinned schedules).
- Add `opts.createWebSocket` to `connectRelay`, wrap `send` in try/catch (reject on throw), add live `close`/`error` handlers that reject pending + mark dead, keep the NACK resolve path → the 5 publish-resilience tests go green.
- Wire `index.ts` to `connectResilientRelay` reading the three env knobs → the 4 wiring tests go green.
- All while `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/seeder build` stay green.

## ADR ambiguities interpreted

1. **`attempts` = total tries, not extra retries.** ADR §2 says "up to `attempts` total tries" and "a failed `connect` counts as a consumed attempt." Tests pin `attempts` as the **total** number of underlying tries, so the number of backoff waits is `attempts - 1` (e.g. `attempts=4` → 3 sleeps `[500,1000,2000]`; default `6` → 5 sleeps `[500,1000,2000,4000,8000]`).
2. **`backoff(i)` index base.** ADR §2 states `backoff(i) = min(maxMs, baseMs * 2^i)` with `i` 0-based per *attempt index*. Tests assume the first backoff (after the first failed attempt) uses `i=0` → `baseMs`. So the wait before reconnect *N* is `min(maxMs, baseMs * 2^(N-1))`.
3. **Exhaustion error text.** ADR §2 gives `relay unreachable after N attempts: …` as the message; tests assert a loose `/relay unreachable/i` match (not the exact interpolated string) to avoid over-fitting the wording while still pinning the "clear error" contract.
4. **Wiring depth.** Per the prompt, the wiring suite is kept light (source-text assertions for the resilient call + the three env names) rather than executing `main()` or over-fitting `index.ts` internals; the heavy behavior is covered by suites A and B.
