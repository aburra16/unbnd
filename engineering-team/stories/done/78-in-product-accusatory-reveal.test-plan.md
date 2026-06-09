# Test Plan: Story 78 — In-product accusatory reveal

**Story:** `engineering-team/stories/78-in-product-accusatory-reveal.md`
**ADR:** `engineering-team/decisions/0076-in-product-accusatory-reveal.md`
**Date:** 2026-06-07

## Coverage map
Three layers: the curator-only gated VIEW (aggregate), the curator-gated reveal ENDPOINT (route mapping + gate), and the web reveal/withdraw CONTROL.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (curator reveals from the product) | `a curator reveals an accusatory tag → 200, enqueued with the curator as requestedBy` | `apps/api/test/routes/tags-reveal-write.test.ts` | integration |
| AC-2 (gate restricted to curators) | `401 when not signed in` + `403 for a below-gate (non-curator) user` + web `a non-curator never sees the gated tag or a reveal control` | api + web | integration + component |
| AC-3 (surfaces via the existing gate; only accusatory) | `400 for a non-accusatory tag` + the aggregate gated-view tests (the read path is otherwise unchanged) | api | integration + unit |
| AC-4 (audit: requestedBy = curator) | `… enqueued with the curator as requestedBy` (asserts the curator pubkey, not the librarian) | tags-reveal-write | integration |
| AC-5 (withdraw too) | `a curator can withdraw (state: withdrawn)` + web `offers a Withdraw action … reveal(withdrawn)` | api + web | integration + component |
| Curator-only gated view (the read addition) | `includeGatedAccusatory=true surfaces an UNREVEALED accusatory tag marked gated` + `revealed stays 'revealed'` + `default keeps the public gate` | `apps/api/test/tags/aggregate-reveal.test.ts` | unit |
| Web control | `offers a Reveal action on a gated accusatory tag and calls api.tags.reveal` | `apps/web/test/components/tag-control-reveal.test.tsx` | component |

## Edge cases
- [x] **Public gate unchanged**: `includeGatedAccusatory=false` (the default, every non-curator path) still hides unrevealed accusatory tags.
- [x] **Gated ≠ revealed**: a gated tag is marked `gated:true, revealed:undefined` (curator cue, not a public reveal); a revealed tag stays `revealed:true` (not gated) even with the flag on.
- [x] **Only accusatory is revealable**: a normal tag slug → `400` (nothing to reveal).
- [x] **Gate parity**: 401 (no session) / 403 (below the curator threshold), reusing the same gate as the accusatory write picker; the endpoint never enqueues for a non-curator.
- [x] **Audit**: `enqueueReveal` is called with the **curator's** pubkey as `requestedBy` (the audit improvement); the gate event stays librarian-signed (worker unchanged — not re-tested here).
- **Async UX + librarian-key-never-on-api**: structural — the api only calls `enqueueReveal` (a DB row); the worker (unchanged, holds the key) mints. Verified by code review, not a unit assertion.

## Test infrastructure
- Vitest. Aggregate unit: real `aggregateBookTagsWeighted` with a cast-alias for the new 5th `includeGatedAccusatory` param (the RED set fails the assertion, not tsc — the PR-#74 rule). Route: express + supertest + `FixtureTrustProvider` (house weights) + a `vi.fn` `enqueueReveal` + a taxonomy query (so `isAccusatorySlug` resolves). Web: `useSession` + `api` mocked; `api.tags.reveal` asserted; gated/revealed `BookTags` fixtures drive the controls.
- Reuses the existing curator gate (`houseWeightOf`/`canAssertAccusatory`) and the existing reveal worker/event/read-gate (untouched).

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/tags/aggregate-reveal.test.ts test/routes/tags-reveal-write.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/tag-control-reveal.test.tsx
pnpm -r typecheck
```

## Verification
The new tests fail against the stubs (aggregate ignores the 5th param; the route returns `501`; TagControl renders no reveal control). Confirmed 2026-06-07:

```
 ❯ apps/api  test/tags/aggregate-reveal.test.ts        (10 tests | 1 failed)
 ❯ apps/api  test/routes/tags-reveal-write.test.ts     ( 5 tests | 5 failed)
 ❯ apps/web  test/components/tag-control-reveal.test.tsx ( 3 tests | 3 failed)
```

`pnpm -r typecheck` clean. No regressions: only the three new-test files fail (api `105 passed | 2 skipped`, web `63 passed`); the additive `gated?`/param defaults leave existing callers + the public tags shape unchanged.
