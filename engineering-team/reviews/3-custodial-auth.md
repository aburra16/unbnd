# Review: Story 3 — Custodial auth

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-28
**Diff:** `git diff 4316253..0ce2bda` (ADR → impl, including the test commit `e3fbf38`).

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass**, all three packages.
- [x] `pnpm -r test` — **pass**, 196 passing (62 schemas + 120 api + 14 web), 5 skipped (integration suite, no Docker here).
- [x] `pnpm --filter @unbnd/web build` — **pass** (216.92 kB JS).
- [x] `pnpm --filter @unbnd/api build` — **pass** (tsc emit clean; confirms the TS-embedded migrations compile into dist without a .sql copy step).
- [x] Lint not configured — skipped.

## Spec adherence

- [x] **AC-1** db service: `docker-compose.yml` has `db` (postgres:16, `5432:5432`, `unbnd-postgres` volume). Verified by `compose.test.ts`.
- [x] **AC-2/3/4/5** four endpoints: `auth.test.ts` covers signup (201 + cookie, 400, 409), login (200 + cookie, 401 generic, rotation forwards old cookie), logout (204 with/without cookie), me (200/401). All pass.
- [x] **AC-6** double-encrypted nsec: `crypto.test.ts` proves NIP-49 round-trip and XChaCha20 round-trip; `createCustodialUser` writes both columns and wipes the plaintext in `finally`.
- [x] **AC-7** wrong password fails decrypt: `crypto.test.ts` asserts NIP-49 decrypt throws on wrong password; `index.ts` login catches that and returns null → 401.
- [x] **AC-8** opaque sha256-hashed sessions: `sessions.test.ts` proves the stored id is SHA-256(token) and ≠ the raw token.
- [x] **AC-9** web form wired: `auth-email-signup.test.tsx` — calls `api.auth.signup`, navigates on success, renders the error on failure.
- [x] **AC-10** nav avatar swap: `nav.test.tsx` — Sign in when signed out, initials avatar when signed in.
- [x] **AC-11** postgres probe: `health.test.ts` asserts `services.postgres` and 503 when down.
- [x] **AC-12** crypto policy: grep confirms zero hand-rolled or raw-primitive crypto imports; all via Applesauce / nostr-tools / @noble.

Hardening items (all present and tested): session hashing, rotation, transactional signup, 4096 password cap, production error sanitizer.

## Security audit (the point of this cycle)

- [x] **No hand-rolled crypto.** `grep` for secp/argon/bcrypt/scrypt/createCipher/crypto-js → none. `auth/crypto.ts` uses `applesauce-core/helpers/keys` (NIP-49), `nostr-tools/nip19` (npub), `@noble/ciphers/chacha.js` (XChaCha20-Poly1305), `node:crypto.randomBytes` (nonce/token). `generate-backup-key.js` uses `randomBytes(32)`, never a non-cryptographic PRNG.
- [x] **No plaintext key retained.** Login calls `decryptWithPassword(...)` purely to verify the password; the result is discarded (no assignment, `index.ts:79`). Cycle 3 holds no decrypted nsec — matches the ADR's strictening of PRD §8.2.
- [x] **No secret logging.** `grep` for console logging of password/nsec/secret/token → none. The error sanitizer logs the raw error server-side only, never in the response.
- [x] **Anti-enumeration.** Login returns the same generic 401 ("Email or password is incorrect.") for unknown email and wrong password.
- [x] **Cookie hardening.** `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, 30-day max-age. `__Host-` prefix correctly deferred to cycle 5 (needs HTTPS).
- [x] **DOS guards.** `express.json({ limit: "256kb" })` plus the 4096-char password cap bound the scrypt/JSON work an attacker can force.
- [x] **No identity leak.** `PublicUser` carries `npub` only; `pubkeyHex` and both encrypted columns never reach the client. The npub-not-hex rule (CLAUDE.md bridging principle) is honored.
- [x] **Session token unstealable from a DB leak.** Only `SHA-256(token)` is stored.
- [x] **No `.env` committed.** `git ls-files` confirms none tracked.

## ADR adherence

- [x] Drizzle + postgres.js as decided. Schema matches (users + sessions, citext, bytea, the documented columns and indexes).
- [x] Endpoint contracts match the ADR's documented shapes.
- [x] New deps exactly those the ADR authorized (`postgres`, `drizzle-orm`, `cookie`, `@noble/ciphers`, `drizzle-kit`), all pinned exact.
- [x] One Implementer-phase deviation: migrations are embedded as a TS string module (`db/migrations.ts`) rather than a runtime-read `db/migrations/0001_initial.sql`. **Defensible and an improvement** — `tsc` does not copy `.sql` into `dist/`, so a TS-embedded migration ships identically in dev (tsx) and prod (tsc→dist) with zero copy-step risk. The SQL is fully readable in the module. Recorded as an ADR refinement at close-out.

## House rules

- [x] PRD scope discipline: identity only. No server-side signing, no NIP-07 backend, no publish path — all correctly deferred to cycle 4.
- [x] POV-first / decentralized-first: auth is identity, not aggregation; nothing violates the invariants.
- [x] Crypto library policy honored (see security audit).
- [x] No new lint/build tooling beyond the ADR-authorized deps.

## Findings

### Blocking
None.

### Non-blocking observations

1. **The 5-test real-Postgres integration suite was not executed in this environment (Docker daemon not running).** The hermetic suites plus the DI-mocked endpoint tests give strong coverage, but the real-SQL behaviors — the `23505 → email_in_use` mapping, CITEXT case-insensitivity, transactional rollback, and `issueSession`/`resolveSession`/`revokeSession` against live Postgres — are only verified when the suite runs with `DATABASE_URL` set. Same deferral as cycle 2's manual steps. **Must be run against a real Postgres before the cycle-5 deploy.** Wiring a `services: postgres` block into CI (so this runs automatically) is the cleanest way to close it — recommended as the first task of the cycle-4 feature-branch workflow.

2. **The `23505 → email_in_use` mapping in `index.ts` is not unit-tested.** The route test covers the 409 response with a mocked `email_in_use` throw, and the integration suite covers the real UNIQUE violation, but the specific branch that inspects `err.code === "23505"` has no hermetic test. Low risk (small, well-understood branch) and covered end-to-end by the integration suite. Optional: a tiny unit test on the mapping helper if it's extracted.

3. **`useSession` fires `/auth/me` on mount in every page that renders `Nav`.** Correct behavior, but it means one request per page load. Fine at MVP scale; if it becomes chatty, a shared context/provider would dedupe. Noted, not actioned.

## Verdict

**PASS.**

Every hermetic gate is green and the security audit is clean: no hand-rolled crypto, no retained plaintext key, no secret logging, anti-enumeration, hardened cookies, DOS guards, npub-only public shape, hashed session storage. The implementation matches the story and the ADR (with one well-justified migrations-format refinement). The integration suite remains the one item to run against real Postgres before deploy — flagged as non-blocking with a clear CI follow-up.
