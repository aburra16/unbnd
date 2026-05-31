# Review: Story 26 — Custodial personalization (the server-signed "Personalize" trigger)

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-05-31
**Diff:** `git diff main...feat/custodial-personalization` (HEAD `8277b53`)
**Story:** `engineering-team/stories/done/26-custodial-personalization.md`
**ADR:** `engineering-team/decisions/0026-custodial-personalization.md` (amended — `authChallenge` returns a template; the seam moved behind the provider; the guard gains `brainstorm_login`)
**Test plan:** `engineering-team/stories/done/26-custodial-personalization.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 6 projects green (schemas, search, indexer, api, seeder, web).
- [x] `pnpm -r test` — **PASS.** api **505 passed | 10 skipped** (64 files); web **161 passed** (35 files); schemas 72; search 11; seeder 12; indexer 6. The 10 skips are pre-existing DB/Neo4j integration tests gated on `DATABASE_URL` — unrelated to this story, hide no work. No `.skip`/`.todo` in any story test file.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit && vite build`; 431 modules; ~0.6s.
- [x] Architecture guard — **PASS.** `brainstorm_login` appears as a source literal in exactly one file: `apps/api/src/trust/brainstorm.ts`. The guard (`test/trust/architecture.test.ts`) adds `brainstorm_login` to the forbidden pattern; kind `27235` is correctly NOT in the guard (standard NIP-98).
- [x] _Lint not configured — skipped._

## Spec adherence (8 ACs)
- [x] **AC-1 — custodial trigger happy path.** Re-checks gate → `authChallenge` → `custodialSign` → `personalize` → `200 {ok,building}`; fixture flips to `hasScores:true`.
- [x] **AC-2 — status reports eligibility.** `/status` `canPersonalize` gate-driven for custodial, `true` for sovereign.
- [x] **AC-3 — reauth when key gone.** `custodialSign` → `null` ⇒ `401 reauth_required`; `personalize` never called (verified by spy).
- [x] **AC-4 — follow-count gate before prompt.** Server-side `403 below_follow_gate` on `/personalize` and `/challenge`; default 10, env-overridable, validated; web `gated` state + honest copy.
- [x] **AC-5 — UI parity.** Custodial calls `personalizeCustodial()` (empty body, no NIP-07); hook test asserts `window.nostr`/`challenge`/`personalize` untouched; `?observer=` parity; same building/poll/ready.
- [x] **AC-6 — sovereign unchanged.** Route sovereign branch byte-identical; `custodialSign` not called; web now signs the SERVER-returned template (behavior preserved, construction moved per ADR).
- [x] **AC-7 — architecture guard green** (see gates).
- [x] **AC-8 — fixture e2e.** `status(eligible,no-scores) → personalize → status(hasScores)` under `FixtureTrustProvider`, no Brainstorm/relay.

## ADR-0026 contract conformance
- [x] `authChallenge: Promise<NostrEventTemplate | null>`. Brainstorm returns kind-27235 with `["challenge",…]` + `["t","brainstorm_login"]`; fixture returns a deterministic generic template (`created_at:1`, challenge tag only, no `brainstorm_login`); both `null` on failure.
- [x] `/personalize` tier branching is fail-closed: sovereign never reaches `custodialSign`; custodial empty-body re-checks the gate server-side, signs via the ephemeral wrap, returns `reauth_required` without calling `personalize` when the wrap is gone. Typed `502 challenge_failed`/`502 trigger_failed`/`403 below_follow_gate`; no throw-to-500 paths.
- [x] Gate counts the user's own kind-3 distinct p-tags server-side, custodial-only.
- [x] `/status` `canPersonalize` gate-driven; `/challenge` returns `{template}`.
- [x] Web: sovereign signs the server template (no client-built 27235, no `brainstorm_login` in web); custodial in-session trigger; `gated` state + copy.

## Adversarial findings
- **Crypto:** No hand-rolled crypto. Custodial signing flows through `custodialSign` → `useSessionKey` → `finalizeEvent` (nostr-tools/pure). No key material logged.
- **`personalizeMinFollows` optional-on-Config:** sound — mirrors the cited `propagateWrites`/`profileRelays` precedent (always set by `loadConfig`, optional in the type so partial fixtures need not set it). No test weakened.
- **`distinctFollowCount` extraction:** correct — freshest kind-3 by `created_at`, dedupes via `Set`, ignores non-`p`/malformed tags. `profile-stats.ts` imports the same primitive; behavior byte-identical.
- **Test quality:** meaningful, not tautological — route tests assert call/no-call on `custodialSign`/`personalize` spies across every fail-closed branch; web tests assert `signEvent` called with the exact server-template object and the custodial path never touches `window.nostr`. Determinism real (fixed `created_at:1`, no `Date.now`/random in asserted output, `TRUST_PROVIDER=fixture`). Migrated contract tests strengthened (negative `brainstorm_login` assertion + new Brainstorm null path).
- **Modularity:** BrainstormProvider remains the only backend-aware file; route and web are template-agnostic.
- **Copy/visual:** "Follow a few curators to personalize your view." — no em dash, no banned tics. No hardcoded hex/colors in changed web files (uses `PoVBar.css` classes).
- **Firewall:** No business/community/grant/funding content in any changed file, ADR, or commit message.

## Findings

### Blocking
None.

### Non-blocking
None.

## Verdict
**APPROVED**
