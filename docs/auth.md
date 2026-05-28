# Authentication — custodial (Tier 2)

Unbnd's MVP auth has three tiers (PRD §5.7). This document covers the Tier 2
custodial email/password flow shipped in cycle 3. Tier 1 (NIP-07 sovereign)
and the server-side signing path land in cycle 4.

## What "custodial" means here

A custodial user signs up with email + password. Behind the scenes Unbnd
generates a nostr keypair and stores the private key encrypted at rest, twice:

- **`encrypted_nsec_password`** — NIP-49 (scrypt + ChaCha20-Poly1305) keyed off
  the user's password. Unbnd cannot decrypt this without the password.
- **`encrypted_nsec_backup`** — XChaCha20-Poly1305 keyed off the deployment's
  `BACKUP_ENCRYPTION_KEY`. Exists solely so a password reset can recover the
  key (PRD §8.4). It is the one place the server can decrypt the nsec, which is
  the sovereignty tradeoff a custodial user accepts. The cure is the Tier 2 →
  Tier 1 upgrade: export the nsec and switch to NIP-07, where the server never
  holds the key.

All cryptography goes through the audited stack (Applesauce / nostr-tools /
@noble) per the project's Cryptographic library policy. No hand-rolled crypto.

## One-time setup

Generate the deployment backup key and add it to `.env`:

```
node scripts/generate-backup-key.js
```

Bring up Postgres (part of the data-layer stack):

```
docker compose up -d db
```

Migrations run automatically when `apps/api` starts; they are idempotent.

## Endpoints

| Method + path | Purpose |
|---|---|
| `POST /auth/signup` | Create a custodial account. Body `{ email, password, displayName }`. Sets a session cookie. |
| `POST /auth/login` | Authenticate. Body `{ email, password }`. Rotates the session. |
| `POST /auth/logout` | Revoke the current session and clear the cookie. |
| `GET /auth/me` | Return the signed-in user, or 401. |

The user object returned by every endpoint carries the **npub** (bech32), never
the raw hex pubkey.

## Sessions

The session cookie holds a random 32-byte token (base64url). The database
stores only `SHA-256(token)`, so a leaked database backup exposes hashes, not
usable sessions. Cookies are `HttpOnly`, `SameSite=Lax`, `Secure` in
production. Sessions slide forward 30 days on each use; logging in rotates to a
fresh token.

## Running the tests

Hermetic suites run with no database:

```
pnpm --filter @unbnd/api test
```

The real-Postgres integration suite is gated on `DATABASE_URL`:

```
docker compose up -d db
DATABASE_URL=postgres://unbnd:unbnd-local-dev@localhost:5432/unbnd \
  pnpm --filter @unbnd/api test
```

## Deferred (see ADR 0003)

Password reset (needs email infra), rate limiting (reverse-proxy layer, cycle
5), explicit CSRF tokens (cycle 4 publish path), nsec export UI, the `__Host-`
cookie prefix (needs HTTPS, cycle 5), and the session sweeper.
