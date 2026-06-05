# Test Plan: Story 59 — Extract a shared `@unbnd/relay` package; migrate seeder + promoter

**Story:** `engineering-team/stories/59-shared-relay-package.md`
**ADR:** `engineering-team/decisions/0058-shared-relay-package.md` (Accepted)
**Date:** 2026-06-05
**Branch:** `story-59-shared-relay-package`

## Scope

Tests only (TDD red), authored against the union package `@unbnd/relay` whose `src/`
the Implementer writes. All three suites live in `packages/relay/test/`, all
deterministic with no real network, sockets, sleeps, or crypto:

1. **Transport hardening (relocated)** — the Story-57 hardened `connectRelay`
   contract (ADR 0056 §1), moved verbatim from `apps/seeder/test/publish-resilience.test.ts`
   with its import re-pointed from `../src/publish` → `../src/connect` (ADR 0058
   §Q3, the new file name). `packages/relay/test/publish-resilience.test.ts`.
2. **Resilient wrapper (relocated)** — `connectResilientRelay` (ADR 0056 §2),
   moved from `apps/seeder/test/resilient-relay.test.ts`. Per ADR 0058 §Q3 the
   `_load.ts` opaque-loader indirection is **dropped** in favour of a DIRECT
   static import `import { connectResilientRelay } from "../src/resilient"` (the
   module will exist in the package). `packages/relay/test/resilient-relay.test.ts`.
3. **REQ read (NEW)** — the one-shot `query(filter, timeoutMs?)` folded into the
   union `RelayConnection` (ADR 0058 §Q1). New coverage: the promoter's
   `relay.ts` carried `query` but had no relay-layer test. `packages/relay/test/query.test.ts`.

**Out of scope for the Tester** (Implementer owns these): all of `packages/relay/src/`
(`connect.ts`, `resilient.ts`, `types.ts`, `index.ts`), the seeder/promoter import
swaps, deleting the local `publish.ts` / `resilient-relay.ts` / `relay.ts`, the
`PublishOutcome → PublishResult` collapse in the promoter, the `workspace:*` dep
additions, and the lockfile regen. The seeder's existing Story-57 tests
(`apps/seeder/test/publish-resilience.test.ts`, `resilient-relay.test.ts`, plus
`_load.ts` and `resilient-wiring.test.ts`) are left in place — the Implementer
deletes the first two when it removes the seeder's local modules; `_load.ts` and
`resilient-wiring.test.ts` stay (ADR 0058 §Q3). No promoter test is touched: ADR
0058 §Q3 confirmed (and re-verified here) that no file under `apps/promoter/test/`
imports `./relay` / `connectRelay`.

## Package test harness scaffold (Tester-authored, NOT `src/`)

Mirrors `@unbnd/trust` exactly so `pnpm --filter @unbnd/relay test` can run:

- `packages/relay/package.json` — `@unbnd/relay`, `"private": true`, `"type": "module"`,
  `main`/`types`/`exports` → `./src/index.ts`, `scripts` `test` (`vitest run`) +
  `typecheck` (`tsc --noEmit`), deps `@unbnd/schemas`/`ws`, devDeps `@types/ws`/`typescript`/`vitest`.
  (No `nostr-tools` — the relocated suites + the REQ read use only `ws` + the
  schema types.)
- `packages/relay/tsconfig.json` — copied verbatim from trust (`include: ["src", "test", "vitest.config.ts"]`).
- `packages/relay/vitest.config.ts` — copied verbatim from trust (`include: ["test/**/*.test.ts"]`).

Picked up by the existing `pnpm-workspace.yaml` `packages/*` glob (confirmed present).

## Contracts under test (pinned from ADR 0058)

### Exact names / paths pinned

- `connectRelay` from `packages/relay/src/connect.ts` (2-arg hardened union:
  `connectRelay(url, opts?: { createWebSocket?: (url) => WebSocketLike })`).
- `connectResilientRelay` from `packages/relay/src/resilient.ts`.
- `RelayConnection`, `PublishResult`, `RelayFilter` from `packages/relay/src/types.ts`.
- Re-export barrel: `packages/relay/src/index.ts` (not directly imported by these
  red suites, which import the leaf files per the ADR layout — but pinned as the
  public surface).

### Union `RelayConnection` (ADR 0058 §Q1)

```ts
type PublishResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

type RelayFilter = { kinds?: number[]; authors?: string[]; "#d"?: string[]; "#z"?: string[]; limit?: number };

type RelayConnection = {
  publish(event: SignedNostrEvent, timeoutMs?: number): Promise<PublishResult>;
  query(filter: RelayFilter, timeoutMs?: number): Promise<SignedNostrEvent[]>;
  close(): void;
};
```

`PublishResult` is the single canonical result type (the seeder's name + shape).
`PublishOutcome` is retired.

### `connectRelay` hardening (ADR 0056 §1, carried into `connect.ts`)

- Injected `createWebSocket` factory drives `open`/`message`/`close`/`error`/`send`-throw.
- `send`-throw → clear pending timer, **reject** the publish promise (transport `Error`).
- Live `close`/`error` → reject **every** pending publish promptly + set `dead`;
  once dead, `publish` rejects immediately without sending.
- Relay NACK `["OK", id, false, reason]` still **resolves** `{ok:false, reason}`.
- Happy path: open → `["EVENT", event]` → `["OK", id, true]` → resolves `{ok:true, id}`.

### `connectResilientRelay` (ADR 0056 §2, carried into `resilient.ts`)

- `publish` retry loop, `attempts` **total** tries; resolved result returned as-is,
  rejected attempt → `sleep(backoff(i))` + reconnect + retry the same event.
- `backoff(i) = min(maxMs, baseMs * 2^i)`, 0-based; exhaustion throws `/relay unreachable/i`.
- `close()` delegates to the current underlying `close()`.
- **`query` pass-through (ADR 0058 §Q1):** `query(filter, timeoutMs?)` delegates to
  `current.query(...)` — NO reconnect/retry on the read path.

### One-shot REQ read `query` (ADR 0058 §Q1, from the promoter's `relay.ts`)

- Sends `["REQ", subId, filter]` with the filter verbatim.
- `EVENT` frames for that subId accumulate.
- `EOSE` resolves the accumulated `SignedNostrEvent[]` and sends `["CLOSE", subId]`.
- The bounded timeout resolves whatever accumulated (`[]` if nothing).

## Coverage map (AC → test)

| Acceptance criterion (story) | Test name | File |
|---|---|---|
| The package exists (mirrors `@unbnd/trust`, picked up by `packages/*`, `test`+`typecheck` scripts) | (harness scaffold: `package.json` / `tsconfig.json` / `vitest.config.ts`; proven by `pnpm --filter @unbnd/relay test` running) | `packages/relay/{package.json,tsconfig.json,vitest.config.ts}` |
| Union client: hardened `connectRelay`, injected WS factory (baseline) | `resolves a publish {ok:true} on a matching OK through the fake ws` | `publish-resilience.test.ts` |
| Union client: `send`-throw rejects (not `{ok:false}`), timer cleared | `rejects the publish promise with a transport Error and clears the pending timer` | `publish-resilience.test.ts` |
| Union client: post-open `close` rejects pending promptly + dead flag; later publish rejects without sending | `rejects an in-flight publish promptly on close (not at the 10s timeout) and a later publish rejects immediately` | `publish-resilience.test.ts` |
| Union client: post-open `error` rejects pending | `rejects an in-flight publish on a post-open error event` | `publish-resilience.test.ts` |
| Union client: relay NACK still resolves `{ok:false, reason}` | `resolves {ok:false, reason} on ["OK", id, false, reason] (not a transport reject)` | `publish-resilience.test.ts` |
| Union client: `connectResilientRelay` reject-then-retry → single `{ok:true}` | `reconnects and retries when the first publish rejects, then surfaces a single {ok:true}` | `resilient-relay.test.ts` |
| Union client: exhaustion → capped backoff then throw `/relay unreachable/i` | `retries up to attempts with capped exponential backoff, then throws a clear error` + `caps the backoff at maxMs once baseMs*2^i would exceed it` | `resilient-relay.test.ts` |
| Union client: resolved `{ok:false}` returned as-is, no reconnect/sleep | `returns a resolved {ok:false} as-is without reconnecting or sleeping` | `resilient-relay.test.ts` |
| Union client: happy path no reconnect | `returns {ok:true} on the first try with no extra connect and no sleep` | `resilient-relay.test.ts` |
| Union client: ADR defaults (6 / 500 / 8000) when knobs omitted | `defaults to 6 attempts / 500ms base / 8000ms cap (asserted via the exhaustion schedule)` | `resilient-relay.test.ts` |
| Union client: `close()` delegates to current connection | `closes the underlying connection that is currently held` | `resilient-relay.test.ts` |
| REQ read unit-tested in the package: REQ sent with filter | `sends ["REQ", subId, filter] with the filter passed verbatim` | `query.test.ts` |
| REQ read: EVENT accumulation, EOSE resolves + CLOSE | `accumulates EVENT frames for the subId, resolves on EOSE, and sends CLOSE` | `query.test.ts` |
| REQ read: bounded timeout resolves what accumulated | `resolves [] when nothing arrives before the timeout` + `resolves the partial accumulation when the timeout fires after some EVENTs` | `query.test.ts` |
| REQ read: `connectResilientRelay.query` is a thin pass-through (no reconnect on read) | `delegates to the current connection's query without reconnecting` | `query.test.ts` |

### Backoff schedules pinned (exact, carried from Story 57)

- `attempts=4, baseMs=500, maxMs=8000` → delays `[500, 1000, 2000]`.
- `attempts=6, baseMs=500, maxMs=2000` → delays `[500, 1000, 2000, 2000, 2000]` (cap engaged).
- Defaults `6 / 500 / 8000` → delays `[500, 1000, 2000, 4000, 8000]` (last at the 8000 cap).

## Edge cases

- [x] Relay NACK vs. transport failure kept distinct (resolve vs. reject).
- [x] Dead-socket fast-reject without sending into the dead socket.
- [x] Bounded read timeout with zero and partial accumulation.
- [x] Read path on the resilient wrapper does NOT trigger reconnect/retry (pass-through).
- [ ] Live strfry round-trip — not covered here (pure unit refactor; integration is
      the seeder/promoter app build gate, unchanged by this story).

## Fixtures / seams

- **Fake WebSocket** (`publish-resilience.test.ts`, `query.test.ts`): a minimal
  object implementing the `ws` slice `connectRelay` uses (`on`/`once`/`send`/`close`)
  plus helpers — `emitOpen`/`emitMessage`/`emitClose`/`emitError`/`makeSendThrow`
  (publish suite) and `emitEvent`/`emitEose` (query suite), and a `sent` array.
  Injected through `opts.createWebSocket`. The query suite reads the random `subId`
  back off the captured `["REQ", subId, filter]` frame (the promoter generates a
  random subId), so no subId is hard-coded. `vi.useFakeTimers()` drives the 10s
  publish/read timeouts deterministically.
- **Scripted `connect` + fake `sleep`** (`resilient-relay.test.ts`): `connect` is a
  `vi.fn` returning a scripted `RelayConnection` whose `publish` replays an ordered
  list of resolve/reject steps; `sleep` records its delays into an array. The
  scripted connection also carries a no-op `query` (returns `[]`) so it satisfies
  the union `RelayConnection` type — it is never called on the publish path.

## Why the red is for the right reason, not a stray failure

All three suites import the not-yet-written package leaf files
(`../src/connect`, `../src/resilient`, `../src/types`). At runtime the module
resolver fails to find them, so each suite fails to load with the readable
`Failed to load url ../src/connect … Does the file exist?` — a module-level red,
NOT a syntax/assertion/typo failure. Once the Implementer writes `src/`, the
imports resolve and the scripted/fake-socket assertions exercise the real exports.

The `HardenedConnectRelay` / `UnionConnectRelay` local cast on `connectRelay`
(publish + query suites) keeps the 2-arg call from being the cause of failure;
the cause is purely the missing module.

## Test infrastructure

- Runner: Vitest (workspace default), `packages/relay/vitest.config.ts`
  (`include: ["test/**/*.test.ts"]`).
- No relay / Docker / Neo4j / network / crypto dependency. The publish + query
  suites use `vi.useFakeTimers()` for the 10s timeout assertions.
- No new framework; `_load.ts` deliberately NOT used here (ADR 0058 §Q3 drops it
  for the package — the modules exist in `src/` once implemented).

## How to run

```
pnpm --filter @unbnd/relay test
pnpm -r typecheck
pnpm --filter @unbnd/seeder test     # regression: stays green untouched
pnpm --filter @unbnd/promoter test   # regression: stays green untouched
```

## Verification (RED for the right reason)

Confirmed on 2026-06-05 (branch `story-59-shared-relay-package`).

### `pnpm --filter @unbnd/relay test`

```
❯ test/query.test.ts               → Failed to load url ../src/connect. Does the file exist?
❯ test/publish-resilience.test.ts  → Failed to load url ../src/connect. Does the file exist?
❯ test/resilient-relay.test.ts     → Failed to load url ../src/resilient. Does the file exist?
Test Files  3 failed (3)
     Tests  no tests
```

All three suites fail to LOAD on the missing `../src/connect` / `../src/resilient`
(module not found) — the intended red, not a syntax/assertion wall.

### Existing seeder + promoter suites stay green (untouched)

```
apps/seeder   Test Files  16 passed (16)   Tests  133 passed (133)
apps/promoter Test Files   5 passed  (5)   Tests   28 passed  (28)
```

(The seeder still carries its Story-57 `publish-resilience.test.ts` +
`resilient-relay.test.ts` — the Implementer deletes those when it removes the
seeder's local modules.)

### `pnpm -r typecheck`

Clean for every project EXCEPT the empty `@unbnd/relay`, which trips:

```
packages/relay typecheck: test/publish-resilience.test.ts(24,30): error TS2307: Cannot find module '../src/connect' …
packages/relay typecheck: test/resilient-relay.test.ts(22,39): error TS2307: Cannot find module '../src/resilient' …
packages/relay typecheck: test/query.test.ts(22,51): error TS2307: Cannot find module '../src/types' …
(all other 10 projects: Done, clean)
```

This is EXPECTED and is the one ADR ambiguity (see below): the ADR's package
mirrors `@unbnd/trust`, whose `tsconfig.json` `include`s `test` alongside `src`.
With no `src/` yet, `tsc` cannot resolve the leaf imports — the SAME
module-not-found the runner surfaces, just at the type layer. It clears the
moment the Implementer writes `src/{connect,resilient,types,index}.ts`. The red
set itself has no spurious type errors (no `vi.fn` arity mismatch, no narrow
table) — the only `tsc` complaints are the four missing-module imports that are
the whole point of the red.

## ADR ambiguity surfaced

- **Empty-package typecheck.** ADR 0058 §"Package layout" pins the `@unbnd/relay`
  `tsconfig.json` as a verbatim copy of `@unbnd/trust`'s, which `include`s both
  `src` and `test`. Because §Q3 also mandates a DIRECT static import of
  `../src/resilient` (dropping `_load.ts`), the package CANNOT typecheck clean
  until the Implementer's `src/` lands — `tsc` raises TS2307 on the test→src
  imports. This is consistent with the ADR (the trust template typechecks
  `src`+`test` together) and is the deliberate trade for dropping the opaque
  loader. It is reported per the brief; no test change is warranted (adding an
  `_load.ts`-style loader back would contradict ADR §Q3). `pnpm -r typecheck`
  goes fully green once the Implementer writes the four `src/` files.

## Red → green expectation for the Implementer

- Write `packages/relay/src/types.ts` (`PublishResult`, `RelayFilter`, the union
  `RelayConnection` with `publish`/`query`/`close`).
- Write `packages/relay/src/connect.ts` (the seeder's hardened `publish.ts` body
  with the promoter's `query` folded into the same resolved `RelayConnection`;
  `ConnectRelayOptions`, `WebSocketLike`) → `publish-resilience.test.ts` +
  `query.test.ts` (connectRelay cases) go green.
- Write `packages/relay/src/resilient.ts` (ADR 0056 §2 body + the `query`
  pass-through to `current.query`) → `resilient-relay.test.ts` + the
  `query.test.ts` pass-through case go green.
- Write `packages/relay/src/index.ts` (the re-export surface).
- All four → `pnpm --filter @unbnd/relay test` green and `pnpm -r typecheck` clean.
- Then migrate seeder + promoter and delete their local copies (ADR §Migration plan).
```
