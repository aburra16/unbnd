# Test Plan: Story 27 — Custodial kind-0 bootstrap

**Story:** `engineering-team/stories/done/27-custodial-kind0-bootstrap.md`
**ADR:** `engineering-team/decisions/0027-custodial-kind0-bootstrap.md` (amended at commit `0eb7241` — AC-6 split to 27b)
**Date:** 2026-05-31
**Scope:** 7 active ACs — 1, 2, 3, 4, 5, 7, 8. (Former AC-6 rename surface is DEFERRED to Story 27b and is NOT tested here.)

## Approach

Everything is unit-testable with no live relay. Per ADR §"Testability seams" and the prior-stories gotcha:
**inject the seams, never `vi.mock` an intra-module call.** Determinism is enforced by an injected
clock (`now: () => FIXED_NOW`), an injected publisher (captures the event / throws / returns `{ ok: false }`),
and an injected `fetchRaw`. No `Date.now()` appears in any asserted output.

The new pure builder (`profile/kind0.ts`) is tested directly. The two injected helpers
(`bootstrap-kind0.ts`, `reconcile-kind0.ts`) are tested through their DI surface
(`sign`, `publishKind0`, `fetchRaw`, `now`). AC-2 is pinned at the API boundary by mirroring
`profile.test.ts`'s injected `resolve` and running the REAL `parseKind0` over the event the bootstrap
would publish (so the kind-0 field shape — `name` / `display_name` — is verified end to end). AC-7 extends
the shipped `substack-template.test.ts` with name-floor cases. AC-8 pins the tier guard contract (custodial-only).

These tests mirror: `apps/api/test/routes/profile-substack.test.ts` (DI shape, captured-template assertions,
fail/return-false publisher), `apps/api/test/routes/profile.test.ts` (the injected `resolve`),
`apps/api/test/routes/auth.test.ts` (signup/login dep boundary — left UNCHANGED; the kind-0 work lives in
the helpers, not the route), and `apps/api/test/profile/substack-template.test.ts` (the merge-preserve contract).

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 | `builds, signs, and publishes a kind-0 whose name AND display_name equal the signup displayName` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-1 | `signs via the injected sign with the session id and a kind-0 / tags:[] template` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-1 | `uses publishKind0 (the local-first / profile-relay publisher), not the shared dcosl publish` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-1/AC-7 | `with null rawPrev and a displayName floor, sets BOTH name and display_name to the floor` | `apps/api/test/profile/kind0.test.ts` | unit (pure) |
| AC-2 | `GET /api/profile/:npub returns name == D so the badge shows D, not the short npub` | `apps/api/test/profile/resolve-after-bootstrap.test.ts` | unit (route + real parseKind0) |
| AC-2 | `a custodial user with NO kind-0 (pre-bootstrap) resolves to just the npub (the bug this story fixes)` | `apps/api/test/profile/resolve-after-bootstrap.test.ts` | unit (route) |
| AC-3 | `DROPS email / password / userId / sessionToken handed in the patch — they never enter the content` | `apps/api/test/profile/kind0.test.ts` | unit (pure) |
| AC-3 | `only emits keys that are in PROFILE_KIND0_FIELDS off the patch` | `apps/api/test/profile/kind0.test.ts` | unit (pure) |
| AC-3 | `contains the public profile fields and NONE of the account/PII fields` (whitelist) | `apps/api/test/profile/kind0.test.ts` | unit (pure) |
| AC-3 | `the signup email string appears NOWHERE in the published event (content or tags)` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-4 | `resolves without throwing when publishKind0 REJECTS (relay down)` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-4 | `resolves without throwing when publishKind0 returns { ok: false }` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-4 | `resolves without throwing AND never publishes when sign returns null (session-key race)` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-4 | `resolves without throwing when sign itself THROWS` | `apps/api/test/profile/bootstrap-kind0.test.ts` | unit (DI) |
| AC-5a | `publishes a kind-0 seeded from the DB displayName when no kind-0 exists` | `apps/api/test/profile/reconcile-kind0.test.ts` | unit (DI) |
| AC-5b | `repairs a kind-0 that has substack but no name, preserving substack and adding the name` | `apps/api/test/profile/reconcile-kind0.test.ts` | unit (DI) |
| AC-5b | `builds with created_at strictly newer than the fetched event so NIP-01 replacement wins` | `apps/api/test/profile/reconcile-kind0.test.ts` | unit (DI) |
| AC-5c | `does NOT sign or publish when a non-empty name already resolves` (idempotent) | `apps/api/test/profile/reconcile-kind0.test.ts` | unit (DI) |
| AC-5d | `resolves without throwing when fetchRaw REJECTS` | `apps/api/test/profile/reconcile-kind0.test.ts` | unit (DI) |
| AC-5d | `resolves without throwing when publishKind0 REJECTS` | `apps/api/test/profile/reconcile-kind0.test.ts` | unit (DI) |
| AC-5d | `resolves without throwing AND never publishes when sign returns null` | `apps/api/test/profile/reconcile-kind0.test.ts` | unit (DI) |
| AC-7 | `with a Substack-only patch and a nameFloor, carries BOTH the name (from floor) AND substack` | `apps/api/test/profile/kind0.test.ts` | unit (pure) |
| AC-7 | `a website-bearing patch with a nameFloor keeps website AND gains the name` | `apps/api/test/profile/kind0.test.ts` | unit (pure) |
| AC-7 | `does NOT clobber an existing name when rawPrev already has one (floor is a floor)` | `apps/api/test/profile/kind0.test.ts` | unit (pure) |
| AC-7 | `first Substack write with no prior kind-0 carries BOTH the name (from floor) AND substack` | `apps/api/test/profile/substack-template.test.ts` | unit (pure) |
| AC-7 | `the floor does NOT clobber an existing name in the raw content (merge-preserve still holds)` | `apps/api/test/profile/substack-template.test.ts` | unit (pure) |
| AC-7 | `a 'clear' with a nameFloor still removes substack but keeps/sets the floored name` | `apps/api/test/profile/substack-template.test.ts` | unit (pure) |
| AC-8 | `a SOVEREIGN auth flow publishes nothing on the user's behalf` | `apps/api/test/profile/resolve-after-bootstrap.test.ts` | unit (DI guard) |
| AC-8 | `a CUSTODIAL auth flow with a missing kind-0 DOES publish (control)` | `apps/api/test/profile/resolve-after-bootstrap.test.ts` | unit (DI guard) |

Supporting (drives reconciliation / repair): `hasResolvableName` true/false cases and the empty-name floor-injection
case in `kind0.test.ts`; `buildKind0Template` (kind:0, tags:[], stringified content) lifted-helper cases in
`kind0.test.ts`.

## Edge cases covered

- [x] Empty / whitespace-only name → `hasResolvableName` false; floor injects (AC-5 repair).
- [x] Junk patch keys (`email`/`password`/`userId`/`sessionToken`/`bogusKey`) → structurally dropped (AC-3).
- [x] `sign` returns `null` (session-key race) → no publish, no throw (bootstrap + reconcile).
- [x] `sign` throws → swallowed (bootstrap).
- [x] Publisher throws AND publisher returns `{ ok: false }` → both swallowed (bootstrap + reconcile, AC-4/5d).
- [x] `fetchRaw` throws → reconcile swallows (AC-5d).
- [x] Fetched event newer than the clock → `created_at = max(now, createdAt+1)` so replacement still wins (AC-5b).
- [x] Idempotent reconcile: good name already present → zero side effects (AC-5c).
- [x] Floor does not clobber an existing relay name (AC-7 merge-preserve).
- [x] Lossless merge: rawPrev's unknown client fields survive; input object not mutated (clone).

## Edge cases deliberately NOT covered (out of this story / deferred)

- AC-6 rename surface (`POST /api/profile/display-name`, `users.updateDisplayName`, the Settings field) — Story 27b.
- The dcosl-exclusion property of `publishKind0` itself — that is a property of the already-shipped publisher
  wired in `index.ts` (ADR 0022); the helpers only assert they route through the injected `publishKind0`.
- Live relay round-trip — no integration test; the ADR mandates injected publisher/fetcher.

## Test infrastructure

- Test runner: Vitest, `apps/api/test/profile/*.test.ts`, `node` environment (`apps/api/vitest.config.ts`).
- No Docker / no live strfry / no live profile relays — every relay touch is an injected `vi.fn`.
- Crypto: deterministic test keypairs via `nostr-tools/pure` `generateSecretKey` / `getPublicKey` / `finalizeEvent`
  (the audited stack, per crypto policy — no hand-rolled crypto in the fakes).
- Determinism: injected clock `now: () => 1_717_000_000`; no `Date.now()` in any asserted field.

## How to run

```
pnpm --filter @unbnd/api test -- --run test/profile
pnpm --filter @unbnd/api test          # full api suite
pnpm -r test                           # workspace gate
```

## Verification — RED for the right reason

Confirmed on 2026-05-31 at commit `0eb7241` (branch `feat/custodial-kind0-bootstrap`).

3 suites fail to LOAD because the production modules do not exist yet (`profile/kind0.ts`,
`profile/bootstrap-kind0.ts`, `profile/reconcile-kind0.ts`) — and a 4th (`resolve-after-bootstrap`) fails to load
because it imports the two not-yet-created helpers. The 2 AC-7 assertion failures in `substack-template.test.ts`
are because `mergeSubstack` does not yet accept/apply a `nameFloor`. None are test bugs. The rest of the api suite
(506 passing, incl. the unchanged `auth.test.ts` and the original `substack-template` cases) stays green.

```
⎯⎯⎯⎯⎯⎯ Failed Suites 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/profile/bootstrap-kind0.test.ts
 FAIL  test/profile/resolve-after-bootstrap.test.ts
Error: Failed to load url ../../src/profile/bootstrap-kind0 (resolved id: ../../src/profile/bootstrap-kind0) ... Does the file exist?

 FAIL  test/profile/kind0.test.ts
Error: Failed to load url ../../src/profile/kind0 (resolved id: ../../src/profile/kind0) ... Does the file exist?

 FAIL  test/profile/reconcile-kind0.test.ts
Error: Failed to load url ../../src/profile/reconcile-kind0 (resolved id: ../../src/profile/reconcile-kind0) ... Does the file exist?

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/profile/substack-template.test.ts > mergeSubstack — name-floor (Story 27 AC-7) > first Substack write with no prior kind-0 carries BOTH the name (from floor) AND substack (AC-7)
AssertionError: expected undefined to be 'Mira Calloway'   // merged.name — mergeSubstack ignores the new nameFloor arg

 FAIL  test/profile/substack-template.test.ts > mergeSubstack — name-floor (Story 27 AC-7) > a 'clear' with a nameFloor still removes substack but keeps/sets the floored name
AssertionError: expected undefined to be 'Mira Calloway'

 Test Files  5 failed | 61 passed | 2 skipped (68)
      Tests  2 failed | 506 passed | 10 skipped (518)
```

The AC-3 privacy/no-email assertion (the load-bearing one) is, in `bootstrap-kind0.test.ts`:

```ts
const wholeEvent = JSON.stringify(published);
expect(wholeEvent).not.toContain(SIGNUP_EMAIL);     // "reader@example.com"
expect(wholeEvent).not.toContain(SIGNUP_PASSWORD);  // "abcdefghij"
expect(wholeEvent).not.toContain(SESSION_ID_HEX);
```

backed by the structural whitelist check in `kind0.test.ts`:

```ts
expect(JSON.stringify(content)).not.toContain("reader@example.com");
// + every key of the built content must be in PROFILE_KIND0_FIELDS
```

## Existing tests touched

- `apps/api/test/profile/substack-template.test.ts` — ADDED a `describe("mergeSubstack — name-floor (Story 27 AC-7)")`
  block (3 cases). This is a **contract extension, not a weakening**: every original assertion is unchanged and still
  green; the new cases pin the ADR 0027 Decision 3 `nameFloor` delegation that the Implementer must add to `mergeSubstack`.
- `apps/api/test/routes/auth.test.ts` — **NOT touched.** Per ADR survey fact 2, the bootstrap/reconcile live in the
  helpers, not the auth route, so the auth-router suite stays green unchanged.
- `apps/api/test/routes/profile.test.ts` — **NOT touched.** AC-2 is asserted in a new sibling file
  (`resolve-after-bootstrap.test.ts`) that mirrors its injected-`resolve` pattern, leaving the original suite intact.

## New test files

- `apps/api/test/profile/kind0.test.ts`
- `apps/api/test/profile/bootstrap-kind0.test.ts`
- `apps/api/test/profile/reconcile-kind0.test.ts`
- `apps/api/test/profile/resolve-after-bootstrap.test.ts`
