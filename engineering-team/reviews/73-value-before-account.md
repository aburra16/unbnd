# Review: Story 73 — Value before account on shared links

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-07
**Diff:** `git diff main...HEAD` (impl commit `9b1775d` + review nit fixup)

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (0 `error TS`).
- [x] `pnpm --filter @unbnd/web test` — **pass** (`60 passed`). Story files: `account-prompt` 9/9 + the seven updated control/route tests green.
- [x] `pnpm -r test` — pass (an `apps/api/curator-roles-vouch-ui` timeout under parallel load passes 6/6 in isolation; unrelated to this web-only change).
- [x] `pnpm --filter @unbnd/web build` — **pass**.
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-3: all six write actions (rate/save/follow/vouch/tag/submit) render the prompt when signed out; the Vouch silent dead end is closed (renders the prompt, still no eligibility query).
- [x] AC-4: the CTA is a "Create account" router `<Link to="/auth">`; framing is "Create a free account …", not "sign in".
- [x] AC-5: the per-action sentence names the unlock (`it.each` over all six).
- [x] AC-1/AC-2/AC-6: structural — no route guard in `App.tsx`; `AccountPrompt` only renders inside a control's signed-out branch (never an interstitial). Read content coexists with the inline prompt (control tests demonstrate).
- [x] No criterion dropped; behavior beyond the story is limited to the intended unification.

## ADR adherence (0071)
- [x] Option A built exactly: one `AccountPrompt` keyed by `AccountAction`, one copy map, swapped into all six controls. `VouchButton` branches signed-out **first** (before the eligibility query) — preserves "does not query when signed out".
- [x] CTA is a router `<Link>` (no raw `<button>` — the no-raw-`<button>` guard stays green); `/auth` reused (account creation + existing sign-in); no return-to (deferred to #73b).
- [x] Five ad-hoc gate styles addressed: `.rate-gate`, `.shelfc-gate`, `.tagc-gate`, `.follow-signin` removed; `.sub-submit-note` correctly **kept** (still used by the submission-policy paragraph, `Submit.tsx:484`). No orphaned styles.
- [x] No new dependency, no `@unbnd/ui` change.

## DList integrity
- [x] N/A — no event shapes; auth-gating + presentation only.

## UI integrity
- [x] Brand tokens only in `AccountPrompt.css` (`--u-muted`, `--u-amber`, `--u-font-size-14`, `--u-space-8`, `--u-radius-4`, …) — no new hex literal.
- [x] No icon library; CTA is text.
- [x] Copy follows the no-slop rules: "Create a free account to {phrase}." — no em dash (asserted by a test), no rhetorical contrast, no filler. Matches the wireframe `#shared` voice. (Two em dashes that were in *code comments* of the new files were reworded during review for consistency with the bar.)
- [x] Accessible: prompt is `role="note"`; CTA is a labeled link with a `:focus-visible` outline.

## Things tests can't catch
- [x] No secrets, no `console.log`, no commented-out code.
- [x] Loading state: no prompt flash — `RatingControl`/`Submit` show the prompt only for definitive `signed-out` (not `loading`); `VouchButton`/`FollowButton` return null while loading.
- [x] Security: the CTA is a static internal route (`/auth`); no user input in the prompt; no new boundary.

## House rules check
- [x] PRD scope: no out-of-scope surface; the read stays open, the gate sits at the write.
- [x] POV-first: the prompt fabricates no viewer-relative signal; anonymous viewer-relative signals remain honestly absent (out of scope, by design).
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
_None._

### Non-blocking
1. **Mild copy repetition.** The body says "Create a free **account**…" and the CTA says "Create **account**." Intentional (matches the wireframe's line + button) and clear; could later shorten the CTA to "Get started" if it reads redundant. Cosmetic.
2. **Return-to after account creation (deferred, #73b).** The CTA routes to `/auth`; the reader does not return to the originating book/profile after creating an account. Tracked as the ADR-noted fast-follow (needs safe-redirect handling). Worth queueing alongside the Block 2 carry-forward.

## Verdict
**PASS** — all gates green, all ACs covered (AC-1/2/6 structurally, AC-3/4/5 by test), ADR 0071 + house rules adhered to, dead styles cleaned, no new dependency. The two non-blocking items are cosmetic / a tracked follow-up.
