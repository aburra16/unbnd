# Review: Story 5b — Custodial server-side signing

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Diff:** `git diff main..HEAD` on `cycle-5b-custodial-signing` (ADR 0006 → failing tests → impl → review fix).

## Quality gates (run by reviewer)

- [x] `pnpm -r typecheck` — pass.
- [x] `pnpm -r test` — pass: schemas 69, api 176 (+10 skipped), web 20.
- [x] `pnpm --filter @unbnd/web build` + `pnpm --filter @unbnd/api build` — pass.

## Spec adherence

- [x] **AC-1** login decrypt→wrap→wipe: `index.ts` login captures `secret = decryptWithPassword(...)`, issues the session, `rememberSessionKey(tokenToId(token).hex, secret)`, and `secret.fill(0)` in a `finally`. No plaintext retained past the wrap.
- [x] **AC-2** custodial submit → server-sign → publish: `routes/ratings.ts` branches on `tier === "custodial"`, builds the template, `custodialSign`s, publishes. Covered by `ratings-custodial.test.ts` (200 + publish called).
- [x] **AC-3** key only via the wrap, wiped after sign: `useSessionKey` unwraps into a fresh buffer, runs `fn`, wipes in `finally`. `ephemeral.test.ts` asserts the round-trip and that the buffer is zeroed afterward.
- [x] **AC-4** restart/evicted → fail closed: `useSessionKey` throws `NoSessionKeyError` when absent; `custodialSign` maps that to `null`; the route returns **401 `reauth_required`** (never an unsigned publish). `ratings-custodial.test.ts` covers the null→401 path; `ephemeral.test.ts` covers `NoSessionKeyError` + evict.
- [x] **AC-5** audited signer, real pubkey, no impersonation: signing is `finalizeEvent` (nostr-tools/pure). The server signs with *that session's* key, so the event carries the custodial user's own pubkey — a user cannot publish as anyone else.
- [x] **AC-6** re-rate replaces; read-back includes custodial: same `buildRatingTemplate` + d-tag as 5a; read-back is the shared `summarizeRatings`. Custodial and sovereign ratings are indistinguishable downstream.
- [x] **AC-7** web control for custodial, no prompt: `RatingControl` now renders the star control for any signed-in user; custodial submits via `api.ratings.submitCustodial` with no extension. `rating-control-custodial.test.tsx` asserts `submitCustodial` is called and `signEvent`/`template`/sovereign-`submit` are not. The obsolete 5a placeholder test was updated.
- [x] **AC-8** DB leak exposes no usable key: at rest the nsec stays NIP-49 + backup-key encrypted (cycle-3, untouched); the ephemeral wrap lives only in process memory. `ephemeral.test.ts` "does not store the raw plaintext" confirms the in-memory value is encrypted, not the caller's buffer.

## ADR adherence

- [x] Option A implemented exactly: process-local random key (lazy, never persisted/exported), `Map<sessionIdHex, nonce||ct||tag>`, XChaCha20-Poly1305 (the cycle-3 `@noble/ciphers` stack). Restart → fresh key + empty map → fail closed.
- [x] One `POST /api/ratings` branched by `tier`; sovereign path unchanged (its 10 tests still green).
- [x] Login-wrap / logout-evict / `custodialSign` = `useSessionKey` + `finalizeEvent`, as the ADR's implementation notes specified.

## Things tests can't catch

- [x] **No hand-rolled crypto** — `ephemeral.ts` uses `@noble/ciphers` XChaCha20-Poly1305 + `node:crypto.randomBytes`; signing via `finalizeEvent`. (grep clean.)
- [x] **Plaintext wiped** in both the login path and `useSessionKey` (`finally` blocks).
- [x] **No secret logging** (grep for console.* of secret/nsec/password/key → none).
- [x] **Process-local key never exported**; the `Map` and key are module-private.
- [N] **Rotation hygiene (fixed during review):** a re-login revokes the old session but previously left its wrapped key orphaned in the map. Added `forgetSessionKey(rotated cookie)` in the login rotation path.

## Findings

### Blocking
None.

### Non-blocking
1. **No expiry sweeper for the in-memory map.** Entries are evicted on logout and on re-login rotation, but a session that simply expires (30-day TTL) leaves its wrapped key in memory until process restart. The ADR noted "ride the session sweeper"; that sweeper isn't wired yet. Low risk (bounded by active custodial sessions; restart clears it), but worth a follow-up when the session sweeper lands.
2. **Login-wrap full path + true process-restart-forces-relogin** are verified at the unit level (the `null` fail-closed path) and need the staging E2E (a real email signup → rate, then a container restart → rate fails with reauth) to confirm end to end — same posture as 5a's live verification. I'll run the email-rate E2E on staging after merge.

## Verdict
**PASS.** All eight ACs are satisfied by passing tests; crypto is audited-stack only; plaintext is wiped on every path; fail-closed on a missing key is enforced and tested. One rotation-hygiene gap fixed during review; one non-blocking follow-up (expiry sweeper) noted. Both rating tiers now work through one endpoint and one read-back.
