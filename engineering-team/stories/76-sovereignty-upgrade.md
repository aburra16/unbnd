# Story 76: Sovereignty upgrade (take ownership of your key)

**Status:** Approved
**Created:** 2026-06-07
**Type:** Feature

## Background
A custodial user signed up the easy way (email + password); Unbnd holds their nostr key, double-encrypted at rest (NIP-49 password layer + an XChaCha20 backup layer, `apps/api/src/auth/crypto.ts`), and signs on their behalf. The sovereignty promise is that this is a *choice*: they can take their key and carry their identity to any nostr app, on their own timeline — never forced, never scary (social-loop PRD §5.4, §7; persona "Sovereignty-Curious User", journey 4.3). Today there is **no way to get the key out** — the promise isn't real yet. This story makes it real.

Crucially, the key's decryption is **password-gated**: the server cannot reveal the key without the user proving they own the account (the NIP-49 layer fails closed on a wrong password). And per the no-hand-rolled-crypto rule, the reveal reuses the audited stack only (`decryptWithPassword`, then `nsecEncode` from `nostr-tools/nip19`) — no new cryptography.

After the export the account **keeps working exactly as before** (the user now *also* holds their key; Unbnd keeps signing custodially) — the wireframe is explicit: "You own your key. Your account still works here as normal." The transition is a portability win, not a destructive cutover.

Anchor: `product-team/prd/social-loop.md` §5.4, §7. Wireframe: `product-team/guides/social-loop-wireframes.html#sovereignty`. Uses the existing `--signal-sovereign` token. Crypto policy: `feedback_unbnd_crypto_policy.md` (hard rule).

## User-facing description
As a Sovereignty-Curious custodial user, I want to deliberately take ownership of my key from Settings — with the choice explained plainly and the key revealed once, safely — so that I can carry my nostr identity to other apps, while my Unbnd account keeps working as normal.

## Acceptance criteria
Testable from the outside.

- [ ] A custodial user can reach a "Take ownership" flow from Settings → Nostr identity (the entry point is a card marked with the sovereign color).
- [ ] The flow explains the choice in plain language (calm, no jargon) and requires one explicit confirmation before the key is revealed.
- [ ] Revealing the key requires the user to re-authenticate (their password) — the server never reveals the key without proof the requester owns the account.
- [ ] The key is shown once, as an `nsec`, with a copy action and an acknowledgement the user must give before the reveal can be dismissed; the plaintext key is never persisted (not in the DB, not in logs, not in browser storage) and is gone after dismissal.
- [ ] After completion the account continues to work normally (custodial signing still works) and the flow/card reflects that ownership was taken — a previously-exported account shows that state rather than offering the reveal again.
- [ ] The flow is never forced and is always dismissible (closing it at any step before the reveal makes no change).
- [ ] A sovereign user (who already holds their own key) sees the "you own your key" state, never the export offer.

## DList shapes touched
- None. This reveals the user's existing nostr key (already represented on nostr as their npub); no event is written and no nostr data changes. The "ownership taken" state is account state in Postgres (the `users` table), not a DList shape.

## Out of scope
- A destructive custodial→sovereign cutover: this story does **not** delete the server's encrypted key copy or stop custodial signing (the account keeps working per the wireframe). Whether to later offer "and stop holding my key" is a separate, deeper decision (signing implications) — flagged, not built.
- Key rotation, re-generation, or importing an external key.
- Changing how custodial signing or the at-rest encryption works.
- Sovereign (NIP-07) signup users gaining an export (they already hold their key — they only see the "you own your key" state).

## Open questions
For the Architect (Phase 2):
1. **"Ownership taken" state.** A new `users` field (a boolean/timestamp, e.g. `keyExportedAt`) and how it surfaces through the session/`PublicUser` so the Settings card reflects "ownership taken" and stops offering the reveal. Tier stays custodial (the account keeps working) — the flag is the signal, not a tier flip.
2. **Re-auth + reveal endpoint.** A new authenticated endpoint that takes the user's password, `decryptWithPassword`s the stored `encryptedNsecPassword`, `nsecEncode`s it, returns it once over the session, marks `keyExportedAt`, and wipes the plaintext. It must never log/cache/persist the plaintext, fail closed on a wrong password, and be rate-limited against guessing. Confirm the exact shape against the existing custodial auth flow.
3. **Reveal UI safety.** The reveal-once component: copy action, the required acknowledgement before dismiss, no browser persistence (no localStorage/sessionStorage), and a clear once-only warning. Confirm against the design + style guides (calm gravity).
4. **Block placement note (PRD §11 open q4):** nsec-export sits in Block 2 by persona logic; this closes Block 2.

## Linked artifacts
- ADR: `engineering-team/decisions/0074-sovereignty-upgrade.md` (Accepted)
- Test plan: `engineering-team/stories/76-sovereignty-upgrade.test-plan.md`
- Review: (filled in after Review phase)
