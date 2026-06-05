# Story 63: Up-sync cron verification + sync-health monitoring

**Status:** Done
**Created:** 2026-06-05
**Type:** Hardening / Ops (Block E)
**Review:** `engineering-team/reviews/63-upsync-monitoring.md` (PASS)

## Background

Block E, PRD §2.11: "**Up-sync cron verification:** confirm `unbnd-upsync` is installed and running on the droplet; add basic monitoring." (Listed as Story 39 in the §5 sequence; this is the next available story number.)

Community writes — reader-signed **ratings** and **tag assertions** (kind-39999, z-tagged to the librarian's `book-ratings` / `book-tag-assertions` concepts) — reach the shared relay **dcosl** (`wss://dcosl.brainstorm.world/`) by two independent paths, by design (ADR 0011):

1. **Primary — API dual-publish.** `apps/api/src/nostr/propagate.ts` `withUpSync(localPublish, dcoslPublish, onError)` awaits the local relay publish (source of truth, gates the response) and fires a **best-effort** dcosl publish off the critical path (`void`-ed, never awaited, failures logged `[upsync] …`, never surfaced to the user). Wired in `apps/api/src/index.ts` (~L120-139) when `config.propagateWrites` and `config.dcoslRelayUrl` are set.
2. **Backstop — `unbnd-upsync` cron.** `ops/cron/unbnd-upsync` runs `strfry sync wss://dcosl.brainstorm.world/ --dir up` every 5 min with the filter `{"kinds":[39999],"#z":["39998:<LIBRARIAN_HEX>:book-ratings","39998:<LIBRARIAN_HEX>:book-tag-assertions"]}`, logging to `/var/log/unbnd-upsync.log`. Negentropy reconciliation only transfers what dcosl lacks (idempotent; the librarian's seeded assertions already on dcosl are never re-pushed). Install/verify procedure in `ops/sync-runbook.md`.

**The gap this story closes:** there is **no visibility** into whether community writes actually landed on dcosl. If the dual-publish drops (relay blip) **and** the cron silently fails (not installed, container renamed, log rotated away, `strfry sync` erroring), writes sit local-only and **nobody knows** — community ratings/tags would be invisible to anyone reading dcosl directly, with no signal until someone manually diffs the relays. Two things are missing: (a) an operator way to confirm the cron is installed + actually running, and (b) a programmatic **sync-health signal** that detects a stalled up-sync (both paths failing) without a human comparing relays by hand.

### Survey of the real code (so the buildable core is grounded)

**The relay query surface already exists.** `apps/api/src/nostr/query.ts` exposes `queryRelayUrl(relayUrl, filter, timeoutMs)` — a one-shot REQ→EOSE read against **an explicit relay URL** with a bounded timeout (default 5s) that **resolves on timeout/error rather than throwing** (it collects what it has and `finish()`es). It already supports `kinds`, `#z`/`#a` tag filters, `limit`, and `until`. This is exactly the primitive a sync-health check needs: it can query the **local** relay (`config.strfryUrl`, default `ws://localhost:7777` / `ws://tapestry/relay` in prod) **and** dcosl (`config.dcoslRelayUrl`) with the same up-sync filter and diff the two event-id sets. The timeout-resolves-empty behavior is the right graceful-degrade primitive (a slow/unreachable dcosl yields an empty/partial set without hanging), though the check must distinguish "dcosl returned 0 because in-sync" from "dcosl unreachable" — see Open questions.

**Config keys are both present.** `apps/api/src/config.ts`: `strfryUrl` (`STRFRY_URL`, the local relay, always set) and `dcoslRelayUrl` (`DCOSL_RELAY_URL`, optional, validated `wss?://`). `librarianPubkey` (`LIBRARIAN_PUBKEY`, 64-hex, optional) is also loaded — needed to build the `#z` filter values `39998:<hex>:book-ratings` / `39998:<hex>:book-tag-assertions`. The check must degrade gracefully when `dcoslRelayUrl` or `librarianPubkey` is unset (e.g. local dev): report `status:"unknown"` with a reason, never error.

**The health router is the natural home.** `apps/api/src/routes/health.ts` `buildHealthRouter(deps)` already exposes `GET /health` (cheap liveness) and `GET /health/data` (probes strfry/neo4j/tapestry/postgres/search via `Promise.allSettled`, each fault-isolated, 200/503 by aggregate `ok`). Mounted at `/` in `index.ts` (~L170). A new `GET /health/sync` (or an added `services.sync` block on `/health/data`) fits the existing shape — but a key constraint surfaces here: **the existing probes are all to in-container dependencies; none reaches across the public internet to an external relay.** A health endpoint must not depend on dcosl being up or fast, so the sync signal must be either pre-computed/cached or strictly bounded by a short timeout that degrades to `unknown` (it must never make `/health/data`'s aggregate `ok` flap on a dcosl blip, and never hang the endpoint).

**A periodic background loop already exists (Story 62 / ADR 0061).** `apps/api/src/maintenance.ts` `startMaintenanceSweeper` runs a single `unref()`'d, fault-isolated timer (default 1h, `MAINTENANCE_INTERVAL_MS`); each tick runs injected sweeps (`keys`/`sessions`/`challenges`), a throw in one is caught+logged and the others still run. Wired in `index.ts` (~L568). **Design option for the Architect:** a sync-backlog computation could be a periodic task here (compute the local-vs-dcosl diff on the timer, cache the result), with `/health/sync` serving the **cached** value — so the endpoint never makes a live external call and stays fast/safe by construction. The alternative is a per-request bounded-timeout query. Flagged below; the PO does not pick.

**What "community writes" the check inspects.** Exactly the up-sync filter target: kind-39999 events z-tagged to the librarian's `book-ratings` + `book-tag-assertions` concepts (`39998:<librarian hex>:book-ratings` / `…:book-tag-assertions`). Not the catalog/down-sync (librarian-published books/taxonomy), which has its own `--dir down` cron and is out of scope per the PRD bullet (up-sync only).

### Lean-vs-full-cycle assessment

This is **on the boundary but warrants a full cycle (keep the Tester phase).** The operator parts (runbook to verify the cron + read the signal) are thin and doc-only. But the buildable core is **not** trivial: it's a new best-effort, bounded, graceful-degrading external-relay diff with several real failure modes (dcosl unreachable vs in-sync ambiguity, timeout bounding, the cache-vs-per-request seam, not flapping `/health/data`). Those are exactly the cases that need explicit test design. Recommendation: **full cycle.** If the Architect lands on the simplest shape (a single bounded helper + a cached read, very few branches), the orchestrator may fold test-design into implementation — but the default here is a real Tester pass on the degrade/bound/diff cases.

## User-facing description

There is no end-user UI change. The "user" here is the **operator** (PRD persona: the platform maintainer) running the droplet:

As the operator, when the up-sync path stalls (the API dual-publish drops **and** the `unbnd-upsync` cron is broken or not running), I want a clear signal that community writes are sitting local-only and not reaching dcosl — plus a runbook to confirm the cron is installed and actually running — so I can catch a silent durability failure instead of discovering weeks later that community ratings and tags never propagated to the shared relay.

## Acceptance criteria

Testable against the sync-health check's seam (inject the two relay reads + a clock; tests never touch a real relay) and by reading the runbook.

**The sync-health signal — in-sync case**
- [ ] Given a bounded recent window of local community events (kind-39999 under the librarian's `book-ratings` + `book-tag-assertions` `#z`) that are **all present on dcosl**, when the sync-health check runs, then it reports an in-sync result: backlog count **0** and a clean status (e.g. `status:"ok"`), with no oldest-unpropagated age.

**The sync-health signal — backlog case**
- [ ] Given local community events in the window that are **missing from dcosl**, when the check runs, then it reports the **backlog count** (number of local-but-not-on-dcosl events in the window) **and the age of the oldest unpropagated event** (from its `created_at`), so a stalled up-sync is detectable and roughly quantified.

**Graceful degrade — dcosl unreachable / slow / unconfigured**
- [ ] Given dcosl is unreachable, times out, or `DCOSL_RELAY_URL`/`LIBRARIAN_PUBKEY` is unset, when the check runs, then it reports `status:"unknown"` **with a reason** — it **does not throw, does not hang, and is bounded by a timeout**. It must not be mistaken for "in sync" (an empty dcosl read due to unreachability is `unknown`, not backlog 0).

**Bounded + off the request hot path**
- [ ] Given the check, when it runs, then it is **bounded**: a small recent time window AND a capped event count, so it is cheap regardless of catalog/community size (no full-history scan, no unbounded REQ).
- [ ] Given the design, when a request hits the health endpoint, then the dcosl diff does **not** run synchronously on the request hot path in a way that can hang or slow the response (either the result is cached by a periodic task and served instantly, or the live query is strictly timeout-bounded and degrades to `unknown` — the Architect picks; the endpoint stays fast either way).
- [ ] Given the sync signal degrades or errors, when `/health/data` is computed (if the signal is surfaced there), then the existing per-dependency probes stay **fault-isolated** — a `sync:"unknown"` must not, by itself, flip the whole `/health/data` aggregate `ok` to false or block the other probes (the up-sync backstop is eventually-consistent by design; an unknown is not an outage of the core service).

**Endpoint shape**
- [ ] Given the operator, when they query the health surface (`GET /health/sync` or the `services.sync` block on `GET /health/data` — the Architect picks), then they get at minimum: a status, the backlog count, and the oldest-unpropagated age (or a clean in-sync reading), plus enough context (window size, cap, reason on `unknown`) to act.

**Operator verification + monitoring runbook**
- [ ] Given the operator, when they follow the updated `ops/sync-runbook.md`, then it documents how to **verify the cron is installed and running** (a crontab/`/etc/cron.d` presence check AND a recent-activity check on `/var/log/unbnd-upsync.log`), and how to **read the new sync-health signal** for basic monitoring: what a **healthy** reading looks like (in-sync / backlog 0), what a **stalled** reading looks like (rising backlog + growing oldest-unpropagated age), and **what to do if stalled** (re-run the manual one-shot up-sync, check the cron + container + log, confirm dual-publish env). The runbook is accurate against the real cron file + the real endpoint shape.

**Invariants & gates**
- [ ] Given the change, when CI runs, then `pnpm -r typecheck`, `pnpm -r test`, and the api build are green, with unit tests covering: in-sync (backlog 0), backlog (count + oldest age), and degrade (`unknown` on unreachable/timeout/unconfigured, no throw, no hang).
- [ ] Given the change, when reviewed, then there is **no web/UI change**, **no change to the dual-publish (`withUpSync`/`propagate.ts`)**, and **no change to the `unbnd-upsync` cron's sync behavior** — this story only **observes**, it does not alter how writes propagate.

## DList shapes touched

No new DList shape, no schema change, no new event written. The check **reads** existing kind-39999 community events (ratings + tag assertions under the librarian's `book-ratings` / `book-tag-assertions` `#z`) from two relays and diffs them. The only new artifact is the read-only sync-health signal + its endpoint wiring and the runbook update.

## Out of scope

- **Changing the up-sync cron's sync logic** or the API **dual-publish** (`withUpSync` / `propagate.ts`). This story only adds an observability signal; propagation behavior is untouched.
- **Alerting / paging infrastructure** (email/Slack/PagerDuty, threshold alarms). Deliver the signal + the runbook; a human (or a future story) reads it. No auto-remediation.
- **A full metrics / Prometheus / dashboard stack.** A single bounded health field is the proportionate hardening, not a metrics pipeline.
- **The down-sync / librarian catalog writes.** The PRD bullet is **up-sync** (community writes). Covering the down-sync is a possible extension, flagged as an Open question, not built here.
- **A live, unbounded relay diff** or any full-history reconciliation report. Bounded window + cap only.

## Open questions

For the Architect to resolve during the Architecture phase (the PO does not answer these):

1. **Cached-via-the-maintenance-timer vs. per-request-with-timeout.** Compute the diff on the Story-62 maintenance timer and cache it (the endpoint serves a cached value, never makes a live external call) — vs. a per-request strictly-timeout-bounded live query. The cached approach is the safest for keeping the endpoint fast and decoupled from dcosl; the per-request approach is fresher but must bound hard. Pin the choice + the staleness/refresh story if cached.
2. **Endpoint shape:** a dedicated `GET /health/sync` vs. a `services.sync` block on the existing `GET /health/data`. If on `/health/data`, define exactly how a `sync:"unknown"`/degraded signal interacts with the aggregate `ok`/503 (it must not turn an eventually-consistent backstop lag into a service outage).
3. **Window + cap defaults.** The recent time window (e.g. last N minutes/hours) and the event-count cap that keep the check cheap. Tie the window to the cron cadence (5 min) with enough margin to avoid false "backlog" right after a write, before the next cron tick.
4. **How to diff.** Diff by event `id` (REQ both relays with the up-sync filter + the window, compare id sets). Confirm this stays within relay query limits given the cap (`queryRelayUrl` is one-shot REQ→EOSE; if the window can exceed the relay's per-REQ cap, decide whether to bound tighter or page — prefer bounding tighter for a cheap health check). Resolve the **unreachable-vs-in-sync ambiguity**: an empty dcosl read must be classifiable as "in sync" only when the read demonstrably succeeded (e.g. EOSE observed / a sentinel) vs. `unknown` on timeout/error.
5. **Up-sync only vs. also down-sync.** The PRD bullet is up-sync (community writes). Decide whether to also surface a down-sync/catalog-propagation health signal now or leave it to a later story (default: up-sync only, per the bullet).
6. **Where the check lives** (so it is reusable by both the periodic task and the endpoint): a small `apps/api/src/nostr/` or `apps/api/src/health/` helper with the two relay reads + the clock injected, mirroring the dependency-injection style of `maintenance.ts` and `query.ts` so it is unit-testable without a real relay.

## Linked artifacts

- ADR: `engineering-team/decisions/0062-upsync-monitoring.md` (to be written by the Architect).
- Relates to: ADR 0011 / `apps/api/src/nostr/propagate.ts` (`withUpSync` dual-publish — the primary path this observes, unchanged), `ops/cron/unbnd-upsync` + `ops/sync-runbook.md` (the cron backstop + install/verify procedure this extends), ADR 0061 / Story 62 / `apps/api/src/maintenance.ts` (the periodic timer the cached-compute option would use), `apps/api/src/nostr/query.ts` (`queryRelayUrl` — the bounded, timeout-resolving relay read the diff reuses), `apps/api/src/routes/health.ts` (the health router this extends), ADR 0012 (explicit-relay-URL reads).
- Test plan: `engineering-team/stories/done/63-upsync-monitoring.test-plan.md` (if the Tester phase runs — see lean-vs-full assessment above).
