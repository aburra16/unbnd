# Review: Story 22 — Set your Substack link (the first kind-0 profile write, safe merge)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-30
**Diff:** `git diff main...feat/substack-set` (merge-base; HEAD `94daba9`)
**Story:** `engineering-team/stories/22-substack-set.md`
**ADR:** `engineering-team/decisions/0022-substack-set.md`
**Test plan:** `engineering-team/stories/22-substack-set.test-plan.md`

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
- [ ] **Brand tokens — one violation.** `Settings.css` uses brand tokens for every decision EXCEPT the error color: `Settings.css:64` hardcodes `color: #b3261e`. The codebase already has a token for exactly this (`tokens.css:31` `--signal-negative: #DC3545`), used by both sibling form-error styles (`AuthForm.css:10` `.auth-field-error { color: var(--signal-negative); }`, `Submit.css:206` `.sub-error { color: var(--signal-negative, #dc3545); }`). See Blocking #1. (`#ffffff` for the input background at `Settings.css:47` is the established pattern — 8 existing components use it — and is not a finding.)

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

### Blocking

1. **`apps/web/src/routes/Settings.css:64`** — the error message color is a new hardcoded hex literal (`color: #b3261e`) where a brand token already exists for the exact same semantic. `tokens.css:31` defines `--signal-negative: #DC3545`, and both sibling form-error styles use it (`AuthForm.css:10`, `Submit.css:206`). The UI-integrity house rule ("No new hex literals outside `tokens.css` and per-component genre/signal colors") and the ADR's own constraint ("no new hex literal") are breached, and the value silently diverges from the project's negative-signal color. **Asked change:** replace `color: #b3261e;` with `color: var(--signal-negative);` (matching `.auth-field-error`). One-line fix; no logic change, no test change.

### Non-blocking

1. **`apps/api/src/profile/validate-kind0.ts:59`** — the `_expectedSubstack` parameter is accepted but unused (the function light-checks the signed content's `substack` rather than byte-comparing). This matches the ADR note (the `url` hint is redundant; the signed content is the source of truth) and the test plan explicitly sanctions it, so it is correct as designed. Optional: a short note at the call site, or dropping the param, would remove the dead argument. Not blocking.

## Verdict

**CHANGES_REQUESTED**

One blocking issue: `Settings.css:64` introduces a new hex literal (`#b3261e`) for the error color where the established brand token `var(--signal-negative)` exists and is used by every sibling form. This breaches a codified UI house rule and the ADR's "no new hex literal" constraint. Everything else is clean: all three gates pass (typecheck, 407+117 tests incl. the 69 new, web build), the merge-don't-clobber is verified to read raw content and never the lossy parse, the three-tier signing and the best-effort first-external-relay fan-out match the ADR, and the copy passes the no-slop rules. Fix the one CSS line (`color: var(--signal-negative);`) and this is mergeable.
