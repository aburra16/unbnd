# Review: Story 44 — Two-tier motion tokens (durations / easings), the `transition`-shorthand sweep, the global reduced-motion block, and the motion CI guard

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, re-derived; did not write the code, guard, ADR, or story)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` on branch `story-44-motion-tokens`, PR #87. Commits: `adbfba4` (story draft) → `67581d5` (ADR 0044 Accepted) → `8a83512` (Tester: motion CI guard, red set) → `3e490ca` (Implementer: two-tier motion tokens + reduced-motion block + 18-file sweep). 22 files, +900/-45.
**Story:** `engineering-team/stories/done/44-motion-tokens.md` (this review wrote this path post-move)
**ADR:** `engineering-team/decisions/0044-motion-tokens.md` (Accepted; refining ADR under umbrella 0038, mirrors 0040/0041/0042/0043; held to the Story-39 `visual` gate via 0039)
**Epic:** `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 7 — the motion axis and the last of the token-ish axes)
**Classification:** behavior-preserving zero-diff refactor + ONE intentional, ADR-0038-sanctioned accessibility addition (the reduced-motion block). Flow PO → Architect → Tester → Implementer → Reviewer.

## Verdict: **PASS** (APPROVED)

The diff delivers exactly what ADR 0044 specifies and nothing more: a two-tier motion model in `packages/ui/styles/tokens.css` (6 value-keyed raw duration tokens `--u-raw-duration-{120,140,150,160,180,200}ms` + 1 raw easing `--u-raw-ease-default: ease`, behind thin value-keyed Tier-2 aliases), the 29-declaration `transition`-shorthand sweep (each duration → `var(--u-duration-<n>ms)`, each `ease` → `var(--u-ease-default)`, property names and comma-layer structure preserved), and the ONE intentional behavior addition: a single global `@media (prefers-reduced-motion: reduce)` block zeroing the six semantic duration aliases to `0.01ms`. The prime directive — **default-state zero-diff** — holds, proven three ways: (1) the CI `Visual regression` job is zero-diff success with no baseline touched; (2) a source-level reverse-substitution of every token back to its computed literal reproduces `origin/main` byte-for-byte across all 18 swept files; (3) the reduced-motion block is provably inert at the no-preference media state the gate captures. Guard integrity is intact: the Implementer modified no guard file; the new motion guard is byte-identical to the Tester's commit, and no prior guard or `tokens.test.ts` was touched. The guard is real (flags bare durations + easings, excludes `var()`/`none`/zero, parenthesis-aware on `cubic-bezier`, asserts the reduced-motion block present). The ADR header gate resolutions are honored exactly. All findings are non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm --filter @unbnd/ui test` — **PASS.** 9 files, 14 tests. New `architecture-motion-literals` (2 tests: literal scan 0 offenders + reduced-motion presence) green; prior guards (`architecture-spacing-literals`, `architecture-shape-literals`, `architecture-type-literals`, `architecture-color-literals`, `architecture-token-refs`, `architecture-palette-sync`, `architecture-breakpoints`) and `tokens.test.ts` all still green.
- [x] `pnpm -r typecheck` — **PASS, zero errors.** All workspace projects clean (web, ui, api, trust, schemas, search, seeder, indexer, promoter, shelves).
- [x] `pnpm --filter @unbnd/web test` — **PASS.** 52 files, **300 passed**, unchanged from `main`.
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build`, 449 modules, built in 572ms. CSS asset hash changes legitimately (the token-sheet and app-CSS source text changed; a structural CSS-source change, not a rendered-value change). The visual gate is the authority on pixels and it is zero-diff.
- [x] `pnpm -r test` (full workspace) — **PASS.** ui 14, web 300, schemas 112, trust 23, search 11, promoter 28, indexer 6, seeder 12, shelves 26, api 784 (+10 skipped). No failures.
- [x] **PR #87 CI** (`gh pr checks 87`): **all three jobs pass** — "Typecheck, test, build" (1m51s), "Validate Caddyfile" (6s), and **"Visual regression" (1m7s) zero-diff success**.
- [ ] _Lint not configured — skipped (house rules)._

The visual suite was not run locally (no Docker; baselines are Linux-canonical under the pinned Playwright image). Verified via CI status + the source-level zero-diff proof below, the local proxy for pixel-identity.

---

## 1. Guard integrity (process check) — **PASS**

The Tester authored `packages/ui/test/architecture-motion-literals.test.ts` in commit `8a83512` (the commit touches that file and nothing else). I verified the Implementer commit `3e490ca` modified **NONE** of the guard tests:

- `git show --name-only 3e490ca` lists 19 files: 18 app CSS files + `packages/ui/styles/tokens.css`. **No file under `test/`.** `grep` of that list for `architecture-*.test.ts` / `tokens.test.ts` → nothing.
- `git diff 8a83512 HEAD -- packages/ui/test/architecture-motion-literals.test.ts` → **IDENTICAL**. Byte-identical Tester → HEAD.
- `git diff --name-only origin/main...HEAD -- 'packages/ui/test/*.test.ts'` lists **only** `architecture-motion-literals.test.ts` — no prior guard (`tokens.test.ts`, the color/type/spacing/shape/breakpoint guards) was added, removed, or weakened on this branch.

The Implementer made the guard green by removing offenders and adding the reduced-motion block, not by editing the guard.

**The guard is REAL, not vacuous.** I read all 342 lines and independently exercised its classifier (`componentIsMotionLiteral` / `splitLayers` / `splitComponents` logic) against constructed values:
- `transition: color 120ms ease` → **OFFENDER** (both `120ms` and `ease` are raw literals).
- `transition: width 200ms ease` → **OFFENDER**.
- `transition: color var(--u-duration-120ms) var(--u-ease-default)` → **passes** (property name `color` is neither a duration nor an easing; the other two are `var()`).
- `transition: none` → **passes** (`none` is a `KEYWORD_VALUES` member).
- `transform 0ms ease` → **OFFENDER** — correctly, on the bare `ease`; the `0ms` itself is exempt via `isZeroDuration` (value-stable), but the bare easing keyword is still a literal. The guard does not let a `0ms`-bearing declaration smuggle a raw `ease`.
- `cubic-bezier(0.4, 0, 0.2, 1)` (bare, not in `var()`) → **OFFENDER** — caught as a bare easing-function atom; `splitLayers` is parenthesis-aware so its internal commas are NOT treated as layer breaks.

So the guard flags a bare duration/easing in a `transition`, excludes `var()`/`none`/`0ms`, handles `cubic-bezier` commas, and (assertion b) asserts the reduced-motion block. Property scope covers both shorthands plus `transition-duration`/`-timing-function`/`-delay` and `animation-duration`/`-timing-function`/`-delay` defensively (none exist today; covered so a future one cannot land raw). `transition-property`/`animation-name` (carry no duration/easing) and `scroll-behavior` are correctly NOT scanned (ADR Option I). The TSX forward net matches inline-style motion keys assigned a literal but never an expression (green on landing; none exist).

**The reduced-motion presence assertion is live.** `REDUCED_MOTION_PATTERN = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/` — I confirmed it matches `tokens.css` on HEAD; it locks the accessibility addition so a later edit cannot silently remove it. It asserts presence only (not the interior token list), per ADR 0038 §6 / the epic story-7 line, deliberately decoupled from exact alias spellings (the literal scan + visual gate cover the values).

**Allowlist is exact:** `ALLOWLIST = new Set(["packages/ui/styles/tokens.css"])` — names **only** the token sheet. `data`, `e2e`, `test` are `SKIP_DIRS` scope-exclusions (not allowlist entries), consistent with the prior guards. No TS file is allowlisted (no motion-scale TS constant exists).

## 2. Default-state ZERO-DIFF (the prime directive) — **PASS**

The decisive source-level proof: I reverse-substituted every motion token in all 18 swept HEAD files back to its computed literal (`var(--u-duration-120ms)`→`120ms`, …, `var(--u-duration-150ms)`→`0.15s` since FollowButton was the only `0.15s` site, `var(--u-ease-default)`→`ease`) and compared to `git show origin/main:<file>`. **All 18 files reproduce `main` byte-for-byte** — the sweep is a pure literal→token substitution with nothing else changed: no property name, no comma-layer order, no whitespace, no added/removed declaration.

Corroborating structural checks:
- **Transition count unchanged:** 29 `transition:` declarations on `main` = 29 on HEAD. No transition added, removed, or retuned.
- **Component pairs unchanged:** 46 `<duration> ease` component-occurrences on `main` = 46 `var(--u-duration-*) var(--u-ease-default)` pairs on HEAD — exactly the ADR's audited "46 easing component-occurrences."
- **6 durations stay distinct:** spot-checked across files (each resolving to the identical computed ms):

| Site (file) | origin/main | After | Resolved ms |
|---|---|---|---|
| `FollowButton.css` (×3, multi-layer) | `background-color 0.15s ease, …` | `… var(--u-duration-150ms) var(--u-ease-default), …` | 150ms (0.15s ≡ 150ms) ✓ |
| `BookCard.css` | `… 180ms ease` | `var(--u-duration-180ms) var(--u-ease-default)` | 180ms ✓ |
| `GenreGrid.css` | `… 160ms ease` | `var(--u-duration-160ms) var(--u-ease-default)` | 160ms ✓ |
| `PoVBar.css` | `… 120ms ease`, `… 200ms ease` | `var(--u-duration-120ms)…`, `var(--u-duration-200ms)…` | 120ms, 200ms ✓ |
| `ToggleSwitch.css` | `… 120ms ease`, `… 140ms ease` | `var(--u-duration-120ms)…`, `var(--u-duration-140ms)…` | 120ms, 140ms ✓ |
| `CallToAction.css` | `… 140ms ease` | `var(--u-duration-140ms) var(--u-ease-default)` | 140ms ✓ |
| `Nav.css` | `… 120ms ease` | `var(--u-duration-120ms) var(--u-ease-default)` | 120ms ✓ |

**160ms and 180ms are NOT consolidated** — each has its own raw + alias token. `0.15s` → `var(--u-duration-150ms)` = 150ms (computed-identical; FollowButton is the only `0.15s` site and there is no other `150ms` literal, so no near-value is snapped onto it — Constraint 1 satisfied, ADR Option E). Each `ease` → `var(--u-ease-default)` = ease. Property names and comma-layer order preserved everywhere.

**Token sheet wiring** matches ADR §1 exactly: 6 raw durations + 1 raw easing (Tier 1), 6 duration aliases + 1 easing alias (Tier 2, each `var()`-chaining its raw), nothing else. The diff is **purely additive** — `git diff` shows zero deletions in `tokens.css`, so all color/type/spacing/radius/elevation/z-index/`--page-*` tokens are untouched.

## 3. The reduced-motion block (the one behavior addition) — **PASS**

A single global block lives in `tokens.css` immediately after the main `:root` token block:

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --u-duration-120ms: 0.01ms;
    --u-duration-140ms: 0.01ms;
    --u-duration-150ms: 0.01ms;
    --u-duration-160ms: 0.01ms;
    --u-duration-180ms: 0.01ms;
    --u-duration-200ms: 0.01ms;
  }
}
```

This matches ADR §3 / Option I precisely:
- **It redefines the semantic Tier-2 `--u-duration-*` aliases** (the tier app CSS reads), to **`0.01ms`** (not `0ms` — keeps `transitionend` firing, the forward-safe idiom). **Easings are untouched** (a 0.01ms transition is imperceptible regardless of curve). It is one self-contained block, not a separate file, shipping with the tokens.
- **It is INERT at the no-preference state** — reasoned explicitly: the override lives entirely inside `@media (prefers-reduced-motion: reduce)`. At the no-preference media state (which the Story-39 harness captures, additionally with animations frozen), the media query does not match, so the override does not apply and every `--u-duration-*` alias resolves to its full value. Structurally I confirmed the main `:root { … }` block CLOSES before the `@media` block opens (the media block contains its own nested `:root`), so the overrides are scoped to the media query alone and do not leak into the base cascade. Therefore the default render is byte-identical and the Story-39 baseline is untouched — which the green zero-diff visual job and the §2 source proof both confirm.
- **It is the ONLY behavior change, and it is correct/safe.** Every motion on `main` is a token-reading `transition` (confirmed: zero `@keyframes`, zero `animation` declarations, zero `scroll-behavior`, zero JS-driven motion — the only `animation`/`@keyframes` strings anywhere in the diff are inside a CSS *comment* in this very block, "animations frozen"). So zeroing the six duration aliases degrades 100% of in-use motion to instant. No `scroll-behavior: auto` and no blanket `transition: none`/`animation: none` reset was added — correctly, as none is needed and a broader reset is out of scope (ADR Option I). The block is the exact ADR-0038-§1-sanctioned mechanism, minimally and surgically.

## 4. The visual gate — **PASS (zero-diff, no baseline touched)**

`gh pr checks 87` → **Visual regression: pass (1m7s).** No `*.png`, snapshot, or baseline file appears in `git diff --name-only origin/main...HEAD` (confirmed: 0). CI green at `maxDiffPixelRatio: 0` + the §2 source-level reverse-substitution proof together establish the default render is byte-identical. **No baseline was updated**, honoring the ADR 0039 discipline. The reduced-motion behavior is observable only under the reduce media state, which the gate does not capture and does not need to (it is the intended, ADR-sanctioned net-new behavior).

## 5. Guards pass + gates — **PASS**

- `pnpm --filter @unbnd/ui test`: motion guard green — literal scan 0 offenders + reduced-motion presence pass (2 tests); all 7 prior guards + `tokens.test.ts` green (14/14, 9 files).
- `pnpm -r typecheck` clean; `pnpm --filter @unbnd/web test` 300 passed; `pnpm --filter @unbnd/web build` clean; `pnpm -r test` full workspace green.
- **Allowlist exact:** motion guard `ALLOWLIST = {packages/ui/styles/tokens.css}` only. `data`/`e2e`/`test` are `SKIP_DIRS` scope-exclusions, not allowlist entries — consistent with the prior guards.

## 6. Scope — **PASS**

Motion axis only. The diff's source surface is exactly: 18 app CSS files (the sweep), `packages/ui/styles/tokens.css` (additive motion block + reduced-motion block), and the one Tester-authored guard. Verified:
- **No other-axis change:** `tokens.css` has zero deletions — color/type/spacing/radius/elevation/z-index/`--page-*` tokens untouched. Reverse-substitution (§2) proves the CSS-file edits are pure duration/easing→token swaps, no other property altered.
- **No primitives/icons/layout, no `data/`:** none in the diff.
- **No `animation`/`@keyframes` invented:** the only such strings added are inside a CSS comment; zero new `animation`/`@keyframes` declarations.
- **No JS reduced-motion hook** (epic story 11): none added.
- **No `.tsx` touched at all** — `Avatar.tsx`'s computed values are untouched (not in the diff).
- No new dependency, no new tooling (the guard is a Vitest test under the existing `pnpm -r test`; `@unbnd/ui` has no build step — ADR 0038 §7 honored).

## House rules

- **Brand tokens are the source of truth:** this story extends the two-tier source to the motion axis (the fifth and last token-ish axis). No bare duration/easing literal remains outside `tokens.css` (the green guard proves it).
- **No new tooling / no new dep:** confirmed (Vitest guard in the existing package; no lockfile change for this story).
- **No AI-slop in copy/visuals:** no shipped UI string changed (developer-facing refactor; render byte-identical; the reduced-motion addition is behavior, not copy). The em dashes / arrows present are in **code comments and the ADR/story prose only**, matching the merged Story-40/41/42/43 precedent (all four prior reviews PASSed on the same basis). The no-slop ban targets shipped UI copy, not internal code comments. Non-blocking; see findings.
- **Crypto / DList / trust tiers:** N/A — no crypto surface, no event-shape change ("DList shapes touched: None"), no trust UI.
- **PRD §11.3 scope:** untouched. Behavior-preserving infrastructure plus an accessibility improvement; touches no out-of-scope product surface.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **Em dashes / arrows in code comments** (`tokens.css`, the guard). Consistent with the merged Story-40/41/42/43 guard/tokens comment style and outside the shipped-copy no-slop scope, so not blocking. An ASCII-only-comments sweep would be a separate whole-package task.
2. **Richer semantic motion role tokens** (`--u-duration-control`/`--u-ease-control` per ADR 0038 §1) — deferred to a later intentional story that designs the roles under ADR 0039 (ADR 0044 §1, Out of scope). Recorded debt, intentional — mapping 6 distinct durations onto a small role set now is a consolidation/zero-diff hazard, the same trap deferred for type bundles (0041), spacing roles (0042), and radius/elevation roles (0043).
3. **A genuinely rationalized motion scale** (snapping `160ms`/`180ms`, retuning the easing) is a separate visual-change motion-design story under ADR 0039, not this refactor. Recorded debt.
4. **The motion util / `transition()` helper and the `matchMedia`-driven reduced-motion JS hook** (ADR 0038 §4, epic story 11) — not built here; this story tokenizes the existing CSS transitions and adds the CSS reduced-motion block only. Recorded debt.
5. **Forward note (ADR Option I):** if a future motion type that does not reduce to a duration token is added (`animation` with its own timing, `scroll-behavior: smooth`), that story must extend the reduced-motion block to cover it. The guard already covers `animation`/longhands defensively so a future raw literal fails CI. Not a gap today.

## Scope / firewall
Engineering-only review. No product/PRD-scope change, no Unbnd business/grant/community rationale touched. The diff approaches none of PRD §11.3. The data layer, API, and all app fixtures are untouched in value.

---

## Verdict: **PASS / APPROVED**

Story 44 is mergeable as committed on PR #87. Per the Reviewer role I **STOP at the merge gate** — I do not commit, push, or merge; the human controls git. On this PASS I performed the doc-only story closeout (Status: Done, Review link, `git mv` the story to `done/`), left in the working tree unstaged for the human.
