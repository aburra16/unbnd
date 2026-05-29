# ADR 0011: Propagate community writes to dcosl (dual-publish + up-sync backstop)

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/10-write-upsync.md`

## Context

User-authored writes (ratings + tag assertions — both kind 39999, signed by the reader's own key) are published by the API to the **local** relay only (`STRFRY_URL = ws://tapestry/relay`). Reads come from the local relay, so the writer sees their write immediately, but it never reaches **dcosl** (the shared backbone), so it's invisible to other clients and would be lost if the local relay's volume were rebuilt. The seeder already publishes catalog/taxonomy/baseline-assertions directly to dcosl; only *community* writes are stranded.

**Probe (2026-05-29):** a throwaway, non-librarian key published a kind-39999 assertion to `wss://dcosl.brainstorm.world/` → `OK accepted:true`, read back by id, and a NIP-09 `e`-tag delete was also accepted. **dcosl does not gate writes by author.** So client-side propagation is viable; no operator-relay / own-relay fallback is needed.

## Decision

A **hybrid**: dual-publish for immediacy + a periodic up-sync as the guaranteed backstop. Local stays the source of truth and the read path; dcosl is the propagation target.

### 1. API dual-publish (immediate, off the critical path)
- New config `dcoslRelayUrl` (env `DCOSL_RELAY_URL`, default `wss://dcosl.brainstorm.world/`); optional `propagateWrites` toggle (default on when the URL is set).
- The shared `publish` dep (used **only** by the ratings + tags routers — i.e. exactly the community-write set) is wrapped: it `await`s the **local** publish (unchanged — that's what gates the API response and read-back), and on local success **fires a best-effort dcosl publish without awaiting it** (`.catch` logs; never throws into the request). So:
  - AC-3: the write response is not slowed — dcosl publish is off the critical path.
  - AC-4: if dcosl is unreachable, the local write still succeeds and the response is unaffected; the event is caught by the backstop.
  - AC-5: only events the API accepted+published locally propagate; seed data (separate process) never goes through this path.
- `nostr/publish.ts` is refactored so the relay URL is an explicit argument (`publishEvent(relayUrl, event)`), with a thin `config`-based wrapper kept for the existing local caller. No behavioural change to the local publish.

### 2. `strfry sync --dir up` backstop (eventual, guaranteed)
- A second droplet cron `unbnd-upsync` (mirroring the existing down-sync `unbnd-sync`) runs every 5 min:
  `docker exec unbnd-tapestry strfry sync wss://dcosl.brainstorm.world/ --dir up --filter '{"kinds":[39999],"#z":["39998:<lib>:book-ratings","39998:<lib>:book-tag-assertions"]}'`
- Negentropy reconciliation: `--dir up` transfers only local events the remote lacks, so it's idempotent and causes **no churn** re-pushing the librarian baseline assertions already on dcosl (AC-5/6). It's the safety net that guarantees eventual propagation even if a live dual-publish failed (AC-4).
- A committed reference script (`ops/cron/unbnd-upsync`) + a one-time install command for the operator (the API can't SSH; same pattern as the seed/down-sync).

### Why both
- Up-sync alone: simple, but up to ~5 min before another client sees a write — borderline for AC-1's "shortly after."
- Dual-publish alone: immediate, but a single dropped publish (dcosl blip) is lost forever — fails AC-4's "eventually, no silent loss."
- Hybrid: immediate in the common case, guaranteed by the backstop. Each covers the other's gap.

## Options considered

- **Dual-publish to dcosl, drop the local relay as the write target** (write straight to dcosl, rely on down-sync for read-back) — rejected: adds ~5-min latency to the writer's *own* read-back (regresses story-9 behaviour) and couples every write to dcosl reachability.
- **Up-sync cron only** — rejected as the sole mechanism (latency), kept as the backstop.
- **Dual-publish only** — rejected as the sole mechanism (no durability if a publish drops).
- **Operator-run relay / own public relay** — unnecessary given the probe (dcosl accepts our writes); revisit only if dcosl later adds a write policy.
- **Synchronous dual-publish (await both)** — rejected: violates AC-3 and makes the write fail when dcosl blips.

## Consequences

- Community ratings/classifications become globally visible (seconds via dual-publish; ≤5 min worst case via backstop) and durable on dcosl beyond the local volume.
- New config + a refactor of `publishEvent`'s signature (one caller). New droplet cron (operator-installed).
- Write path now has a best-effort side effect; failures are logged, never surfaced to the user, and reconciled by the backstop.
- No schema change, no PRD change, no new dependency. No migration.

## Out of scope

Down-sync changes; write ACL / anti-spam / moderation on dcosl; production librarian identity; GrapeRank; search.

## Implementation notes (single PR, test-first)
1. `config.ts` — add `dcoslRelayUrl` (+ optional `propagateWrites`); validate URL shape.
2. `nostr/publish.ts` — `publishEvent(relayUrl, event)` (URL explicit) + keep a `config` wrapper for the local caller; update the one call site. Adjust `publish.test.ts`.
3. `index.ts` — wrap the shared `publish`: await local; on `ok`, fire `publishEvent(dcoslRelayUrl, event).catch(log)` (no await). Both routers inherit it.
4. `ops/cron/unbnd-upsync` (reference) + operator install command + a note in the deploy/runbook doc.
5. Tests: local-success → dcosl publish fired; local-failure → NOT fired (and 502 returned); dcosl-failure → response still ok (AC-4); the wrapper doesn't await dcosl (AC-3).
6. Verify live on staging: apply a tag → query **dcosl directly** for it (AC-7); and confirm the up-sync cron reconciles a write made while dcosl publish is disabled.
