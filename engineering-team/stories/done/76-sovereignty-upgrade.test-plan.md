# Test Plan: Story 76 — Sovereignty upgrade (take ownership of your key)

**Story:** `engineering-team/stories/76-sovereignty-upgrade.md`
**ADR:** `engineering-team/decisions/0074-sovereignty-upgrade.md`
**Date:** 2026-06-07

## Coverage map
Three layers: the **crypto core** (`exportNsec` — the security-critical reveal), the **route mapping** (`POST /auth/export-key` status codes via the `AuthDeps` fake), and the **web flow** (card states + the deliberate reveal-once flow).

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (reach the flow; sovereign-colored card) | `a custodial, not-yet-exported user sees the 'Take ownership' offer` | `apps/web/test/routes/settings-sovereignty.test.tsx` | component |
| AC-2 (explain + one explicit confirm) | `reveals the nsec only after explicit confirm + password …` | web | component |
| AC-3 (re-auth; server never reveals without proof) | `throws on the wrong password and reveals nothing` (crypto) + `returns 403 and no nsec on a wrong password` (route) | `apps/api/test/auth/crypto.test.ts`, `apps/api/test/routes/auth.test.ts` | unit + integration |
| AC-3 (reveal is password-gated, reproducible) | `reveals the encrypted custodial key as the matching nsec (password-gated)` — decodes back to the exact secret | `crypto.test.ts` | unit |
| AC-4 (shown once, copy, acknowledgement gates dismissal) | `… gates dismissal on an acknowledgement` (Done disabled until the "saved my key" checkbox) | web | component |
| AC-5 (account keeps working; exported state, no re-offer) | `a custodial user who already exported sees the taken state, not the offer` | web | component |
| AC-6 (never forced, always dismissible) | structural — the flow is a dismissible card in Settings, not a gate; covered by the card-state tests (no forced interstitial) | web | component |
| AC-7 (sovereign sees "you own your key", never the offer) | `a sovereign user sees 'you own your key', never the export offer` | web | component |
| Route — 401 no session / 400 non-custodial | `returns 401 when not signed in` / `returns 400 for a non-custodial (sovereign) user` | `auth.test.ts` | integration |

## Edge cases
- [x] **Wrong password reveals nothing** — both at the crypto layer (`exportNsec` throws) and the route (`403`, `res.body.nsec` undefined). This is the security spine (the reveal uses the password layer, never the deployment backup key).
- [x] **Reproducibility** — the revealed `nsec` decodes back to the exact original secret bytes (any nostr client can use it).
- [x] **Sovereign user** — no encrypted key to export → the route returns `400 not_custodial`; the UI shows "you own your key".
- [x] **Already-exported** — the offer is gated on `keyExportedAt` (UI shows the taken state).
- [x] **No browser persistence / no logging** — the reveal nsec lives in component state only; verified-by-design (no localStorage/sessionStorage write) + the route never logs the secret. (Asserted structurally in the Implementation + Review, not a unit assertion.)

## Test infrastructure
- Vitest. Crypto unit: real `encryptWithPassword` → `exportNsec` round-trip + `decode` (nostr-tools/nip19) — no mocks, real audited crypto. Route: express + supertest + the `AuthDeps` fake `exportKey` (the route maps its discriminated result to status codes). Web: `useSession` + `api` mocked; the flow drives explain → confirm → password → reveal and asserts `api.auth.exportKey(password)` + the acknowledgement gate.
- **Fixture fallout (Implementation):** adding `keyExportedAt` to the API `PublicUser`/`toPublicUser` will touch the few api tests that `toEqual` the full user object — handled in Implementation (additive `keyExportedAt: null`), not here. The web `PublicUser` field is optional → no web fallout.

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/auth/crypto.test.ts test/routes/auth.test.ts
pnpm --filter @unbnd/web exec vitest run test/routes/settings-sovereignty.test.tsx
pnpm -r typecheck
```

## Verification
The new tests fail against the stubs (`exportNsec` returns `""`; the route returns `501`; Settings renders no sovereignty card). Confirmed 2026-06-07:

```
 ❯ apps/api  test/auth/crypto.test.ts            (9 tests  | 2 failed)
 ❯ apps/api  test/routes/auth.test.ts            (14 tests | 4 failed)
 ❯ apps/web  test/routes/settings-sovereignty.test.tsx (4 tests | 4 failed)
```

`pnpm -r typecheck` clean. No regressions: api `103 passed | 2 skipped` (only the two new-test files fail), web `62 passed` (only the new file fails).
