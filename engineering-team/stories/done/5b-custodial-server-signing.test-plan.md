# Test Plan: Story 5b — Custodial server-side signing

**Story:** `engineering-team/stories/done/5b-custodial-server-signing.md`
**ADR:** `engineering-team/decisions/0006-custodial-server-signing.md`
**Date:** 2026-05-29

## Coverage map

| AC | Test file | Level |
|---|---|---|
| AC-1 login decrypt→wrap, plaintext wiped | `auth/ephemeral.test.ts` (wrap/wipe) + integration (login wiring) | unit |
| AC-2 custodial submit → server-sign → publish | `routes/ratings-custodial.test.ts` | component |
| AC-3 key only via the session wrap; wiped after sign | `auth/ephemeral.test.ts` (round-trip + wipe) | unit |
| AC-4 restart → no wrap → fail closed (reauth) | `routes/ratings-custodial.test.ts` (custodialSign → null → 401) + `ephemeral.test.ts` (NoSessionKeyError) | unit + component |
| AC-5 audited signer; real pubkey; no impersonation | `ephemeral.test.ts` round-trip + Implementer uses `finalizeEvent` (reviewed) | unit + review |
| AC-6 re-rate replaces; read-back includes custodial | reuses 5a `summarizeRatings` + d-tag (cycle 1); route returns summary | component |
| AC-7 web control works for custodial, no prompt | `web/test/components/rating-control-custodial.test.tsx` | component |
| AC-8 DB leak exposes no usable key | `ephemeral.test.ts` (wrapped-at-rest) + cycle-3 crypto invariant | unit |

## What each suite pins

- **`auth/ephemeral.test.ts`** — the §8.2 lifecycle: `rememberSessionKey`→`useSessionKey` round-trips the secret; `useSessionKey` **wipes the plaintext** after the callback (asserted by capturing the buffer and checking it's zeroed); an unknown session throws `NoSessionKeyError`; `forgetSessionKey` evicts (fails closed after); and the store **does not alias the caller's plaintext** (mutating it after `remember` doesn't change what's stored — i.e. it's copied/encrypted at rest).
- **`routes/ratings-custodial.test.ts`** — tier-branched `POST /api/ratings`: a custodial session posting a rating **intent** (no `event`) → `custodialSign` → publish → 200 summary; `custodialSign` returning **null** (wrap gone) → **401 `reauth_required`** (never an unsigned publish); a bad score → 400 `score_out_of_range` before signing; no session → 401. The sovereign path (`{event}`) is unchanged (covered by `ratings.test.ts`).
- **`web/rating-control-custodial.test.tsx`** — a custodial session gets the **same star control** (placeholder gone); submitting calls `api.ratings.submitCustodial({bookSlug, score, …})` and does **not** touch `window.nostr.signEvent`, the `template`, or the sovereign `submit`.

## Hybrid strategy

Hermetic everywhere. The login-time decrypt→wrap wiring (`index.ts`) and the end-to-end custodial publish belong to the integration/staging tier — the unit + component suites pin the ephemeral lifecycle and the route dispatch, and the staging E2E (a real email signup → rate) verifies the wiring, mirroring how the sovereign E2E was run against staging.

## Edge cases

- [x] plaintext wiped after each signing use
- [x] store does not alias the caller's buffer (copied/encrypted at rest)
- [x] unknown / evicted session → `NoSessionKeyError` → 401 `reauth_required`
- [x] bad score rejected before any signing
- [x] custodial path never calls the extension / sovereign endpoints
- [x] no session → 401
- [ ] login decrypt→wrap and process-restart-forces-relogin (integration/staging)

## Verification — failing-for-the-right-reason

Confirmed 2026-05-29. Typecheck clean workspace-wide.

- `@unbnd/api`: **8 new failures** for the right reason:
  - 5 × `ephemeral.test.ts` — `rememberSessionKey/useSessionKey not implemented` (stub).
  - 3 × `ratings-custodial.test.ts` — `expected 400 to be 200/401` and `expected 'invalid_event' to be 'score_out_of_range'` (the custodial tier-branch isn't in the route yet; the unimplemented path falls through to the sovereign validator). The "no session → 401" case already passes (the session guard exists).
- `@unbnd/web`: **1 new failure** — `rating-control-custodial.test.tsx`: no `Rate 4 of 5` button (custodial still renders the 5a placeholder).
- All pre-existing suites stay green.

## Notes for the Implementer

Order: `auth/ephemeral.ts` (process-local random key; `rememberSessionKey` wraps via `@noble/ciphers` XChaCha20-Poly1305 into a `Map<sessionIdHex, blob>`, copying the input; `useSessionKey` unwraps into a fresh buffer, runs `fn`, wipes in a `finally`; `forgetSessionKey` deletes; `NoSessionKeyError` when absent) → `routes/ratings.ts` (custodial branch on `POST /api/ratings`: read intent body, `buildRatingTemplate(config,{raterPubkey:user.pubkeyHex,…},now)`, compute `sessionIdHex = tokenToId(cookie)`, `deps.custodialSign(sessionIdHex, template)`; null → 401 `reauth_required`; else `publish` → summary) → `index.ts` (wire `custodialSign` to `useSessionKey`+`finalizeEvent`; in custodial **login**, after `decryptWithPassword` verifies, `rememberSessionKey(tokenToId(token).hex, secret)` then wipe; in **logout**, `forgetSessionKey`) → web `RatingControl` (custodial branch: same stars, `submitCustodial`, drop the placeholder) — `api.ratings.submitCustodial` already added.

Sign with `finalizeEvent` from `nostr-tools/pure` (audited); never hand-roll. Always wipe plaintext in a `finally`.
