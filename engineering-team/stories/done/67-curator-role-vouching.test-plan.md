# Test Plan: Story 67 — Curator status by trusted-user vouching

**Story:** `engineering-team/stories/done/67-curator-role-vouching.md`
**ADR:** `engineering-team/decisions/0066-curator-role-vouching.md`
**Date:** 2026-06-06

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (vouch is a curator-role assertion; no self-vouch) | round-trip + `#p`/`t`/polarity/`z`/no-`#a` + `rejects a self-vouch` | `packages/schemas/test/CuratorRoleAssertion.test.ts`, `apps/api/test/routes/curator-roles.test.ts` | unit + route |
| AC-2 (becomes a curator at ≥ N trusted vouches) | `count-gate ≥ N` (both sides of N) + route `vouched by ≥ N trusted asserters` | `apps/api/test/curator-roles/status.test.ts`, `routes/curator-roles.test.ts` | unit + route |
| AC-3 (Curator badge on profile) | `shows a Curator badge when the owner is a curator` | `apps/web/test/components/curator-badge.test.tsx` | component |
| AC-4 (withdraw/dispute lowers count) | `latest DISPUTE drops them from the count`; `below-floor + untrusted cannot cross` | `apps/api/test/curator-roles/status.test.ts` | unit |
| AC-5 (seed allowlist regardless of vouches) | `a seed-allowlist pubkey is a curator` + the emergent fallback case | `apps/api/test/routes/curator-roles.test.ts` | route |

## Edge cases
- [x] Self-vouch excluded structurally, regardless of the self weight (resolver) + rejected at the write (route).
- [x] Untrusted / below-floor volume cannot cross the bar (resolver).
- [x] Symmetric dispute: latest-per-(asserter, subject) wins (resolver).
- [x] Batched `weights` fetch, no N+1 (resolver).
- [x] Honest degrade: throwing seam / empty weights / empty set → no curator, never throws (resolver).
- [x] Curator status = seed OR vouched OR emergent house-weight (route): all three confer; none → not a curator; a single trusted vouch (< N) does not.

## Test infrastructure
- Runner: Vitest. Schema round-trip in `packages/schemas/test` (mirrors `AuthorVerifiedAssertion.test.ts`). Resolver in `apps/api/test/curator-roles` with the `FixtureTrustProvider` (mirrors `author-verified/verify.test.ts`). Route in `apps/api/test/routes` (express + supertest + injected `sessionUser`/`query`/`trust`). Component in `apps/web/test/components` (`vi.mock` of `../../src/lib/api`).
- No live relay, no real crypto, no network.

## How to run
```
pnpm --filter @unbnd/schemas exec vitest run test/CuratorRoleAssertion.test.ts
pnpm --filter @unbnd/api exec vitest run test/curator-roles/status.test.ts test/routes/curator-roles.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/curator-badge.test.tsx
pnpm -r test && pnpm -r typecheck
```

## Verification
The feature tests fail with the current (stub) code for the right reason (assertions/throw, not imports), and the workspace typechecks clean with no existing test regressed. The `CuratorRoleAssertion` schema is implemented as the data contract (other tests build fixtures from it), so its round-trip test passes. Confirmed 2026-06-06 (pre-implementation):

```
packages/schemas  CuratorRoleAssertion.test.ts          8 passed (contract)
apps/api          curator-roles/status.test.ts          9 failed  — computeCuratorStatus throws (stub)
apps/api          routes/curator-roles.test.ts          6 failed  — routes return 501 (stub)
apps/web          components/curator-badge.test.tsx     1 failed | 1 passed — badge is a stub

apps/api full: 2 failed | 99 passed | 2 skipped (only the two new files)
apps/web full: 1 failed | 56 passed (only the new file)
pnpm -r typecheck → EXIT 0; the @unbnd/ui color-literal guard caught "red" in a stub comment (reworded).
```
