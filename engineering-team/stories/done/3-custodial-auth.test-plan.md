# Test Plan: Story 3 — Custodial auth

**Story:** `engineering-team/stories/done/3-custodial-auth.md`
**ADR:** `engineering-team/decisions/0003-custodial-auth.md`
**Date:** 2026-05-28

## Coverage map

| AC | Test file | Level |
|---|---|---|
| AC-1 (compose `db` service) | `apps/api/test/infrastructure/compose.test.ts` | file-content |
| AC-2/3/4/5 (4 endpoints) | `apps/api/test/routes/auth.test.ts` | component (supertest, mocked deps) |
| AC-6 (double-encrypted nsec) | `apps/api/test/auth/crypto.test.ts` | unit |
| AC-7 (wrong password fails decrypt) | `apps/api/test/auth/crypto.test.ts` + `routes/auth.test.ts` | unit + component |
| AC-8 (opaque sha256-hashed sessions) | `apps/api/test/auth/sessions.test.ts` | unit |
| AC-9 (web form wired) | `apps/web/test/routes/auth-email-signup.test.tsx` | component (Testing Library) |
| AC-10 (nav avatar swap) | `apps/web/test/components/nav.test.tsx` | component |
| AC-11 (postgres probe + /health/data) | `apps/api/test/probes/postgres.test.ts` + `routes/health.test.ts` | unit + component |
| AC-12 (crypto policy) | meta — see §"Crypto policy" below | static |

Hardening items (absorbed into cycle 3 per the amended ADR):

| Item | Test file | Asserts |
|---|---|---|
| Session token hashing | `auth/sessions.test.ts` | stored `id` = SHA-256(token), ≠ raw token |
| Session rotation on login | `routes/auth.test.ts` + `db/integration.test.ts` | login forwards old cookie to the login dep; integration confirms old row deleted |
| Transactional ops | `db/integration.test.ts` | duplicate signup rejected by UNIQUE constraint inside a transaction |
| Max password length 4096 | `auth/passwords.test.ts` | 4097 chars → invalid |
| Production error sanitizer | `middleware/errors.test.ts` | prod: generic 500, no stack, requestId; dev: stack included |

## Test infrastructure — the hybrid

- **Hermetic suites** (run everywhere, no external services): crypto, passwords, sessions (pure helpers), middleware, postgres-probe (points at a dead port to exercise the error path), the four endpoints (`auth.test.ts`, via dependency-injected mocked `signup`/`login`/`logout`/`me`), health route, all infrastructure file-content tests, and both apps/web component suites. These are the fail-for-the-right-reason set in the Tester phase.
- **Real-Postgres integration suite** (`apps/api/test/db/integration.test.ts`): gated on `DATABASE_URL`. Skipped-with-a-console-notice when absent (no silent caps). Covers the behaviors a mock can't: UNIQUE-email constraint, CITEXT case-insensitivity, `issueSession` → `resolveSession` round-trip, `revokeSession` removing the row. Runs locally when a dev sets `DATABASE_URL` against `docker compose up`, and is the Reviewer's real-SQL check.
- **CI note:** wiring a `services: postgres` block into the GitHub Actions workflow so the integration suite runs automatically is a small follow-up, deferred until the Implementer's code exists (wiring it now would guarantee a red CI run against unimplemented stubs). For cycle 3 the integration suite is dev/Reviewer-run.
- **Runner:** Vitest. **HTTP:** supertest. **Web component:** Testing Library + happy-dom (cycle-1 setup).
- **New deps:** `postgres`, `drizzle-orm`, `cookie`, `@noble/ciphers` (runtime), `drizzle-kit` (dev) — all pinned exact per the supply-chain rule.

## Crypto policy (AC-12)

`apps/api/src/auth/crypto.ts` imports key generation + NIP-49 from `applesauce-core/helpers/keys`, npub encoding from `nostr-tools/nip19`, and XChaCha20-Poly1305 from `@noble/ciphers/chacha`. No hand-rolled primitives. `scripts/generate-backup-key.js` uses `node:crypto.randomBytes(32)` — the `scripts.test.ts` infra test asserts `randomBytes(32)` is present and `Math.random` is absent.

## Edge cases

- [x] Password at min (10), at max (4096), below min, above max
- [x] Email with no `@`, email > 254 chars, email normalization (trim + lowercase)
- [x] Display name empty, normal, > 100 chars
- [x] NIP-49 wrong-password decrypt throws
- [x] XChaCha20 fresh nonce per call (ciphertext differs), wrong-key decrypt throws
- [x] Session token decodes to 32 bytes; stored id is SHA-256 not raw token; distinct per call
- [x] Login with existing cookie forwards it for rotation
- [x] Logout with and without a cookie both 204
- [x] `/auth/me` with and without a resolving session (200 vs 401)
- [x] Signup duplicate email → 409
- [x] Public user object never exposes `pubkeyHex` or encrypted columns
- [x] `/health/data` 503 when postgres down
- [x] Error sanitizer hides internal detail (pg version, file paths) in prod
- [x] Web signup form: success path calls api + navigates; failure path renders the error and does not navigate
- [x] Nav renders Sign in when signed out, initials avatar when signed in

## How to run

```
pnpm --filter @unbnd/api test          # hermetic + skipped integration
pnpm --filter @unbnd/web test
pnpm -r test                           # whole workspace

# Integration suite against a live db:
docker compose up -d db
DATABASE_URL=postgres://unbnd:unbnd@localhost:5432/unbnd pnpm --filter @unbnd/api test
```

## Verification — failing-for-the-right-reason

Confirmed 2026-05-28 after the Tester commit. Typecheck is clean workspace-wide (the Tester keeps types green; stubs satisfy their signatures, only bodies are missing).

### `pnpm --filter @unbnd/api test`
```
Test Files  10 failed | 5 passed | 1 skipped (16)
     Tests  45 failed | 75 passed | 5 skipped (125)
```
Every failure is one of:
- `Error: <fn> not implemented` from a stub (`generateCustodialKeypair`, `validatePassword`, `generateSessionToken`, `errorSanitizer`, `probePostgres`, etc.).
- `expected 404 to be <201|200|204|401|409>` from the four endpoints (the `buildAuthRouter` stub returns an empty router).
- `toMatch` failures on `docker-compose.yml` / `.env.example` content not yet added.
- `ENOENT` for `scripts/generate-backup-key.js` (not yet created).

The 75 passing are the config suite (config is a trivial validated-loader extension, implemented in this commit) plus the cycle-1/2 carryover suites. The 5 skipped are the integration suite (no `DATABASE_URL`).

### `pnpm --filter @unbnd/web test`
```
Test Files  2 failed | 2 passed (4)
     Tests  3 failed | 11 passed (14)
```
The 3 failures: the nav signed-in test (Nav doesn't read `useSession` yet) and two signup-form tests (the form doesn't call `api.auth.signup` or render errors yet). The signup "navigates to /auth/welcome" test passes against the stub's existing setTimeout-navigate — it's an end-state guard the Implementer must preserve. The 5 route smoke tests and 4 fixture tests (cycle 1) still pass.

## Notes for the Implementer

Suggested order: `auth/crypto.ts` → `auth/passwords.ts` → `auth/sessions.ts` (pure helpers) → `db/index.ts` + migration + `auth/users.ts` (db layer) → `routes/auth.ts` (wire the four handlers, transactional, rotation) → `middleware/errors.ts` → `probes/postgres.ts` + health route → infrastructure files (`docker-compose.yml` db service, `.env.example`, `scripts/generate-backup-key.js`, `docs/auth.md`) → apps/web (`lib/api.ts`, `hooks/useSession.ts`, `AuthEmailSignup.tsx` wiring, `Nav.tsx` swap, `vite.config.ts` proxy).

The two cycle-2 search config fixtures and the cycle-2 health config fixture were updated to include the new required `databaseUrl` / `backupEncryptionKey` fields — those are not new tests, just fixture maintenance.
