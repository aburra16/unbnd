# ADR 0062: Up-sync sync-health monitoring — cached local-vs-dcosl backlog check + `/health/sync`

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/63-upsync-monitoring.md`

**Accepted 2026-06-05.** Add a best-effort, bounded, graceful-degrading sync-health signal that detects a stalled community **up-sync** (kind-39999 ratings + tag assertions not reaching dcosl). A pure, injectable `checkUpsyncBacklog(deps)` diffs a bounded recent window of local-relay community events against dcosl by event id; it returns `in-sync` / `backlog` / `unknown` and is computed periodically by the Story-62 maintenance loop (via a dedicated up-sync interval) and **cached**. A new `GET /health/sync` serves only the cached value — never a live external call on the request path — and is kept off the `/health/data` aggregate so a backlog or `unknown` can never flap the service's liveness. The dual-publish (`propagate.ts` / `withUpSync`), the `unbnd-upsync` cron, and the existing health probes are all unchanged. Block E, PRD §2.11. This story only **observes**; propagation behavior is untouched.

## Context

Community writes reach the shared relay **dcosl** (`wss://dcosl.brainstorm.world/`) by two independent paths (ADR 0011 `engineering-team/decisions/0011-write-upsync.md`): the API's best-effort dual-publish (`apps/api/src/nostr/propagate.ts` `withUpSync`, wired in `index.ts` ~L116–139) and the `ops/cron/unbnd-upsync` `strfry sync … --dir up` backstop every 5 min. If the dual-publish drops **and** the cron silently fails, community ratings/tags sit local-only with **no signal**. The story closes that gap with (a) an operator runbook to confirm the cron is installed + running and (b) a programmatic sync-health signal.

**Constraints pulled from the real code:**

- **`queryRelayUrl(relayUrl, filter, timeoutMs)`** (`apps/api/src/nostr/query.ts`, default 5s) is a one-shot REQ→EOSE read that **resolves on timeout/error rather than throwing** (it `finish()`es with whatever it collected). This is the right graceful-degrade primitive, but it has a load-bearing flaw for this check: **a failed/timed-out dcosl read is indistinguishable from "dcosl returned 0 events" (in-sync).** The check MUST distinguish these or it will report a false "in-sync" while writes are actually stranded. The current `NostrFilter` type supports `kinds`, `authors`, `limit`, `until`, and `#<tag>` filters; it does **not** yet have `ids` or `since` — both are needed here (Implementer extends the type, see Implementation notes).
- **`apps/api/src/routes/health.ts`** `buildHealthRouter(deps)` exposes `GET /health` (trivial liveness) and `GET /health/data` (`Promise.allSettled` over in-container probes — strfry/neo4j/tapestry/postgres/search — with an aggregate `ok` → 200/503). **Every existing probe is in-container.** None reaches across the public internet. An external-relay signal must never gate liveness, or a dcosl blip turns an eventually-consistent backstop into a false 503.
- **`apps/api/src/maintenance.ts`** `startMaintenanceSweeper(opts)` is a single `unref()`'d, fault-isolated timer (default 1h via `MAINTENANCE_INTERVAL_MS`, ADR 0061) running three injected sweeps; a throw in one is caught + logged and the others still run. Wired in `index.ts` `main()` ~L568. **The 1h cadence is too coarse** to track a 5-min up-sync cron, so this ADR adds a *dedicated* up-sync interval rather than overloading the maintenance interval (see Decision §1).
- **`apps/api/src/config.ts`**: `strfryUrl` (`STRFRY_URL`, always set, local relay), `dcoslRelayUrl` (`DCOSL_RELAY_URL`, optional, validated `wss?://`), `librarianPubkey` (`LIBRARIAN_PUBKEY`, optional 64-hex). The `#z` filter values are `39998:<librarian hex>:book-ratings` and `39998:<librarian hex>:book-tag-assertions` (exactly the cron's `--filter`). The Librarian pubkey is resolved at runtime from config, never hardcoded (CLAUDE.md invariant). The check must degrade to `unknown` (never error) when `dcoslRelayUrl` or `librarianPubkey` is unset (local dev/test).

No DList shape, schema, or event is created or changed. The check **reads** existing kind-39999 events from two relays and diffs them.

## Options considered

### Option A — Cached compute on a dedicated up-sync interval; dedicated `GET /health/sync` (chosen)

A pure `checkUpsyncBacklog(deps)` over injected local + dcosl reads + an injected clock. A dedicated `unref()`'d periodic (cadence `UPSYNC_CHECK_INTERVAL_MS`, default 5 min to track the cron) computes the backlog and writes a module-level cache. `GET /health/sync` serves the cache, always HTTP 200, with `checkedAtMs` for staleness. Off the `/health/data` aggregate entirely.

- **Pros:** Endpoint never makes a live external call → fast + safe by construction. Cadence is tunable to the 5-min cron independent of the 1h maintenance interval. Can never flap liveness. Pure check → deterministic unit tests, no real network.
- **Cons:** A second `unref()`'d timer beside the maintenance one (small, justified by the cadence mismatch). The served value is up to one interval stale (exposed via `checkedAtMs`).

### Option B — Compute as a 4th maintenance sweep (reuse the existing timer)

Add `upsync` as a 4th injected task in `MaintenanceSweeps`, computing + caching on each maintenance tick.

- **Pros:** One timer, reuses ADR 0061's fault-isolation. No second interval.
- **Cons:** The maintenance interval defaults to **1h** — far too coarse to detect a 5-min-cron stall; an operator would see hour-old data. Lowering `MAINTENANCE_INTERVAL_MS` to 5 min to suit this would make the key/session/challenge sweeps run 12× more often for no reason, and coupling the two cadences is a latent footgun. The cadences genuinely differ.

### Option C — Per-request live query with a hard timeout

`/health/sync` queries both relays on each request, strictly timeout-bounded, degrading to `unknown`.

- **Pros:** Freshest reading; no cache, no second timer.
- **Cons:** Puts a public-internet call on the request hot path (the one thing the story's survey calls out as the constraint). Even bounded, it adds dcosl round-trip latency to every poll, and a misconfigured/aggressive monitor could hammer dcosl. The cache decouples cleanly; freshness is not worth the coupling for an eventually-consistent backstop.

## Decision

We chose **Option A**. It keeps the endpoint a pure cache read (never touches dcosl on the request path), tracks the 5-min cron with a dedicated cadence without disturbing the 1h maintenance sweeps, and makes the check a pure function over injected reads + clock so the degrade/diff cases are unit-testable without a real relay. The unreachable-vs-in-sync ambiguity is resolved by a thin `{ ok, events }` wrapper (Decision §2) so a failed read is never mistaken for "in-sync".

### 1. Cached-via-a-dedicated-timer (resolves Open Q1)

- A new `apps/api/src/health/upsync.ts` module holds a **module-level mutable cache** of the latest result plus its computed-at time:
  ```ts
  export type UpsyncStatus = "in-sync" | "backlog" | "unknown";
  export type UpsyncHealth = {
    status: UpsyncStatus;
    backlog: number;                       // local-but-not-on-dcosl count in the window (0 unless status==="backlog")
    oldestUnpropagatedAgeMs: number | null;// now − oldest missing event's created_at; null unless backlog>0
    capped: boolean;                       // true iff the local window hit the cap (backlog may be ≥ reported)
    windowMs: number;                      // the window used (for operator context)
    limit: number;                         // the cap used
    reason?: string;                       // present on status==="unknown"
    checkedAtMs: number | null;            // when this was computed; null before the first run
  };
  ```
- **Before the first computation** the cache reads `{ status: "unknown", backlog: 0, oldestUnpropagatedAgeMs: null, capped: false, windowMs, limit, reason: "not yet computed", checkedAtMs: null }`. The endpoint serves this verbatim until the first tick lands.
- A **dedicated periodic** (its own `unref()`'d `setInterval`, cadence `UPSYNC_CHECK_INTERVAL_MS`, default 5 min) runs `checkUpsyncBacklog`, then writes the result + `checkedAtMs = now` into the cache. It is **fault-isolated**: the whole tick body is wrapped in try/catch; a throw logs `[upsync-check] …` and leaves the previous cache untouched (it does **not** clobber a good value with a crash, and it does not stop future ticks). Expose a small `startUpsyncHealthMonitor(deps): { stop(): void }` mirroring `startMaintenanceSweeper`'s handle shape; optionally run one tick shortly after boot so the first reading appears without waiting a full interval. `checkUpsyncBacklog` itself already bounds each read by `timeoutMs`, so a slow/down dcosl never hangs the tick.
- Rationale for *not* folding it into the maintenance sweep: the 1h maintenance cadence cannot track a 5-min cron; the two cadences differ for real reasons (Option B cons). A second tiny `unref()`'d timer is the proportionate cost.

### 2. The check logic + the unreachable-vs-in-sync resolution (the load-bearing decision; resolves Open Q2 & Q4)

`checkUpsyncBacklog(deps)` is **pure over injected reads + an injected clock** — no real network, no `Date.now()` inside:

```ts
type RelayRead = (filter: NostrFilter) => Promise<{ ok: boolean; events: SignedNostrEvent[] }>;
type CheckDeps = {
  readLocal: RelayRead;          // wraps queryRelayUrl(strfryUrl, …)
  readDcosl: RelayRead | null;   // null when dcoslRelayUrl/librarianPubkey unset
  librarianPubkey: string | null;
  now: () => number;             // injected clock (ms)
  windowMs: number;              // UPSYNC_CHECK_WINDOW_MS
  limit: number;                 // UPSYNC_CHECK_LIMIT
};
```

**The `{ ok, events }` wrapper is the resolution of the unreachable-vs-in-sync ambiguity.** Because `queryRelayUrl` resolves-on-error, the check can never see a throw. So we interpose a thin wrapper around it that reports whether the read *demonstrably succeeded*:

- The wrapper observes the EOSE/timeout outcome and returns `{ ok: true, events }` only when the read completed cleanly (EOSE seen within the timeout), and `{ ok: false, events: [] }` on timeout or socket error. `queryRelayUrl` does not currently surface that distinction, so the wrapper is built on a **success-signalling variant** of the one-shot read: a `queryRelayUrlChecked(relayUrl, filter, timeoutMs): Promise<{ ok; events }>` that mirrors `queryRelayUrl` but resolves `ok:false` on the timeout/`error` branches and `ok:true` on the EOSE branch. (This is additive in `query.ts`; `queryRelayUrl`/`queryEvents` stay byte-identical so nothing else changes. The Implementer may either add the variant or refactor `queryRelayUrl` to return the richer shape and keep a thin back-compat wrapper — `checkUpsyncBacklog` only depends on the injected `RelayRead`, so the unit tests pin the contract regardless.)

**Algorithm (only computes a real backlog when BOTH reads succeed):**

1. If `readDcosl === null` or `librarianPubkey === null` → return `status:"unknown", reason:"dcosl/librarian not configured"`, `backlog:0`, `oldestUnpropagatedAgeMs:null`, `capped:false`. (No reads attempted.)
2. Compute `since = now() − windowMs`. **Local read:** `readLocal({ kinds:[39999], "#z":[<book-ratings handle>, <book-tag-assertions handle>], since, limit })`.
   - If `local.ok === false` → `status:"unknown", reason:"local relay read failed"`. (Never report a backlog off a failed local read.)
3. Let `localEvents = local.events` (each has `id` + `created_at`), `localIds = localEvents.map(e => e.id)`. `capped = localEvents.length >= limit`. If `localIds` is empty → `status:"in-sync", backlog:0, oldestUnpropagatedAgeMs:null` (nothing recent to propagate; a clean reading).
4. **dcosl read:** prefer `readDcosl({ ids: localIds })` (exact membership test for the same ids, cheap, within the cap since `localIds.length ≤ limit`). If the relay does not honor `ids`, fall back to `readDcosl({ kinds:[39999], "#z":[…], since, limit })` and diff by id set — Implementer picks based on dcosl's REQ support; the `ids` form is preferred because it is exact and self-bounded.
   - If `dcosl.ok === false` → `status:"unknown", reason:"dcosl read failed/timeout"`. **This is the critical branch:** a timed-out or errored dcosl read is `unknown`, NEVER backlog-0/in-sync.
5. **Both reads succeeded.** `dcoslIds = new Set(dcosl.events.map(e => e.id))`. `missing = localEvents.filter(e => !dcoslIds.has(e.id))`.
   - `missing.length === 0` → `status:"in-sync", backlog:0, oldestUnpropagatedAgeMs:null`.
   - `missing.length > 0` → `status:"backlog", backlog: missing.length, oldestUnpropagatedAgeMs: now() − (min(missing.created_at) × 1000)` (nostr `created_at` is seconds; the age is ms). Carry `capped` through.

Result shape is `UpsyncHealth` (minus `checkedAtMs`, which the timer stamps when caching). The function is deterministic given its injected reads + clock.

### 3. Endpoint shape + the non-flapping guarantee (resolves Open Q2/endpoint, Q3-window-context)

- A **dedicated `GET /health/sync`** (NOT a `services.sync` block on `/health/data`). It serves the cached `UpsyncHealth` verbatim.
- **HTTP status policy: always 200**, including on `status:"unknown"` and `status:"backlog"`. The *status field* conveys sync health; the HTTP code conveys "the endpoint answered." A backlog or `unknown` is an eventually-consistent backstop signal, not a liveness failure, so it must not read as an HTTP error to a naive monitor. (Operators threshold on the `status`/`backlog` fields, per the runbook.)
- **Non-flapping guarantee:** `/health/sync` is entirely separate from `buildHealthRouter`'s `/health/data` aggregate. The dcosl signal is **never** added to the `Promise.allSettled` probe set and **never** contributes to the `ok`/503 computation. `GET /health` (trivial liveness) and `GET /health/data` (in-container aggregate) are byte-identical after this change. A `sync:"unknown"` or a rising backlog therefore cannot, by construction, flip `/health/data` to 503 or block the other probes.

### 4. Window + cap defaults + config (resolves Open Q3)

Tie the window to the 5-min cron cadence with margin so a healthy steady state reads `in-sync` and a just-written event isn't a false "backlog" before the next cron tick:

| Env | Default | Validation | Meaning |
|---|---|---|---|
| `UPSYNC_CHECK_WINDOW_MS` | `1_800_000` (30 min) | positive integer | `since = now − window`; ~6 cron cycles of margin |
| `UPSYNC_CHECK_LIMIT` | `500` | positive integer | per-REQ cap on the local read (tracks strfry `maxFilterLimit`); keeps the check cheap and one-shot |
| `UPSYNC_CHECK_INTERVAL_MS` | `300_000` (5 min) | positive integer | how often the dedicated timer recomputes + caches |

All three follow the exact `withDefault` + `Number.isFinite`/`Number.isInteger`/`> 0` parse-and-throw style already in `config.ts` (mirror the `maintenanceIntervalMs` block). The 30-min window deliberately gives several cron cycles of slack: an event written seconds ago that the next cron tick (≤5 min away) will propagate stays inside the window but, once propagated, drops out of the backlog — so transient "in flight" writes don't read as a stall. A true stall accumulates across cycles and the backlog + oldest-age climb. The 500-event cap keeps the read a single REQ→EOSE within the relay's per-REQ limit (no paging — a health check stays cheap; see Risks for the cap-clipping note).

### 5. Scope: up-sync only (resolves Open Q5)

Covers the **community up-sync** only: kind-39999 events z-tagged to the librarian's `book-ratings` + `book-tag-assertions` concepts (exactly the cron's `--filter`). The down-sync / librarian catalog (`--dir down`) is explicitly **out of scope** per the PRD bullet; a down-sync health signal is a possible later story, not built here.

### 6. Module home + wiring (resolves Open Q6)

- **`apps/api/src/health/upsync.ts`** (new) — exports `checkUpsyncBacklog` (the pure check), the `UpsyncHealth` type, the module-level cache holder with `getUpsyncHealth(): UpsyncHealth` (returns the cache, or the pre-first-run `unknown`) + an internal setter the timer calls, and `startUpsyncHealthMonitor(deps): { stop(): void }` (the dedicated `unref()`'d timer). Imported by **both** the timer wiring and the endpoint, so they share one cache.
- **`apps/api/src/routes/health.ts`** — add `GET /health/sync` to `buildHealthRouter`. Inject the cache reader via a new optional dep `readUpsyncHealth?: () => UpsyncHealth` on `HealthDeps` (mirroring the existing injected-probe style), defaulting to a pre-first-run `unknown` when absent so the router stays usable in partial test fixtures. The route just `res.status(200).json(deps.readUpsyncHealth())`.
- **`apps/api/src/nostr/query.ts`** — add the success-signalling read (`queryRelayUrlChecked` or the richer-return refactor, §2) and extend `NostrFilter` with `ids?: string[]` and `since?: number` (both standard nostr filter fields the type simply doesn't list yet).
- **`apps/api/src/index.ts` `main()`** — (a) pass `readUpsyncHealth: getUpsyncHealth` into `buildHealthRouter` (~L172); (b) after `app.listen`, near the existing `startMaintenanceSweeper` call (~L568), start `startUpsyncHealthMonitor({ config, intervalMs: config.upsyncCheckIntervalMs ?? 300_000, windowMs: …, limit: …, readLocal: f => queryRelayUrlChecked(config.strfryUrl, f, timeoutMs), readDcosl: config.dcoslRelayUrl && config.librarianPubkey ? f => queryRelayUrlChecked(config.dcoslRelayUrl!, f, timeoutMs) : null, librarianPubkey: config.librarianPubkey ?? null, now: Date.now })`. Best-effort background; never affects request handling; `unref()`'d.
- The `#z` handle strings (`39998:<hex>:book-ratings`, `…:book-tag-assertions`) are built at wiring time from `config.librarianPubkey` (runtime, never hardcoded — CLAUDE.md invariant).

## Consequences

- An operator can read `GET /health/sync` and see at a glance whether community writes are propagating: `in-sync` (backlog 0), `backlog` (count + oldest-unpropagated age, rising = stall), or `unknown` (dcosl unreachable/unconfigured — investigate, never assume in-sync).
- A failed/timed-out dcosl read reports `unknown`, never a false `in-sync` — the load-bearing correctness property, pinned by tests.
- The endpoint is a pure cache read: zero external calls on the request path, can never hang, can never flap `/health` or `/health/data`'s liveness.
- One additional small `unref()`'d timer (5-min default), fault-isolated; a crash leaves the last good cache in place and retries next tick.
- **Affects existing fixtures?** No web/UI change. Partial API test fixtures for `buildHealthRouter` gain an optional `readUpsyncHealth` dep (defaulted), so existing health-router tests keep passing without edits.
- **New dependency?** No. Reuses `ws`-backed `queryRelayUrl`, the maintenance-timer pattern, and the config parse style.
- **PRD section change required?** No. This implements PRD §2.11's up-sync verification + basic monitoring bullet as written.
- Runbook (`ops/sync-runbook.md`) gains a "Verify the cron + read the sync-health signal" section (design level below).

## Implementation notes

- **`apps/api/src/health/upsync.ts`** (new): `checkUpsyncBacklog(deps)` per Decision §2 (pure, injected `readLocal`/`readDcosl`/`now`/`windowMs`/`limit`/`librarianPubkey`); the `UpsyncHealth` type; module-level cache + `getUpsyncHealth()` + internal setter; `startUpsyncHealthMonitor(deps)` (dedicated `unref()`'d `setInterval`, fault-isolated tick that calls `checkUpsyncBacklog` then caches with `checkedAtMs = Date.now()`, leaving the prior cache on throw; optional one-shot at boot).
- **`apps/api/src/nostr/query.ts`**: add `queryRelayUrlChecked` (resolves `{ ok:true, events }` on EOSE, `{ ok:false, events:[] }` on timeout/error) — or refactor `queryRelayUrl` to the richer return + keep a thin back-compat wrapper. Extend `NostrFilter` with `ids?: string[]` and `since?: number`. Leave `queryEvents`/`queryEventsPaged` byte-identical.
- **`apps/api/src/routes/health.ts`**: add optional `readUpsyncHealth?: () => UpsyncHealth` to `HealthDeps` (default → pre-first-run `unknown`); add `router.get("/health/sync", (_req,res)=>res.status(200).json(deps.readUpsyncHealth()))`. Do NOT touch `/health` or `/health/data`.
- **`apps/api/src/config.ts`**: add `upsyncCheckWindowMs` / `upsyncCheckLimit` / `upsyncCheckIntervalMs` (env `UPSYNC_CHECK_WINDOW_MS` / `UPSYNC_CHECK_LIMIT` / `UPSYNC_CHECK_INTERVAL_MS`, defaults 1_800_000 / 500 / 300_000, parsed positive-integer with the existing throw style; optional on `Config` like the other Story-62 knobs).
- **`apps/api/src/index.ts`**: wire `readUpsyncHealth: getUpsyncHealth` into `buildHealthRouter`; start `startUpsyncHealthMonitor` after `app.listen` near the maintenance timer (see Decision §6 for the dep wiring; build the two `#z` handles from `config.librarianPubkey` at runtime).
- **No change** to `propagate.ts` / `withUpSync`, the `unbnd-upsync` cron, or the dual-publish wiring.

### Operator runbook (design level — goes in `ops/sync-runbook.md`)

Add a "Sync-health monitoring (Story 63)" section covering:

- **Verify the cron is installed:** `cat /etc/cron.d/unbnd-upsync` (presence + correct librarian hex substituted, no `<LIBRARIAN_HEX>` placeholder left). 
- **Verify the cron is running:** `tail -n 20 /var/log/unbnd-upsync.log` shows recent (within the last few cycles) `strfry sync` lines with no repeated errors; cross-check the log's most-recent timestamp is < ~10 min old.
- **Read the signal:** `curl -s localhost:8787/health/sync | jq` (or through nginx). Interpretation:
  - `status:"in-sync"`, `backlog:0` → healthy; nothing to do.
  - `status:"backlog"`, rising `backlog` + growing `oldestUnpropagatedAgeMs` across reads → up-sync is stalled. Action: run the manual one-shot up-sync (the `docker exec … strfry sync … --dir up` command already in the runbook), then check the cron is installed + running (above), the `unbnd-tapestry` container is up, and the dual-publish env (`DCOSL_RELAY_URL` set, `PROPAGATE_WRITES` != `false`).
  - `status:"unknown"` with a `reason` → the check couldn't read one of the relays (dcosl unreachable/slow, or `DCOSL_RELAY_URL`/`LIBRARIAN_PUBKEY` unset). Action: confirm config is set and dcosl is reachable; an `unknown` is NOT "in sync" — treat it as "no signal, investigate."
  - **Staleness:** `checkedAtMs` is the last compute time. If it is much older than `UPSYNC_CHECK_INTERVAL_MS` (5 min), the monitor timer has stalled — check the api logs for `[upsync-check]` errors.

### Testability (for the Tester phase)

- **`checkUpsyncBacklog`** unit tests with injected `readLocal`/`readDcosl`/`now`/`windowMs`/`limit` (no real relay): (1) all local ids present on dcosl → `in-sync`, backlog 0, age null; (2) some local ids missing → `backlog` with exact count + `oldestUnpropagatedAgeMs` from the oldest missing `created_at` against the injected clock; (3) `readDcosl` returns `{ok:false}` → `unknown` with reason, never backlog-0; (4) `readDcosl===null` / `librarianPubkey===null` → `unknown`; (5) `readLocal` returns `{ok:false}` → `unknown`; (6) window honored (events older than `since` are not requested/diffed) and cap honored (local at `limit` → `capped:true`).
- **`startUpsyncHealthMonitor`** tests: a tick updates the cache + stamps `checkedAtMs`; a throwing `checkUpsyncBacklog` is caught (timer survives, prior cache untouched).
- **Endpoint** tests: `/health/sync` serves the cached value; pre-first-run returns the `unknown`/`checkedAtMs:null` shape; always HTTP 200; `/health/data` aggregate unaffected by a `backlog`/`unknown` sync state.

## Risks

- **Cap-clipping:** a true backlog larger than `UPSYNC_CHECK_LIMIT` (500) reads as "≥ cap" — the local window itself is capped, so the diff under-reports. Mitigated by the `capped:true` flag on the result (and surfaced in the runbook): a `capped` reading means "at least this many; investigate," not an exact count. Acceptable for a cheap one-shot health check (the story explicitly excludes full-history reconciliation).
- **Staleness on a stalled timer:** if the dedicated timer stalls, the served value goes stale silently. Mitigated by `checkedAtMs` (operators/monitors detect staleness by comparing it to now + the interval).
- **Window false-negative at the very edge:** an event written just before a cron tick is "in flight" and could read as backlog for one interval; the 30-min window over a 5-min cron gives ample margin so steady state reads `in-sync`, and a transient one-off clears on the next compute. A persistent stall accumulates and is unambiguous.
- **dcosl `ids:` filter support:** if dcosl rejects/ignores large `ids:` filters, the fallback `#z`+`since` diff (Decision §2 step 4) covers it within the same cap. Either way the diff is id-set based and bounded.

## Out of scope

- Changing the up-sync cron's sync logic or the API dual-publish (`withUpSync` / `propagate.ts`). This story only observes.
- Alerting / paging / threshold alarms (email/Slack/PagerDuty) and any auto-remediation. Deliver the signal + runbook; a human (or a future story) reads it.
- A full metrics / Prometheus / dashboard stack. One bounded health field is the proportionate hardening.
- The down-sync / librarian catalog propagation signal (`--dir down`). Up-sync only, per the PRD bullet; a down-sync signal is a possible later story.
- A live, unbounded relay diff or full-history reconciliation report. Bounded window + cap only.
