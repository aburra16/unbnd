# Review: Story 29 — Profile IA: progressive disclosure of nostr internals

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-06-01
**Diff:** `git diff main...feat/profile-ia`
**Story:** `engineering-team/stories/done/29-profile-ia-nostr-disclosure.md` (7 ACs; nsec-export OUT; tier-differentiated; Settings-home)
**ADR:** `engineering-team/decisions/0030-profile-ia-nostr-disclosure.md` (incl. the 2026-06-01 Amendment pinning the presentation)
**Test plan:** `engineering-team/stories/done/29-profile-ia-nostr-disclosure.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 6 projects clean.
- [x] `pnpm -r test` — **PASS.** web 41 files / 231 tests, **0 skipped**; api 564 passed / 10 skipped (pre-existing env-gated integration suites — no Story-29 work hidden). Grepped for `.skip`/`.todo`/`xit` — none.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** tsc + vite, 434 modules.

## Spec adherence (7 ACs)
- [x] **AC-1** — raw npub gone from the default header; `ProfileMe.tsx` tier branch (custodial: no npub; sovereign: labeled truncated chip).
- [x] **AC-2** — Settings "Nostr identity" `<section>` (both tiers): heading + explainer + "Your npub" label + chip + CopyButton.
- [x] **AC-3** — click-to-copy, keyboard-activatable, announced via `role="status"`, clipboard-failure-safe.
- [x] **AC-4** — slop-free explainer present as on-page text (asserted not a `title` tooltip).
- [x] **AC-5** — tier-differentiated on `email === null`; no path where custodial sees a bare npub or sovereign loses copy access.
- [x] **AC-6** — Settings aligned for both tiers; Substack (Story 22) + display-name (Story 27b) fields intact; npub is not an editable textbox.
- [x] **AC-7** — no new data/API/schema/write/crypto/deps; only `session.user.npub`/`email` + `useProfileMeta`; clipboard is a platform API.

## Targeted assessments
- **CopyButton:** real `<button type="button">`, copies the FULL value (not the truncated display), `aria-label="Copy your npub"` stable, transient state in a single `role="status"`/`aria-live` region, `navigator.clipboard?.writeText` optional-chaining + try/catch (rejected promise OR absent clipboard → "Copy failed", never throws, never false-reports), revert `setTimeout` cleared on unmount. The status-region-only transient (stable button name) is the more a11y-correct pattern.
- **Truncated-visible / full-copied:** holds on both surfaces; `shortNpub` reused unchanged (empty diff); no own-profile/settings surface renders a bare full npub (grep-proven; the public `Profile.tsx` twin is a different, out-of-scope surface).
- **On-page text not tooltip:** old `title="npub…"` removed from `ProfileMe.tsx`; sovereign header has no explainer line.
- **Copy quality:** all shipped strings slop-free (em dashes only in code comments); no new hex (existing tokens only).

## Test integrity
- 5 migrated files (`profile-me-polish/-shelves/-capped/-substack.test.tsx`, `settings.test.tsx`) preserve their original Story-18/19/20/21 behaviors verbatim; only the npub-display expectation + tier changed. The `settings.test.tsx` "only Substack field" → "no editable name/bio/picture/nip05 fields" rename kept all negatives + added one — faithful, not loosened.
- The Tester's type-fix (`cfdb853`) widened `settings-nostr-identity.test.tsx`'s `describe.each` table type `typeof sovereignUser` → `PublicUser` — type-only, no value/assertion/data change.
- New tests (copy-button 10, settings-nostr-identity 16-expanded, profile-me-nostr-identity 8) meaningful + deterministic (mocked clipboard/session/profileMeta, no `Date.now()` in asserted output, no intra-module vi.mock, role-scoped queries).

## Findings

### Blocking
None.

### Non-blocking (handled at close-out)
1. ADR §1 prose "visible label swaps to Copied" reconciled to the shipped `role="status"` pattern.
2. PRD Appendix C-5's false "export nsec → NIP-07 already exists from Phase 1" claim corrected (nsec-export does not exist; scoped OUT of Story 29, deferred as a future story).

## Verdict
**APPROVED**
