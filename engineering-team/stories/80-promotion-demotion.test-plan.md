# Test Plan: Story 80 — Demote a promoted book

**Story:** `engineering-team/stories/80-promotion-demotion.md`
**ADR:** `engineering-team/decisions/0078-promotion-demotion.md`
**Date:** 2026-06-09

## Coverage map
Five layers: the WIRE contract (delisting + predicate), the catalog READ seam (parseBook → detail/browse/hydration), the SEARCH layer (document null + provider delete), the ENDPOINT (gate + state-machine answers), the WORKER cycle, and the STATE MACHINE against real Postgres.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| Delisting wire contract (own d-tag, marker, books z-tag, no record fields) | the 3 `buildBookDelisting` tests | `packages/schemas/test/BookDelisting.test.ts` | unit |
| The shared catalog predicate | the 3 `isDelistedRecord` tests | same | unit |
| AC-4 detail/browse/hydration (and the predicate-not-parse-luck pin) | `detail: a delisted record 404s EVEN when its payload still parses` + browse + `?slugs=` hydration | `apps/api/test/routes/books-delisted.test.ts` | integration |
| AC-4 search: never indexed + live-index delete | `returns null for a delisted record EVEN when the payload still parses` + the 3 `MeiliProvider.delete` tests | `packages/search/test/delisted.test.ts` | unit |
| AC-1 (curator gate, fail-closed, mirror of promote) | curator 200/queued + anon 401 + below 403 + honest-degrade 403 | `apps/api/test/routes/submissions-demote.test.ts` | integration |
| AC-1 (seeded books structurally undemotable) + AC-6 (idempotent no-op) | `not_promoted → 400` + `already → 200` + `no dep → 501` | same | integration |
| AC-3 (worker mints; key off the api) + AC-4 (index delete) | the 4 happy-path `runDemotionCycle` tests | `apps/promoter/test/demotion-cycle.test.ts` | unit (injected) |
| Fault isolation (sign/publish failure → demote_failed; one job never aborts others; searchDelete swallowed) | the 2 fault tests + the swallow test | same | unit |
| AC-5 (no auto-re-promote war) + AC-6 (re-promote resets; full arc) | `walks the full arc: queued → done → demote_pending → demoted → pending` + retriable `demote_failed` + never-promoted | `apps/api/test/db/promotions-demotion.integration.test.ts` | integration (real Postgres) |
| AC-1/AC-2 web (curator-only, community-only, confirm-gated) | the 2 visibility tests + confirm-gate + Keep-it + requested-state + honest error | `apps/web/test/components/demote-control.test.tsx` | component |
| `PublicBook.source` (the affordance's community gate) | the 2 source tests | books-delisted | integration |

## Edge cases
- [x] **Predicate, not parse luck**: the delisted fixtures are FULLY PARSEABLE records carrying the marker, so `parseBook`/`buildBookDocument` must null them intentionally (a parse-failure-only implementation fails these).
- [x] **Seeded books structurally undemotable**: no promotions row → `not_promoted` (route 400 + the real-Postgres never-promoted case).
- [x] **No-war (AC-5)**: a `demoted` row answers `already` to re-demote and is reset ONLY by `enqueuePromotion` (the manual path); the #77 sweep's skip-any-status rule is pinned by the state arc.
- [x] **Retriable demote_failed**: `enqueueDemotion` re-queues it.
- [x] **searchDelete optional + best-effort**: absent → completes; throwing → swallowed, job still demoted (batch rebuild is the backstop).
- [x] **Empty delete is a no-op** (no request); a non-ok provider response throws (the WORKER decides to swallow, not the provider).
- [x] **Confirm gate**: nothing sent before confirm; Keep-it cancels; a failed POST shows an honest alert, never the requested state.

## Test infrastructure
- Vitest. Schemas/search: pure builders + the captured-fetch meili harness. Books/submissions routes: express + supertest + `FixtureTrustProvider` + injected `enqueueDemotion`. Worker: the consume-loop pattern (fake claim/signer/publishers — no real `LIBRARIAN_NSEC`). Web: mocked `api.submissions.demote`; the `DemoteControl` seam takes `{ bookSlug, source, canCurate }` (BookDetail composes `canAssertAccusatory` + `PublicBook.source`).
- **Real-Postgres suite** (the existing `DATABASE_URL`-gated pattern): the state-machine SQL is what mocks can't cover. It imports `enqueuePromotion`/`enqueueDemotion` from `src/db` — the implementer relocates the index.ts `enqueuePromotion` closure beside the state machine (mandated by this design). Skipped (announced) without `DATABASE_URL`; red in a DB env until implemented.
- Stubs (red): `buildBookDelisting` d-tag-only; `isDelistedRecord` false; meili `delete` no-op; the demote route 501; `runDemotionCycle` no-op; `DemoteControl` renders null; db enqueue helpers return wrong-but-typed values.
- **Fixture fallout** (the #74 pattern, forecast in the ADR): `SearchProvider` gained required `delete` → 4 test fakes updated (`apps/indexer` flush-before-upsert + reindex-book, `apps/api` health + health-sync). Type-only; all green.

## How to run

```
pnpm --filter @unbnd/schemas exec vitest run test/BookDelisting.test.ts
pnpm --filter @unbnd/search exec vitest run test/delisted.test.ts
pnpm --filter @unbnd/promoter exec vitest run test/demotion-cycle.test.ts
pnpm --filter @unbnd/api exec vitest run test/routes/books-delisted.test.ts test/routes/submissions-demote.test.ts
DATABASE_URL=... pnpm --filter @unbnd/api exec vitest run test/db/promotions-demotion.integration.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/demote-control.test.tsx
pnpm -r typecheck
```

## Verification
The new tests fail against the stubs. Confirmed 2026-06-09:

```
 ❯ packages/schemas  test/BookDelisting.test.ts                  (6 tests | 2 failed)
 ❯ packages/search   test/delisted.test.ts                       (5 tests | 3 failed)
 ❯ apps/promoter     test/demotion-cycle.test.ts                 (6 tests | 6 failed)
 ❯ apps/api          books-delisted + submissions-demote         (12 tests | 11 failed)
 ❯ apps/api          promotions-demotion.integration             (3 skipped — no DATABASE_URL; red in a DB env)
 ❯ apps/web          test/components/demote-control.test.tsx     (6 tests | 4 failed)
```

26 failing; the handful passing are negative-space pins (the stub's d-tag/payload identity, predicate false cases, the empty-delete no-op, "renders nothing" visibility, the 501-without-dep stub). `pnpm -r typecheck` clean. No regressions: schemas 164, search 13, indexer 26, promoter 32, api 977, web 382 existing tests all pass.
