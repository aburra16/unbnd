# Story 57: Seeder relay-publish resilience (auto-reconnect + bounded retry)

**Status:** Done
**Created:** 2026-06-05
**Type:** Hardening / Ops

## Background

The catalog seeder (`apps/seeder`) opens one WebSocket to dcosl via `connectRelay` (`apps/seeder/src/publish.ts`) and publishes every book record and genre assertion over it sequentially. A full re-seed publishes on the order of tens of thousands of events across many minutes. During the Story-55 re-seed the dcosl socket dropped mid-run with a "broken pipe", the seeder process exited, and the run only recovered because the operator re-ran it (the epoch checkpoint on the `seeder-data` volume resumes where it stopped).

The root cause is that the publish path has no resilience:

- `connectRelay` opens the socket once and never reconnects. `ws.once("error", …)` only rejects the *initial* connect promise; a `close` or `error` after the socket is open is unhandled.
- `publish()` calls `ws.send(...)`. On a dead or closing socket `ws.send` throws synchronously, which rejects the publish promise; that rejection propagates out of the seed loop to `main().catch()` and kills the process.
- When the socket dies silently (no `close`, just no replies), pending publishes are not rejected, so each one grinds to its 10s timeout and resolves `{ok:false, "publish timed out"}` one after another, making no progress.

The checkpoint makes a re-run safe and fast, but a single run cannot survive a transient relay blip unattended. This story makes one seeder run ride through transient drops by reconnecting and retrying, while still failing cleanly on a genuine sustained outage (so the operator re-runs and the checkpoint resumes).

**Scope note:** `connectRelay` is duplicated in `apps/promoter/src/relay.ts` with the same gap, but the promoter runs one short batch per cron invocation and exits, so its connections are short-lived and far less exposed. This story hardens the seeder only; extracting a shared resilient relay client and migrating the promoter is logged as a separate follow-up.

## User-facing description

There is no end-user-facing change. As the operator running a full catalog re-seed, I want a single seeder run to survive a transient dcosl connection drop without dying, so that a long seed completes unattended instead of needing me to watch for "broken pipe" and re-run it.

## Acceptance criteria

Testable from the outside. The real test surface is a resilient publish layer with an injected connector and clock (deterministic, no real sockets or sleeps).

**Transport hardening (`connectRelay`)**
- [ ] Given the socket throws synchronously on `send` (dead/closing socket), when `publish` is called, then the returned promise **rejects** with a transport error (it does not crash the caller's stack and is not reported as a relay `{ok:false}`).
- [ ] Given the socket emits `close` or `error` AFTER it was open, when there are pending publishes, then every pending publish is **rejected** promptly with a transport error (not left to grind to the 10s timeout), and the connection is marked unusable so a subsequent `publish` rejects immediately rather than sending into a dead socket.
- [ ] Given a genuine relay NACK (`["OK", id, false, reason]`), when received, then `publish` still **resolves** `{ok:false, reason}` (a relay rejection is not a transport failure and must remain distinguishable).
- [ ] `connectRelay` accepts an injected WebSocket factory so the above are unit-testable without a real network.

**Resilient layer (`connectResilientRelay`)**
- [ ] Given a `publish` whose underlying transport **rejects** once and then succeeds, when called, then the layer reconnects and retries, and the event is delivered exactly as a `{ok:true}` — the caller sees a single successful publish, not an error.
- [ ] Given the transport rejects on every attempt, when `publish` is called, then the layer retries up to `RELAY_RECONNECT_ATTEMPTS` with exponential backoff (base `RELAY_RECONNECT_BASE_MS`, doubling, capped at `RELAY_RECONNECT_MAX_MS`) and, after exhausting them, **throws** a clear error (so the run aborts cleanly and the operator re-runs; the checkpoint resumes). The backoff schedule is asserted via an injected sleep.
- [ ] Given the underlying publish **resolves** `{ok:false, reason}` (relay NACK), when called, then the layer returns it as-is and does **not** reconnect or retry (no retry storm on a genuinely rejected event; matches today's behavior where the seeder logs it and leaves it uncheckpointed for the next run).
- [ ] Given a publish that succeeds on the first try, when called, then the layer does **not** reconnect (no spurious reconnects on the happy path).
- [ ] The layer exposes the same `RelayConnection` interface (`publish`, `close`) so `index.ts` swaps it in with no change to the seed loop; it takes an injected `connect` and `sleep` for deterministic tests.

**Wiring + invariants**
- [ ] Given the seeder runs, when it connects, then `index.ts` uses the resilient layer (same interface) and the rest of the seed loop, checkpoint, blurb path, dedup, gate, rate limiting, and politeness are unchanged.
- [ ] New env knobs `RELAY_RECONNECT_ATTEMPTS` (default 6), `RELAY_RECONNECT_BASE_MS` (default 500), `RELAY_RECONNECT_MAX_MS` (default 8000) are read with sane defaults and documented in `docker-compose.prod.yml` / `.env.production.example` / `docs/DEPLOY.md`.
- [ ] A retry after a reconnect may re-send an event the relay accepted just before the drop; this is safe (kind-39999 replaces in place by d-tag; the checkpoint records only on a confirmed `{ok:true}`) and is documented.

**Gates**
- [ ] `pnpm --filter @unbnd/seeder test` (new resilience tests + existing suite) green; `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/seeder build` green. No web/UI/API/schema change.

## DList shapes touched

None. This is transport-layer resilience for the seeder's publish path. No event kinds, tags, or data-layer shapes change.

## Out of scope

- **The promoter (`apps/promoter`)** and its duplicate `connectRelay` — left as-is this story; a shared resilient relay client + promoter migration is a logged follow-up.
- The API/indexer relay paths.
- The checkpoint, gate, dedup, blurb, or any Story-55/56 behavior.
- Changing the relay protocol, adding queueing/batching, or parallel publishing (sequential publish stays).

## Open questions

None blocking. Retry defaults (6 attempts, 500ms→8s capped backoff) are sensible starting values and are env-tunable; the Architect may adjust the constants if a probe suggests better.

## Linked artifacts

- ADR: `engineering-team/decisions/0056-seeder-relay-resilience.md`
- Test plan: `engineering-team/stories/done/57-seeder-relay-resilience.test-plan.md` (Tester)
- Review: `engineering-team/reviews/57-seeder-relay-resilience.md` (PASS)
- Follow-up: extract a shared resilient relay client and migrate `apps/promoter` off its duplicate `connectRelay`.
