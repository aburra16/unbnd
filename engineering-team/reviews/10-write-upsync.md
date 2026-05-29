# Review: Story 10 — write up-sync

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** PR #17 (squash to main), CI-green; verified live on staging.

## Quality gates

- [x] `pnpm -r typecheck` — pass (4/4).
- [x] `pnpm --filter @unbnd/api test` — **201 pass** (+10 skipped). New: `withUpSync` contract (5), config dcosl parsing + fail-safe-off (5), env-example documents the new vars (2).
- [x] `@unbnd/api build` — pass.
- [x] CI green on merge; staging auto-deploy green.

## Probe (de-risked the design)

A throwaway, non-librarian key published a kind-39999 event to `wss://dcosl.brainstorm.world/` → `OK accepted:true`, read back by id, NIP-09 delete accepted. **dcosl has no write allowlist** → client-side propagation is viable; the operator-relay / own-relay fallback is unnecessary.

## AC status

- [x] **AC-1/AC-2** — a sovereign tag assertion submitted through the staging API was found **on dcosl directly** (queried by event id, not via the local relay) within ~2.5s. Same dual-publish path serves ratings. **Verified live.**
- [x] **AC-3** (read-back not slowed) — `withUpSync` resolves with the local result without awaiting the dcosl publish; unit-tested (dcosl publisher hangs → wrapper still returns). Staging round-trip latency unchanged.
- [x] **AC-4** (resilient, no silent loss) — local is awaited (source of truth); dcosl publish is best-effort and its failure (rejected OK frame or thrown socket) is swallowed + logged, never surfaced. Unit-tested both failure modes. The `unbnd-upsync` cron (`strfry sync --dir up`, negentropy) is the durability backstop for a dropped live publish.
- [x] **AC-5** (scoped + validated) — only the shared `publish` dep (ratings + tags routers, i.e. accepted community writes) is wrapped; local failure → no propagation (unit-tested). Seeder publishes to dcosl on its own path. The up-sync filter is scoped to the ratings/assertions concepts; negentropy avoids re-pushing seeded librarian assertions.
- [x] **AC-6** (idempotent) — replaceable events reconcile by d-tag; negentropy only transfers what dcosl lacks.
- [x] **AC-7** (verified live from dcosl) — see AC-1.

## Crypto / safety

- No new signing; `publishEvent(relayUrl, event)` is a pure transport refactor (one caller updated). No hand-rolled crypto.
- Fail-safe config: `DCOSL_RELAY_URL` has no code default, so dev/test never write to production dcosl; prod compose opts in. `PROPAGATE_WRITES=false` is an operational kill-switch.

## Operational

- `ops/cron/unbnd-upsync` + `ops/sync-runbook.md` committed; cron install is an operator step on the droplet (same pattern as the down-sync/seed installs). Dual-publish covers the immediate case regardless of the cron.

## Carryovers (tracked in build-status memory)

- Backstop **live** verification (forced-failure → cron reconciles) is operator-side once the cron is installed; the dual-publish path is verified and is the primary mechanism.
- Seeder image freshness (`docker pull` before re-seed); orphaned web components; production librarian identity — unchanged from prior cycles.

## Verdict

**PASS** — community writes propagate to dcosl, verified end-to-end on staging (write → present on dcosl in seconds), with a resilient best-effort design and a cron backstop for durability. The story-9 write-propagation gap is closed. Story marked Done.
