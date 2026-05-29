# ADR 0006: Custodial server-side signing (session-scoped ephemeral wrap)

**Status:** Accepted
**Date:** 2026-05-28
**Story:** `engineering-team/stories/done/5b-custodial-server-signing.md`

## Context

Story 5a gave sovereign (Tier 1) users a full rating write path. Custodial (Tier 2 email) users cannot client-sign — their key lives encrypted in `users` (NIP-49 under the password + XChaCha20-Poly1305 under the deployment backup key, ADR 0003). Story 5b lets the **server** sign a rating for a custodial user without weakening that posture, reusing the 5a `buildRatingTemplate` + `publishEvent` core with only the signing step swapped.

The mechanism is fixed by **PRD §8.2** (strictened at the cycle-3 close-out): *the decrypted private key is never persisted across requests; the signing path re-encrypts the nsec under a process-local ephemeral key for the session window; a process restart invalidates all such wrappings and forces re-login; no plaintext key is written to disk or held across a restart.*

### What already exists

- `auth/crypto.ts`: `decryptWithPassword(ncryptsec, password) → Uint8Array` (NIP-49, throws on wrong password), `encryptWithBackupKey`/`decryptWithBackupKey` (XChaCha20-Poly1305, `nonce(24)||ct||tag`). The same `@noble/ciphers` primitive is the natural fit for the ephemeral wrap.
- `auth/sessions.ts`: `issueSession(tx, userId) → {token, expiresAt}`; `tokenToId(token) → Buffer` (SHA-256); `resolveSession(cookie) → {session, user}` where `session.id` is that SHA-256 buffer. So a request can always recover its session id from the cookie.
- `index.ts` custodial login: today it `decryptWithPassword(...)` **only to verify the password, then discards** the plaintext, and issues a session. 5b extends exactly this point: keep the verified plaintext just long enough to wrap it.
- 5a (ADR 0005): `buildRatingTemplate(config, {raterPubkey, …}, createdAt) → NostrEventTemplate`, `validateSignedRating`, `summarizeRatings`, `publishEvent`, `queryEvents`, and `POST /api/ratings` (currently sovereign-only: expects a client-signed `{event}`).

### CLAUDE.md / PRD invariants

- **No plaintext key across requests or on disk** (PRD §8.2). The login-time plaintext is wiped after wrapping; the per-write plaintext is wiped after signing.
- **DB leak exposes no usable key** (PRD §8.3, cycle-3 invariant): at rest the nsec stays NIP-49 + backup-key encrypted; the ephemeral wrap lives only in process memory.
- **No hand-rolled crypto**: reuse `@noble/ciphers` XChaCha20-Poly1305 (the cycle-3 stack) for the wrap; sign via `nostr-tools/pure.finalizeEvent` (the audited signer, same lib as `verifyEvent`).
- **Fail closed**: if the wrap is gone (restart/eviction), a write does not silently produce an unsigned event — it returns a re-auth signal.

## Options considered

The pivot: **how is the custodial signing key held between login and a write?**

### Option A — In-memory, session-scoped, ephemeral-wrapped key store (the §8.2 design)

A process-local random 32-byte **ephemeral key** is generated once at startup and never persisted. At custodial login, after the password verifies, the server decrypts the nsec once, re-encrypts it under the ephemeral key (XChaCha20-Poly1305), stores the ciphertext in an in-memory `Map<sessionId, Buffer>` keyed by the session id (`tokenToId(token)`), and wipes the plaintext. On a custodial write, the server unwraps that session's ciphertext in memory, signs the template, wipes the plaintext, and publishes. Logout / session expiry evicts the entry. Restart drops both the ephemeral key and the Map → all custodial sessions must re-login before they can sign.

**Pros**
- Implements PRD §8.2 verbatim. A heap dump yields ciphertext, not keys, unless the attacker also captures the ephemeral key — strictly better than holding plaintext.
- Reuses the cycle-3 `@noble/ciphers` wrap and the existing session-id derivation; no new dependency, no schema change, no disk writes.
- The write core is shared with 5a; only the signer differs (`finalizeEvent` with the unwrapped key vs validating a client-signed event).

**Cons**
- Single-process only: a restart forces custodial re-login (accepted by §8.2). No multi-process/clustered key sharing (explicitly out of scope).
- A second in-memory store to bound by session lifetime (evict on logout/expiry; ride the session sweeper).

### Option B — Hold the raw plaintext nsec in memory per session (no wrap)

Same Map, but store the plaintext `Uint8Array` directly.

**Pros**: simpler; one less encrypt/decrypt per request.
**Cons**: **violates PRD §8.2's explicit "re-encrypts under a process-local ephemeral key."** A heap dump yields live keys for every signed-in custodial user. The wrap is cheap; skipping it trades the one defense §8.2 mandates for a negligible saving. Rejected.

### Option C — Re-derive the key from the password on every write

Don't retain anything; prompt for the password (or keep it) per write.
**Cons**: the password isn't available after login without storing it (worse than the key), or it means a password prompt on every rating — unacceptable UX and a bigger secret to hold. Rejected.

## Decision

**Option A.** It is the design PRD §8.2 specifies, reuses the audited cycle-3 crypto, and slots into the 5a core by swapping only the signing step.

### Specifics

1. **`auth/ephemeral.ts` (new) — the session key store.**
   - Module-local `ephemeralKey: Buffer` = `randomBytes(32)`, created lazily on first use, never exported, never persisted.
   - `store: Map<string, Buffer>` keyed by **session-id hex** (`tokenToId(token).toString("hex")`).
   - `rememberSessionKey(sessionIdHex, secret)`: wrap `secret` with the ephemeral key (XChaCha20-Poly1305, `nonce||ct||tag`), store the blob. Caller wipes the plaintext after.
   - `useSessionKey(sessionIdHex, fn)`: unwrap into a `Uint8Array`, invoke `fn(secret)`, then wipe the plaintext in a `finally` (even on throw). Returns `fn`'s result, or throws `NoSessionKeyError` if absent.
   - `forgetSessionKey(sessionIdHex)`: evict (logout / sweep).
   - Pure-ish and unit-testable: inject or expose the key for tests, or test wrap→unwrap round-trip + eviction + missing-key behavior.

2. **Login wiring (`index.ts`).** In the custodial branch, after `decryptWithPassword` succeeds and `issueSession` returns `{token}`: `rememberSessionKey(tokenToId(token).toString("hex"), secret)`, then `secret.fill(0)`. Sovereign login is untouched (no wrap). Password-verify still happens exactly as in cycle 3.

3. **Write dispatch (`routes/ratings.ts`, `POST /api/ratings`).** Branch on the session user's `tier`:
   - **sovereign** → unchanged 5a path (`{event}` body → `validateSignedRating` → publish).
   - **custodial** → body is a rating intent `{bookSlug, score, reviewText?, reviewDate}`. `buildRatingTemplate(config, {raterPubkey: user.pubkeyHex, …}, now)` → `useSessionKey(sessionIdHex, (secret) => finalizeEvent(template, secret))` → `publishEvent`. If `useSessionKey` throws `NoSessionKeyError` (post-restart / evicted) → **401 `reauth_required`** (fail closed; never publish unsigned). The router gains a `sign` dep (DI) wrapping `useSessionKey`+`finalizeEvent` so the route suite stays hermetic.
   - The route resolves `sessionIdHex` from the cookie (`tokenToId`); `RatingsDeps.sessionUser` already returns `tier`, and we extend it (or add a sibling dep) to surface the session id.

4. **Logout (`index.ts`).** `revokeSession` also calls `forgetSessionKey(tokenToId(cookie).toString("hex"))`.

5. **Web (`RatingControl`).** Remove the custodial placeholder. For a custodial session (`user.email !== null`), render the same star control; on submit, call a new `api.ratings.submitCustodial({bookSlug, score, …})` (no `signEvent`, no extension). On a `reauth_required` 401, show a "please sign in again" message.

6. **Signing artifact parity.** The server-built template is identical to the one a sovereign client would sign (same `buildRatingTemplate`), so a custodial rating is indistinguishable on the wire from a sovereign one except for the signing key — read-back (`summarizeRatings`) treats both uniformly. Re-rating replaces (same d-tag).

## Consequences

- **Enables** custodial users to rate; both tiers now write through one endpoint and one read-back. The ephemeral-wrap store is reusable for future custodial writes (tags, shelves, follows).
- **Constrains:** single-process; restart forces custodial re-login (per §8.2). The in-memory store grows with active custodial sessions; bound it by evicting on logout and riding the session sweeper for expiry.
- **Security note:** the ephemeral key in memory is the trust anchor — a full process compromise that reads both the Map and the key recovers keys, same as any server that can sign. This is the accepted custodial tradeoff (PRD §8.3); sovereign users avoid it entirely.
- **Affects existing fixtures?** No new Config fields. Route-test deps gain a `sign` function + session-id surface (test-only wiring). No schema change.
- **New dependency?** No — `@noble/ciphers`, `nostr-tools`, existing session helpers.
- **PRD change required?** No. This implements §8.2 as written.

## Implementation notes

- Files: `auth/ephemeral.ts` (new); `index.ts` (login wrap + logout evict + ratings `sign` dep); `routes/ratings.ts` (tier branch + `reauth_required`); `auth/sessions.ts` or the ratings deps (surface session-id hex to the route); web `lib/api.ts` (`submitCustodial`) + `RatingControl` (drop placeholder, custodial submit).
- Reuse `finalizeEvent` from `nostr-tools/pure` for signing; do **not** hand-roll. Wrap/unwrap via `@noble/ciphers` XChaCha20-Poly1305, mirroring `encryptWithBackupKey`.
- Always wipe plaintext (`secret.fill(0)`) in a `finally` after signing and after login-wrap.
- DList shapes unchanged from 5a (kind 39999, same d-tag / json tag / parent header).

## Out of scope

Multi-process / clustered key sharing (Redis); OAuth custodial (server-managed key) tier; tags / shelves / follows writes; rate limiting (cycle 5); GrapeRank. A password-change flow re-wrapping the in-memory key is unnecessary (re-login re-wraps).
