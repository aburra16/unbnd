# Review: Story 76 — Sovereignty upgrade (take ownership of your key)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff main...HEAD` (impl commit `e96b527` + review nit fixup)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm -r test` — **pass** (exit 0, no failing files). Story suites: `crypto` 9/9 (2 new), `auth` 14/14 (4 new), `settings-sovereignty` 4/4.
- [x] `pnpm --filter @unbnd/web build` — **pass**.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1 reach the flow from Settings → Nostr identity (sovereign-colored card). AC-2 explain + one explicit confirm. AC-3 password re-auth. AC-4 reveal-once + copy + acknowledgement-gated Done. AC-5 account keeps working + exported state shown (no re-offer). AC-6 dismissible (Not now / Cancel at each step). AC-7 sovereign sees "you own your key".
- [x] No criterion dropped; the destructive cutover stays out of scope (account keeps signing custodially).

## ADR adherence (0074) — security spine verified
- [x] **Reveal uses the PASSWORD layer, never the backup key.** `exportNsec` calls only `decryptWithPassword` (NIP-49, user's password) then `nsecEncode`, and **wipes the secret** in `finally`. Confirmed `encryptedNsecBackup`/`decryptWithBackupKey` are NOT on the export path. A wrong password throws → 403, nothing revealed.
- [x] **No leak.** No `console.*`/logger touches the password or nsec; the nsec is returned in the response body only, never persisted/cached server-side. Browser side: the nsec lives in component state only (no `localStorage`/`sessionStorage`), cleared on dismiss/unmount.
- [x] `keyExportedAt` is additive + idempotent (migration `0006`, `ADD COLUMN IF NOT EXISTS`; `markKeyExported` stamps once via `WHERE key_exported_at IS NULL`). Tier stays custodial. Surfaced on `PublicUser`.
- [x] Endpoint status mapping is exactly per the ADR (200/403/401/400); `/auth/export-key` validates a non-empty password (400) before calling the dep.
- [x] `--signal-sovereign` token used; no new hex; password field has `autoComplete="current-password"`.

## DList integrity
- [x] N/A — reveals the user's existing key; no nostr event written, no DList change. Account state only (Postgres).

## UI integrity
- [x] Tokens only (`--signal-sovereign`, `--u-*`); no new hex. Calm-gravity copy, no jargon, **no em dashes in rendered copy** (a few comment em-dashes were reworded in review). `CopyButton` generalized with an `ariaLabel` prop (legacy default preserved → the existing npub caller + its test unaffected); the nsec copy gets a correct "Copy your key" accessible name.

## Things tests can't catch
- [x] No secrets in logs/commits; no commented-out code; no debug cruft.
- [x] Error path: a failure after the nsec is computed (e.g. the `markKeyExported` write) propagates without returning the nsec (no partial reveal) and is retryable (`keyExportedAt` not stamped); the error never carries the secret.
- [x] Re-auth is required even with a valid session (the password is the second factor against a hijacked session / shared computer).

## House rules check
- [x] **No hand-rolled crypto** — `exportNsec` reuses the audited `decryptSecretKey`/`nsecEncode` only; tests exercise the real round-trip.
- [x] No new dependency; no new lint/build tooling. PRD scope respected (portability win, not a cutover).

## Findings

### Blocking
_None._

### Non-blocking
1. **No explicit rate-limiter on `/auth/export-key`.** Intentional and consistent with the login path (no separate limiter there either). The real throttle is the **NIP-49 scrypt KDF**: each password attempt is deliberately expensive, so online guessing is impractical by construction. An explicit per-account/IP cap is a defense-in-depth nicety for a future hardening pass, not a gap here.
2. **Brief offer-flash after Done.** On Done, `reset()` returns the card to the offer state, then `session.refresh()` re-fetches `/auth/me` (now with `keyExportedAt`) and flips it to the taken state — a sub-second flash of the offer is possible. Cosmetic; could be smoothed by setting a local "done" state before the refresh resolves.
3. **Re-export remains available (by design).** Once `keyExportedAt` is set the UI hides the offer, but the endpoint still serves a re-auth'd reveal so a user who lost their key isn't locked out (ADR-noted). Worth remembering if a future "true cutover" story changes the model.

## Verdict
**PASS** — all gates green, all 7 ACs covered, the security spine holds (password-gated, backup key never used, no leak, secret wiped), no hand-rolled crypto, house rules adhered to. Non-blocking items are an intentional rate-limit-via-KDF posture, a cosmetic flash, and a documented re-export choice. The migration runs automatically on boot — **no ops step** for this story.
