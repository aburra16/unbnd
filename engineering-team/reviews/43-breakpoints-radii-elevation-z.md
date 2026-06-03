# Review: Story 43 — Two-tier radii, elevation, and z-index tokens; canonical breakpoints via a typed export and a `@media` guard; and the shape-literal CI guards

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, re-derived; did not write the code, guards, ADR, or story)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` on branch `story-43-bp-radii-elevation-z`, PR #86. Commits: `a64790e` (story draft) → `1df7310` (ADR 0043 Accepted) → `4ef1647` (Tester: shape-literal + breakpoint CI guards, red set) → `21500de` (Implementer: two-tier radii/elevation/z + canonical breakpoints sweep). 38 files, +1291/-93.
**Story:** `engineering-team/stories/done/43-breakpoints-radii-elevation-z.md` (this review wrote this path post-move)
**ADR:** `engineering-team/decisions/0043-breakpoints-radii-elevation-z.md` (Accepted; refining ADR under umbrella 0038, mirrors 0040/0041/0042; held to the Story-39 `visual` gate via 0039)
**Epic:** `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 6 — four small related axes bundled)
**Classification:** behavior-preserving zero-diff refactor. Flow PO → Architect → Tester → Implementer → Reviewer.

## Verdict: **PASS** (APPROVED)

The diff delivers exactly what ADR 0043 specifies and nothing more: a two-tier radii model (13 value-keyed raw tokens incl. `-circle`/`-pill` off-ramps, thin Tier-2 aliases, `--u-radius`/`--u-radius-lg` kept and repointed), a two-tier elevation model (15 whole-shadow raw tokens verbatim, thin `--u-elevation-*` aliases), a three-value z-index role scale, and the breakpoint axis canonicalized — not consolidated — via a typed `breakpoints` export with NO `@media` edit and NO `--u-raw-bp-*` CSS tokens. Two new CI guards land green and are real, not vacuous. The prime directive — **zero-diff, behavior-preserving** — holds at the gated viewport (CI `Visual regression` zero-diff success, no baseline touched) and by inspection for the breakpoint axis. Guard integrity is intact: the Implementer modified no guard file; both new guards are byte-identical to the Tester's commit. The ADR's header gate resolutions are honored exactly (two guard files; stable-index elevation registry; `--u-elevation-*` naming; existing `--u-radius*` kept + repointed; no consolidation; no cosmetic renames; breakpoints canonicalized not consolidated). All findings are non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm --filter @unbnd/ui test` — **PASS.** 8 files, 12 tests. New `architecture-shape-literals` (1 test) and `architecture-breakpoints` (3 tests) green; prior guards (`architecture-spacing-literals`, `architecture-type-literals`, `architecture-color-literals`, `architecture-token-refs`, `architecture-palette-sync`) and `tokens.test.ts` all still green.
- [x] `pnpm -r typecheck` — **PASS, zero errors.** All workspace projects clean (web, ui, api, trust, schemas, search, seeder, indexer, promoter, shelves), including the new typed `breakpoints` export.
- [x] `pnpm --filter @unbnd/web test` — **PASS.** 52 files, **300 passed**, unchanged from `main`.
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build`. CSS asset hash legitimately changes (`index-2Nl3TpQY.css`, 76.53 kB) because the token-sheet and app-CSS source text changed; a structural CSS-source change, not a rendered-value change. The visual gate is the authority on pixels and it is zero-diff.
- [x] **PR #86 CI** (`gh pr checks 86`): **all three jobs pass** — "Typecheck, test, build" (1m42s), "Validate Caddyfile" (9s), and **"Visual regression" (1m1s) zero-diff success**.
- [ ] _Lint not configured — skipped (house rules)._
- _Note: the `apps/api` port-bound flake (ECONNREFUSED) was not encountered — I ran `@unbnd/ui` and `@unbnd/web` filtered._

The visual suite was not run locally (no Docker; baselines are Linux-canonical under the pinned Playwright image). Verified via CI status + the value spot-checks below, the local proxy for pixel-identity.

---

## 1. Guard integrity (process check) — **PASS**

The Tester authored `packages/ui/test/architecture-shape-literals.test.ts` and `architecture-breakpoints.test.ts` in commit `4ef1647`. I verified the Implementer commit `21500de` modified **NONE** of the guard tests:

- `git diff --name-only 4ef1647 21500de -- packages/ui/test/` lists **nothing** — the Implementer touched no file under `test/`. The 34 files the Implementer commit touches are all app CSS, `tokens.css`, `breakpoints.ts`, and `index.ts`.
- `git diff --quiet 4ef1647 HEAD -- packages/ui/test/architecture-shape-literals.test.ts` → **IDENTICAL**. Same for `architecture-breakpoints.test.ts` and `tokens.test.ts`. Byte-identical Tester → HEAD.
- `git log --diff-filter=A -- packages/ui/test/architecture-*.test.ts` confirms both new guards were introduced **only** in `4ef1647` (the Tester commit) and nowhere since.

The Implementer made the guards green by removing offenders and landing the module, not by editing a guard.

**Both guards are real, not vacuous.** I read each in full and proved them live by planting offenders into `apps/web/src/components/Nav.css`:
- `border-radius: 7px` → caught: `contains raw border-radius literal: border-radius: 7px`.
- `box-shadow: 0 1px 3px var(--u-ink-tint-14)` → caught: `contains raw box-shadow literal: …` (the bare `0`/`1px`/`3px` geometry flagged while the trailing color `var()` is exempt).
- `z-index: 99` → caught: `contains raw z-index literal: z-index: 99`.
- `@media (max-width: 999px)` → caught: `Nav.css:103 @media (max-width: 999px) uses 999px, not in breakpoints`.

All four planted offenders failed the build with precise messages; reverted; `git status` clean. (The probe also tripped the existing color guard on `red`, confirming the Story-40 guards stay live.)

**Shape guard correctness, confirmed by reading + the live probe:**
- Flags a bare radius (`Npx`, `50%`, `999px`), bare box-shadow geometry, and bare z-index integer; passes `var(...)`, `calc(...)`, keywords, and bare `0`.
- Excludes the `transition`-property `box-shadow`: `CSS_SHADOW_PATTERN` keys on `box-shadow` **followed by a colon**, so `AuthMethodCard.css:13`'s `box-shadow 120ms ease` (a property name inside a `transition` list, no colon) is never matched — verified the real `box-shadow:` declaration on line 19 is the only one swept there.
- Treats `var(--u-radius, 8px)` as a **single parenthesis-aware atom** (the `8px` lives inside the `var()`), so it is not flagged — it is already a token reference; the Implementer drops the dead fallback regardless.
- Allowlist names **only** `packages/ui/styles/tokens.css`; `data`, `e2e`, `test` are `SKIP_DIRS` scope-exclusions (not allowlist entries), consistent with the prior guards.

**Breakpoints guard correctness:** binds to the typed export via the Story-40 palette-sync dynamic-import-against-a-typed-shim pattern (`loadBreakpoints()`), derives `ALLOWED = new Set(Object.values(breakpoints))`, parses `@media` preludes for px values in both colon (`min-/max-width/-height`) and modern range (`(width >= Npx)`) forms, and asserts forward (every `@media` px is a member — caught the planted `999px`) + reverse (every member has ≥1 consumer) + a TSX net (`matchMedia`/`innerWidth`/`innerHeight` literal). Allowlist names **only** `packages/ui/src/breakpoints.ts`.

## 2. THE BREAKPOINT ZERO-DIFF PROOF (the most important check) — **PASS**

This is the by-inspection argument the single-viewport (1280×800) harness cannot make. Proven three ways:

1. **No `@media` value was edited.** `git diff origin/main...HEAD` restricted to `apps/web/src/**/*.css` + `packages/ui/styles/*.css`, grepped for `@media` on added/removed lines → **zero matches**. (The only `@media` mentions in the full diff are in the ADR/story prose under `engineering-team/`, not code.) The Implementer's CSS change for this axis is genuinely none.
2. **`@media` count and value set unchanged.** 14 `@media` blocks on `main` = 14 on HEAD. The distinct in-use `@media` px values on HEAD are exactly `{480 (×3), 540 (×4), 620 (×3), 700 (×1), 720 (×1), 860 (×1), 880 (×1)}` — the same 7 as `main`.
3. **The canonical set IS those 7 values, no consolidation.** `packages/ui/src/breakpoints.ts` exports `breakpoints = { bp480, bp540, bp620, bp700, bp720, bp860, bp880 }` value-for-value — none merged, none added, none removed. So every `@media` value is trivially a member; no firing point changes.

**No `--u-raw-bp-*` / `--u-bp-*` CSS tokens were minted** (`git grep -nE 'raw-bp|u-bp' HEAD -- packages/ui/styles packages/ui/src` → nothing), honoring the ADR §4 decision that breakpoint CSS tokens would be dead CSS (`var()` is illegal in `@media`). `index.ts` re-exports `breakpoints` and the `Breakpoint` type. No runtime breakpoint logic exists to rewire (the TSX net is green on landing).

Responsive behavior at every narrow viewport is unchanged by inspection, independent of the single-viewport gate.

## 3. Radii — **PASS**

`tokens.css` carries 13 raw radius tokens (`--u-raw-radius-{2,3,4,5,6,7,8,9,10,12,20}` + `-circle: 50%` + `-pill: 999px`), value-keyed, values verbatim. Tier-2 thin aliases point at the raws; `--u-radius` and `--u-radius-lg` are **kept (no rename) and repointed** to `var(--u-raw-radius-8)` / `var(--u-raw-radius-12)`, so the 28 existing call sites resolve unchanged. The value-keyed `--u-radius-8`/`--u-radius-12` aliases are intentionally absent — the ADR §1 routes the 8px/12px cases onto the existing role names `--u-radius`/`--u-radius-lg`, which is what landed.

Spot-checks vs `git show origin/main:<file>` (all byte-identical resolved):

| Site | origin/main | After | Check |
|---|---|---|---|
| `SearchBox.css:114` | `border-radius: 0 0 7px 7px` | `0 0 var(--u-radius-7) var(--u-radius-7)` | corner shorthand, `0` stays bare, `7px`→`-radius-7` ✓ |
| `TagControl.css:132` | `border-radius: var(--u-radius, 8px)` | `border-radius: var(--u-radius)` | dead `8px` fallback dropped ✓ |
| `Avatar.css:5` | `border-radius: 50%` | `var(--u-radius-circle)` | =`--u-raw-radius-circle: 50%` ✓ |
| `Pill.css:8` | `border-radius: 20px` | `var(--u-radius-20)` | =`20px` ✓ |
| `AuthorBadge/AuthorEdit/RatedByRow` | `border-radius: 999px` | `var(--u-radius-pill)` | =`999px` ✓ |
| `BookCard.css:7,43` | `border-radius: 4px` | `var(--u-radius-4)` | =`4px` ✓ |
| `BookCard.css:102` | `border-radius: 12px` | `var(--u-radius-lg)` | =`--u-raw-radius-12: 12px` ✓ |
| `AuthMethodCard.css:31` | `border-radius: 8px` | `var(--u-radius)` | =`--u-raw-radius-8: 8px` ✓ |

**Sweep completeness:** zero bare `border-radius` px/% literals remain in app CSS (the green shape guard proves this; manually confirmed the only bare value left is the legit `0` corner in the shorthand).

## 4. Elevation — **PASS**

15 raw elevation tokens, one per distinct box-shadow, the **whole value verbatim** (geometry + existing color `var()` + `inset`), each with a geometry comment and stable-index registry naming (`hairline`, `1a/1b/1c`, `2/3/4a/4b/4c`, `ring-{06,08,10,18,parchment}`, `inset-hairline`). Thin `--u-elevation-*` Tier-2 aliases point at the raws. All 16 `box-shadow:` declaration sites in app CSS now reference `var(--u-elevation-*)` (the `ring-10` token is the ×2 focus ring → 16 sites, 15 distinct tokens); zero raw geometry remains.

Spot-checks (token chain resolved, byte-identical):

| Site | origin/main | After | Token resolves to |
|---|---|---|---|
| `SearchBox.css:66` | `0 12px 32px var(--u-ink-tint-16)` | `var(--u-elevation-4c)` | `--u-raw-elevation-4c: 0 12px 32px var(--u-ink-tint-16)` ✓ |
| `RatingsPanel.css:28` | `0 1px 3px var(--u-ink-tint-12)` | `var(--u-elevation-1b)` | `--u-raw-elevation-1b: 0 1px 3px var(--u-ink-tint-12)` ✓ |
| `AuthMethodCard.css:19` | `0 0 0 3px var(--u-amber-tint-06)` | `var(--u-elevation-ring-06)` | `--u-raw-elevation-ring-06: 0 0 0 3px var(--u-amber-tint-06)` ✓ |

The existing color `var()` is preserved inside each stored shadow (CSS substitution is recursive, so the alias chain resolves identically). The `transition: ... box-shadow 120ms ease` usage at `AuthMethodCard.css:13` was **NOT touched** (confirmed by reading the file's diff — only the line-19 declaration changed). No geometry redesigned.

## 5. z-index — **PASS**

3 raw role tokens (`--u-raw-z-base: 1`, `--u-raw-z-dropdown: 40`, `--u-raw-z-popover: 50`) behind `--u-z-*` aliases. The 3 call sites, byte-identical:

| Site | origin/main | After |
|---|---|---|
| `SearchBox.css:68` | `z-index: 40` | `var(--u-z-dropdown)` ✓ |
| `AccountMenu.css:29` | `z-index: 50` | `var(--u-z-popover)` ✓ |
| `RatedByRow.css:36` | `z-index: 1` | `var(--u-z-base)` ✓ |

Zero bare z-index literals remain in app CSS.

## 6. The visual gate — **PASS (zero-diff, no baseline touched)**

`gh pr checks 86` → **Visual regression: pass (1m1s).** No `*.png`, snapshot, or baseline file appears in `git diff --name-only origin/main...HEAD` (confirmed: 0). CI green + the §3–5 value spot-checks together are the evidence that pixels are unchanged. No baseline was updated, honoring the ADR 0039 discipline. The breakpoint axis is additionally argued zero-diff by inspection (§2), the protection the single-viewport harness cannot provide.

## 7. Guards pass + gates — **PASS**

- `pnpm --filter @unbnd/ui test`: both new guards green (shape 0 offenders; breakpoints forward+reverse+TSX all green); all 5 prior guards + `tokens.test.ts` green (12/12).
- `pnpm -r typecheck` clean; `pnpm --filter @unbnd/web test` 300 passed; `pnpm --filter @unbnd/web build` clean.
- **Allowlists exact:** shape guard `ALLOWLIST = {packages/ui/styles/tokens.css}` only; breakpoints guard `ALLOWLIST = {packages/ui/src/breakpoints.ts}` only. `data`/`e2e`/`test` are `SKIP_DIRS` scope-exclusions, not allowlist entries — consistent with the prior guards.

## 8. Scope — **PASS**

Radii / elevation / z-index / breakpoints only. Every added/removed app-CSS property line is `border-radius` (66/66), `box-shadow` (16/16), or `z-index` (3/3) — a grep of the CSS diff for any non-shape property (`color`/`background`/`font`/`padding`/`margin`/`gap`/`transition`/`width`/etc.) returns **nothing**. The only source-surface files changed are `breakpoints.ts` (new), `index.ts` (two-line re-export), and the two Tester-authored guards. Non-radii/elevation/z-index token-sheet entries (color, type, spacing, `--page-max`, `--page-pad-x`) are untouched. No primitives/icons/layout work, no `data/` changes, no behavior/copy change, no new dependency, no new tooling (the guards are Vitest tests under the existing `pnpm -r test`; the `breakpoints` export is plain TS, no build step — ADR 0038 §7 honored). **`Avatar.tsx` is not in the diff** — its computed `width: size`/`height: size` values are untouched. No TSX touched at all.

## House rules

- **Brand tokens are the source of truth:** this story extends the two-tier source to radii, elevation, and z-index, and establishes the canonical breakpoint source. No bare shape literal remains outside `tokens.css`; no breakpoint outside `breakpoints.ts`.
- **No new tooling / no new dep:** confirmed (guards are Vitest; `breakpoints.ts` is plain TS in the existing package; no lockfile change for this story).
- **No AI-slop in copy/visuals:** no shipped UI string changed (developer-facing refactor; render byte-identical). The em dashes / `→` arrows present are in **code comments and the ADR/story prose only**, matching the already-merged Story-40/41/42 precedent (all three prior reviews PASSed on the same basis). The no-slop ban targets shipped UI copy, not internal code comments. Non-blocking; see findings.
- **Trust tiers / crypto / DList:** N/A — no trust UI, no crypto surface, no event-shape change.
- **PRD §11.3 scope:** untouched. Developer-facing infrastructure; approaches no out-of-scope product surface.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **Em dashes / arrows in code comments** (`tokens.css`, `breakpoints.ts`, the two guards). Consistent with the merged Story-40/41/42 guard/tokens comment style and outside the shipped-copy no-slop scope, so not blocking. An ASCII-only-comments sweep would be a separate whole-package task.
2. **Richer semantic role aliases** for radii (`--u-radius-control`/`-card`), elevation, and a fuller z-index role scale — deferred to a later intentional story that designs the roles (ADR 0043 §1/§2, Out of scope). Recorded debt, intentional.
3. **A genuinely rationalized radius/elevation scale** (snapping near radii, a clean depth ladder) and **collapsing the breakpoints** are separate visual-change stories under ADR 0039; the breakpoint collapse must **first add multi-viewport baselines** so a real gate exists for the narrow viewports the current single-viewport harness cannot see. Recorded debt.
4. **Redesigning elevation onto the parchment-depth principle** (ADR 0038 §1) — a separate visual-change story; this story tokenized the existing drop shadows verbatim, which is correct for a zero-diff refactor.
5. **A multi-viewport visual-baseline enhancement** to the Story-39 harness — recorded as future work so a later breakpoint-consolidation story has a real gate. Not built here.

## Scope / firewall
Engineering-only review. No product/PRD-scope change, no Unbnd business/grant/community rationale touched. The diff approaches none of PRD §11.3. The data layer, API, and all app fixtures are untouched in value.

---

## Verdict: **PASS / APPROVED**

Story 43 is mergeable as committed on PR #86. Per the Reviewer role I **STOP at the merge gate** — I do not commit, push, or merge; the human controls git. On this PASS I performed the doc-only story closeout (Status: Done, Review link, `git mv` the story to `done/`), left in the working tree unstaged for the human.
