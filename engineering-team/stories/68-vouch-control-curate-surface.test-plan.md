# Test Plan: Story 68 — Vouch control + the Curate surface

**Story:** `engineering-team/stories/68-vouch-control-curate-surface.md`
**ADR:** `engineering-team/decisions/0067-vouch-control-curate-surface.md`
**Date:** 2026-06-06

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (vouch control visibility) | `signed out → nothing`, `own profile → nothing`, `eligible → shows 'Vouch as curator'` | `apps/web/test/components/vouch-control.test.tsx` | component |
| AC-1 (eligibility source) | `GET /api/me/curator` weighty → canVouch true / no-weight → false / signed-out 401 | `apps/api/test/routes/curator-roles-vouch-ui.test.ts` | route |
| AC-2 (vouched/withdraw state) | `already vouched → 'Vouched'`; `vouch-status` reports vouched true/false | component + route |
| AC-3 (N vouched count) | `trustedVouchCount` counts above-floor latest-apply (self/below-floor/dispute excluded); route `vouchCount` on `GET /api/profile/:id/curator` | `apps/api/test/curator-roles/vouch-count.test.ts`, `routes/curator-roles-vouch-ui.test.ts` | unit + route |
| AC-4 (Curate nav for curators) | `curator → Curate link to /submissions`; `non-curator → no link` | `apps/web/test/components/vouch-control.test.tsx` | component |
| AC-5 (Curate surfaces tools) | the Curate link targets the existing `/submissions` (which carries promotion) | component | component |

## Edge cases
- [x] `trustedVouchCount` excludes self-vouch, below-floor asserters, and a latest dispute; returns 0 on empty.
- [x] `GET /api/me/curator` 401 when signed out.
- [x] Vouch control hidden on own profile and when ineligible.

## Test infrastructure
- Vitest. Resolver unit in `apps/api/test/curator-roles` (FixtureTrustProvider). Route in `apps/api/test/routes` (express + supertest + injected deps). Components in `apps/web/test/components` (`vi.mock` of `useSession` + `../../src/lib/api`; the Curate entry is a small `CurateNavLink` testable in isolation from the heavy `Nav`).

## How to run
```
pnpm --filter @unbnd/api exec vitest run test/curator-roles/vouch-count.test.ts test/routes/curator-roles-vouch-ui.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/vouch-control.test.tsx
pnpm -r test && pnpm -r typecheck
```

## Verification
Feature tests fail with the current (stub) code for the right reason (assertions / 404 / missing field), typecheck clean, no existing test regressed. Confirmed 2026-06-06 (pre-implementation):
```
apps/api curator-roles/vouch-count.test.ts          2 failed | 1 passed (trustedVouchCount stub → 0)
apps/api routes/curator-roles-vouch-ui.test.ts      6 failed (endpoints 404 / vouchCount missing)
apps/web components/vouch-control.test.tsx          3 failed | 3 guards (VouchButton/CurateNavLink stubs → null)
apps/api full: 2 failed | 101 passed | 2 skipped   apps/web full: 1 failed | 57 passed
pnpm -r typecheck → EXIT 0; ui color guard green.
```
