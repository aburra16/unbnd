# Story 4: NIP-07 sovereign login backend

**Status:** Approved
**Created:** 2026-05-28
**Type:** Feature
**Branch:** cycle-4-nostr-writes

## Background

Cycle 3 made Tier 2 custodial auth real. The Tier 1 sovereign path (PRD §5.7) still has only a UI stub: `/auth/nostr` detects `window.nostr`, reads the pubkey, and navigates without the server ever verifying anything. This story makes sovereign login real — the server proves the user controls the private key behind their pubkey, then issues a session.

This is the second half of "identity." Once it lands, both tiers can authenticate, and the cycle-5 write path (story 5) can treat a signed-in user uniformly regardless of how they proved themselves.

A sovereign user holds their own key. The server never sees it. That is the whole point of Tier 1 and the reason it is the recommended path in the sovereignty notes. So a sovereign `users` row has no encrypted-nsec columns populated — cycle 3 deferred exactly this schema decision to cycle 4 (ADR 0003 "Deferred concerns: Sovereign user creation path").

Tapestry's `src/middleware/auth.js` (concept-graph branch) is the prior art: server generates a random challenge, client signs it via the extension, server verifies the signature against the claimed pubkey. We crib the challenge/verify shape; we do not crib its owner-only gate (Unbnd accepts any valid pubkey, not just an owner).

## User-facing description

As a reader who already has a nostr identity (a "sovereign" user, though the UI never uses that word — bridging principle), I want to click "Sign in with Nostr", approve a signature in my browser extension, and be signed in — landing in the same place a custodial user lands, with my npub-derived identity recognized on return visits. The server confirms I control the key; it never asks for or stores it.

End users see the `/auth/nostr` flow become real: the extension prompts for a signature, and on approval they are signed in.

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: `POST /auth/nostr/challenge` accepts `{ pubkey }` (64-hex) and returns `{ challenge }` — a single-use, time-bounded random nonce bound to that pubkey. Invalid pubkey → 400.
- [ ] AC-2: `POST /auth/nostr/verify` accepts a signed nostr event (the signed challenge, per the agreed signing convention) and verifies: the signature is valid for the claimed pubkey, the event embeds the issued challenge, and the challenge has not expired or been used. On success → creates-or-loads a `tier='sovereign'` user and returns `{ user }` + a session cookie (same session mechanism as cycle 3). On any failure → 401 with a generic message.
- [ ] AC-3: Challenges are single-use (consumed on successful verify) and expire (recommend 5 minutes). A replayed or expired challenge → 401.
- [ ] AC-4: Signature verification goes through the audited stack (`nostr-tools.verifyEvent` or Applesauce), per the Cryptographic library policy. No hand-rolled signature checking.
- [ ] AC-5: A sovereign `users` row is created with `tier='sovereign'`, the user's real `pubkey_hex`, and NO usable encrypted-nsec material. The schema change that allows this (nullable encrypted-nsec columns, or an equivalent the Architect chooses) is migrated cleanly and does not break existing custodial rows.
- [ ] AC-6: A returning sovereign user (same pubkey) loads the existing row rather than creating a duplicate. `/auth/me` resolves their session identically to a custodial user; the returned `user` carries `npub`, never hex.
- [ ] AC-7: `apps/web`'s `/auth/nostr` flow calls `getPublicKey()`, requests a challenge, calls `signEvent()` on the challenge, posts to verify, and navigates to `/auth/welcome` on success. On extension-missing or user-rejection, it shows the existing no-extension / cancel states (no crash).
- [ ] AC-8: A sovereign user signs out and signs in again with no residue; logout revokes the session the same way it does for custodial users.
- [ ] AC-9: No sovereign private key is ever transmitted to or stored by the server. Verified by inspection: the verify endpoint receives only a signed event (pubkey + sig + content), never a secret.

## DList shapes touched

None directly. This story is identity, not events. (Story 5 introduces the rating event.)

## Out of scope

- The write/publish path (rating, tagging). Story 5.
- Nostr Connect / bunker (NIP-46) remote signing — PRD §5.7 stretch, not MVP.
- Migrating an existing custodial user to sovereign (the "export nsec, switch to NIP-07" upgrade path) — a later settings-page story. This story only handles a user who arrives sovereign from the start.
- Trust scoring / GrapeRank. A sovereign user's pubkey may already have a rich follow graph; using it is a personalization-cycle concern.
- Rate limiting on the challenge/verify endpoints — same deferral as cycle 3 (reverse-proxy layer, cycle 5).

## Open questions

The Architect resolves these in the ADR.

1. **Signing convention for the challenge.** NIP-42 (kind 22242 auth event) is the nostr standard for relay auth and the natural fit; the alternative is a bespoke kind. Recommend NIP-42-style so the signed artifact is conventional. Architect confirms exactly what the client signs and what the server checks.
2. **Challenge storage.** A `challenges` table (pubkey, nonce, expires_at, consumed) vs an in-memory/Redis store. Recommend a Postgres table for single-process simplicity and durability across restarts; matches the sessions pattern. Sweep/expiry like sessions.
3. **Sovereign schema.** Make `encrypted_nsec_password` / `encrypted_nsec_backup` nullable, or split sovereign identity into its own table, or a sentinel. Recommend nullable columns + a CHECK that custodial rows have them and sovereign rows don't. Architect decides and writes the migration.
4. **Client signing artifact.** Whether `apps/web` builds the unsigned event and calls `window.nostr.signEvent`, and exactly which fields. Tie to Q1.
5. **Verify endpoint input shape.** The full signed event JSON vs pubkey+sig+challenge-id. Recommend the full signed event so verification is standard `verifyEvent`.

## Linked artifacts

- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
