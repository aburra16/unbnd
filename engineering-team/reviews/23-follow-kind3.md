# Review: Story 23 — Follow / unfollow a user (kind-3 contact-list write, safe merge)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-31
**Diff:** `git diff main...feat/follow` (merge-base `41f750a`, HEAD `78b20f5`)
**Story:** `engineering-team/stories/done/23-follow-kind3.md`
**ADR:** `engineering-team/decisions/0023-follow-kind3.md`
**Test plan:** `engineering-team/stories/done/23-follow-kind3.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 6 projects clean (schemas, search, api, seeder, indexer, web).
- [x] `pnpm -r test` — **PASS.** API `471 passed | 10 skipped (61 files)`; web `129 passed (29 files)`. The 10 skips are pre-existing (unrelated to Story 23). Stderr noise is expected (the error-sanitizer leak test + an offline-fetch test), not failures.
  - Story-23 subset, API: `follow-template` 16, `validate-kind3` 7, `profile-raw-kind3` 4, `publish-kind3` 6, `profile-follow` 25, `profile-stats-following-count` 6 = **64**.
  - Story-23 subset, web: `follow-button` 9, `profile-following-count` 3 = **12**.
  - Total **76** Story-23 cases (the test-plan said 78; the per-file numbers shifted — `follow-template` 17→16, `profile-follow` 24→25, `follow-button` 11→9). The delta is a count drift, not a coverage gap: every AC and every named edge case below maps to a passing test. Non-blocking.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit` clean; `vite build` 429 modules, no warnings.
- [x] _Lint not configured — skipped._

## Spec adherence (10 ACs)
- [x] **AC-1** control by tier/session; own-profile → no control; signed-out → sign-in link. `FollowButton.tsx:75-84`. Covered.
- [x] **AC-2** status drives Follow/Following, read from viewer's own kind-3. `FollowButton.tsx:62-73`; `profile-follow.ts:227-256`. Covered.
- [x] **AC-3** follow = append `p` tag, merge-preserve, fresh-on-null, idempotent. `follow-template.ts:40-56`. Covered (incl. no-dup keeping full payload).
- [x] **AC-4** unfollow = remove only matching `p` tag, no-op when absent. `follow-template.ts:49-50`. Covered.
- [x] **AC-5** merge-don't-clobber: whole list survives byte-intact. `follow-template.ts:47,50,55` + the byte-intact/order/clone tests. Covered. See merge audit below.
- [x] **AC-6** sovereign NIP-07; no-extension honest message. `FollowButton.tsx:96-106`; `validate-kind3.ts`. Covered.
- [x] **AC-7** custodial server-side sign; reauth 401 when key gone. `profile-follow.ts:132-180`. Covered.
- [x] **AC-8** publish local-awaited + profile-relay best-effort, NOT dcosl; created_at bumped. `publish-public-relay-kind.ts`; `profile-follow.ts:62-68`. Covered.
- [x] **AC-9** following-count = target's distinct kind-3 `p`-tag count, omit-on-throw. `profile-stats.ts:40-54,121-127,143`. Covered.
- [x] **AC-10** honest states, optimistic + revert, accessible. `FollowButton.tsx:88-123`. Covered.

## ADR adherence
- [x] Files changed match ADR Implementation notes exactly: `profile.ts` (`fetchRawKind3`/`pickNewestKind3`), new `follow-template.ts`, `validate-kind3.ts`, `routes/profile-follow.ts`, `profile-stats.ts` (+`followingCount`), `index.ts` wiring, new `publish-public-relay-kind.ts`, web `FollowButton.tsx`/`.css`, `api.ts`, `Profile.tsx`.
- [x] Layering respected: pure merge/validate, DI router, server stays server, web stays UI.
- [x] No new dependencies. Reuses `nostr-tools/pure` `verifyEvent`, `publishEvent`/`publishToMany`, ADR-0006 ephemeral wrap, `toHex`, NIP-07.
- [x] F1-A chosen (duplicate skeleton, share kind-agnostic primitives) — honored; `pickNewestKind3` factored, `publishPublicRelayKind` is the shared primitive. The shipped kind-0 path was not refactored (correctly out of scope).
- [x] F2-A chosen (split session-gated status `GET /api/profile/follows/:target` from public `/stats`-folded `followingCount`) — honored.
- [x] Followers-via-kind-30382 future direction recorded in the ADR deferred section (`0023:145-152`). Not implemented (correct).

## Targeted audit

### 1. Merge-don't-clobber (`mergeFollow`, AC-5) — CLEAN
`follow-template.ts:47` clones every inner tag (`.map(tag => [...tag])`) — input array and inner arrays are never mutated. Follow (`:53-55`) appends `["p", target]` only if absent (idempotent; an already-followed target keeps its full relay-hint/petname payload, no dup, no flatten). Unfollow (`:50`) filters out ONLY tags with `tag[0]==="p" && tag[1]===target`; every other `p` tag (with positions) and every non-`p` tag is preserved in order. `content` is passed through verbatim in `buildKind3Template` (`:64-75`). `created_at` bumped strictly past the fetched event (`profile-follow.ts:62-68`, handles future-dated). The merge tests assert order-preservation (`slice(0,4).toEqual(before)`), relay-hint+petname survival, idempotent-no-dup-with-payload, and a deep-clone reference check. No clobber or shallow-clone bug.

### 2. Three-tier write — CLEAN
Sovereign `{event}` → `validateSignedKind3` (kind 3, hex pubkey, pubkey-matches-session before the sig check, `verifyEvent`, `tags` array) → 403 on `pubkey_mismatch`, 400 otherwise (`profile-follow.ts:193-206`). Custodial `{target,action}` → server merge + `custodialSign` → 401 `reauth_required` when the key is gone, no publish (`:151-167`). Anon → 401 (`:123-128`). Self-follow → 400 before any merge/sign, on all three entry points (`:97-102,140-145,186-191`). Idempotent. No hand-rolled crypto (NIP-07 + ADR-0006 wrap + `verifyEvent` only).

### 3. Injected publisher (`publishPublicRelayKind` + `publishKind3`) — CLEAN, genuine injection
`publish-public-relay-kind.ts:36-60`: local awaited (gates the return), `publishMany` fan-out fired only on `local.ok`, the fan-out promise `.catch`-swallowed so a rejecting fan-out never fails the save, dcosl excluded by construction (caller passes `config.profileRelays`). `index.ts:251-258` builds it by passing `publishEvent`/`publishToMany` as arguments — a real injection, not an intra-module `vi.mock`. The publish-kind3 suite drives injected `publishLocal`/`publishMany` spies directly (the Story-22 lesson is honored).

### 4. Reads — CLEAN
`GET /api/profile/follows/:target` is session-gated (401 anon), resolves via `toHex` (404 unresolvable), self → `{following:false}`, else `{following}` from the viewer's kind-3 (`profile-follow.ts:227-256`). `followingCount` in `/stats` is a fourth parallel, independently-wrapped read author-scoped to the resolved target hex, counting DISTINCT `p` hexes via a `Set` (filters `kind===3` defensively), present-0, omit-on-throw — consistent with the other stat cells (`profile-stats.ts:121-143`).

### 5. The 3 disclosed existing-test edits — did NOT weaken coverage
- **(a) `profile-public.test.tsx`** — adds a `useSession` mock (settles signed-out → no control fires) and a `followStatus` stub so the import resolves. Purely additive; the Story-20 profile assertions are untouched. Justified.
- **(b) `profile-stats.test.ts` + `profile-stats-public.test.ts`** — the per-call `kinds` check is relaxed from `toContain(39999)` to `includes(39999) || includes(3)` to admit the legitimate new author-scoped kind-3 read. **Critically, the real intent — `expect(filter.authors).toEqual([USER]/[TARGET_HEX])` — is UNCHANGED on every call.** The author-scoping guard (the anti-leak assertion) still fails loudly if any read is unscoped or mis-scoped. The relaxation is justified, not a cover for a leak.
- **(c) `publish-kind3.test.ts`** — new file (no pre-existing edit to weaken). The disclosed "typing-only" change is benign.

### 6. FollowButton (UI) — MEETS the high bar
Crafted states match the spec: Follow filled amber, Following quiet outline + hand-authored SVG check, Unfollow revealed in `--signal-negative` on hover AND focus (`onFocus`/`onBlur`, keyboard-reachable). Optimistic flip with revert-on-failure and an honest `role="alert"` (no fabricated success). Signed-out → sign-in `<Link>`; own-profile → `null`. Accessibility: real `<button>`, `aria-pressed` reflecting status, accessible label, `:focus-visible` ring from tokens. Brand tokens only (verified every token resolves in `tokens.css`), no icon library (inline hand-drawn polyline check), no emoji. Copy clean against the no-slop ban list.

### 7. Invariants / scope — HELD
nostr-native (NIP-02 kind-3, no proprietary follow table); npub-display / hex-internal (`toHex` server-side); honest uncapped count; no new tooling/deps; no secrets/debug (the two `console.warn` are ADR-sanctioned fan-out logging). No followers-count, no byline buttons, no personalization in source (grep-confirmed). The 30382 followers future note is in the ADR deferred section.

## Things tests can't catch
- [x] No secrets in committed files.
- [x] No leftover debug logging (the 2 `console.warn` are intentional fan-out-failure logs).
- [x] No commented-out code.
- [x] Error paths handled (401/400/403/502/reauth all mapped + tested).
- [x] Concurrency: the multi-client clobber window is named and accepted in the ADR (merge-from-freshest at sign time); not closed, by design.
- [x] Security: identity gate before the sig check; self-follow rejected before fetch/merge; `toHex` validates targets at the boundary.

## House rules check
- [x] PRD §11.3 scope discipline: nothing out-of-scope sneaks in.
- [x] POV-first: not engaged by the write or the self-asserted following-count (ADR §Constraints; correct).
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`FollowButton.tsx:136`** — the Following button's `aria-label` interpolates the raw npub (`target`), so a screen reader announces "Following npub1…, activate to unfollow". The ADR suggested a display name; `Profile.tsx` passes only `target={npub}`, and the display name is available there. Optional polish on staging: thread `displayNameOf(meta)` into the label. Honest and functional as-is.
2. **Test count drift** — 76 Story-23 cases vs. the test-plan's 78. Coverage is complete; the plan's per-file counts are stale. Cosmetic.

## Verdict
**PASS**
