# Test plan: Story 10 — write up-sync

Covers ADR 0011 (dual-publish + up-sync backstop). Unit tests assert the dual-publish wrapper's contract; live staging verification covers AC-1/2/7 end-to-end.

## Unit — `withUpSync` propagation wrapper (`apps/api/test/nostr/propagate.test.ts`)

The wrapper composes a local publisher (source of truth, gates the response) with a best-effort dcosl publisher (off the critical path).

1. **Local success → propagates.** local resolves `{ok:true}` → returns the local result, and the dcosl publisher is called once with the same event. (AC-1/2)
2. **Off the critical path.** The wrapper resolves with the local result *before* the dcosl publish resolves (dcosl publisher hangs → wrapper still returns). (AC-3)
3. **Local failure → no propagation.** local resolves `{ok:false}` → dcosl publisher is **not** called, and the failure is returned unchanged. (AC-5 — only accepted writes propagate)
4. **dcosl rejection is swallowed.** local ok, dcosl resolves `{ok:false}` → wrapper still returns the local `{ok:true}`, `onError` is invoked, nothing throws. (AC-4)
5. **dcosl throw is swallowed.** local ok, dcosl publisher throws → wrapper still returns local ok, `onError` invoked, no unhandled rejection. (AC-4)

## Unit — config (`apps/api/test/config.test.ts`, if present, else folded in)

6. `DCOSL_RELAY_URL` unset → `dcoslRelayUrl` undefined, `propagateWrites` false (fail-safe: no accidental prod propagation from dev/test).
7. `DCOSL_RELAY_URL` set to a `wss://` URL → parsed; `propagateWrites` true. `PROPAGATE_WRITES=false` overrides to off. A non-`ws(s)://` value throws.

## Unit — `publishEvent` signature (regression)

8. `publishEvent(relayUrl, event)` takes an explicit URL (refactor); the single existing caller updated. Existing route tests (ratings/tags) remain green with the wrapped `publish`.

## Live verification (staging, post-deploy) — AC-1/2/6/7

- Apply a tag (sovereign) through the API, then query **dcosl directly** by event id / `#a` → the assertion is present (dual-publish path). (AC-1/2/7)
- Submit a rating → present on dcosl. (AC-1)
- Re-query: replaceable events reconcile, no duplicates. (AC-6)
- Backstop: with dual-publish disabled (or a forced dcosl failure), confirm the `unbnd-upsync` cron reconciles a local-only write up to dcosl within its interval. (AC-4)

## Out of scope for tests

dcosl write-ACL (probed: open); moderation/anti-spam; down-sync (unchanged).
