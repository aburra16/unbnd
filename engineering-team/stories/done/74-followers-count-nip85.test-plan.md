# Test Plan: Story 74 — Followers count via NIP-85

**Story:** `engineering-team/stories/74-followers-count-nip85.md`
**ADR:** `engineering-team/decisions/0072-followers-count-nip85.md`
**Date:** 2026-06-07

## Coverage map
Three layers: the new `followers()` on the trust seam (Fixture + Brainstorm), the profile-stats endpoint that reads it from the house vantage, and the web Profile that renders the count or the honest empty state.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (accurate count, labeled "Followers") | `renders a 'Followers' cell with the trust-anchored followersCount` | `apps/web/test/routes/profile-followers-count.test.tsx` | component |
| AC-1 (served from the trust read) | `returns followersCount from trust.followers read at the house vantage` | `apps/api/test/routes/profile-stats.test.ts` | integration |
| AC-2 (sourced from the NIP-85 attestation, not a `#p` scan) | `resolves the service key and maps the … followers tag to counts` + `introduces no #p relay scan (AC-2)` | `packages/trust/test/brainstorm.test.ts`, `apps/api/test/routes/profile-stats.test.ts` | unit + integration |
| AC-3 (no followers → "No followers yet.") | `shows 'No followers yet.' on a 0 datum (never a fabricated 0 cell)` + API `omits followersCount on a 0 datum` | web + api | component + integration |
| AC-4 (unavailable/degrade → "No followers yet.", never throws) | `shows 'No followers yet.' when followersCount is absent (honest-empty)` + API `omits followersCount when the source has no datum` + seam honest-empty tests | web + api + trust | all |
| Seam contract (Fixture) | `followers` describe: configured counts incl 0; unknown observer → empty; no spec → empty | `packages/trust/test/fixture.test.ts` | unit |
| Seam contract (Brainstorm) | omit no-tag target; honest-empty without a rank provider; no targets → no query | `packages/trust/test/brainstorm.test.ts` | unit |

## Edge cases
- [x] A real datum of **0** is distinct from "no datum" at the seam (the map carries 0), but the API/web both treat 0 as honest-empty ("No followers yet.") — verified at both layers.
- [x] A target whose attestation event has no `followers` tag → omitted (honest absence), not 0.
- [x] `followers()` reuses the **same** service-key resolution as `weights()` (the rank provider) — a no-rank-provider observer yields an empty map.
- [x] No targets → no relay query issued.
- [x] **AC-2 structural:** the profile-stats route adds no `#p` filter — asserted by scanning every `query` call's filter for `#p === undefined`.

## Test infrastructure
- Vitest. Trust unit: `packages/trust/test/{fixture,brainstorm}.test.ts` (the brainstorm test injects `fetchImpl` + `query`; the 30382 fixture events already carry a `followers` tag). API: express + supertest + DI fakes; the followers test injects a `trust` whose `followers()` returns a controlled `Map`, and a `config` with `houseObserverPubkey` set. Web: the api client is mocked; `stats.followersCount` drives the render.
- **Fixture fallout (intended, behavior-neutral):** adding `followers()` to the `TrustProvider` interface required a `followers` stub on every typed inline trust mock — added to 10 api test files + the librarian `follows-cycle` mock. These are mechanical (`followers: vi.fn(async () => new Map())`), introduce no behavior, and keep the suites green.
- The **architecture guard** (`packages/trust/test/architecture.test.ts`) bans the backend event-kind literal outside the adapter — the new comments use "NIP-85 attestation", never the kind number, so the guard stays green.

## How to run

```
pnpm --filter @unbnd/trust test
pnpm --filter @unbnd/api exec vitest run test/routes/profile-stats.test.ts
pnpm --filter @unbnd/web exec vitest run test/routes/profile-followers-count.test.tsx
pnpm -r typecheck
```

## Verification
The new tests fail against the stubs (`followers()` returns an empty map; the route does not populate `followersCount`; the Profile renders neither the cell nor the empty state). Confirmed 2026-06-07:

```
 ❯ packages/trust  test/fixture.test.ts     (11 tests | 1 failed)
 ❯ packages/trust  test/brainstorm.test.ts  (15 tests | 1 failed)
 ❯ apps/api        test/routes/profile-stats.test.ts            (10 tests | 1 failed)
 ❯ apps/web        test/routes/profile-followers-count.test.tsx ( 3 tests | 3 failed)
```

`pnpm -r typecheck` clean. No regressions: api `104 passed | 1 failed | 2 skipped`, web `60 passed | 1 failed`, the trust architecture guard green. The handful of green assertions in the new files are stub coincidences (honest-empty cases) that remain correct after Implementation.
