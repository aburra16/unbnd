# Story 3: Custodial auth — email signup, login, session

**Status:** Approved
**Created:** 2026-05-28
**Type:** Feature

## Background

PRD §5.7 specifies three tiers of identity. Today, the UI ships fully wireframed flows for all three (the `/auth/email`, `/auth/nostr`, `/auth/welcome` sub-routes from cycle 1) but the backend doesn't authenticate anyone — the signup form posts nowhere, the Sign In button is decorative. This story makes the Tier 2 custodial flow real: a user can create an account by email and password, log in later, and the server holds an encrypted copy of their nostr private key in Postgres.

Tier 1 sovereign (NIP-07) backend verification is the next story (cycle 4). Server-side signing of write events (rating, tagging, etc.) is also cycle 4 — once both tiers can authenticate, both tiers can act. Cycle 3 is identity only.

### Two security strictenings versus the PRD as written

The user directed both deviations during planning. The Architect locks them in the ADR; the PRD §8.1 and §8.2 amendments land after this story closes out.

1. **NIP-49 (scrypt) replaces PRD §8.1's Argon2id.** NIP-49 is the canonical nostr standard for encrypted private keys: scrypt-based key derivation, ChaCha20-Poly1305 AEAD. Standardising on it means a custodial Unbnd user can export their encrypted nsec and import it into any other NIP-49-compatible client (Alby, etc.). Applesauce wraps NIP-49 via `applesauce-core/helpers/keys.encryptSecretKey` / `decryptSecretKey`. The scrypt parameters NIP-49 mandates (logN=18, r=8, p=1) place attacker cost well outside reach. The marginal Argon2id-vs-scrypt difference is not worth the interop loss.

2. **The decrypted nsec is not held in server memory for the session lifetime** per PRD §8.2 wording. Cycle 3 alone doesn't need to hold the decrypted nsec at all — login is just password verification (attempt to decrypt; if it works, the password is right; throw the plaintext away). When cycle 4 introduces server-side signing, the design will re-encrypt the nsec under a process-local ephemeral key for the session window — strictly better than the PRD wording because a process restart invalidates all wrappings and forces re-login (no plaintext nsec ever lives in memory across a restart).

### Stack additions this story brings

- **Postgres** as a new `db` service in `docker-compose.yml`. Connects from `apps/api` via the postgres.js driver. Schema managed by Drizzle (TypeScript-first, no codegen runtime, lightweight migration tool) — Architect confirms.
- **NIP-49 wrapping** of the generated nsec at rest via `applesauce-core/helpers/keys`.
- **A second at-rest encryption layer** for the server-managed backup-key copy of the nsec (per PRD §8.4). The backup key is a deployment secret; the AEAD construction is ChaCha20-Poly1305 from `@noble/ciphers` (Architect confirms).
- **A `/health/data` probe for Postgres** added to the existing probe set from cycle 2.

## User-facing description

As a reader who wants to sign up without learning what nostr is (per the bridging principle in `memory/feedback_unbnd_copy_and_visual.md`), I want to enter an email + password + display name on `/auth/email`, click Create account, and be signed in — landing on `/auth/welcome` with my identity established. Later visits to the site recognize me from a cookie; I see my initials in the nav avatar where the Sign In button was. Logging out returns me to the anonymous-browse state.

End users see two new behaviors: the Sign In button on the nav now actually signs them in, and the email signup form actually creates an account.

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: `docker-compose.yml` gains a `db` service running Postgres 16, with a named volume `unbnd-postgres` for persistence. Connection details documented in `.env.example`.
- [ ] AC-2: `apps/api` exposes `POST /auth/signup` accepting `{ email, password, displayName }`. On success: 201 with `{ user: { id, email, displayName, npub } }` and a `Set-Cookie: session=<opaque-token>; HttpOnly; SameSite=Lax`. On failure (duplicate email, password too short, missing field): 400 with a typed error.
- [ ] AC-3: `apps/api` exposes `POST /auth/login` accepting `{ email, password }`. On success: 200 with the same user shape and a session cookie. On wrong password or unknown email: 401 with a generic error message (does not distinguish the two — prevents enumeration).
- [ ] AC-4: `apps/api` exposes `POST /auth/logout`. Deletes the session row referenced by the cookie; clears the cookie. Always returns 204, even if the cookie is absent or expired.
- [ ] AC-5: `apps/api` exposes `GET /auth/me`. Returns 200 + the user object if the session cookie maps to a live session, 401 otherwise. The returned user object includes the **npub** (bech32, never the hex pubkey — per the bridging-principle rule in CLAUDE.md and `memory/feedback_unbnd_copy_and_visual.md`).
- [ ] AC-6: The generated nostr keypair is stored encrypted at rest in two columns: `encrypted_nsec_password` (NIP-49 encrypted with a scrypt-derived key from the user's password) and `encrypted_nsec_backup` (ChaCha20-Poly1305 encrypted with the deployment's `BACKUP_ENCRYPTION_KEY`). The plaintext nsec exists only briefly during signup, is wiped from memory after both encryptions, and never enters the database row.
- [ ] AC-7: Logging in with the wrong password does not allow `encrypted_nsec_password` to be decrypted. The NIP-49 decrypt either succeeds (correct password) or returns a deterministic failure (the AEAD authentication tag check fails); login distinguishes these and returns 401 on failure.
- [ ] AC-8: The session cookie value is an opaque token (32 bytes of `crypto.randomBytes`, base64url-encoded). It is not a JWT and carries no embedded data. Every request that needs identity does a single indexed query against the `sessions` table.
- [ ] AC-9: `apps/web`'s email signup form on `/auth/email` actually `POST`s to `/auth/signup`. On success, navigates to `/auth/welcome`. On failure, renders the API's error message inline below the relevant field (or in a top-level slot if non-field-specific).
- [ ] AC-10: `apps/web`'s nav reads `/auth/me` on mount. When signed in, the Sign In button is replaced with the user's avatar (initials, per the existing `Nav.tsx` pattern). When signed out, the Sign In button is present.
- [ ] AC-11: `apps/api/src/probes/postgres.ts` exists; `/health/data` reports `postgres: { ok, latencyMs }`. The top-level `ok` of `/health/data` becomes 200 iff every dependency including Postgres is up.
- [ ] AC-12: All cryptographic operations go through the Applesauce default / nostr-tools fallback / `@noble/*` floor stack per CLAUDE.md "Cryptographic library policy". No hand-rolled crypto, no Argon2 implementation, no custom AEAD.

## DList shapes touched

None. This story does not publish or read any nostr events. The keypairs generated and stored are dormant until cycle 4 wires the server-side signing path.

## Out of scope

- **NIP-07 sovereign login backend.** The signed-challenge verification and Tier 1 user creation path is cycle 4. The UI's `/auth/nostr` flow remains a stub.
- **Server-side signing of user write actions.** Rating, tagging, shelf actions still don't persist. Cycle 4 introduces the publish path and the ephemeral-wrap pattern.
- **Password reset flow.** Requires email infrastructure (SMTP or similar). Deferred until after cycle 5 when we have a deployment.
- **Email verification.** Same dependency on email infra.
- **Nsec export from a Settings → Advanced page** (the PRD §5.7 "Tier 2 → Tier 1 upgrade path"). Small UI feature; deferred to a settings-page story.
- **OAuth providers (Google / Apple).** PRD §11.2 stretch — not in MVP.
- **Account deletion / data export.** Out of MVP scope per PRD §11.3.
- **Avatar upload.** Existing initials-in-circle pattern continues.
- **Rate limiting on `/auth/login`.** Belongs in a future infrastructure / CI story. Architect notes the deferral.
- **CSRF tokens.** Architect decides in the ADR whether SameSite=Lax suffices for MVP write paths, or whether explicit CSRF tokens land now. Either way, scope is small enough to ride within this story.

PRD §11.3 "Out of Scope" line is undisturbed.

## Open questions

The Architect resolves these in the ADR.

1. **Database migration tool.** Drizzle is the recommendation but options include raw SQL with versioned files, Knex, Prisma. The Architect picks and pins.
2. **Postgres client library.** `postgres.js` (faster, simpler API) vs `pg` (most popular, slightly heavier). Recommendation: `postgres.js` because Drizzle's adapter for it is well-maintained.
3. **CORS + cookie config in dev.** `apps/web` runs on `localhost:5181`; `apps/api` runs on `localhost:8787`. Different origins. Two options:
   - Vite dev proxy for `/auth/*` (and `/api/*` more generally) so the browser sees same-origin requests.
   - Explicit CORS headers + `credentials: include` on the client. Cookie `Domain=localhost` works for both ports.
   The Architect picks. Recommendation: Vite proxy in dev, CORS in prod (single domain so the question disappears).
4. **PRD §8.1 / §8.2 amendments.** Already directed by the user. The ADR's "PRD section change required?" line confirms yes, and the post-closeout amendment is tracked separately. The Architect specifies the exact wording so the PRD edit is mechanical.
5. **CSRF protection.** SameSite=Lax cookies block most CSRF on state-changing requests. Do we add explicit CSRF tokens for `/auth/signup`, `/auth/login`, `/auth/logout`? Architect decides.
6. **Password strength requirements.** PRD §5.7 doesn't specify minimum length. NIST recommends ≥8 characters with no composition rules. The Architect picks the floor; recommend 10 characters with no other rules (matches the placeholder in the current UI: "At least 10 characters").
7. **Where the `BACKUP_ENCRYPTION_KEY` lives in dev.** `.env.example` placeholder + `scripts/generate-keypair.js`-style helper that prints a fresh 32-byte hex string? Or a separate `scripts/generate-backup-key.js`? Architect picks.
8. **Session expiry.** 30 days rolling? 14 days fixed? Architect specifies.

## Linked artifacts

- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)

## Post-closeout actions

Tracked by the Reviewer at PASS close-out. The harness's normal close-out (status → Done, `git mv` to `done/`, update path refs) plus:

1. **Amend PRD §8.1** to replace the Argon2id recommendation with the NIP-49 scrypt design this ADR locks. Exact wording per the Architect.
2. **Amend PRD §8.2** to replace "the decrypted private key is held in server memory for the duration of the session" with the ephemeral-wrap pattern this ADR locks. Exact wording per the Architect.
3. **Confirm both amendments** with the user before committing (the PRD is a public-repo document; the user owns its final shape).
