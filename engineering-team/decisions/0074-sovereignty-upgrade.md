# ADR 0074: Sovereignty upgrade — password-gated nsec reveal

**Status:** Accepted
**Date:** 2026-06-07
**Story:** `engineering-team/stories/76-sovereignty-upgrade.md`

## Context
A custodial user's secret key is stored double-encrypted in `users` (`apps/api/src/db/schema.ts`): `encryptedNsecPassword` (NIP-49, **bound to the user's password**) and `encryptedNsecBackup` (XChaCha20 under the deployment backup key). `apps/api/src/auth/crypto.ts` already exposes `decryptWithPassword(ncryptsec, password) → Uint8Array` (throws on a wrong password — NIP-49 AEAD fails closed) and uses only the audited stack (Applesauce / nostr-tools / `@noble`). `nsecEncode` (nostr-tools/nip19) is available but unused. There is **no export path** today. The account model: custodial = `email !== null` + `tier = "custodial"` + non-null encrypted key columns; sovereign = `email === null`. The session surfaces `PublicUser { id, email, displayName, npub }` via `/auth/me`. The Settings → Nostr identity card (`Settings.tsx`) is read-only (npub chip + copy). `--signal-sovereign` (#7845FF) is defined but unused. Migrations are an idempotent `{name, sql}[]` array (`apps/api/src/db/migrations.ts`).

The story: let a custodial user **reveal their nsec once**, deliberately, to carry their identity elsewhere — a portability win, **not** a destructive cutover (the account keeps signing custodially). Constraints: no hand-rolled crypto (hard rule); the server must not reveal the key without the user proving ownership; the plaintext must never be persisted/logged; never forced, always dismissible.

## Decision

### The security spine: reveal uses the PASSWORD layer, never the backup key
The reveal decrypts `encryptedNsecPassword` with the **user's password** (`decryptWithPassword`). It must **never** use `encryptedNsecBackup` (the deployment key) — that would let the server reveal a key without the user proving ownership, defeating AC-3. A wrong password throws (AEAD) → the endpoint returns an auth error and reveals nothing. This makes "the server never reveals without proof of ownership" a *cryptographic* property, not a policy.

### Crypto helper (in the audited module)
Add to `apps/api/src/auth/crypto.ts`:
```
export function exportNsec(ncryptsec: string, password: string): string {
  const secret = decryptWithPassword(ncryptsec, password); // throws on wrong pw
  try { return nsecEncode(secret); } finally { secret.fill(0); }
}
```
`nsecEncode` joins the existing `nostr-tools/nip19` import. No new cryptography; the secret is wiped after encoding.

### State: a `keyExportedAt` timestamp (no tier flip)
Migration `0003`: `ALTER TABLE users ADD COLUMN IF NOT EXISTS key_exported_at timestamptz;` (nullable; idempotent). The tier **stays** `custodial` (the account keeps working). `PublicUser` gains `keyExportedAt: string | null` (`toPublicUser` → `row.keyExportedAt?.toISOString() ?? null`), surfaced by `/auth/me`/login/signup so the UI can reflect "ownership taken".

### Endpoint: `POST /auth/export-key` (re-auth gated)
A new `exportKey(cookie, password)` dep on `AuthDeps`, wired in `index.ts`:
1. Resolve the session cookie → user; no session → `401`.
2. Load the row; if not custodial (no `encryptedNsecPassword`) → `400 not_custodial` (sovereign users hold their own key).
3. `exportNsec(row.encryptedNsecPassword, password)`; a thrown AEAD error → `403 wrong_password` (reveals nothing).
4. On success: set `key_exported_at = now()` if not already set; return `{ nsec }` **once** in the response body.
- The handler **never logs** the password or the nsec; the nsec is not cached or persisted anywhere server-side; it exists only in the response. Modest anti-guessing protection mirrors the login path (a small per-account/IP attempt throttle); the password AEAD is the real gate.
- Re-export: the endpoint remains available (re-auth each time) so a user isn't locked out of their own key, but the UI surfaces the offer only while `keyExportedAt` is null (AC-5). `keyExportedAt` is stamped once (first export).

### UI: a deliberate flow in Settings → Nostr identity
A sovereign-colored card + a small client state machine (no new route):
- **Custodial, not exported:** a `--signal-sovereign` card "Take ownership of your account" → step 1 plain-language explain → step 2 one explicit confirm → step 3 password re-auth → step 4 **reveal-once**: the `nsec` (monospace) + `CopyButton` + a required acknowledgement ("I've saved my key") that gates the Done/dismiss → calm done state. Dismissible at any step before the reveal with no change.
- **Custodial, exported (`keyExportedAt` set):** a calm "You've taken ownership — your account still works here as normal" state; no reveal offer.
- **Sovereign (`email === null`):** "You own your key" state; never the offer.
- The reveal component holds the nsec in component state only — **never** `localStorage`/`sessionStorage`; it is cleared on unmount/dismiss. Copy uses the existing `CopyButton`. Tokens only; calm-gravity copy per the design + style guides (no jargon, no slop).

## Consequences
- **Enables:** the real sovereignty promise — a custodial user can carry their key out, deliberately and safely, while the account keeps working.
- **Security posture:** the reveal is cryptographically gated on the user's password (backup key never used for export); plaintext is wiped/never persisted; the new endpoint is the only key-egress path and it fails closed.
- **Constrains:** every response shape carrying `PublicUser` now includes `keyExportedAt` (additive, nullable).
- **Out of scope (flagged):** a destructive cutover (deleting `encryptedNsec*`, stopping custodial signing) — a deeper decision with signing implications; this story keeps the account working.
- **Affects existing fixtures?** Tests asserting the exact `PublicUser` shape may need the additive `keyExportedAt` field (logged by the Tester). DB migration is additive/idempotent.
- **New dependency?** No.
- **PRD section change required?** No. Implements §5.4/§7.

## Implementation notes
- `apps/api/src/auth/crypto.ts`: add `nsecEncode` to the nip19 import + `exportNsec(ncryptsec, password)` (wipes the secret).
- `apps/api/src/db/migrations.ts`: migration `0003_key_exported_at` (`ADD COLUMN IF NOT EXISTS key_exported_at timestamptz`). `schema.ts`: add `keyExportedAt: timestamp("key_exported_at", { withTimezone: true })`.
- `apps/api/src/auth/users.ts`: `PublicUser` + `toPublicUser` gain `keyExportedAt: string | null`; add `markKeyExported(id)`.
- `apps/api/src/routes/auth.ts`: `POST /auth/export-key` + `exportKey` on `AuthDeps`; status mapping above; never log secrets.
- `apps/api/src/index.ts`: wire `exportKey` (session → user → `exportNsec` → `markKeyExported`).
- `apps/web/src/lib/api.ts`: `PublicUser`/session type gains `keyExportedAt?`; `api.auth.exportKey(password) → { nsec }`.
- `apps/web/src/routes/Settings.tsx` (+ a new `SovereigntyCard`/`TakeOwnershipFlow` component + CSS): the card + 4-step flow + reveal-once, gated on custodial/`keyExportedAt`/sovereign. `--signal-sovereign` token; no new hex; no browser persistence of the nsec.

## Out of scope
- Destructive custodial→sovereign cutover (key deletion / stopping custodial signing); key rotation/import; changing at-rest encryption or custodial signing.
