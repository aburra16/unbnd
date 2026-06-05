# Review: Story 59 — Extract a shared `@unbnd/relay` client; migrate seeder + promoter

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-05
**Diff:** `git diff a6ca445..bfb16b6` (head `bfb16b6`, PR #103, branch `story-59-shared-relay-package`)
**Story:** `engineering-team/stories/done/59-shared-relay-package.md`
**ADR:** `engineering-team/decisions/0058-shared-relay-package.md`
**Test plan:** `engineering-team/stories/done/59-shared-relay-package.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 11 projects `Done`, including `packages/relay` (the red-state TS2307 test→src import errors are resolved by the new `src/`).
- [x] `pnpm -r test` — **PASS.** No failures anywhere. Per-project: schemas 13, search 2, ui 13, **relay 3 (17 tests)**, trust 5, indexer 4, web 52, **promoter 5 (28 tests)**, **seeder 14 (121 tests)**, shelves 3, api 86 passed + 2 skipped (790 passed / 10 skipped). (The `errorSanitizer` / `bootstrap-kind0` stderr lines are intentional fixtures asserting sanitization/fail-open, not failures.)
- [x] `pnpm --filter @unbnd/relay test` — **PASS, 17 tests** (publish-resilience 5, resilient-relay 7, query 5).
- [x] `pnpm --filter @unbnd/seeder test` — **PASS, 121 tests** (was 133 at red; the 12 relocated tests removed with the two deleted suites).
- [x] `pnpm --filter @unbnd/promoter test` — **PASS, 28 tests.**
- [x] `pnpm --filter @unbnd/seeder bundle` / `pnpm --filter @unbnd/promoter bundle` — **PASS.** esbuild resolves `@unbnd/relay` from source; no Dockerfile change needed.
- [x] `gh pr checks 103` — **all green** (Typecheck/test/build, Validate Caddyfile, Visual regression). PR head `bfb16b6` matches local; `MERGEABLE`.
- [ ] _Lint not configured — skipped._
- [ ] `pnpm --filter @unbnd/web build` — N/A (no `apps/web` change).

## Test integrity (Tester red `9206620` → Implementer green `bfb16b6`)

`git diff 9206620 bfb16b6 -- '*.test.ts'` shows **only two changes**, both **deletions**:

- `apps/seeder/test/publish-resilience.test.ts` (deleted)
- `apps/seeder/test/resilient-relay.test.ts` (deleted)

These are precisely the seeder's local Story-57 suites the ADR §Migration plan says to remove (relocated to the package by the Tester at red). `git diff 9206620 bfb16b6 -- 'packages/relay/test/'` is **empty** — the three relocated/new suites (`publish-resilience.test.ts`, `resilient-relay.test.ts`, `query.test.ts`) are **byte-unchanged** from the red commit. The Implementer did NOT touch any relocated suite or weaken any assertion. Test integrity intact.

## Behavior-equivalence of the moved code (the core risk)

Diffed the extracted source against the pre-extraction worker code (`9206620~1`):

**`packages/relay/src/connect.ts` vs `apps/seeder/src/publish.ts`** — the hardened `connectRelay` body is **behavior-identical**:
- Injectable `createWebSocket` (`ConnectRelayOptions`) — unchanged.
- `send`-throw → `clearTimeout` + `pending.delete` + reject with a transport `Error` — unchanged (`connect.ts:81-87`).
- `dead` flag + `killPending` on post-open `close`/`error`, rejecting every pending; a later `publish` rejects immediately without sending — unchanged (`connect.ts:19-27, 72-75, 122-134`).
- Relay NACK `["OK", id, false, reason]` resolves `{ok:false, reason}`; timeout resolves `{ok:false, reason:"publish timed out"}` — unchanged.
- The OK branch was restructured from an early-return into an `if (msg[0]==="OK")` block to make room for the `EVENT`/`EOSE` branches; the OK logic inside is line-for-line identical.

The **only** additions are the union read: a `subs` map, the `EVENT`/`EOSE` message branches, and the `query` method — all on code paths the seeder never exercises (`index.ts` calls only `publish`/`close`). `close()` additionally clears `subs` timers. This matches ADR §Q1 and the residual-risk note exactly.

**`packages/relay/src/resilient.ts` vs `apps/seeder/src/resilient-relay.ts`** — **behavior-identical**: same `attempts`-total retry loop, same `backoff(i)=min(maxMs, baseMs*2^i)`, same exhaustion `throw /relay unreachable/i`, same resolved-result-returned-as-is (no reconnect on NACK), same `close()` delegation. Diff is comments + import path (`./publish` → `./connect`/`./types`) + the added `query` pass-through (`query(filter, timeoutMs?) => current.query(filter, timeoutMs)`), with NO reconnect/retry on the read path — exactly ADR §Q1.

**`query` body vs the promoter's old `apps/promoter/src/relay.ts`** — identical: `["REQ", subId, filter]` with the filter verbatim, EVENT accumulation by subId, EOSE resolves the array + sends `["CLOSE", subId]`, bounded timeout resolves whatever accumulated (`[]` if empty) + CLOSE. Sole cosmetic change: subId prefix `promoter-` → `relay-` (random suffix, read back off the captured frame; no caller/test hard-codes it). Behavior-preserving.

The relocated suites passing in the package is the gate, and the source diff confirms the bodies were not subtly altered.

## Union additions

- **Canonical `PublishResult`** (`types.ts`): `{ok:true;id}|{ok:false;reason}` — the seeder's name+shape, a strict superset of the retired `PublishOutcome`. The promoter's callers (`runPromotionCycle`, `runRevealCycle`) read only `.ok`/`.reason`, so the `PublisherDeps` signature swap is type-compatible and behavior-preserving; both `PublishOutcome` defs (in `index.ts` and `reveal/cycle.ts`) are deleted and re-import `PublishResult`. Typecheck + promoter's 28 tests confirm.
- **`query` on `RelayConnection`** (every `connectRelay` connection) — correct frame shapes, EVENT accumulation, EOSE→CLOSE, bounded timeout. Unit-tested by the NEW `query.test.ts` (5 tests, genuine new coverage).
- **`connectResilientRelay.query`** — thin pass-through to `current.query`, no reconnect/retry (ADR §Q1). Tested by `query.test.ts`'s "delegates without reconnecting" case.

## One definition, scope

- `grep -rE "function connectRelay|function connectResilientRelay" apps packages --include="*.ts"` → exactly **two** hits: `packages/relay/src/connect.ts:27` and `packages/relay/src/resilient.ts:47`. None in `apps/seeder/src` or `apps/promoter/src`.
- Deletions confirmed: `apps/seeder/src/publish.ts`, `apps/seeder/src/resilient-relay.ts`, `apps/promoter/src/relay.ts` all gone; both promoter `PublishOutcome` defs removed.
- **Scope (apps/api untouched):** `git diff --name-only 9206620~1 bfb16b6 | grep apps/api` → **empty**. `apps/api/src/nostr/publish.ts` and `apps/api/src/profile/bootstrap-kind0.ts` are not touched. The remaining `PublishOutcome` hits live only in `apps/api/src/profile/` — a *different*, out-of-scope type (the custodial kind-0 publisher), never imported from the worker relay. Correctly left alone per the ADR scope guard.

## ADR adherence

- [x] Package mirrors `@unbnd/trust`: `tsconfig.json` and `vitest.config.ts` are **identical** to trust's (verified by diff); `package.json` shape matches (`private`, `type:module`, raw `src` export, no build step, `test`+`typecheck` scripts; deps `@unbnd/schemas`/`ws`, devDeps `@types/ws`/`typescript`/`vitest`).
- [x] `index.ts` re-export surface matches ADR §Q1 verbatim.
- [x] Migration wiring: seeder `index.ts` imports `connectResilientRelay` from `@unbnd/relay` (resilient, unchanged call); promoter `main.ts` imports `connectRelay` from `@unbnd/relay` (hardened, NOT resilient, per ADR §Q2) and keeps its dual `local`+`dcosl` connections with `publish`/`query`(`readSubmission`)/`close` call sites intact.
- [x] Deps wired: `@unbnd/relay: workspace:*` in both `package.json`s; lockfile regenerated (`packages/relay` linked at lines 123/160/279) so `--frozen-lockfile` resolves in Docker.
- [x] Dockerfiles unchanged; `pnpm --filter @unbnd/<app> bundle` (esbuild) inlines `@unbnd/relay` from source like `@unbnd/schemas`. Both bundles pass.

## DList integrity

N/A — pure transport-layer refactor. No event kinds, d-tags, or DList shapes touched (confirmed: `RelayFilter` is generic; no hardcoded pubkeys introduced).

## UI integrity

N/A — no `apps/web` change.

## Things tests can't catch

- [x] No secrets, no `console.log` debug, no commented-out code in the new `src/`.
- [x] Error paths preserved (transport reject vs relay NACK distinction; dead-socket fast-reject; bounded read timeout).
- [x] No race introduced — single socket, sequential publishes, per-sub timers cleared on resolve/close.

## House rules

- [x] PRD §11.3 scope clean — no out-of-scope features.
- [x] POV-first respected (transport layer, no global-truth claim).
- [x] No new lint/typecheck/build tooling; package reuses the trust template under the existing `packages/*` glob.

## Findings

### Blocking
None.

### Non-blocking
1. **`packages/relay/src/connect.ts:90`** — `query`'s leading `ws.send(["REQ", ...])` is unguarded by try/catch (unlike `publish`, which catches a `send`-throw). This is carried verbatim from the promoter's original `relay.ts` (no behavior change, and the seeder never calls `query`), so it is out of scope for this refactor. If the librarian worker (Story 58) starts driving `query` against flaky sockets, hardening the read-path `send` the same way `publish` is hardened would be a reasonable follow-up. Not blocking.

## Flake note

The Implementer flagged a transient `apps/api/test/routes/trust.test.ts` flake ("Parse Error: Expected HTTP/"). It did **NOT** reproduce: `trust.test.ts` passed (8 tests) on both full `pnpm -r test` runs, and the PR's CI is green. Treated as a confirmed pre-existing transient, not caused by this change. Not a blocker.

## Verdict
**PASS**
