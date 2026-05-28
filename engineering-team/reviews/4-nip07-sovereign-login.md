# Review: Story 4 — NIP-07 sovereign login

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-28
**Diff:** `git diff 8ad66b7..HEAD` (story → ADR → tests `a564bc7` → impl `1827051`), branch `cycle-4-nostr-writes`.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass**, all three packages.
- [x] `pnpm -r test` — **pass**, 212 passing (62 schemas + 134 api + 16 web), 9 skipped (the `db/integration.test.ts` suite).
- [x] `pnpm --filter @unbnd/web build` — **pass** (318.40 kB JS / 102.5 kB gzip).
- [x] `pnpm --filter @unbnd/api build` — **pass** earlier this phase (tsc emit clean; TS-embedded migration 0002 compiles into dist).
- [~] **Integration suite NOT run locally.** No Docker and no Postgres on :5432 in this environment, so the 9 `db/integration.test.ts` tests (the only coverage for AC-3 single-use/expiry, AC-5 sovereign schema + CHECK, AC-6 dedup at the DB layer) are skipped here. They are wired into CI (`.github/workflows/ci.yml`, postgres:16 service + `DATABASE_URL`) and gate the PR merge. Same posture as the cycle-3 review. **This is the one gap a reviewer cannot close locally; it closes on push.**
- [x] _Lint not configured — skipped._

## Spec adherence

- [x] **AC-1** challenge endpoint: `routes/auth.ts` `POST /auth/nostr/challenge` validates 64-hex pubkey (400 `validation_failed` otherwise, `nostrChallenge` not called), returns `{ challenge }`. `issueChallenge` writes a 32-byte base64url nonce with a 5-min expiry. Covered by `routes/auth-nostr.test.ts` (200 + 400) and the integration suite (issue).
- [x] **AC-2** verify endpoint: `POST /auth/nostr/verify` → `verifySignedChallenge` then transactional consume → create/load → issue session. 200 `{ user }` + cookie on success, generic 401 `invalid_signature` on any failure. Covered by `auth-nostr.test.ts` (200 + cookie, 401).
- [~] **AC-3** single-use / expiry: `consumeChallenge` is a single conditional `UPDATE ... WHERE pubkey AND nonce AND consumed_at IS NULL AND expires_at > now()` returning the row count — atomic, replay-safe. Logic reviewed and sound; **its test is in the CI-gated integration suite** (issue→consume→replay-fails→expired-fails). Not executed locally.
- [x] **AC-4** audited signature verification: `auth/nostr.ts` uses `nostr-tools/pure.verifyEvent` as the last check, on the freshly-parsed body only. The `auth/nostr.test.ts` security suite (7 tests, passing) round-trips a real fixture-keypair NIP-42 event through JSON and rejects tampered pubkey / tampered content / wrong kind / missing-tag / stale-time / junk. This is the exact gap in Tapestry's reference handler, and it is closed.
- [~] **AC-5** sovereign schema: migration 0002 drops NOT NULL on both encrypted columns, adds the `users_tier_key_material` CHECK (guarded by a `pg_constraint` existence check so re-running is safe), creates `challenges`. `createOrLoadSovereignUser` inserts `tier='sovereign'`, null email, null key material. Reviewed; **the create/load + CHECK test is integration-gated.**
- [~] **AC-6** returning-user dedup + npub: `createOrLoadSovereignUser` selects by `pubkey_hex` and returns the existing row before inserting. `toPublicUser` emits `npub` only. Component test asserts `user.npub` present and `email` null on verify; **the DB-level dedup test is integration-gated.**
- [x] **AC-7** web flow: `AuthNostrConnect` runs `getPublicKey()` → `api.auth.nostr.challenge(hex)` → `signEvent({kind:22242, tags:[["challenge",nonce],["relay",origin]], content:""})` → `api.auth.nostr.verify(signed)` → `navigate("/auth/welcome")`. No-extension and a new error state are handled; rejection/throw lands on the error state with a retry, no crash. `auth-nostr-connect.test.tsx` (2 tests) passes.
- [x] **AC-8** sign-out/in: no new logout path; sovereign sessions are issued through the same `issueSession` and revoked by the cycle-3 `revokeSession`. Reuse verified by reading `index.ts`.
- [x] **AC-9** no key on server: `verifySignedChallenge(event)` and `nostrVerify(event)` accept only a signed event (pubkey + sig + tags + content). No endpoint, type, or column receives a secret. Confirmed by inspection and by the `users` insert (null key material for sovereign).

## ADR adherence

- [x] File layout matches the ADR's notes (`auth/nostr.ts`, `auth/challenges.ts`, `auth/users.ts`, `routes/auth.ts`, `index.ts`, `config.ts`, `db/*`, web `lib/api.ts` + `AuthNostrConnect.tsx`).
- [x] Verify pipeline order matches decision #3 (shape → verifyEvent → skew → challenge tag; then transactional consume → create/load → session).
- [x] Layering respected: web stays UI (no server imports); the signature check and DB work stay in `apps/api`.
- [x] `challenges` table shape and the tier CHECK match the ADR SQL; the CHECK is guarded for idempotency as the ADR required.
- [N] **Relay tag:** the ADR specified `["relay", origin]` in the signed event. The first impl pass omitted it; corrected during review to `["relay", window.location.origin]` so the signed NIP-42 artifact is complete. The server does not verify this tag, so behavior is unchanged either way.

## DList integrity

Not applicable — this story is identity, not events. No event kinds (39998/39999), d-tags, or word-wrapper JSON touched. (Kind 22242 here is a transient NIP-42 auth event, never persisted to strfry.)

## UI integrity (apps/web)

- [x] No new hex literals; `AuthNostrConnect` reuses `AuthShell`, `SovereigntyNote`, and the existing `auth-*` classes (`auth-field-error` for the new error line).
- [x] No icon library; no SVG added.
- [x] Copy passes the no-slop rules: no em dashes, no rhetorical contrasts, no banned filler. New strings ("Signing challenge…", "Try again", the error fallback) are plain.
- [x] npub-not-hex: the extension returns hex, held only for the API call; the screen displays `npubEncode(hex)`. Trust tiers not relevant here.

## Things tests can't catch

- [x] No secrets committed; `.env.example` gains only `PUBLIC_ORIGIN` (a non-secret default).
- [x] No `console.*`, `debugger`, TODO/FIXME in the new code (grep clean).
- [x] No commented-out code.
- [x] Error paths: verify returns a single generic 401 regardless of which check fails (no oracle for shape vs signature vs replay). Challenge validates pubkey shape before any DB write. Both 501-guard when the dep is absent.
- [x] **Concurrency:** the single-statement conditional UPDATE in `consumeChallenge` means two concurrent verifies of the same challenge cannot both succeed — only one `UPDATE` matches the `consumed_at IS NULL` predicate. Correct.
- [x] Security: 64-hex validation at both the route and inside `verifySignedChallenge`; the clock-skew window is defense-in-depth on top of the DB expiry; no injection vector (parameterized via Drizzle).

## House rules check

- [x] PRD §11.3 scope discipline: nothing out-of-scope sneaks in. The write/publish path, NIP-46 bunker, custodial→sovereign upgrade, kind-0 enrichment, GrapeRank, and rate limiting all remain deferred, as the story's Out-of-scope says.
- [x] POV-first: any valid pubkey authenticates; no owner gate, no allowlist (the deliberate departure from Tapestry's owner-only handler).
- [N] **New dependency not authorized by the ADR.** The ADR said "New dependencies? None" and "the `npubEncode` for display is server-side." The impl adds `applesauce-core@6.0.3` to `apps/web` and encodes npub client-side. **Justification:** the pre-verify screen shows the user their key *before* any server round-trip, so a server-side npub is not available at that moment; showing raw hex would violate the npub-not-hex house rule. `applesauce-core` is the sanctioned default under the Cryptographic library policy, already pinned at the workspace root (same version), so this introduces no new third-party surface — only a new workspace edge. This is the correct call, but it contradicts the ADR text and must be recorded as an ADR refinement at close-out (alongside the email-nullable refinement the test plan already flagged). Non-blocking.

## Findings

### Blocking
None.

### Non-blocking
1. **ADR refinements to record at close-out** (two): (a) `email` is nullable for sovereign users — the ADR §4 migration text covered the encrypted columns but not email; (b) `apps/web` gains `applesauce-core` for client-side `npubEncode`, superseding the ADR's "display npub is server-side / no new dependencies" line, for the reason in the house-rules note above.
2. **`config.publicOrigin` is now only used as the `.env.example`/cookie-scoping default**, not as the relay tag source (the client uses `window.location.origin`). Harmless; note for when story 5 wires publish/relay config.
3. **AC-3/5/6 rest on CI.** Their only automated coverage is the integration suite, which did not run in this review environment. The merge must wait for a green CI run on `cycle-4-nostr-writes` before it lands — the local gates alone do not exercise the schema/CHECK/dedup/expiry behavior.

## Verdict
**PASS** — contingent on a green CI run (the integration suite must pass on push, since it is the sole coverage for AC-3/5/6). Two ADR refinements to record at close-out; no code changes required.
