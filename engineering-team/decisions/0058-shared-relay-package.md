# ADR 0058: Extract a shared `@unbnd/relay` package; migrate seeder + promoter

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/59-shared-relay-package.md`

**Accepted 2026-06-05.** Extract ONE workspace package `@unbnd/relay` that is the **union** of the two diverged worker relay clients — the seeder's Story-57 **hardened** `connectRelay` + `connectResilientRelay` (ADR 0056, publish-only) and the promoter's `connectRelay` (not hardened, but carrying a one-shot `REQ` read). The union `RelayConnection` folds `publish` + the `REQ` read (`query`) + `close`; the seeder's `PublishResult` is the single canonical result type (it is a strict superset of the promoter's `PublishOutcome`). Both workers migrate onto the package and their local copies are deleted, so the hardening + the read live in one audited place and the next worker (the Story-58 librarian) imports it instead of copying it. Pure transport-layer refactor: no event kinds, tags, DList shapes, schema, web, or API change. The only intended behavioral delta is the promoter inheriting the Story-57 hardening — strictly an improvement, verified by its existing tests staying green. `apps/api`'s own multi-relay publisher (`apps/api/src/nostr/publish.ts`) is a separate concern and is OUT of scope (verified untouched — it does not import the worker `connectRelay`).

This retires the shared-relay-extraction follow-up logged in ADR 0056 (Consequences) and unblocks Story 58 / ADR 0057 (the librarian worker imports `@unbnd/relay`).

## Context

The relay-transport primitive is duplicated across two worker apps and has diverged:

- **Seeder** — `apps/seeder/src/publish.ts` exports the hardened `connectRelay` (injectable WebSocket factory; synchronous `send`-throw rejects; post-open `close`/`error` rejects all pending + sets a `dead` flag; relay NACK still resolves `{ok:false}`) returning `RelayConnection.publish(event, timeoutMs?) → PublishResult` + `close()`. `apps/seeder/src/resilient-relay.ts` exports `connectResilientRelay` (reconnect + bounded exponential backoff, ADR 0056 §2). **Publish-only.** `index.ts` connects via `connectResilientRelay({url, attempts, baseMs, maxMs, onReconnect})` and uses only `relay.publish` / `relay.close`.
- **Promoter** — `apps/promoter/src/relay.ts` exports a separate, near-identical `connectRelay` that is **NOT** hardened (the pre-Story-57 model: no injectable WS factory, no dead-socket reject; `error` rejects only the connect promise via `once`; `send` is unguarded) but **DOES** carry a one-shot `REQ` read — `query(filter: RelayFilter, timeoutMs?) → SignedNostrEvent[]` (manages a `subs` map, sends `["REQ", subId, filter]`, accumulates `EVENT`, resolves on `EOSE` or the bounded timeout, sends `["CLOSE", subId]`). `main.ts` opens TWO connections (`local = ws://strfry`, `dcosl = wss://dcosl…`), uses `local.query(...)` for the submission read-back and `local.publish` / `dcosl.publish` for the dual publish.

Result types differ in name and shape:

| | seeder `PublishResult` | promoter `PublishOutcome` |
|---|---|---|
| ok branch | `{ ok: true; id: string }` | `{ ok: true }` |
| nack branch | `{ ok: false; reason: string }` | `{ ok: false; reason?: string }` |
| defined in | `apps/seeder/src/publish.ts` | `apps/promoter/src/index.ts` **and** `apps/promoter/src/reveal/cycle.ts` (two identical copies; `relay.ts` imports the `index.ts` one) |

The promoter never reads `.id` off a relay publish (its callers consume only `r.ok` / `r.reason`), so `PublishResult` is a behavior-preserving superset of `PublishOutcome`.

Story 58 adds a **third** consumer (the production librarian worker) that needs BOTH capabilities (publish a kind-0/kind-3 AND a one-shot `REQ` read to fetch the existing kind-3 for merge-preserving). A third copy would triple the duplication and force the librarian to pick a diverged client. This story extracts the union and migrates the two existing workers; Story 58 is then a clean third consumer.

### Acceptance criteria (quoted from the story)

- The package exists (`packages/relay/`, `@unbnd/relay`, mirroring `@unbnd/trust`: `"private": true`, `"type": "module"`, raw `src` export, no build step, `scripts` test + typecheck; picked up by the `packages/*` glob).
- The union client exports the hardened `connectRelay`, `connectResilientRelay`, the one-shot `REQ` read folded into `RelayConnection`, and the shared types — one coherent interface, no duplicate definitions.
- Seeder migrated, behavior preserved; its local `publish.ts` / `resilient-relay.ts` removed; the Story-57 resilience tests move to `packages/relay/test/` and stay green.
- Promoter migrated, behavior preserved (and hardened); its local `relay.ts` removed; its tests stay green; any test exercising the local `relay.ts` re-points to `@unbnd/relay` without weakening assertions.
- One definition, no third copy (repo-wide grep finds exactly one `connectRelay` / `connectResilientRelay` in `packages/relay/src`).
- Tests relocated + green; the `REQ`-read unit-tested in the package; `pnpm --filter @unbnd/relay test` green.
- Gates green, no behavior change beyond the union; deps wired (`@unbnd/relay` `workspace:*` in both apps; Dockerfiles still resolve through source).

## Decision

### Resolving the three open questions

#### Q1 — The union `RelayConnection` interface

One coherent interface, with the seeder's `PublishResult` as the single canonical result type:

```ts
// packages/relay/src/types.ts
export type PublishResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export type RelayFilter = {
  kinds?: number[];
  authors?: string[];
  "#d"?: string[];
  "#z"?: string[];
  limit?: number;
};

export type RelayConnection = {
  /** Publish EVENT and await the matching OK. Hardened (ADR 0056 §1): a
   *  transport failure REJECTS; a relay NACK / timeout RESOLVES {ok:false}. */
  publish(event: SignedNostrEvent, timeoutMs?: number): Promise<PublishResult>;
  /** One-shot REQ read: subscribe, accumulate EVENT, resolve on EOSE or the
   *  bounded timeout, then CLOSE the subscription. */
  query(filter: RelayFilter, timeoutMs?: number): Promise<SignedNostrEvent[]>;
  close(): void;
};
```

- **Canonical result type: `PublishResult`** (the seeder's name + shape). `PublishOutcome` is retired. `PublishResult` is a strict superset of `PublishOutcome` — it adds `id` on the ok branch and makes `reason` required (always populated; `String(msg[3] ?? "rejected")` / `"publish timed out"`). The promoter's callers (`runPromotionCycle`, `runRevealCycle`) read only `r.ok` and `r.reason`, so swapping `PublishOutcome → PublishResult` in those `PublisherDeps` signatures is type-compatible and behavior-preserving. The two `PublishOutcome` definitions in `apps/promoter/src/index.ts` and `apps/promoter/src/reveal/cycle.ts` are **deleted** and both re-import `PublishResult` from `@unbnd/relay` (this also collapses the existing double-definition — a bonus dedup, in-scope as part of removing `PublishOutcome`).
- **`query` lives on `RelayConnection` directly** — i.e. on EVERY connection produced by `connectRelay` (the union folds the promoter's `query` into the same object that already carries the seeder's hardened `publish`). The single hardened `connectRelay` is the union of both capabilities; there is no publish-only variant.
- **The resilient wrapper passes `query` through.** `connectResilientRelay` already holds a single `current: RelayConnection` and reconnects it on a transport reject of `publish`. It gains a `query(filter, timeoutMs?)` method that **delegates to `current.query(...)`** — a thin pass-through, NO reconnect/retry wrapping on the read path. Rationale: the resilience contract (ADR 0056 §2) is defined precisely for the idempotent re-send of a publish (safe because kind-39999 replaces in place by d-tag, and the checkpoint records only on `{ok:true}`); a `REQ` read has no equivalent idempotency story and no caller asks for read-retry. A read fault surfaces to the caller unchanged (resolves `[]` on timeout, as today). This keeps the wrapper's behavior on `publish` byte-identical to ADR 0056 and adds the read as a transparent delegate. The seeder (publish-only) simply never calls `query`; the promoter, were it to adopt the wrapper, would get the same read semantics it has today.

**Exported surface of `@unbnd/relay`** (`src/index.ts` re-exports):

```ts
export { connectRelay } from "./connect";
export type { ConnectRelayOptions, WebSocketLike } from "./connect";
export { connectResilientRelay } from "./resilient";
export type { ConnectResilientRelayOptions, ReconnectInfo } from "./resilient";
export type { RelayConnection, PublishResult, RelayFilter } from "./types";
```

#### Q2 — Promoter: resilient or just hardened? → **just hardened `connectRelay`** (do NOT adopt `connectResilientRelay`)

Decision: the promoter swaps its local `connectRelay` for the shared **hardened `connectRelay`** and does NOT move to `connectResilientRelay`. This is the lower-risk option:

- The promoter opens two connections (`local` strfry + `dcosl`) and does both `publish` and `query`. The hardened `connectRelay` supports its full usage (it is the union — publish + query + close). `connectResilientRelay` currently does NOT expose `query`; even with the Q1 pass-through added, adopting it would change the promoter's failure semantics (introducing reconnect/backoff on its short per-cron-tick connections) for no required benefit, and would touch more code.
- Swapping the promoter's plain (un-hardened) `connectRelay` for the hardened one is **behavior-preserving on the happy path** (same `["EVENT", event]` → `["OK"]` flow, same `query` REQ/EOSE flow, same 10s timeouts, same `{ok:false}` on NACK/timeout) and **an improvement on failure** (a dead socket now fast-rejects `publish` instead of grinding to timeout or letting a `send`-throw escape). The story explicitly calls this hardening out as the one intended, strictly-positive behavioral delta.
- The promoter's existing tests inject FAKE publishers (`publishLocal`/`publishDcosl` → `{ok:true}`) and a fake `readSubmission`; they do not exercise a live socket. So the hardening delta is invisible to them and they stay green with no assertion change. The promoter's resilience need is low: connections are short-lived, per-cron-tick, off the internet-facing path (ADR 0056 already noted this); a failed tick simply retries next cron. Adopting full resilience here is unnecessary risk.

(If a future story shows the promoter dropping connections mid-tick often enough to matter, moving it to `connectResilientRelay` is a one-line swap — the wrapper already exposes the full `RelayConnection` after Q1.)

#### Q3 — Test relocation + the `_load.ts` question

- **Move the two Story-57 suites** into `packages/relay/test/`:
  - `apps/seeder/test/publish-resilience.test.ts` → `packages/relay/test/publish-resilience.test.ts` — re-point its import from `../src/publish` to `../src/connect` (the new file name). Its `fakeWebSocket` + `HardenedConnectRelay` machinery moves verbatim; assertions unchanged.
  - `apps/seeder/test/resilient-relay.test.ts` → `packages/relay/test/resilient-relay.test.ts` — see `_load.ts` below.
- **Drop the `_load.ts` opaque loader for the moved suite.** `_load.ts` exists only because `resilient-relay.ts` did not exist at TDD-red time, so a static `import` would have been a `tsc` TS2307 compile wall instead of an assertion-level red. In `@unbnd/relay` the module exists (`src/resilient.ts`), so `resilient-relay.test.ts` replaces `loadSeederModule<…>("resilient-relay")` with a **direct static import** `import { connectResilientRelay } from "../src/resilient"` and drops the `load()` indirection. `apps/seeder/test/_load.ts` stays in the seeder for its other current users (the Story-52 description/blurb modules) — it is NOT moved or deleted.
- **`resilient-wiring.test.ts` stays in `apps/seeder/test/`.** It is a structural guard that reads `apps/seeder/src/index.ts` and asserts it calls `connectResilientRelay(` and reads the three `RELAY_RECONNECT_*` env knobs. That wiring lives in the seeder, not the package, so the test stays put. (The string `connectResilientRelay` is now imported from `@unbnd/relay`; the regex `connectResilientRelay\s*\(` still matches the call site, so it stays green unchanged.)
- **The `REQ`-read gets its own unit test in the package:** new `packages/relay/test/query.test.ts`, using the same injected-`fakeWebSocket` pattern as `publish-resilience.test.ts` (extend the fake's helpers to emit `EVENT` / `EOSE`). It pins: `query(filter)` sends `["REQ", subId, filter]`; accumulated `EVENT` frames for that `subId` are collected; `EOSE` resolves the accumulated array and sends `["CLOSE", subId]`; the bounded timeout resolves whatever has accumulated (`[]` if nothing) and closes. This is NEW coverage — the promoter never had a relay-layer test, so nothing is being weakened; it is added because the read now lives in the audited package.
- **No promoter test re-point is needed.** Verified: no file under `apps/promoter/test/` imports `./relay` or `connectRelay`; all relay interaction is injected as fakes (`consume-loop.test.ts`, `reveal-cycle.test.ts`). The acceptance-criterion clause about re-pointing a promoter test that exercised the local `relay.ts` is vacuous here — there is no such test. (The only edits in `apps/promoter` are source: `main.ts` import swap + deleting the two `PublishOutcome` definitions in favor of the imported `PublishResult`.)

### Package layout

```
packages/relay/
  package.json          # mirror @unbnd/trust exactly (below)
  tsconfig.json         # copy @unbnd/trust's verbatim
  vitest.config.ts      # copy @unbnd/trust's verbatim (include test/**/*.test.ts)
  src/
    connect.ts          # hardened connectRelay + query (REQ read) + close;
                        #   ConnectRelayOptions, WebSocketLike. = seeder publish.ts
                        #   hardened body, with the promoter's query folded into the
                        #   same resolved RelayConnection. Returns PublishResult.
    resilient.ts        # connectResilientRelay (ADR 0056 §2 body, unchanged) +
                        #   the query() pass-through to current.query (Q1).
                        #   ConnectResilientRelayOptions, ReconnectInfo.
    types.ts            # RelayConnection, PublishResult, RelayFilter.
    index.ts            # the re-export surface (Q1).
  test/
    publish-resilience.test.ts   # moved from seeder; import → ../src/connect
    resilient-relay.test.ts      # moved from seeder; direct import ../src/resilient
    query.test.ts                # NEW — REQ-read unit test
```

`package.json` (mirror `@unbnd/trust`):

```json
{
  "name": "@unbnd/relay",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@unbnd/schemas": "workspace:*",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/ws": "^8.5.12",
    "typescript": "^5.5.3",
    "vitest": "^2.1.0"
  }
}
```

`tsconfig.json`: copy `@unbnd/trust`'s verbatim (`include: ["src", "test", "vitest.config.ts"]`). No build step; consumed by source. Picked up by the existing `pnpm-workspace.yaml` `packages/*` glob (confirmed present).

### Migration plan

**Seeder:**
1. `apps/seeder/src/index.ts`: change `import { connectResilientRelay } from "./resilient-relay";` → `from "@unbnd/relay";`. Nothing else in the seed loop changes (same `connectResilientRelay({...})` call, same `relay.publish` / `relay.close`).
2. Delete `apps/seeder/src/publish.ts` and `apps/seeder/src/resilient-relay.ts`.
3. `apps/seeder/package.json`: add `"@unbnd/relay": "workspace:*"` to `dependencies`.
4. Move the two test suites out (Q3); `apps/seeder/test/_load.ts` and `resilient-wiring.test.ts` stay.

**Promoter:**
1. `apps/promoter/src/main.ts`: change `import { connectRelay } from "./relay";` → `from "@unbnd/relay";`. No call-site change (`connectRelay(url)` still valid — the hardened signature's second arg is optional; `local.query(...)` / `*.publish(...)` / `*.close()` unchanged).
2. Delete `apps/promoter/src/relay.ts` (its `RelayFilter` now comes from `@unbnd/relay`).
3. Delete the `PublishOutcome` type in `apps/promoter/src/index.ts` AND in `apps/promoter/src/reveal/cycle.ts`; in both, add `import type { PublishResult } from "@unbnd/relay";` and replace `PublishOutcome` with `PublishResult` in the `publishLocal` / `publishDcosl` dep signatures. (Callers read only `.ok` / `.reason` → type-compatible, behavior-preserving.)
4. `apps/promoter/package.json`: add `"@unbnd/relay": "workspace:*"` to `dependencies`.

**Build / Docker:** the seeder + promoter Dockerfiles copy the whole repo, run `pnpm install --frozen-lockfile`, then `pnpm --filter @unbnd/<app> bundle` (esbuild, inlines all `@unbnd/*` TS source into one ESM file — exactly how `@unbnd/schemas` is already pulled in). `@unbnd/relay` resolves through source the same way; no Dockerfile change, no build step in the package. After the dep additions, regenerate the lockfile (`pnpm install`).

**One-definition check:** after migration, `grep -rn "function connectRelay\|connectResilientRelay" apps/ packages/ --include=*.ts` finds the definitions only in `packages/relay/src/{connect,resilient}.ts` (ignoring `dist/` build artifacts, which are regenerated).

### Scope guard

`apps/api/src/nostr/publish.ts` is OUT of scope (a separate multi-relay/dual-publish publisher with its own semantics). Verified by grep: no file under `apps/api/src/` imports the worker `connectRelay` / `connectResilientRelay` or `@unbnd/relay` (the only `relay` hits are relay-URL string constants in `config.ts` and comments referencing the indexer). It is genuinely untouched by this story.

## Consequences

- One audited relay-transport package; the Story-57 hardening + the `REQ` read live in one place and cannot diverge again. Story 58's librarian worker is a clean third consumer (`import { connectRelay } from "@unbnd/relay"`).
- The promoter gains the Story-57 hardening for free (dead-socket fast-reject instead of timeout-grind / escaping `send`-throw) — strictly positive, invisible to its fake-injected tests.
- `PublishResult` becomes the one result type across both workers; the promoter's duplicate `PublishOutcome` definitions are collapsed as a side benefit.
- The package's `query` test is NEW coverage for a read path that previously had none.

### Residual risk

- **The seeder is a verified hot path** (it re-seeds the live dcosl catalog; ADR 0056 was prompted by a real outage). The import swap MUST be byte-equivalent in behavior. Mitigation: the moved Story-57 suites are the proof — `connect.ts` carries the hardened `publish.ts` body unchanged (only `query` is added alongside, on a code path the seeder never calls), and `resilient.ts` carries `resilient-relay.ts` unchanged (only the `query` pass-through is added). The suites passing in `packages/relay/test/` is the gate.
- **The promoter migration is the higher-touch part** (import swap in `main.ts` + deleting two `PublishOutcome` definitions across two files). Risk is contained to types + one import; the dual-connection `publish`/`query`/`close` call sites are unchanged, and the promoter's existing fixture tests stay green as the regression net.
- Low-likelihood: the lockfile must be regenerated after the two `workspace:*` additions or `--frozen-lockfile` fails in the Docker build. Called out so the Implementer runs `pnpm install` before building.
