# ADR 0003: Custodial auth — email signup, login, session

**Status:** Proposed
**Date:** 2026-05-28
**Story:** `engineering-team/stories/3-custodial-auth.md`

## Context

Story 3 makes the Tier 2 custodial auth flow real for PRD §5.7's three-tier identity model. The Sign In screen becomes functional: a user enters email + password + display name, an account row is created in Postgres, a nostr keypair is generated and stored double-encrypted at rest, and the session cookie carries the user through subsequent requests.

Twelve acceptance criteria drive the design. The user already directed two security strictenings over the PRD as drafted (NIP-49 scrypt instead of Argon2id; no plaintext nsec in session memory) — this ADR locks both. PRD §8.1 and §8.2 will be amended after closeout.

### Tapestry prior-art survey

Tapestry's `src/middleware/auth.js` (on `concept-graph`) implements **NIP-07 owner verification**: server generates a 32-byte random challenge, stores it on `req.session.challenge`, the client signs it via the browser extension, the server verifies the signature against the configured owner pubkey. That's the pattern **cycle 4** will crib for the Tier 1 sovereign login backend. Tapestry has no email-password custodial flow; cycle 3 designs fresh.

The session model Tapestry uses is express-session with an in-memory store — fine for a single-process admin tool, wrong for Unbnd because we want sessions to survive process restarts during dev iteration and we want clean revocation. We use a Postgres-backed sessions table instead.

### CLAUDE.md invariants the design must honor

- **Cryptographic library policy.** Every crypto operation goes through Applesauce default / nostr-tools fallback / `@noble/*` floor. No Argon2id roll-your-own, no custom AEAD.
- **No-AI-slop copy.** Endpoint error messages and the validation feedback that appears in the apps/web form land through the no-slop ban list. "Generic error message" for login failure (does not distinguish "no such user" from "wrong password" — prevents enumeration AND avoids any hedged or rhetorical-contrast phrasing).
- **Bridging principle / npub display.** The `user` object returned by every auth endpoint includes `npub` (bech32) and never raw hex. `useSession()` on the client carries npub; if any UI ever displays an identity string, it shows the npub.
- **POV-first, decentralized-first.** Authentication is identity, not aggregation. No POV-derived data flows through these endpoints. Future write paths (cycle 4) apply the POV invariants when they aggregate; cycle 3 just establishes who's making the writes.

### Project constraints

- New runtime deps in `apps/api`: `postgres` (the postgres.js client), `drizzle-orm` (the migration + query builder), `cookie` (parser/serializer), `@noble/ciphers` (ChaCha20-Poly1305 for the backup-key wrapping). Crypto deps already authorized by the Cryptographic library policy.
- New deps in `apps/web`: none. The auth client wrapper is a thin `fetch` helper; React state lives in a small hook.
- `apps/api` will need to read and set HTTP-only cookies — adds a tiny cookie middleware to the Express app.
- The story's AC-12 explicitly requires the crypto policy be honored. Every crypto call site cites which library it uses.

## Options considered

### Option A — Drizzle ORM + postgres.js client; raw SQL migrations under Drizzle's control

`drizzle-orm` 0.36+ with the `postgres.js` adapter. Schema declared in TypeScript at `apps/api/src/db/schema.ts`; migrations generated and run via `drizzle-kit`. Type-safe queries across `apps/api`.

**Pros**
- Type-safe queries: every `db.select().from(users).where(eq(users.email, e))` is checked at compile time. The Postgres column shape and the TypeScript model never drift.
- Cycle 4 (server-side signing) and subsequent stories that touch the database get the same type safety without re-paying the setup cost.
- Drizzle's migration story is "you control the SQL." `drizzle-kit generate` produces SQL files; you commit them; running them is `drizzle-kit migrate`. No surprise schema changes.
- `postgres.js` is the fastest Node Postgres client and the simplest API. Drizzle adapter for it is well-maintained.

**Cons**
- One more workspace dep (`drizzle-orm` + `drizzle-kit`).
- Type-level query builder has a learning curve.

### Option B — postgres.js client only; hand-written SQL migrations

Plain SQL files in `apps/api/src/db/migrations/`, run by a tiny custom migrator at startup. Queries written as tagged template literals against the `postgres` client.

**Pros**
- Zero ORM dep. SQL is what we'd write anyway.
- Migrations are literal `.sql` files — no codegen, no inference.

**Cons**
- Every query is a string. Column renames break at runtime, not compile time. Cycle 4 + 6 multiply this cost.
- We re-invent migration sequencing, lock tables, etc. — small wheel but still a wheel.

### (Option C — Knex or Prisma)

Knex is older and verbose; Prisma is heavier (its own schema language, codegen runtime, opinionated). Both work but Drizzle's TypeScript-first + raw-SQL-migrations posture is a better fit for the project's style (we already write our own types and prefer not to be locked into a query language).

## Decision

We chose **Option A**: Drizzle ORM + postgres.js client.

The rest of the design:

1. **Postgres 16** as a new `db` service in `docker-compose.yml`. Named volume `unbnd-postgres`. Port 5432 exposed to the host.
2. **Database URL** via `DATABASE_URL` env var; `apps/api/src/config.ts` validates it as a required field.
3. **Schema**: two tables (`users`, `sessions`), one extension (`citext` for case-insensitive email). Initial migration `0001_initial.sql`.
4. **Generated nsec** via `applesauce-core/helpers/keys.generateSecretKey`. Public key via `getPublicKey`.
5. **Password copy of nsec** encrypted via NIP-49 (`applesauce-core/helpers/keys.encryptSecretKey`). Stored as the bech32 `ncryptsec1...` string in `users.encrypted_nsec_password TEXT`.
6. **Backup copy of nsec** encrypted via XChaCha20-Poly1305 (`@noble/ciphers/chacha`). Server-managed 32-byte key from `BACKUP_ENCRYPTION_KEY` env var. Stored as `nonce || ciphertext || tag` in `users.encrypted_nsec_backup BYTEA`.
7. **Sessions**: opaque 32-byte random token (`crypto.randomBytes(32)`), base64url-encoded as the cookie value. **The database stores `SHA-256(token)`, not the token itself.** A leaked database backup or SQL injection therefore exposes hashes, not usable tokens. Lookup is `WHERE id = sha256(cookieValue)`. 30-day sliding expiry: every authenticated request bumps `last_seen_at` and pushes `expires_at` forward.
8. **Session rotation on login.** Every successful signup and login issues a brand-new session row with a freshly generated token, even if the user already had a session cookie. Prevents session-fixation attacks where an attacker plants a known session cookie before the victim logs in.
9. **Multi-row operations are transactional.** Signup (INSERT user + INSERT session), login (INSERT new session + optional DELETE of an old session), and logout (DELETE session) all run inside `db.transaction(async (tx) => {...})` so a partial failure does not leave the database in a half-state.
10. **Cookie**: name `session`. Flags `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=2592000`. In production: also `Secure`. In dev: no `Secure` so localhost over plain HTTP works. (`__Host-` prefix lands with cycle 5 once HTTPS exists.)
11. **Origin handling**: Vite proxy in dev. `apps/web/vite.config.ts` proxies `/auth/*` and `/api/*` to `localhost:8787` so the browser sees same-origin requests. In production both surfaces sit behind the same nginx on `unbnd.ink`, so CORS is a non-question.
12. **CSRF**: `SameSite=Lax` plus POST-only state-changing endpoints is sufficient for MVP. Explicit CSRF tokens are recorded as a deferred concern for when we ship the publish path (cycle 4 or 5).
13. **Password validation**: minimum 10 characters, maximum 4096. No other composition rules. The minimum matches NIST 800-63B; the maximum prevents an attacker from making the server allocate memory and burn CPU on scrypt for a gigabyte-sized password.
14. **Error messages on login failure** are deliberately generic ("Email or password is incorrect.") so an attacker can't enumerate accounts by probing.
15. **Production error sanitizer.** A terminal Express error middleware catches uncaught errors, logs the full stack server-side with a generated request ID, and returns `{ error: { code: "internal", message: "An unexpected error occurred.", requestId } }` with HTTP 500. No stack traces, error messages, or library version strings leave the server. In `NODE_ENV !== "production"`, the response also includes the stack to keep dev iteration fast.

## Consequences

**Enables**
- Real account creation. The Sign In screen stops being a wireframe and produces working sessions.
- Cycle 4 can lean on the `users` table to find a user's encrypted nsec when their write actions need to be signed server-side.
- Cycle 4's NIP-07 backend slots in cleanly: same `users` table, `tier='sovereign'`, no encrypted nsec columns populated (sovereign users hold their own key), same `sessions` table for session tracking.
- A clear seam for adding Tier 2 → Tier 1 upgrade (export nsec from Settings) as a small later story.

**Constrains / makes harder**
- The `users` table schema is now committed. Adding columns later is cheap; renaming or removing them requires a migration with care.
- `BACKUP_ENCRYPTION_KEY` is now a deployment secret we have to manage. Rotation is non-trivial (would require decrypting every existing `encrypted_nsec_backup` with the old key and re-encrypting with the new). Acceptable; rotation is a multi-year concern.
- The session table grows monotonically until we add a sweeper. Cycle 3 ships the column structure and an index on `expires_at`; the sweeper job lands as a tiny follow-up.

**Affects existing fixtures?** No. The apps/web fixtures continue to render; the auth flow doesn't change what gets displayed on the homepage or book detail.

**New dependencies in `apps/api`:**
- `postgres` (postgres.js client) ^3.4
- `drizzle-orm` ^0.36
- `drizzle-kit` ^0.28 (dev dep)
- `cookie` (parser/serializer) ^1.0
- `@noble/ciphers` (ChaCha20-Poly1305) ^1.0

All pinned exactly per the supply-chain rule established in ADR 0002.

**New dependencies in `apps/web`:** none.

**PRD section change required?** Yes. After this story closes out:
- **PRD §8.1** — replace "Derive an encryption key from the password using Argon2id (high memory cost)." with "Encrypt the nostr private key using NIP-49 (scrypt-based key derivation with logN=18, r=8, p=1; ChaCha20-Poly1305 AEAD). NIP-49 is the canonical nostr standard for encrypted private keys, enabling export to other compatible clients."
- **PRD §8.2** — replace "the decrypted private key is held in server memory for the duration of the session" with "the decrypted private key is never persisted across requests. Cycle 4's signing path will re-encrypt the nsec under a process-local ephemeral key for the session window; a process restart invalidates all such wrappings and forces re-login."

Reviewer confirms these wordings with the user at close-out before committing the PRD edit.

## Implementation notes

### File layout

```
apps/api/
├── package.json                            (modify — add 5 deps)
├── drizzle.config.ts                       (new — drizzle-kit config)
├── src/
│   ├── index.ts                            (modify — add cookie middleware, JSON body, mount /auth router)
│   ├── config.ts                           (modify — add databaseUrl + backupEncryptionKey to Config)
│   ├── db/
│   │   ├── index.ts                        (new — postgres client + drizzle adapter, exported as `db`)
│   │   ├── schema.ts                       (new — Drizzle pgTable declarations + types)
│   │   └── migrations/
│   │       └── 0001_initial.sql            (new — CREATE EXTENSION citext, CREATE TABLE users, CREATE TABLE sessions, indexes)
│   ├── auth/
│   │   ├── crypto.ts                       (new — NIP-49 wrap/unwrap + XChaCha20-Poly1305 wrap/unwrap)
│   │   ├── sessions.ts                     (new — createSession, getSessionByToken, deleteSession, sweepExpiredSessions)
│   │   ├── passwords.ts                    (new — validatePasswordStrength, normalizeEmail)
│   │   └── users.ts                        (new — createCustodialUser, findUserByEmail, findUserById)
│   ├── middleware/
│   │   └── errors.ts                       (new — production error sanitizer; mounted last)
│   ├── routes/
│   │   ├── auth.ts                         (new — POST signup/login/logout, GET me)
│   │   └── health.ts                       (modify — add postgres to /health/data)
│   └── probes/
│       └── postgres.ts                     (new — driver-level "SELECT 1" probe; same shape as the strfry/neo4j probes)
├── test/
│   ├── auth/
│   │   ├── crypto.test.ts                  (new — NIP-49 round-trip, wrong-password failure, XChaCha20 round-trip)
│   │   ├── passwords.test.ts               (new — validation rules + 4096-char max)
│   │   ├── sessions.test.ts                (new — token generation, sha256 storage, lookup, expiry, rotation)
│   │   └── users.test.ts                   (new — schema-conformance, duplicate-email handling)
│   ├── middleware/
│   │   └── errors.test.ts                  (new — sanitizer returns generic shape in prod, includes stack in dev)
│   ├── probes/
│   │   └── postgres.test.ts                (new — supertest-style mocked probe)
│   ├── routes/
│   │   └── auth.test.ts                    (new — supertest against the four endpoints, db mocked; covers signup, login rotation, transactional rollback)
│   └── infrastructure/
│       ├── compose.test.ts                 (modify — assert `db` service present)
│       ├── env-example.test.ts             (modify — assert DATABASE_URL + BACKUP_ENCRYPTION_KEY documented)
│       └── scripts.test.ts                 (modify — assert generate-backup-key.js exists)

apps/web/
├── vite.config.ts                          (modify — proxy /auth/* and /api/* to localhost:8787)
├── src/
│   ├── lib/
│   │   └── api.ts                          (new — small fetch wrapper: api.auth.signup(...), api.auth.login(...), api.auth.logout(), api.auth.me())
│   ├── hooks/
│   │   └── useSession.ts                   (new — React hook backed by /auth/me)
│   ├── routes/
│   │   └── AuthEmailSignup.tsx             (modify — wire form to api.auth.signup)
│   └── components/
│       └── Nav.tsx                         (modify — read useSession; render avatar when signed in)
└── test/
    └── routes/
        └── auth-email-signup.test.tsx      (new — mocks api.auth.signup, asserts form behavior)

docker-compose.yml                          (modify — add `db` service)
.env.example                                (modify — add DATABASE_URL, BACKUP_ENCRYPTION_KEY)
scripts/
└── generate-backup-key.js                  (new — prints a 32-byte hex string)
docs/
└── auth.md                                 (new — start/stop, migrations, sovereignty notes for Tier 2 users)
```

### `users` table

```sql
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    CITEXT NOT NULL UNIQUE,
  display_name             TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
  pubkey_hex               CHAR(64) NOT NULL UNIQUE,
  tier                     TEXT NOT NULL CHECK (tier IN ('custodial', 'sovereign')),
  encrypted_nsec_password  TEXT NOT NULL,    -- NIP-49 ncryptsec1...
  encrypted_nsec_backup    BYTEA NOT NULL,   -- nonce(24) || ct || tag(16), XChaCha20-Poly1305
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

For sovereign (Tier 1) users that cycle 4 will add: both `encrypted_nsec_*` columns are populated with sentinel values or made nullable. The ADR for cycle 4 picks the exact shape. For cycle 3 they are NOT NULL and always populated (since cycle 3 only creates custodial users).

### `sessions` table

```sql
CREATE TABLE sessions (
  id           BYTEA PRIMARY KEY,             -- SHA-256 of the 32-byte cookie token
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
```

The `id` column stores the SHA-256 of the raw 32-byte token; the token itself only exists in the cookie. A leaked database backup or SQL injection exposes hashes, not usable tokens.

### Cryptography call sites

```ts
// apps/api/src/auth/crypto.ts

import { generateSecretKey, getPublicKey, encryptSecretKey, decryptSecretKey }
  from "applesauce-core/helpers/keys";
import { npubEncode } from "nostr-tools/nip19";
import { xchacha20poly1305 } from "@noble/ciphers/chacha";
import { randomBytes } from "node:crypto";

// Generate a fresh keypair for a new custodial user
export function generateCustodialKeypair() {
  const secret = generateSecretKey();
  const pubkeyHex = getPublicKey(secret);
  const npub = npubEncode(pubkeyHex);
  return { secret, pubkeyHex, npub };
}

// Encrypt with the user's password (NIP-49 standard format).
// Returns the bech32 ncryptsec1... string.
export function encryptWithPassword(secret: Uint8Array, password: string): string {
  return encryptSecretKey(secret, password);
}

// Decrypt with the user's password. Throws on AEAD-tag failure.
export function decryptWithPassword(ncryptsec: string, password: string): Uint8Array {
  return decryptSecretKey(ncryptsec, password);
}

// Encrypt with the deployment's backup key (XChaCha20-Poly1305).
// Returns a single Buffer: nonce(24) || ciphertext || tag(16).
export function encryptWithBackupKey(secret: Uint8Array, backupKey: Buffer): Buffer {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(backupKey, nonce).encrypt(secret);
  return Buffer.concat([nonce, ct]);
}

export function decryptWithBackupKey(blob: Buffer, backupKey: Buffer): Uint8Array {
  const nonce = blob.subarray(0, 24);
  const ct = blob.subarray(24);
  return xchacha20poly1305(backupKey, nonce).decrypt(ct);
}
```

All four primitives go through audited libraries. No hand-rolled crypto.

### Session token handling

```ts
// apps/api/src/auth/sessions.ts

import { randomBytes, createHash } from "node:crypto";
import { db } from "../db";
import { sessions } from "../db/schema";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Issue a fresh session. Caller is responsible for setting the cookie
 * with the returned `token`. Returns the plaintext token (cookie value)
 * and the row written to the database.
 */
export async function issueSession(
  tx: typeof db,
  userId: string,
): Promise<{ token: string; row: { id: Buffer; expiresAt: Date } }> {
  const tokenBytes = randomBytes(32);
  const token = tokenBytes.toString("base64url");
  const id = createHash("sha256").update(tokenBytes).digest();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  const [row] = await tx
    .insert(sessions)
    .values({ id, userId, expiresAt })
    .returning({ id: sessions.id, expiresAt: sessions.expiresAt });
  return { token, row };
}

/**
 * Resolve a cookie's token to a live session + user. Returns null if the
 * token is malformed, the row doesn't exist, or the session is expired.
 * Side effect on success: bumps `last_seen_at` and pushes `expires_at`
 * out by the sliding window.
 */
export async function resolveSession(cookieValue: string): Promise<...>;

/** Delete the session row referenced by the cookie's token. */
export async function revokeSession(cookieValue: string): Promise<void>;

/** Delete every session row whose `expires_at` is in the past. */
export async function sweepExpiredSessions(): Promise<number>;
```

`issueSession` is always called inside a `db.transaction(...)` so signup and login are atomic. Login also calls `revokeSession(oldCookie)` first if the request arrived with an existing session cookie — that's the rotation guarantee.

### Wipe behavior

After both encryptions complete in the signup handler, the plaintext `secret` Uint8Array is filled with zeros (`secret.fill(0)`). Node doesn't guarantee this prevents the data from leaking via swap or memory dump, but it raises the cost of any extraction beyond a forensic memory snapshot during the signup-handler window.

### Endpoint contracts

```
POST /auth/signup
Request:  { email, password, displayName }
Validates: email format + length <= 254, password length in [10, 4096],
           displayName length in [1, 100], email not already in users table.
Atomic:   INSERT user + INSERT session inside a single transaction. Rolls
          back on either failure.
On success (201):
  Response body: { user: { id, email, displayName, npub } }
  Headers:       Set-Cookie: session=<base64url-token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000
On validation failure (400):
  Response body: { error: { code: "validation_failed", message, fieldErrors? } }
On duplicate email (409):
  Response body: { error: { code: "email_in_use", message: "An account with this email already exists." } }

POST /auth/login
Request:  { email, password }
Atomic:   Within a single transaction: revoke any existing session referenced
          by the incoming cookie (rotation), then issue a fresh session row.
On success (200):
  Response body: { user: { id, email, displayName, npub } }
  Headers:       Set-Cookie: session=<fresh-base64url-token>
On failure (401):
  Response body: { error: { code: "invalid_credentials", message: "Email or password is incorrect." } }
  (No distinction between "unknown email" and "wrong password" — anti-enumeration.)

POST /auth/logout
Always 204; revokes the session row referenced by the cookie (if any) and
sets `Set-Cookie: session=; Max-Age=0` to clear the cookie.

GET /auth/me
With valid session: 200 { user: { id, email, displayName, npub } } + sliding-window expiry refresh.
Without valid session: 401 { error: { code: "no_session", message: "Not signed in." } }

(All error responses pass through the production error sanitizer; any
uncaught exception returns the generic { code: "internal", ... } 500.)
```

### apps/web wiring

```ts
// apps/web/src/lib/api.ts — thin fetch wrapper
const base = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL;
// In dev the Vite proxy routes /auth/* to localhost:8787, so the base is "".

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.error?.code, body?.error?.message);
  }
  return res.json();
}

export const api = {
  auth: {
    signup: (input) => authFetch<{ user }>("/auth/signup", { method: "POST", body: JSON.stringify(input) }),
    login:  (input) => authFetch<{ user }>("/auth/login",  { method: "POST", body: JSON.stringify(input) }),
    logout: ()      => authFetch<void>   ("/auth/logout", { method: "POST" }),
    me:     ()      => authFetch<{ user }>("/auth/me"),
  },
};
```

```ts
// apps/web/src/hooks/useSession.ts
// React hook backed by /auth/me. Returns { status: "loading" | "signed-in" | "signed-out", user?, refresh }
```

### Vite proxy

```ts
// apps/web/vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5181,
    strictPort: true,
    proxy: {
      "/auth": "http://localhost:8787",
      "/api":  "http://localhost:8787",
    },
  },
});
```

### Production error sanitizer

A terminal Express error middleware mounted after all routes:

```ts
// apps/api/src/middleware/errors.ts

import type { ErrorRequestHandler } from "express";
import { randomBytes } from "node:crypto";

export const errorSanitizer: ErrorRequestHandler = (err, _req, res, _next) => {
  const requestId = randomBytes(8).toString("hex");
  // Structured log for the operator (cycle 5 swaps console for pino).
  // eslint-disable-next-line no-console
  console.error(`[${requestId}]`, err);

  const isDev = process.env.NODE_ENV !== "production";
  res.status(500).json({
    error: {
      code: "internal",
      message: "An unexpected error occurred.",
      requestId,
      ...(isDev && { stack: err instanceof Error ? err.stack : String(err) }),
    },
  });
};
```

Mounted last in `apps/api/src/index.ts`. Any uncaught throw inside a route handler bubbles up; the sanitizer returns the generic shape with a request ID so the operator can correlate the response to a server-side log entry. Stack traces only appear in dev.

This replaces Express's default error handler — which returns the raw stack trace as the response body, exposing library versions, file paths, and internal logic to anyone who can trigger an error.

### Order of operations for the Implementer

Stub source first (per the TDD pattern from cycles 1 + 2), so the Tester's tests fail at assertion level rather than import level.

1. Add the 5 new `apps/api` dependencies and install.
2. Add `drizzle.config.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/db/migrations/0001_initial.sql`, `apps/api/src/db/index.ts` (stubs).
3. Add `apps/api/src/auth/{crypto,passwords,sessions,users}.ts` (stubs).
4. Add `apps/api/src/probes/postgres.ts` (stub).
5. Add `apps/api/src/routes/auth.ts` (stub).
6. Add config fields (`databaseUrl`, `backupEncryptionKey`) to `apps/api/src/config.ts`.
7. Hand off to Tester.

Implementation (after tests are committed):

1. Implement `db/index.ts` to connect via postgres.js and run pending migrations on startup.
2. Implement `auth/crypto.ts` (4 helpers + generateCustodialKeypair).
3. Implement `auth/passwords.ts` (validation + normalization).
4. Implement `auth/users.ts` (find/create/get queries via Drizzle).
5. Implement `auth/sessions.ts` (token generation, lookup, expiry refresh).
6. Implement `routes/auth.ts` (the four endpoints).
7. Implement `probes/postgres.ts`.
8. Wire everything in `index.ts`.
9. Update `docker-compose.yml` for the `db` service.
10. Update `.env.example` and add `scripts/generate-backup-key.js`.
11. Add `apps/web` proxy + `lib/api.ts` + `hooks/useSession.ts` + `AuthEmailSignup.tsx` wiring + `Nav.tsx` swap.
12. Run gates.

## Deferred concerns — captured here so the next story finds them

Each item is deferred for an explicit reason. None is the kind of cut where "we'll get to it eventually" — every entry below either has a natural home in a downstream cycle that's already on the roadmap, or is an additive feature whose absence doesn't compromise the security or correctness of what cycle 3 ships.

**`__Host-` cookie prefix in production.** Requires HTTPS, the `Secure` flag, no `Domain` attribute, and `Path=/`. We can't set it in dev because we don't have HTTPS on localhost. Lands cleanly in **cycle 5** (the deploy story) when nginx + Let's Encrypt + the production cookie config arrive together. Until then we use a plain `session` cookie name with `Secure` toggled by `NODE_ENV`.

**Common-password check (haveibeenpwned API or a static top-10K list).** NIST 800-63B *recommends* (does not *require*) checking submitted passwords against a known-leaked list. The minimum-length floor in cycle 3 already eliminates the worst quartile of bad passwords (no `12345`, no `password`). A future story can add either the k-anonymity haveibeenpwned API integration or a bundled top-10K list with minimal risk; it doesn't change any schema or wire shape.

**Rate limiting on `/auth/login` and `/auth/signup`.** Naive password-guessing attacks aren't mitigated by anything in cycle 3 — SameSite + opaque tokens make the cookie unstealable but don't slow down brute-force attempts. Belongs at the reverse-proxy layer (nginx with the limit_req module) where it's most effective. Lands with **cycle 5** alongside the production reverse proxy. Recommended floors when it lands: 5 login attempts per email per 15 minutes; 3 signups per IP per hour.

**Explicit CSRF tokens.** SameSite=Lax plus POST-only state-changing endpoints is the cycle 3 attack surface. When **cycle 4** introduces the publish path (rate a book, tag a book, etc.), the user-driven state-change surface grows; that's when explicit CSRF tokens become the right hardening. A `csrfToken` field on `/auth/me` plus an `X-CSRF-Token` header requirement on POSTs is the canonical pattern.

**Structured logger (pino).** apps/api still uses `console.log` for startup and `console.error` for the production error sanitizer. Production needs structured logs with request IDs, severity levels, and machine-parseable output for monitoring. Belongs with **cycle 5** alongside the deploy story; the deploy story is also when log destinations (stdout to journald, or a hosted aggregator) are decided. The error sanitizer's `console.error(\`[\${requestId}]\`, err)` becomes `logger.error({ requestId, err })` at that point.

**`updated_at` column on `users`.** Adding it costs nothing today but doesn't have a current consumer (no audit logging, no cache invalidation, no edit flow). Cheaper to add the column when we first have a need for it (probably cycle 4 when the publish path may want to track "last write time" per user, or a later settings/profile story). Migration when motivated, not before.

**Session sweeper.** The `sessions` table grows monotonically until expired rows are deleted. Reads filter out expired sessions, so correctness isn't affected. Eventually the table accumulates dead rows; a periodic `DELETE FROM sessions WHERE expires_at < NOW()` (every 6 hours) lands either as a small startup task in `apps/api` or as a tiny follow-up story. Acceptable storage cost in the near term — a row is ~120 bytes; even 100K dead rows is 12MB.

**Backup key rotation.** `BACKUP_ENCRYPTION_KEY` rotation requires re-encrypting every existing `encrypted_nsec_backup`. The current design has no rotation primitive. Rotation cadence in similar systems is one to three years; the primitive lives in a dedicated migration story when the time comes.

**Sovereign user creation path.** **Cycle 4** adds Tier 1 NIP-07 backend. The `users` schema as designed has the `tier` column ready and the `encrypted_nsec_*` columns as NOT NULL. Cycle 4's ADR decides whether to make them nullable for sovereign users or to store sentinel values (e.g., empty-string ncryptsec, all-zero backup blob with a known sentinel nonce). Either works; flagged here so cycle 4 finds the seam without re-discovering it.

**Password reset flow.** Requires email infrastructure (SMTP / SES / Postmark). PRD §8.4 prescribes the cryptographic shape: backup key decrypts the existing nsec, re-encrypt under the new password-derived key, update `encrypted_nsec_password`. The flow itself is a later story once the deployment exists and an email provider is selected.

**Nsec export from Settings.** The Tier 2 → Tier 1 upgrade path PRD §5.7 describes. One new Settings page that re-prompts for the password, decrypts the nsec, shows it with copy-to-clipboard and an "I have stored this safely" confirmation. Lands after cycle 4's signing path so users can immediately switch to NIP-07 signing.

## PRD amendments tracked for post-closeout

Both pinned in the story's "Post-closeout actions" section and tracked in the Reviewer's close-out checklist:

1. **PRD §8.1** — replace Argon2id with the NIP-49 scrypt design.
2. **PRD §8.2** — replace "decrypted private key is held in server memory for the duration of the session" with the ephemeral-wrap pattern (cycle 4 will implement it; cycle 3 just confirms the design).

Reviewer confirms wordings with the user before committing the PRD edit.

## Out of scope

(Same as the story.) NIP-07 backend, server-side signing, password reset, email verification, nsec export UI, OAuth, account deletion, avatar upload, rate limiting, CSRF tokens. The boundary is "identity, not agency."
