# Review: Story 27b — Custodial display-name rename (re-publish kind-0, merge-preserving)

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-06-01
**Diff:** `git diff main...feat/custodial-displayname-rename`
**Story:** `engineering-team/stories/done/27b-custodial-displayname-rename.md` (6 ACs)
**ADR:** `engineering-team/decisions/0028-custodial-displayname-rename.md` (reuses the Story-27 `buildProfileKind0Content` seam, ADR 0027)
**Test plan:** `engineering-team/stories/done/27b-custodial-displayname-rename.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** 6/6 projects clean.
- [x] `pnpm -r test` — **PASS.** api 558 passed / 10 skipped; web 167 passed; schemas 72; search 11; seeder 12; indexer 6. Zero failures, zero regressions. The 10 API skips are pre-existing infra gates (`db/integration` ×9 needs `DATABASE_URL`, `nostr/integration` ×1) + 2 runtime no-signing-key log-skips — none are 27b work. The 13 new API + 6 new web tests all run and pass.
- [x] `pnpm -r build` — **PASS.** api/web/seeder/indexer build; web vite bundle clean.

## Spec adherence (6 ACs + the 502 posture)
- [x] **AC-1 rename re-publishes, merge-preserving** — route does exactly `buildProfileKind0Content(content, {displayName:nextName}, nextName)` → `buildKind0Template(merged, nextCreatedAt)`; `name==display_name==D2`, substack/website preserved, `created_at` strictly newer, kind 0, empty tags; published author is the session user.
- [x] **AC-2 DB lockstep** — `updateDisplayName(user.id, nextName)` once after publish; not called on publish-fail or 401/400/403.
- [x] **AC-3 own-profile-only** — anon 401 `no_session`; custodial no-key 401 `reauth_required`; body-id smuggling ignored (target always the session user).
- [x] **AC-4 validation + privacy** — `validateDisplayName` before any I/O; over-length + empty both 400 pre-I/O; privacy assessment below.
- [x] **AC-5 Settings field** — custodial-only (`isSovereign = user.email === null`), prefilled via `displayNameOf(meta, user.displayName)`, honest idle/saving/saved/error, calls `setDisplayName` then `invalidateProfileMeta(user.npub)`; reuses `set-*` CSS tokens, no new hex, no icon lib; copy clean.
- [x] **AC-6 sovereign untouched** — 403 `sovereign_self_signed` before any build/sign/publish/DB; field hidden for sovereign; no sovereign code path modified.
- [x] **502 / DB-lockstep posture (ADR 0028 §3)** — publish `!ok` → 502, DB untouched; DB-throws-after-publish → 502, kind-0 already live. "Self-limiting drift" holds: `displayName` only ever feeds `buildProfileKind0Content`'s `nameFloor`, which fills only when the name is empty — it can never clobber a present name.

## The three implementation-phase adjudications (all CORRECT, none weakened)
1. **AC-4 re-scoped to session/body PII (not poisoned `rawPrev`)** — the test feeds `email` via session AND `email`/`password`/`userId` via the request body, serializes the whole signed event, asserts all three absent + content lacks those keys + merge-preserve holds. Still fails the instant any future change pipes session/body PII in. The `rawPrev`-passthrough carve-out is sound (see privacy).
2. **Two Save buttons disambiguated by aria-label** ("Save Substack link" / "Save display name") — visible text "Save" is contained in each accessible name, valid a11y; tests query the specific names.
3. **Settings input queries role-scoped to `textbox`** — pure query mechanics (`findByLabelText` → `findByRole("textbox", {name})`, `/save/i` → `/save substack link/i`); every assertion unchanged; pre-existing Substack tests retain intent.

## Privacy assessment
Sound. The route builds its patch as a closed `{displayName: nextName}` literal through the shared `buildProfileKind0Content`, whose patch surface is the `PROFILE_KIND0_FIELDS` whitelist — email/password/userId/token cannot enter from the patch. Production `resolveSessionUser` returns only `{id, pubkeyHex, tier, displayName}` (no email reaches the route at runtime); the AC-4 test casts an email on anyway, a stronger test than reality. Lossless `rawPrev` passthrough is not a hole: `rawPrev` is already-public relay data, our own writes only ever put whitelisted fields in kind-0, and planting PII there would require already holding the victim's key (a strictly larger compromise).

## Reuse / crypto / scope
- Exactly one `buildProfileKind0Content` call; reuses `buildKind0Template`, `validateDisplayName`, injected `custodialSign`/`publish`/`fetchRaw`. No new merge logic, whitelist, or template builder. `nextCreatedAt`/`readSessionCookie` are tiny local helpers the ADR explicitly permits.
- Signing solely via injected `custodialSign` (ephemeral wrap → `useSessionKey` → `finalizeEvent`); no hand-rolled primitives; test signer uses `nostr-tools/pure`.
- `users.updateDisplayName` — correct scoped, parameterized drizzle update, run in the route transaction.
- Scope/firewall: 27b touched none of `kind0.ts`, `substack-template.ts`, `profile-substack.ts`, `passwords.ts`, or the signup/login bootstrap. No business/grant/community content. Sovereign untouched.

## Copy check
"Display name" / "The name readers see on your profile and reviews." / "Enter a display name." / "Could not save your name. Try again." — no em dashes, no declarative-negative/rhetorical-contrast slop, no banned filler, no emoji. Error messages match ADR 0028 §1 verbatim.

## Findings

### Blocking
None.

### Non-blocking
1. `profile-display-name.ts` — `validateDisplayName` checks length on the untrimmed string while the stored value is `displayName.trim()`; a 100-visible-char name with trailing spaces (101 total) is rejected. Identical to the pre-existing signup behavior in `passwords.ts:55`, so 27b is consistent, not a regression. Future awareness only.

## Verdict
**APPROVED**
