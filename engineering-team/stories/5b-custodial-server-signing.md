# Story 5b: Custodial server-side signing (session-scoped ephemeral wrap)

**Status:** Approved
**Created:** 2026-05-28
**Type:** Feature

## Background

Story 5a gave **sovereign** (Tier 1) users a full rating write path: the client signs via NIP-07 and the server validates + relays to strfry, reusing a generic publish/read-back core. Custodial (Tier 2 email) users cannot do that — they have no client-side key; their key lives encrypted in the database (NIP-49 + backup key, from cycle 3). This story lets a custodial user rate a book by having the **server** sign the event on their behalf, without weakening the cycle-3 security posture.

The mechanism is fixed by PRD §8.2 and was strictened in the cycle-3 close-out: *the decrypted private key is never persisted across requests; the signing path re-encrypts the nsec under a process-local ephemeral key for the session window; a process restart invalidates all such wrappings and forces re-login; no plaintext key is written to disk or held across a restart.* So this story introduces a session-scoped ephemeral key-wrapping lifecycle: at custodial login (where the password is available) the server decrypts the nsec once and re-wraps it under a process-local ephemeral key bound to the session; on each write it unwraps in memory, signs, and discards the plaintext immediately.

This is the higher-risk half of the rating write path, which is why it is its own story: the key-handling lifecycle deserves its own ADR, its own test plan, and its own review. When it lands, both tiers can rate and the rating endpoint/UI treats them uniformly.

## User-facing description

As a Reader (PRD §3.1) signed in with email and password, I want to rate a book from 1 to 5 stars with an optional short review, exactly as a Nostr-native user can, so that my rating is recorded under my own (custodial) identity without my having to manage keys.

End users see: the same star-rating control story 5a built, now working for email accounts — no extension prompt, the rating just saves. The "coming for email accounts" placeholder from 5a is gone.

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: At custodial login, after the password verifies, the server decrypts the nsec once and stores it **only** as a ciphertext wrapped under a process-local ephemeral key bound to that session. The plaintext from the login decrypt is discarded immediately. No plaintext key is written to disk.
- [ ] AC-2: A custodial signed-in user can submit a rating (`{ book reference, score 1–5, optional reviewText, reviewDate }`); the server builds the kind-39999 `BookRating` event with the user's pubkey, signs it server-side, and publishes it through the 5a generic publish core. Out-of-range score → 400; no session → 401.
- [ ] AC-3: The server obtains the signing key **only** by unwrapping the session-scoped ephemeral ciphertext — never by re-reading the password and never from a persisted plaintext. The unwrapped plaintext is discarded immediately after signing (within the request).
- [ ] AC-4: After a process restart, the ephemeral wrap is gone, so no custodial signing is possible; the user is forced to re-login (a write attempt on a pre-restart session fails closed with a re-auth signal, never a silent unsigned event).
- [ ] AC-5: The signature stack is the audited one (no hand-rolled signing); the published event passes `verifyEvent` and carries the custodial user's real pubkey. A custodial user cannot publish under another identity.
- [ ] AC-6: Re-rating the same book replaces the prior rating (same d-tag), identical to 5a. Read-back (raw count + raw mean, no trust number) now includes custodial ratings alongside sovereign ones, through the same 5a read path.
- [ ] AC-7: The book detail rating control works for a custodial session with no extension present and no key prompt; success reflects the rating, failure shows a plain error. The 5a custodial placeholder is removed.
- [ ] AC-8: A database leak still does not expose a usable signing key (cycle-3 invariant preserved): at rest the nsec remains NIP-49 + backup-key encrypted; the ephemeral wrap exists only in process memory and only for the session window.

## DList shapes touched

- `kind:39999` — `bookRating` item (**created and published** server-side for custodial users). Same builder, d-tag, and replaceable semantics as 5a.
- `kind:39998` — referenced parent header, same as 5a.

## Out of scope

- The sovereign path and the generic publish/read-back core — delivered in 5a.
- **Trust-weighting / GrapeRank** — later personalization cycle. Read-back stays raw/unweighted.
- Tier 2 **OAuth** custodial (server-managed key, PRD §8.1) — stretch, not MVP.
- Genre tags, quality signals, shelves, follows — later stories (they will reuse this custodial signing service once it exists).
- Rate limiting — reverse-proxy layer, cycle 5.
- A persistent/clustered session-key store (Redis, multi-process key sharing) — §8.2 explicitly accepts that a restart forces re-login; single-process in-memory is the MVP.

## Open questions

The Architect resolves these in the ADR.

1. **Ephemeral wrap construction.** What the process-local ephemeral key is (random per-process key + per-session nonce?), the cipher (reuse the cycle-3 XChaCha20-Poly1305 backup-key path, or a dedicated scheme?), and where the wrapped ciphertext lives (in-memory map keyed by session id, lifetime tied to the session row).
2. **Login hook.** Where in the cycle-3 custodial login flow the decrypt-then-rewrap happens, and how it coexists with sovereign login (which has no wrap).
3. **Write dispatch.** How the rating endpoint decides sovereign-validate-relay (5a) vs custodial-server-sign (this story) — by the session user's `tier`.
4. **Fail-closed semantics** when the wrap is missing (post-restart or evicted): the exact status/signal the client uses to force re-login.

## Linked artifacts

- ADR: `engineering-team/decisions/0006-custodial-server-signing.md`
- Test plan: `engineering-team/stories/5b-custodial-server-signing.test-plan.md`
- Review: (filled in after Review phase)
