# ADR 0056: Seeder relay-publish resilience — auto-reconnect + bounded backoff retry

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/57-seeder-relay-resilience.md`

**Accepted 2026-06-05.** Harden the seeder's transport primitive `connectRelay` (`apps/seeder/src/publish.ts`) so a dead socket is surfaced as a promise rejection rather than a thrown crash or a silent timeout grind, and add a thin self-healing wrapper `connectResilientRelay` (new `apps/seeder/src/resilient-relay.ts`) that reconnects with bounded exponential backoff and retries the failed publish. The wrapper exposes the same `RelayConnection` interface, so `index.ts` swaps it in with no change to the seed loop. A transient drop is ridden through transparently; a sustained outage throws after `RELAY_RECONNECT_ATTEMPTS` so the run exits cleanly and the operator re-runs (the epoch checkpoint resumes). A genuine relay NACK (`OK:false`) stays a resolved `{ok:false}` and is never reconnect-retried. The seeder-only scope is deliberate (the duplicate `connectRelay` in `apps/promoter` is short-lived and far less exposed; a shared-client extraction is a logged follow-up). No event-shape, schema, web, API, or checkpoint change.

This is a hardening follow-up under **ADR 0008** (the seeder + `connectRelay`) prompted by a real "broken pipe" during the Story-55 / ADR-0054 re-seed. It does not change the seed semantics, the gate, dedup, the blurb path, or the checkpoint (ADR 0051).

## Context

`connectRelay` (`apps/seeder/src/publish.ts`) opens one WebSocket and resolves a `RelayConnection` with `publish(event)` and `close()`. `publish` sends `["EVENT", event]` and waits for the matching `["OK", id, …]` or a 10s timeout. The gaps that turned a transient dcosl drop into an aborted run:

1. **No reconnect.** `ws.once("error", …)` only rejects the initial connect promise. A `close`/`error` after open is unhandled.
2. **Synchronous send throw escapes.** On a dead/closing socket `ws.send` throws; the throw rejects the publish promise, which propagates through the seed loop to `main().catch()` and exits the process. This is the observed "broken pipe".
3. **Silent-death timeout grind.** If the socket dies without a `close` event, pending publishes are never rejected; each grinds to its 10s timeout and resolves `{ok:false,"publish timed out"}`, so the loop makes no progress for a long time.

The checkpoint (ADR 0051) appends each completed key to disk as it goes, so a re-run resumes correctly. That makes recovery safe but manual; this ADR makes a single run resilient to transient blips.

### Acceptance criteria (quoted from the story)

- Transport: `send`-throw rejects; post-open `close`/`error` rejects pending promptly and marks the connection unusable; a relay NACK still resolves `{ok:false}`; `connectRelay` accepts an injected WebSocket factory for tests.
- Resilient layer: reject-then-succeed reconnects and retries to a single `{ok:true}`; always-reject retries to `RELAY_RECONNECT_ATTEMPTS` with capped exponential backoff then throws; resolved `{ok:false}` is returned as-is with no reconnect; happy path does not reconnect; same `RelayConnection` interface; injected `connect` + `sleep`.
- Wiring: `index.ts` uses the resilient layer with no seed-loop change; new env knobs documented; re-send-after-reconnect idempotency documented.
- Gates: seeder tests + `pnpm -r typecheck` / `pnpm -r test` / seeder build green; no web/UI/API/schema change.

## Decision

### 1. Harden `connectRelay` (the transport primitive)

- **Injectable WebSocket.** `connectRelay(url, opts?)` accepts `opts.createWebSocket?: (url) => WebSocketLike` (default the real `ws` `WebSocket`), so tests drive `open`/`message`/`close`/`error`/`send`-throw deterministically.
- **Send throw → reject.** Wrap `ws.send(...)` in `try/catch`; on throw, clear the pending timer, delete the waiter, and **reject** the publish promise with a transport `Error` (not a resolved `{ok:false}` — a transport failure must be distinguishable from a relay NACK).
- **Post-open death → reject pending + mark dead.** Add `ws.on("close", …)` and `ws.on("error", …)` (live for the connection's life, not `once` on connect only). On either, **reject every pending publish** with a transport `Error` and set a `dead` flag. Once `dead`, `publish` rejects immediately without sending.
- **Relay NACK unchanged.** `["OK", id, false, reason]` still resolves `{ok:false, reason}`. The 10s timeout still resolves `{ok:false,"publish timed out"}` (the resilient layer does not reconnect on a resolved `{ok:false}`; the new close/error rejection is what converts a genuine dead-socket into a fast reject instead of a timeout).

### 2. `connectResilientRelay` (the self-healing wrapper) — new `apps/seeder/src/resilient-relay.ts`

```
connectResilientRelay(opts: {
  url: string;
  connect?: (url) => Promise<RelayConnection>;   // default connectRelay; injectable for tests
  attempts?: number;     // RELAY_RECONNECT_ATTEMPTS, default 6
  baseMs?: number;       // RELAY_RECONNECT_BASE_MS, default 500
  maxMs?: number;        // RELAY_RECONNECT_MAX_MS, default 8000
  sleep?: (ms) => Promise<void>;                 // injectable for tests
  onReconnect?: (info) => void;                  // for logging
}): Promise<RelayConnection>
```

- Holds the current `RelayConnection` (established once up front via `connect(url)`).
- `publish(event)`: a retry loop, up to `attempts` total tries:
  - `await current.publish(event)`.
  - If it **resolves** (`{ok:true}` or `{ok:false}`) → return the result (a relay NACK is the relay's answer, not a transport problem; no reconnect).
  - If it **rejects** (transport) → this attempt failed: if attempts remain, `sleep(backoff(i))` then reconnect (`current.close()` best-effort, then `current = await connect(url)`; a failed `connect` counts as a consumed attempt and backs off the same way) and loop to retry the SAME event.
  - After `attempts` exhausted → **throw** a clear `Error` (`relay unreachable after N attempts: …`). The seed loop's `main().catch()` exits non-zero; the operator re-runs; the checkpoint resumes.
- `backoff(i) = min(maxMs, baseMs * 2^i)` (i = 0-based attempt index). No jitter for v1 (deterministic, testable; jitter is a trivial future tweak if dcosl ever needs it).
- `close()` → `current.close()`.

### 3. Wire into `index.ts`

Replace `const relay = await connectRelay(relayUrl)` with `const relay = await connectResilientRelay({ url: relayUrl, attempts, baseMs, maxMs, onReconnect: log })`, reading the three env knobs. Everything else in the seed loop is unchanged (same `relay.publish` / `relay.close` calls). Log each reconnect (`[seeder] relay reconnect attempt i/N after …`) so a run's drops are visible.

### 4. Env knobs + idempotency

- `RELAY_RECONNECT_ATTEMPTS` (6), `RELAY_RECONNECT_BASE_MS` (500), `RELAY_RECONNECT_MAX_MS` (8000). Added to the seeder service in `docker-compose.prod.yml`, `.env.production.example`, and `docs/DEPLOY.md`.
- **Re-send idempotency:** a retry after a reconnect can re-send an event the relay accepted just before the drop. This is safe: book records and assertions are kind-39999 and replace in place by their deterministic d-tag, and the checkpoint records a key only on a confirmed `{ok:true}`, so a duplicate is at worst a redundant replace. Documented in the module and DEPLOY.

## Consequences

- A single seeder run rides through transient dcosl drops (the common case) without operator intervention; a genuine sustained outage still ends the run cleanly with a clear error, and the checkpoint makes the re-run cheap.
- The resilient layer and the hardened `connectRelay` are unit-tested deterministically (injected connector + clock + WebSocket factory); no real network in tests.
- The `apps/promoter` duplicate `connectRelay` is unchanged and still has the gap, but its short-lived per-batch connections make it low-risk; a shared resilient-relay extraction + promoter migration is the logged follow-up that retires the duplication.
- Sequential publishing is retained; no batching/parallelism/queueing is introduced (out of scope).
