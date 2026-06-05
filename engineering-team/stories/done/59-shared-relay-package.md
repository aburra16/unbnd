# Story 59: Extract a shared `@unbnd/relay` client; migrate seeder + promoter

**Status:** Done
**Created:** 2026-06-05
**Type:** Refactor / Tech-debt
**Review:** `engineering-team/reviews/59-shared-relay-package.md` (PASS)

## Background

The nostr relay-publish primitive `connectRelay` is duplicated across worker apps:

- `apps/seeder/src/publish.ts` — the Story-57 **hardened** `connectRelay` (injectable WebSocket factory; a synchronous `send` throw rejects; post-open `close`/`error` reject all pending + set a `dead` flag; relay NACK still resolves `{ok:false}`) plus `apps/seeder/src/resilient-relay.ts` — `connectResilientRelay` (reconnect + bounded exponential backoff). Publish-only.
- `apps/promoter/src/relay.ts` — a separate, near-identical `connectRelay` that is NOT hardened (the original pre-Story-57 model), but DOES carry a one-shot `REQ` read (`RelayFilter` + a query method) the seeder's does not.

So the two copies have diverged: the seeder's is resilient but publish-only; the promoter's has a REQ read but lacks the Story-57 hardening. Story 58 (production librarian identity) adds a **third** consumer that needs BOTH capabilities (publish a kind-0/kind-3, AND a one-shot REQ read to fetch the librarian's existing kind-3 for merge-preserving). Adding a third copy would triple the duplication and force the librarian worker to pick one diverged client.

This story extracts ONE shared package, `@unbnd/relay`, that is the **union** of both clients, and migrates the seeder and the promoter onto it. The librarian worker (Story 58) is then a clean third consumer. This retires the duplication logged as an ADR-0056 follow-up; Story 58 depends on this landing first.

## User-facing description

No end-user-facing change. As an engineer, I want one audited relay-transport package (`@unbnd/relay`) that every worker uses, so the hardening and the REQ-read live in one place, can't diverge again, and the next worker imports it instead of copying it.

## Acceptance criteria

Testable from the outside.

- [ ] **The package exists.** `packages/relay/` is a workspace package `@unbnd/relay`, mirroring `@unbnd/trust`'s shape (`"private": true`, `"type": "module"`, raw `src` export, no build step, consumed by source; `scripts`: `test` + `typecheck`). It is picked up by the existing `pnpm-workspace` `packages/*` glob.
- [ ] **The union client.** `@unbnd/relay` exports: the Story-57 **hardened** `connectRelay` (injectable WebSocket factory; `send`-throw rejects; post-open `close`/`error` reject all pending + `dead` flag; relay NACK resolves `{ok:false}`); `connectResilientRelay` (reconnect + bounded exponential backoff, the Story-57 wrapper); a one-shot **`REQ` read** (the promoter's `query`/`RelayFilter` capability, folded into the same `RelayConnection`); and the shared types (`RelayConnection`, `PublishResult`/`PublishOutcome`, `RelayFilter`). One coherent interface, no duplicate definitions.
- [ ] **Seeder migrated, behavior preserved.** `apps/seeder` imports `connectRelay`/`connectResilientRelay` from `@unbnd/relay` (its local `publish.ts`/`resilient-relay.ts` are removed). The seeder's seed loop, resilience behavior, and tests are unchanged in effect; the Story-57 resilience tests move to `packages/relay/test/` and stay green.
- [ ] **Promoter migrated, behavior preserved (and hardened).** `apps/promoter` imports the client from `@unbnd/relay` (its local `relay.ts` is removed). Its publish + REQ-read behavior is preserved; it now also carries the Story-57 hardening (and may use `connectResilientRelay`). The promoter's existing tests stay green; any promoter test that exercised its local `relay.ts` is updated to import from `@unbnd/relay` without weakening assertions.
- [ ] **One definition, no third copy.** A repo-wide grep finds exactly ONE `connectRelay`/`connectResilientRelay` definition (in `packages/relay/src`); none remain in `apps/seeder/src`, `apps/promoter/src`, or elsewhere. (`apps/api`'s own publish path — `apps/api/src/nostr/publish.ts` — is a separate concern and is OUT of scope; this story is the worker `connectRelay` duplication only.)
- [ ] **Tests relocated + green.** The Story-57 transport + resilience tests (`apps/seeder/test/publish-resilience.test.ts`, `resilient-relay.test.ts`) move to `packages/relay/test/` and pass there; the REQ-read is unit-tested in the package; `pnpm --filter @unbnd/relay test` green.
- [ ] **Gates green, no behavior change.** `pnpm -r typecheck`, `pnpm -r test`, and the seeder + promoter builds are green. No change to relay behavior beyond unifying the two clients (the promoter gaining the Story-57 hardening is the only intended behavioral delta, and it is strictly an improvement, verified by its tests).
- [ ] **Deps wired.** `apps/seeder` and `apps/promoter` `package.json` declare `@unbnd/relay` (`workspace:*`); the Dockerfiles/build still resolve through source like the other `@unbnd/*` packages.

## DList shapes touched

None. Pure transport-layer refactor; no event kinds, tags, or data-layer change.

## Out of scope

- **The librarian worker (Story 58)** — it consumes `@unbnd/relay` but is its own story.
- **`apps/api`'s relay/publish code** (`nostr/publish.ts`, `propagate.ts`) — a separate publisher with its own multi-relay/dual-publish semantics; not part of the worker `connectRelay` duplication. Left untouched.
- **Changing relay behavior** beyond forming the union (and the promoter inheriting the Story-57 hardening). No new protocol features, no batching/parallelism.

## Open questions

For the Architect (ADR 0058):
1. **Interface shape of the union `RelayConnection`** — fold `publish` + `close` + the one-shot `REQ` read into one type; reconcile the seeder's `PublishResult` and the promoter's `PublishOutcome` names into one.
2. **Does the promoter adopt `connectResilientRelay`** (free resilience on its short batches) or just the hardened `connectRelay`? Pick the lower-risk option that keeps its tests green.
3. **Test relocation mechanics** — moving the Story-57 tests to `packages/relay/test` (and whether the seeder's `_load.ts` opaque-loader pattern is still needed once the modules live in the package).

## Linked artifacts

- ADR: `engineering-team/decisions/0058-shared-relay-package.md` (Architect).
- Retires the ADR-0056 follow-up (the shared-relay extraction) and the spawned chip for it.
- **Blocks:** Story 58 / ADR 0057 (production librarian identity) — the librarian worker imports `@unbnd/relay`.
