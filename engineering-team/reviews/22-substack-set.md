# Review: Story 22 — Set your Substack link (the first kind-0 profile write, safe merge)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-30
**Diff:** `git diff main...feat/substack-set` (merge-base; original review HEAD `94daba9`; re-verified at fix HEAD `b7e2496`)
**Story:** `engineering-team/stories/done/22-substack-set.md`
**ADR:** `engineering-team/decisions/0022-substack-set.md`
**Test plan:** `engineering-team/stories/done/22-substack-set.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** 6 of 7 workspace projects (schemas, search, seeder, indexer, api, web) all `Done`, no errors.
- [x] `pnpm -r test` — **PASS.** api **407 passed | 10 skipped** (53 files passed, 2 skipped); web **117 passed** (27 files). Includes the 69 new Story-22 tests (49 api + 20 web — counted: profile-raw 9, substack-template 18, validate-kind0 7, publish-many 4, profile-substack 16; account-menu-settings 2, invalidate-profile-meta 2, settings 11) and the Story-18/19/20/21 + search/trust guard suites.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit` clean, `vite build` 427 modules, built in ~0.5s.
- [x] _Lint not configured — skipped._

All gates green.

## Spec adherence (9 ACs)

- [x] **AC-1** Settings affordance — gated `/settings` route (`Settings.tsx:49-62`: loading → `role=status`; signed-out → `<Navigate to="/auth" replace />`), prefilled from `useProfileMeta(npub)?.substack` (`:42,66`), Settings item in `AccountMenu` between "Your shelves" and "Sign out" (`AccountMenu.tsx:83-85`). Tests: `account-menu-settings.test.tsx`, `settings.test.tsx`.
- [x] **AC-2** Set persists; merged kind-0 carries `substack`; Story-20 display reused unchanged. Route tests + the read-side `ProfileMeta.substack`/`httpUrl` untouched (`profile.ts:17,89`).
- [x] **AC-3** Merge-don't-clobber — see judgment below. Verified raw-read + clone-merge preserves all fields incl. unknown ones.
- [x] **AC-4** Clear DELETES the key — `mergeSubstack` `delete result.substack` (`substack-template.ts:57`), not `""`/`null`. Empty/whitespace/absent → `"clear"` (`:27,32`). No-op-on-no-value verified by unit test.
- [x] **AC-5** Validation before publish — `validateSubstackUrl` rejects `ftp:`/`javascript:`/junk/non-string with `SubstackError("invalid_url")` (`:26-43`); route returns 400 before any fetch/merge (`profile-substack.ts:82-91,117-126`); web inline check before any API call (`Settings.tsx:28-37,71-74`).
- [x] **AC-6** Sovereign via NIP-07 — `Settings.tsx:79-90` runs `substackTemplate → window.nostr.signEvent → setSubstack`; no-extension → honest message, nothing published (`:80-87`); server `validateSignedKind0` (kind 0, hex pubkey, pubkey===session→403, `verifyEvent`, content object, `substack` valid-http(s)-or-absent). No private key on server.
- [x] **AC-7** Custodial server-signs via ephemeral wrap; `custodialSign` → `null` ⇒ 401 `reauth_required` (`profile-substack.ts:139-148`). Fresh-minimal-kind-0 for no-existing-kind-0 (`mergeSubstack(null,…)` → `{substack}`). Tests cover both.
- [x] **AC-8** Propagation — `publishKind0` (`index.ts:233-246`): local relay awaited (gates 200/502), profile-relay fan-out fire-and-forget via `publishToMany`. Route awaits injected `publish`, local result gates response. `created_at` bumped strictly past fetched (`profile-substack.ts:59-66`). See judgment.
- [x] **AC-9** Honest states (`idle|saving|saved|error`, no fabricated success), in-place state (not a toast), optimistic echo + `invalidateProfileMeta` cache-bust on success (`Settings.tsx:94-97`); only the Substack field rendered (asserted by `exposes ONLY the Substack field`).

Every AC has at least one passing test; none silently dropped.

## ADR adherence

- [x] Files match the ADR Implementation notes exactly: raw read in `profile.ts` (`pickNewestKind0`/`parseRawKind0Content`/`fetchRawKind0`), new `profile/substack-template.ts`, `profile/validate-kind0.ts`, `routes/profile-substack.ts`, `publishToMany` in `nostr/publish.ts`, `publishKind0` inline in `index.ts`, web `Settings.tsx`/`Settings.css`, `AccountMenu` item, `App.tsx` route, `invalidateProfileMeta` + three `api.profile.*` methods.
- [x] F1-A (server-side merge, tier-branched), F2-A (local-first + best-effort profile-relay fan-out), F3-A (dedicated `/settings`) all as decided.
- [x] No new dependencies. Uses existing `nostr-tools/pure` `verifyEvent`/`finalizeEvent`, existing `publishEvent`, existing ephemeral wrap, NIP-07. No new DList shape. No new tooling.
- [x] Layering respected: apps/web stays UI, apps/api stays server, no cross-import.

## DList integrity
N/A — no DList shape touched. kind-0 is an existing NIP-01 replaceable event; `tags: []`, flat metadata content. `buildKind0Template` correctly does NOT use `toWireTemplate` (no `["json",…]` payload tag). The kind-39999 ratings/tags/shelves paths are untouched.

## UI integrity (apps/web)

- [x] No icon library; no emoji; no AI-slop visual chrome. State surfaced in place, not via toast (copy rule satisfied).
- [x] Copy passes the no-slop rules. No em dashes, no rhetorical contrasts, no banned verbs, no exclamation CTAs. Strings ("Add the place you publish. It shows on your profile as a link readers can follow.", "A full link, including https://.", "Enter a full http or https link, or leave it empty to clear.", "No Nostr extension found. Install one to update your profile.", "Could not save your link. Try again.", "Saving…", "Saved.") are concrete and plain.
- [x] npub-display / hex-internal: `Settings` reads `user.npub` for the cache-bust; no hex shown.
- [x] No trust / GrapeRank surface touched.
- [x] **Brand tokens — RESOLVED (fix commit `b7e2496`).** `Settings.css:64` now uses `color: var(--signal-negative);`, matching `.auth-field-error` (`AuthForm.css:10`) and `.sub-error` (`Submit.css:206`). The prior `#b3261e` hex literal is gone (`grep #b3261e apps/web/src` returns nothing). The fix is a one-line CSS change, no logic and no test change (`git show b7e2496 --stat`: 1 file, 1 insertion, 1 deletion). (`#ffffff` for the input background at `Settings.css:47` is the established pattern — 8 existing components use it — and is correctly not a finding.)

## Things tests can't catch

- [x] No secrets in committed files.
- [x] No leftover `console.log` / `debugger` / `TODO` / `FIXME` in the new source. The only `console.warn` is the documented fire-and-forget profile-publish failure log in `index.ts:241` (per ADR F2-A), with an `eslint-disable no-console` matching the sibling `[upsync]` log. No stray eslint-disables in the new `profile/` or route files.
- [x] No commented-out code.
- [x] Error paths handled: 401 no_session, 400 invalid_url, 403 pubkey_mismatch, 401 reauth_required, 502 publish_failed, 501 when custodialSign absent.
- [x] **Merge-preserve (the whole point) — VERIFIED CLEAN.** The route feeds `deps.fetchRaw(user.pubkeyHex)` (→ `fetchRawKind0` → `pickNewestKind0` → `parseRawKind0Content`, which returns the RAW content object untouched) straight into `mergeSubstack` (`profile-substack.ts:93-95,128-130`). It never routes through the lossy `parseKind0`/`ProfileMeta` (which is itself untouched, still dropping `lud16`/`banner`/`website`). `mergeSubstack` clones with `{...(rawContent ?? {})}` (no input mutation — asserted by a unit test) and `delete result.substack` on clear (not `""`/`null`). Unknown fields survive. This is correct.
- [x] **Concurrency / clobber** — documented as accepted (ADR Decision 5; kind-0 latest-`created_at` wins). Mitigated by fetching the freshest raw kind-0 at template-build/sign time and bumping `created_at` strictly past it (`profile-substack.ts:59-66`). No locking, as designed.
- [x] **Security** — input validated at the boundary server-side; `validateSignedKind0` re-parses the body and runs `verifyEvent` on the fresh object (ADR 0004 verifiedSymbol discipline), gates kind/pubkey/signature before publish, and pins `substack` to valid-http(s)-or-absent. The sovereign body `url` is treated as a non-authoritative hint; the signed content is the source of truth (`profile-substack.ts:164-210`, `validate-kind0.ts:48-99`). No hand-rolled crypto (NIP-07 in the browser, ephemeral-wrap server-side).

## House rules check

- [x] PRD §11.3 scope discipline — only the `substack` field is settable. No name/bio/picture/nip05/lud16/website editor. No payments, no federation, no OAuth identity-mapping. Confirmed the form renders ONLY the Substack input (test-asserted).
- [x] POV-first — N/A; kind-0 is the user's own self-asserted metadata, true for everyone who reads it. No trust/GrapeRank path engaged.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking — RESOLVED

1. **`apps/web/src/routes/Settings.css:64` — RESOLVED in fix commit `b7e2496`.** The error message color previously used a new hardcoded hex literal (`color: #b3261e`) where the brand token `--signal-negative` already existed for the exact same semantic. The fix replaces it with `color: var(--signal-negative);`, matching `.auth-field-error` (`AuthForm.css:10`) and `.sub-error` (`Submit.css:206`). Re-verified: `grep #b3261e apps/web/src` returns nothing; the fix is a clean one-line CSS change (1 file, +1/-1) with no logic or test change. The UI-integrity house rule and the ADR's "no new hex literal" constraint are now satisfied.

### Non-blocking

1. **`apps/api/src/profile/validate-kind0.ts:59`** — the `_expectedSubstack` parameter is accepted but unused (the function light-checks the signed content's `substack` rather than byte-comparing). This matches the ADR note (the `url` hint is redundant; the signed content is the source of truth) and the test plan explicitly sanctions it, so it is correct as designed. Optional: a short note at the call site, or dropping the param, would remove the dead argument. Not blocking.

## Verdict

**PASS** (re-verified 2026-05-30 at fix HEAD `b7e2496`)

The single blocking issue from the prior CHANGES_REQUESTED review is resolved. Fix commit `b7e2496` replaces the new hex literal at `Settings.css:64` (`color: #b3261e`) with `color: var(--signal-negative);`, matching every sibling form-error style; `grep #b3261e apps/web/src` now returns nothing, and the fix is a clean one-line CSS change with no logic or test change. No other new hardcoded hex values that should be tokens were found (the `#ffffff` input background at `Settings.css:47` is the established pattern across 8 components — not a finding).

All three gates re-run by the reviewer at the fix HEAD are green:
- `pnpm -r typecheck` — **PASS.** 6 of 7 workspace projects (schemas, search, seeder, indexer, api, web) all `Done`, no errors.
- `pnpm -r test` — **PASS.** api **407 passed | 10 skipped** (53 files passed, 2 skipped); web **117 passed** (27 files). Same totals as the prior run, including the 69 new Story-22 tests.
- `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit` clean; `vite build` 427 modules, built in ~0.55s.

All prior verification stands: merge-don't-clobber reads raw content and never the lossy parse, the three-tier signing (sovereign NIP-07 / custodial ephemeral-wrap / anon blocked) and the local-first + best-effort profile-relay fan-out match the ADR, the `Publisher` type / injectable publisher is correct, there is no hand-rolled crypto, the copy passes the no-slop rules, and scope is held to the single `substack` field. Mergeable.

The one non-blocking note (unused `_expectedSubstack` param in `validate-kind0.ts:59`) is sanctioned by the ADR and test plan as designed; not a merge blocker.
