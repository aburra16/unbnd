# ADR 0004: NIP-07 sovereign login backend

**Status:** Accepted
**Date:** 2026-05-28
**Story:** `engineering-team/stories/4-nip07-sovereign-login.md`

## Context

Story 4 makes Tier 1 sovereign login real: the server proves a user controls the private key behind a claimed pubkey via a signed challenge, then issues a session — without ever seeing the key. Extends the ADR 0003 auth foundation (Postgres, opaque hashed sessions, the `users` table).

### Tapestry prior-art survey

Tapestry's `src/middleware/auth.js` (concept-graph): server generates a random challenge, stores it on the express-session, the client signs an event carrying a `["challenge", nonce]` tag, the server checks the event's pubkey matches and the challenge tag is present. **Critical weakness we must not crib:** the handler's own comment says "In a production environment, you would want to use a proper Nostr library for verification" — it does **not** cryptographically verify the signature. It only checks pubkey-equality and tag-presence, which any attacker can forge. We take the challenge/verify *shape* and add real signature verification.

Two further departures: (1) Tapestry gates on owner-pubkey only; Unbnd accepts any valid pubkey. (2) Tapestry stores the challenge on an in-memory express-session; we use opaque cookie sessions issued only *after* verify, so the challenge must live in Postgres, keyed by pubkey, before any session exists.

### Verified facts (run against the installed libs)

- `nostr-tools/pure.verifyEvent(event)` returns true for an honest event and **false** for a tampered pubkey or tampered content, when given a wire-realistic (JSON-parsed) object. Confirmed.
- **Landmine:** nostr-tools memoizes verification via a `verifiedSymbol` property. If you `verifyEvent` an in-memory event and then object-spread it (`{...evt, pubkey: other}`), the memo carries over and `verifyEvent` returns a false "valid" without re-checking. Over the wire this cannot happen (JSON has no symbols), but the Implementer must **verify only the freshly-parsed request body** and never a spread/derived copy. The Tester covers tampered-pubkey and tampered-content via JSON round-trip.
- NIP-42 auth events are `kind: 22242` with a `["challenge", <nonce>]` tag; they sign and verify cleanly. Confirmed.

### CLAUDE.md invariants

- **Crypto policy.** Signature verification via `nostr-tools/pure.verifyEvent`. No hand-rolled schnorr/secp.
- **No key on the server.** The verify endpoint receives only a signed event (pubkey, sig, content, tags) — never a secret. AC-9.
- **Bridging principle / npub.** The returned `user` carries `npub`; a fresh sovereign user's default display name is a truncated npub, never raw hex.
- **POV-first / decentralized-first.** Any valid pubkey may authenticate; no owner gate, no allowlist.

## Options considered

### Option A — NIP-42 kind-22242 signed challenge; Postgres `challenges` table; nullable encrypted-nsec columns with a tier CHECK

The client signs a NIP-42 event (`kind 22242`, tags `[["challenge", nonce], ["relay", <origin>]]`, empty content). The server verifies the signature, the challenge binding, single-use, and expiry, then creates/loads a sovereign user and issues a session. Challenges live in a `challenges` table. Sovereign users are stored in the existing `users` table with the encrypted-nsec columns made nullable and a CHECK enforcing the tier invariant.

**Pros**
- NIP-42 is the nostr standard for auth-by-signature; the signed artifact is conventional and a future relay-auth use can reuse it.
- One `users` table for both tiers keeps `/auth/me`, sessions, and the future write path uniform.
- The CHECK constraint makes "custodial ⇒ has encrypted key; sovereign ⇒ has none" a database invariant, not a convention.
- Challenge-in-Postgres matches the sessions pattern (durable across restarts, sweepable), needs no new infra.

**Cons**
- Adds a `challenges` table + a migration that alters `users`.
- A migration that drops NOT NULL on two columns must be written carefully so existing custodial rows are untouched.

### Option B — Bespoke challenge (opaque string signed as content); challenge in-memory; separate `sovereign_identities` table

Client signs the raw nonce string as event content (custom kind). Challenge held in a `Map` with a timer. Sovereign identity in its own table joined to a shared identity row.

**Pros**
- No schema alteration of `users` (separate table).
- Slightly less to verify (no tag parsing).

**Cons**
- Non-standard signing artifact; throws away NIP-42 interop.
- In-memory challenge store loses challenges on restart and doesn't survive multi-process — re-introduces the very fragility we moved away from for sessions.
- A separate identity table forks `/auth/me`, session resolution, and the write path into two code paths. More surface, more drift.

## Decision

**Option A.**

1. **Signing artifact:** NIP-42 `kind 22242`, tags `[["challenge", <nonce>], ["relay", config.publicOrigin]]`, `content: ""`, signed by the user's extension.
2. **`challenges` table:** `(pubkey CHAR(64), nonce TEXT, expires_at TIMESTAMPTZ, consumed_at TIMESTAMPTZ NULL)`, PK `(pubkey, nonce)`. 5-minute expiry. Single-use: `consumed_at` set transactionally on successful verify. Indexed on `expires_at` for sweeping.
3. **Verify pipeline** (all must pass, else generic 401):
   a. `verifyEvent(event)` on the freshly-parsed body — valid signature + id integrity (catches tampered pubkey/content).
   b. `event.kind === 22242`.
   c. `event.created_at` within a clock-skew window (±10 min) — defense in depth.
   d. extract the `challenge` tag value; look up `(event.pubkey, nonce)` in `challenges`; must exist, not expired, not consumed.
   e. transactionally: mark the challenge consumed, create-or-load the sovereign user, issue the session.
4. **Sovereign schema (migration 0002):** `ALTER TABLE users ALTER COLUMN encrypted_nsec_password DROP NOT NULL` (and `_backup`), plus `ADD CONSTRAINT users_tier_key_material CHECK ((tier = 'custodial' AND encrypted_nsec_password IS NOT NULL AND encrypted_nsec_backup IS NOT NULL) OR (tier = 'sovereign' AND encrypted_nsec_password IS NULL AND encrypted_nsec_backup IS NULL))`. Existing custodial rows satisfy the first branch untouched.
5. **`createOrLoadSovereignUser(tx, pubkeyHex)`:** find by `pubkey_hex`; if present, return it; else insert `tier='sovereign'`, both encrypted columns NULL, `display_name` = a truncated npub (`npub1abcd…wxyz`, ~16 visible chars). kind-0 profile enrichment (real display name/avatar from relays) is deferred.
6. **Custodial login guard:** with the columns now nullable, `findUserByEmail` can return a row whose `encrypted_nsec_password` is null only if a sovereign somehow had an email (it can't — sovereign rows have no email). Defensive: `login` treats a null password column as "not a custodial account" → 401. Keeps the type honest (`string | null`) and the path safe.
7. **Sessions reused:** `createOrLoadSovereignUser` + `issueSession` run in one transaction; the cookie is set exactly as for custodial login.

## Consequences

**Enables**
- Both tiers authenticate; story 5's write path treats a session uniformly (custodial → server signs; sovereign → client signs, server relays).
- The `challenges` table + sweep is a reusable pattern if other signed-challenge flows appear.

**Constrains / makes harder**
- `UserRow.encryptedNsecPassword` / `_backup` become `string | null`. The cycle-3 custodial code that reads them must guard for null (only the login path does; handled by decision #6).
- The tier CHECK means any future tier (none planned) needs a CHECK amendment.

**Affects existing fixtures?** No.
**New dependencies?** None — `nostr-tools` is already present (cycle 2 crypto policy).
**PRD change required?** No. PRD §5.7/§8.1 already describe Tier 1 NIP-07 + NIP-98/challenge sessions; this implements them.

## Implementation notes

### File layout
```
apps/api/src/
  db/
    schema.ts                  (modify — encrypted cols nullable; add challenges table)
    migrations.ts              (modify — add 0002_sovereign_and_challenges)
  auth/
    challenges.ts              (new — issueChallenge, consumeChallenge, sweepExpiredChallenges)
    nostr.ts                   (new — verifySignedChallenge(event, expected): result)
    users.ts                   (modify — createOrLoadSovereignUser; null-guard helpers)
  routes/auth.ts               (modify — POST /auth/nostr/challenge, /auth/nostr/verify; extend AuthDeps)
  index.ts                     (modify — wire the two deps; add config.publicOrigin)
  config.ts                    (modify — PUBLIC_ORIGIN with default http://localhost:5181)
apps/web/src/
  lib/api.ts                   (modify — api.auth.nostr.challenge / verify)
  routes/AuthNostrConnect.tsx  (modify — real challenge→sign→verify→navigate)
apps/api/test/...              (Tester)
```

### `challenges` (migration 0002)
```sql
CREATE TABLE IF NOT EXISTS challenges (
  pubkey      CHAR(64) NOT NULL,
  nonce       TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (pubkey, nonce)
);
CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON challenges(expires_at);

ALTER TABLE users ALTER COLUMN encrypted_nsec_password DROP NOT NULL;
ALTER TABLE users ALTER COLUMN encrypted_nsec_backup   DROP NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_tier_key_material CHECK (
  (tier = 'custodial' AND encrypted_nsec_password IS NOT NULL AND encrypted_nsec_backup IS NOT NULL)
  OR
  (tier = 'sovereign' AND encrypted_nsec_password IS NULL AND encrypted_nsec_backup IS NULL)
);
```
Idempotent: `ADD CONSTRAINT` is not `IF NOT EXISTS` in Postgres, so guard it (catch duplicate_object, or `DO $$ ... $$` with a pg_constraint check). The Implementer wraps it so re-running migrations is safe.

### `auth/nostr.ts`
```ts
import { verifyEvent } from "nostr-tools/pure";
export type ChallengeVerification =
  | { ok: true; pubkey: string; challenge: string }
  | { ok: false; reason: string };
// Receives the raw parsed body. NEVER a spread/derived object (verifiedSymbol landmine).
export function verifySignedChallenge(event: unknown, maxSkewSec = 600): ChallengeVerification;
```
Checks, in order: shape (kind 22242, pubkey 64-hex, sig present), `verifyEvent`, created_at skew, presence of a `challenge` tag. Returns the pubkey + challenge for the route to match against the table. Does NOT touch the db (pure-ish; testable hermetically with a fixture keypair).

### Route shape
```
POST /auth/nostr/challenge   body { pubkey }            -> 200 { challenge }      | 400 invalid_pubkey
POST /auth/nostr/verify      body { event }             -> 200 { user } + cookie  | 401 invalid_signature
```
401 message is generic ("Could not verify your signature."). Both endpoints go through the cycle-3 error sanitizer.

### apps/web flow (AuthNostrConnect)
On confirm: `pubkey = await window.nostr.getPublicKey()` → `{challenge} = api.auth.nostr.challenge(pubkey)` → build `{kind:22242, created_at, tags:[["challenge",challenge],["relay",origin]], content:""}` → `signed = await window.nostr.signEvent(evt)` → `api.auth.nostr.verify(signed)` → navigate `/auth/welcome`. Extension-missing and user-rejection reuse the existing states. The `npubEncode` for display is server-side; the client just posts hex.

### Test surface (for the Tester)
- `nostr.ts` unit: honest signed challenge passes; tampered pubkey fails; tampered content fails; wrong kind fails; stale created_at fails; missing challenge tag fails. Use a fixture keypair + JSON round-trip to dodge the verifiedSymbol memo.
- `challenges` integration: issue → consume marks consumed; second consume fails; expired fails; sweep removes expired.
- route (mocked deps): challenge 200/400; verify 200+cookie / 401; returning user dedup.
- web: AuthNostrConnect calls getPublicKey→challenge→signEvent→verify→navigate; rejection path shows cancel state.

## Out of scope
The write path (story 5), NIP-46 bunker, custodial→sovereign upgrade, kind-0 profile enrichment, GrapeRank, rate limiting (cycle 5).

## Deferred concerns
- **kind-0 profile enrichment.** Fresh sovereign users get a truncated-npub display name; pulling their real name/avatar from relays is a later story.
- **Challenge sweeper.** Same as the session sweeper — a periodic delete; ride the same future job.
- **Rate limiting** on challenge/verify — reverse-proxy layer, cycle 5.
