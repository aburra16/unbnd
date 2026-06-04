# Review: Story 45 — `Button`/`IconButton` primitives, the bespoke-button migration, and the no-raw-`<button>` guard

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` (branch `story-45-button-primitives`, PR #88; commits `0ace0fd` ADR revise → `8d94ddd` Tester guard → `444f797` Implementer migration → `d8da2b7` auth-submit fix)
**Story:** `engineering-team/stories/done/45-button-iconbutton-primitives.md`
**ADR:** `engineering-team/decisions/0045-button-iconbutton-primitives.md` (Accepted, REVISED Option 3 + USER SIGN-OFF)

This was reviewed fresh, re-deriving from the ADR and the code rather than trusting the author. Because the Story-39 `visual` job can only partially cover this change (the fixtures are signed-out with minimal data, so most normalized buttons never render in the 6 captured screens), the **code-level audit of the built CSS bundle is the primary proof** for the normalized buttons. That audit was done against `apps/web/dist/assets/index-*.css` produced by a clean `pnpm --filter @unbnd/web build`.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS**. All 10 workspace projects, including `packages/ui` self-typechecking the new `.tsx` (tsconfig `jsx: react-jsx` + `DOM` lib added).
- [x] `pnpm -r test` — **PASS**. Full workspace green: `packages/ui` 15/15 (10 files), `apps/web` 300/300 (52 files), plus schemas 112, api 784, trust 23, shelves 26, search 11, indexer 6, promoter 28, seeder 12. No failures. (stderr noise from mocked-network/fail-open tests, not failures.)
- [x] `pnpm --filter @unbnd/ui test` — **PASS**. Button guard green (only the 5 deferred remain); Story-40..44 guards (color/type/spacing/shape/motion/breakpoints/palette-sync/token-refs) all green.
- [x] `pnpm --filter @unbnd/web build` — **PASS** (`tsc --noEmit && vite build`, 453 modules).
- [x] `gh pr checks 88` — **all PASS**: Typecheck/test/build, Validate Caddyfile, **Visual regression**. **0 `*.png` baselines changed** in `git diff origin/main...HEAD` (verified).
- [x] _Lint not configured — skipped._

## Guard integrity

- [x] **Authorship preserved.** `packages/ui/test/architecture-button-literals.test.ts` is touched **only** by the Tester commit `8d94ddd`. The Implementer commit `444f797` and the fix `d8da2b7` do **not** modify it, nor any other `architecture-*.test.ts` or `tokens.test.ts` (verified by `git diff 8d94ddd 444f797 --name-only` and `git diff 444f797 d8da2b7 --name-only`).
- [x] **The guard is real.** It flags raw `<button>` JSX opening tags, is **comment-aware** (a `stripComments` pass whitespaces out `//` and `/* */` so `CopyButton.tsx:2`'s `// <button>` is not counted — the documented 38-vs-37 correction), is brace/string-aware in its tag scan, and also catches `createElement("button")` and the polymorphic `"button"`-tag literal (with a negative lookbehind that correctly excludes `type="button"`).
- [x] **DEFERRED allowlist is the 5 sites, by class name.** Exemption is keyed to `className` containing one of `auth-linklike`, `sub-back`, `gps-pill`, `rated-by-more`, `searchbox-hit` — not to whole files — so a new raw `<button>` with any other class still fails even inside a file that holds a deferred button. The comment documents it as a countdown-to-empty. Confirmed no false-positive `"button"` literals exist in `apps/web/src` today beyond `type="button"`.

## The primitives (`Button.tsx` / `IconButton.tsx` + CSS)

- [x] 5 variants `primary | secondary | ink | ghost | danger`; **no `tone` axis** anywhere.
- [x] `size: sm|md|lg`; `accent` (secondary-only, gated `if (accent && variant === "secondary")`); `selected`/`block`/`loading`.
- [x] `loading` sets **only** `aria-busy={loading || undefined}` — no auto-disable, no spinner.
- [x] `type` is **not** defaulted; it flows through `...rest` (verified — no `type=` in the primitive body).
- [x] `selected` drives the visual class only and does **not** force `aria-pressed` (callers pass their own `role`/`aria-selected`/`aria-pressed`).
- [x] `className` is appended last and is additive-layout-only; the skin lives entirely in the primitive CSS — there is no re-skin path in the component (the leak is at two call sites, see Findings).
- [x] Standardized **2px amber `:focus-visible` ring** on `.u-btn` and `.u-iconbtn`; `--signal-negative` override for `.u-btn--danger` and `.u-btn--secondary.is-selected` (the unfollow danger state).
- [x] CSS references only `var(--u-*)` / `var(--signal-negative)` / `var(--font-sans)` — no literals, no minted token (the Story-40..44 guards stay green, confirming).

## The normalization-delta audit (the key check — code-level, against ADR §2)

Audited the **built CSS bundle** (so cascade order, not just source, is accounted for). Every approved §2 delta lands exactly; no unapproved delta was introduced.

**Off-color primary text → `--u-parchment`:** `set-save`, `foryou-invite-btn` — their classes drop the old `color: --u-night` / `--u-ink`; text now inherits `--u-parchment` from `.u-btn--primary`. ✅
**Ink curation buttons KEPT ink (not amber), radius → 8px:** `dc-proceed` → `variant="ink"` zero-diff; `tagc-apply`, `shelfc-add` drop `--u-radius-6` (→ 8px via `.u-btn`); `author-edit-save` drops `--u-radius-pill` and `--u-on-ink` (→ 8px + `--u-surface-card`). JC-1 honored — these stayed ink-filled. ✅
**Secondary border collapse → `--u-border`, fill → transparent:** `set-clear`, `copy-btn`, `search-more-btn`, `claim-btn`, `tagc-dispute`, `dc-proceed-quiet`, `pov-btn`, `shelfc-remove`, `cs-promote` carry **no** `border`/`background`/`border-radius`/`color` residue in the bundle — all from `.u-btn--secondary`. `search-more-btn`'s `--u-surface-card` fill → transparent confirmed. ✅
**Muted secondary text → `--u-ink`:** `pov-btn`, `shelfc-remove` no longer set `color`; inherit `--u-ink`. ✅
**Secondary radius → 8px:** `claim-btn` (+1px), `shelfc-remove` (+2px), `tagc-dispute` (+2px) — all drop their radius override. ✅
**`dc-proceed-quiet` weight regular → medium:** class no longer sets weight; medium from `.u-btn--md`. ✅
**Toggle unify (JC-4):** `.pov-sw-active` and `.rp-tab-on` skin are **gone**; both toggles now use the single `.u-btn--ghost.is-selected` = `surface-card` + `--u-elevation-1b` + `--u-radius-6`. `pov-sw` normalized off 1c/7 onto 1b/6 exactly. ✅
**`rp-personalize` accent kept zero-diff (JC-2b):** `variant="secondary" accent` → `.u-btn--secondary.u-btn--accent` reproduces the amber `color`+`border` value-for-value. ✅
**`follow-following` unfollow danger as a state:** `.is-unfollow` class removed; reproduced as `selected` → `.u-btn--secondary.is-selected` (text+border+focus → `--signal-negative`); resting `--u-surface` fill kept as intended state residue. ✅

**No unapproved visual change found.** Spot-checked the zero-diff buttons (`sub-submit-btn` correctly slimmed to `align-self` only with `12 28` from `lg`; `cs-promote`; `acct-signout`; `searchbox-seeall`; the ghost resting-color residue is the deliberate per-call-site identity the ADR designs for). No zero-diff button gained a color/padding change.

## The auth-submit fix

- [x] `.auth-submit` skin block is **byte-identical** to `git show origin/main:apps/web/src/components/AuthForm.css` (compared block-for-block). Only a clarifying comment was added above it.
- [x] `AuthWelcome.tsx` is **not** in the diff; its `<Link className="auth-submit">` is unchanged. The fix correctly preserves the shared-class skin for the one remaining non-button consumer (the welcome-screen Link, captured by `auth-welcome.png`).

## Migration fidelity (spot-checked ~10 sites)

- [x] `auth-submit` ×2, `cta-btn`, `set-save`, `sub-submit-btn`, `rate-submit`, `follow-follow`/`follow-following`, `pov-sw` ×2, `pov-btn`, `dc-proceed`/`dc-proceed-quiet`, `acct-signout`, `rate-star`, `acct-trigger`, `cs-promote` — each carries `type`/`onClick`/`disabled`/`aria-*`/`role`/`key`/label **verbatim**.
- [x] **Toggles keep their own aria.** `pov-sw` and `rp-tab` keep `role="tab"` + `aria-selected={...}` (the `-active`/`-on` ternary replaced by the `selected` prop); `role="tablist"` stays on the parent. `rate-star` keeps `aria-pressed`. No forced `aria-pressed` on tabs.
- [x] **Bespoke classes slimmed.** `FollowButton`, `Settings`, `Shelf`, `Submit`, `CommunitySubmissions`, `DuplicateCheck`, `Tag/Shelf/Rating/Claim/RatingsPanel` CSS all have their skin stripped to layout/state/identity residue only. `FollowButton` is the model migration (skin fully removed, danger state via `selected`).
- [x] **`cta-btn` polymorphic split.** `CallToAction.tsx` splits `ctaHref ? <a className="cta-btn"> : <Button … className="cta-btn">`; the `"button"` tag literal is gone (the guard's polymorphic check passing is the proof the `<Btn>` was resolved). `IconButton` carries the raw `<Star>`/`<Avatar>` node as `children`.

## Deferrals

- [x] All 5 deferred sites remain raw `<button>` with their exempt class: `auth-linklike` ×2 (`AuthEmailSignup.tsx`), `sub-back` (`Submit.tsx`), `gps-pill` (`GenrePillSelector.tsx`, untouched), `rated-by-more` (`RatedByRow.tsx`, untouched), `searchbox-hit` (`SearchBox.tsx`).

## Package config

- [x] `@types/react@18.3.29` + `@types/react-dom@18.3.7` added to `packages/ui` devDeps, **exact-pinned** (no caret) per the version-pin house rule; resolved cleanly in `pnpm-lock.yaml`.
- [x] `packages/ui/tsconfig.json`: `jsx: "react-jsx"` + `"DOM"`/`"DOM.Iterable"` added. Package self-typechecks the `.tsx` (typecheck pass confirms). React stays a peer dep; no build step added.

## Gates + visual, and the fixture-coverage gap

- [x] All gates green; `visual` success with **no baseline PNG changed**.
- **The gap (assessed, as the brief requires):** the 6 captured fixtures (`auth-welcome`, `home`, `book-detail`, `search`, `submit`, `profile`) are **signed-out with minimal data**, so most migrated/normalized buttons never render in them:
  - **Curation controls are session-gated** (`TagControl`, `ShelfControl`, `RatingControl`, `ClaimControl`) — so `tagc-apply`/`tagc-dispute`/`shelfc-add`/`shelfc-remove`/`rate-star`/`rate-submit`/`claim-btn` (several of which carry NORMALIZE deltas) are **not** in any captured screen.
  - **Auth submit + CTA button branches not rendered:** `auth-welcome.png` renders the `<Link className="auth-submit">`, not the two migrated `<Button className="auth-submit">`; `home.png` passes `ctaHref="/auth"`, so it renders the `cta-btn` `<a>` branch, **not** the migrated `<Button>` branch.
  - Net: the `visual` green proves only that the screens the fixtures *do* render are unbroken. It does **not** prove the normalized buttons look right. That proof is this review's code-level CSS audit above (which passed).
- **Why no baseline moved despite a "deliberate visual-change story":** ADR §6.5 anticipated baseline diffs for normalized screens, but because no normalized button renders in any fixture, there was nothing to re-baseline. Consistent, but it means the harness contributed no coverage of the normalizations.

## House rules check

- [x] PRD §11.3 scope: untouched (developer-facing infra; no product surface).
- [x] POV-first: N/A; no truth/aggregation change.
- [x] No new lint/typecheck/build tooling; guard is a Vitest test under `pnpm -r test`; `@unbnd/ui` keeps no build step.
- [x] Brand tokens are the source of truth: primitives reference only `var(--u-*)`; no new token, no hex literal.
- [x] No icon library; `IconButton` carries the existing inline SVG node as `children`.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/web/src/routes/AuthEmailSignup.tsx:138`, `apps/web/src/routes/AuthNostrConnect.tsx:174`, `apps/web/src/components/CallToAction.tsx:28`** — Re-skin leak via `className`. These migrated `<Button>`s keep `className="auth-submit"` / `className="cta-btn"`, and those classes still carry **full skin** (`background`, `color`, `border`, `border-radius`, `padding`, hover) in the bundle, so the skin double-applies on top of the primitive. This is technically a soft breach of the ADR 0038 §2 / ADR 0045 §1 rule that `className` is additive-layout-only (contrast `sub-submit-btn`/`set-clear`, correctly slimmed to layout/state residue). **It does not change pixels today:** `.auth-submit` (built-CSS byte offset 55718) wins its `padding`/`font-size` conflict over `.u-btn--md` (offset 336) by equal-specificity source order, reproducing the original `12 16`/font-14 look; the amber/parchment/border/radius values match the primitive. It is non-blocking because (a) pixels are unchanged, proven from the bundle, and (b) the classes are legitimately still needed by the un-migrated non-button siblings they were shared with (the AuthWelcome `<Link>`, the `cta-btn` `<a>` branch), both deferred to the Link primitive in story 10. The clean fix is to give the migrated buttons a layout-only class (and a real size for the `12 16`/14 inset) rather than sharing the skin class — naturally resolved when those Links migrate in story 10. *Flagged as a follow-up (see below).*
2. **Fixture-coverage gap (process/coverage, not a code defect).** The normalized buttons are not visually verified by the Story-39 harness (analysis above). Recommend a follow-up to enrich the visual fixtures with a signed-in/data-bearing variant **or** add a dedicated component-gallery route captured by Story-39, so future button changes (and these normalizations) are pixel-gated, not review-gated. *Flagged as a follow-up.*
3. **Guard latent false-positive (minor).** `POLYMORPHIC_BUTTON` matches any `"button"`/`'button'` string literal except `type="button"`. None exist in `apps/web/src` today beyond `type`, so the guard is correct now, but a future legitimate `role="button"` on a non-button element would be flagged as a false offender. Worth a small tightening (also exclude `role`/`aria-*` keys) when convenient; non-blocking.

## Verdict
**PASS**

The primitives, the migration, the guard, the package config, and every approved §2 normalization delta are correct and verified at the code level; all gates and CI are green with no baseline change. The three findings are non-blocking: the re-skin-leak is pixel-neutral and tied to siblings that retire in story 10, and the fixture-coverage gap and guard tightening are follow-ups, not merge blockers.
