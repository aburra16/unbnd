# Review: Story 42 — Two-tier spacing tokens (padding / margin / gap), multi-value shorthand handling, and the spacing CI guard

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, re-derived; did not write the code, guard, ADR, or story)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` on branch `story-42-spacing-tokens`, PR #85. Commits: `9e775f0` (story draft) → `a9dd2f7` (ADR 0042 Accepted) → `065f030` (Tester: spacing CI guard, red set) → `9b3320f` (Implementer: two-tier spacing sweep). 49 files, +1118/-333.
**Story:** `engineering-team/stories/done/42-spacing-tokens.md` (this review wrote this path post-move)
**ADR:** `engineering-team/decisions/0042-spacing-tokens.md` (Accepted; refining ADR under umbrella 0038, mirrors 0040/0041, held to the Story-39 `visual` gate via 0039)
**Epic:** `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 5, the spacing axis — last in the lowest-entanglement-first order, color → type → spacing)
**Classification:** behavior-preserving zero-diff refactor. Flow PO → Architect → Tester → Implementer → Reviewer.

## Verdict: **PASS** (APPROVED)

The diff delivers exactly what ADR 0042 specifies and nothing more: a two-tier spacing token model (Tier-1 value-keyed raw registry, Tier-2 thin per-value 1:1 aliases) across `padding`/`margin`/`gap`, the multi-value shorthand handled per-component (Option E), the runtime-injected TSX spacing literals swept into CSS (Option G, no TS constant), and one new CI guard landing green. The prime directive — **zero-diff, behavior-preserving** — holds. Every gate I ran is green; PR #85's `Visual regression` job is zero-diff success with no baseline touched. Guard integrity is intact (the Implementer modified no guard file; the spacing guard is byte-identical to the Tester's). The ADR's header gate resolutions are honored exactly: thin per-value aliases (no inset/stack/inline role tokens); `--page-pad-x` left as-is; positioning offsets out of scope; bare `0` left bare; negatives via the `n` prefix; no unit conversion. All findings are non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm --filter @unbnd/ui test` — **PASS.** 6 files, 8 tests. New `architecture-spacing-literals` green (0 spacing literals outside the token layer); `architecture-type-literals`, `architecture-color-literals`, `architecture-token-refs`, `architecture-palette-sync`, and `tokens.test.ts` all still green.
- [x] `pnpm -r typecheck` — **PASS, zero errors.** All 10 workspace projects clean (web, ui, api, trust, schemas, search, seeder, indexer, promoter, shelves).
- [x] `pnpm --filter @unbnd/web test` — **PASS.** 52 files, **300 passed**, unchanged from `main`.
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build`, 448 modules. (CSS asset hash legitimately changes — `index-B_-wRUo5.css`, 73.12 kB — because the token-sheet and app-CSS source text changed; a structural CSS-source change, not a rendered-value change. The visual gate is the authority on pixels, and it is zero-diff.)
- [x] **PR #85 CI** (`gh pr checks 85`): **all three jobs pass** — "Typecheck, test, build" (1m49s), "Validate Caddyfile" (5s), and **"Visual regression" (1m0s, zero-diff success)**.
- [ ] _Lint not configured — skipped (house rules)._
- _Note: the `apps/api` port-bound flake (ECONNREFUSED) was not encountered — I ran `@unbnd/ui` and `@unbnd/web` filtered, not `apps/api`._

The visual suite was not run locally (no Docker; baselines are Linux-canonical under the pinned Playwright image). Verified via CI status + the value spot-check below, which is the local proxy for pixel-identity.

---

## 1. Guard integrity (process check) — **PASS**

The Tester authored `packages/ui/test/architecture-spacing-literals.test.ts` in commit `065f030`. I verified the Implementer commit `9b3320f` did **not** modify it or any other guard:

- `git diff --name-only 065f030 9b3320f -- packages/ui/test/` lists **nothing** — the Implementer touched no file under `test/`.
- `git diff 065f030 HEAD -- packages/ui/test/architecture-spacing-literals.test.ts` is **empty (byte-identical)**. The other guards (`architecture-type-literals`, `architecture-color-literals`, `architecture-token-refs`, `architecture-palette-sync`) and `tokens.test.ts` are likewise untouched in the Implementer commit (they appear nowhere in the branch test-dir diff).
- `git log --diff-filter=A` confirms the spacing guard was introduced only in `065f030` (the Tester commit) and nowhere since.

The Implementer made the guard green by removing offenders, not by editing the guard.

**The guard is real, not vacuous.** I read it in full and proved it live. It `walk()`s the live source tree (`SCAN_ROOTS = [apps/web/src, packages/ui]`), `readFileSync`s each `.css/.ts/.tsx` (excluding `.test.*`), and aggregates into one `expect(offenders).toEqual([])`.
- **CSS path:** `CSS_SPACING_PATTERN` keys on the in-scope property set (`padding`/`margin`/`gap`/`row-gap`/`column-gap` + all longhand/logical forms, longest-first so `padding-inline-start` wins over `padding-inline`), captures the value up to `;`/`}` (`[^;}]+`, which never bleeds into the next rule). The decisive extension over the type guard: `splitComponents()` is **parenthesis-aware** (depth counter), so `var(...)` / `calc(...)` are single atoms and a multi-value shorthand is split correctly; `spacingValueHasLiteral()` strips a trailing `!important` and flags a declaration if **any** component is a bare length literal (`LENGTH_LITERAL = /^[+-]?\d*\.?\d+(px|rem|em|vh|vw)?$/i`) that is not `var(`/`calc(`/a keyword (`auto`/`inherit`/`initial`/`unset`/`revert`/`revert-layer`/`normal`)/a zero (`isZero` via `parseFloat`). A bare `%` falls through `LENGTH_LITERAL` (no `%` unit) → not flagged, matching the ADR's "stray % is not a bare spacing literal".
- **Positioning offsets** (`top`/`right`/`bottom`/`left`/`inset`) are deliberately **not** in `SPACING_PROP_NAMES` → never matched (ADR §2 out-of-scope).
- **TSX path:** `TS_PATTERNS` matches inline-style spacing keys (camelCase of the in-scope props; `width`/`height` are not keys) assigned a **numeric literal** (terminated by `,`/`}`/newline so an expression head is not matched) or a **quoted-string literal**. An identifier/member/call (`width: size`, `Math.round(...)`) is never matched — so `Avatar.tsx`'s computed `width: size`/`height: size` is correctly ignored.

**Live red-test:** I planted `padding: 8px var(--u-space-12)` into `apps/web/src/styles/base.css` and re-ran `pnpm --filter @unbnd/ui test` — the guard went **RED** with the precise message `apps/web/src/styles/base.css contains raw padding literal: padding: 8px var(--u-space-12)`, proving the per-component check flags the one `8px` even amid token components. Reverted; tree clean. **Not weakened.**

## 2. Two-tier spacing structure (ADR §1) — **PASS**

`packages/ui/styles/tokens.css` (the only changed file in `packages/ui`) is cleanly two-tier, in a new clearly-commented block placed after the type Tier-2 block and before the `--page-*` layout tokens:

- **Tier 1** (`--u-raw-space-*`): literal px values only, one token per distinct in-use value, no consolidation, no unit conversion. **31 px tokens** (`1,2,3,4,5,6,7,8,9,10,11,12,13,14,16,18,20,22,24,26,28,30,32,34,36,40,42,48,56,60,80`) plus **1 negative** `--u-raw-space-n8: -8px` = 32 raw tokens. The `80px` carries the documented `/* swept off the NotFound.tsx inline padding */` provenance; `n8` carries `/* negative; RatedByRow avatar-stack overlap */`. Matches the ADR §1 inventory exactly (30 from CSS + 80px swept + n8).
- **Tier 2** (`--u-space-*`): every alias is `var(--u-raw-space-…)`, never a literal — thin 1:1 value-keyed aliases (32 of them, including `--u-space-n8: var(--u-raw-space-n8)`). App CSS references only this tier.

**Gate resolutions honored exactly:**
- **NO role tokens.** No `--u-space-inset-*`, `--u-space-stack-*`, or `--u-space-inline-*` exist; the deferral is recorded in the Tier-2 comment. (Deferred per ADR §1 / Out of scope.)
- **NO `--u-space-0`.** Grep for `--u-(raw-)?space-0\b` finds nothing — bare `0` stays bare (ADR §2).
- **`--page-pad-x` left as-is:** `--page-pad-x: 24px` (line 467) is unchanged — not renamed, not repointed. (The optional repoint to `var(--u-raw-space-24)` was not taken; that is allowed per ADR §4.) `--page-max: 720px` untouched.

## 3. Multi-value shorthand handling (ADR §3, Option E) — **PASS**

Spot-checked several shorthands; each length component → its `var(--u-space-…)`, order preserved, `0`/`auto`/existing `var()` untouched:

| Site | origin/main | After | Check |
|---|---|---|---|
| `SearchBox.css:9` | `padding: 8px 12px 8px 34px` | `padding: var(--u-space-8) var(--u-space-12) var(--u-space-8) var(--u-space-34)` | 4-value, repeat + order preserved ✓ |
| `SearchBox.css:42` | `padding: 13px 16px 13px 42px` | `var(--u-space-13) var(--u-space-16) var(--u-space-13) var(--u-space-42)` | 4-value ✓ |
| `GenreGrid.css` `.genre` | `padding: 18px 14px 18px 18px` | all four → `var(--u-space-18/14/18/18)` | order preserved ✓ |
| `base.css` `.page` | `margin: 0 auto` | `margin: 0 auto` | **untouched** (`0`+`auto`) ✓ |
| `ProfileMe.css` `.me-head` | `margin: 8px 0 24px` | `var(--u-space-8) 0 var(--u-space-24)` | mid `0` preserved ✓ |
| `RatingControl.css` `.rate-summary` | `margin: 0 0 12px` | `0 0 var(--u-space-12)` | two leading `0`s preserved ✓ |
| `base.css` `.page` | `padding: 0 var(--page-pad-x) 32px` | `padding: 0 var(--page-pad-x) var(--u-space-32)` | existing `var()` + `0` untouched, only `32px` swapped ✓ |
| `RatingControl.css` `.rate` | `padding: 24px var(--page-pad-x)` | `padding: var(--u-space-24) var(--page-pad-x)` | existing `var()` untouched ✓ |
| `RatedByRow.css:24` | `margin-left: -8px` | `margin-left: var(--u-space-n8)` | **negative** → `n8` ✓ |
| `RatedByRow.css` `.rated-by-more` | `padding: 0 8px` | `padding: 0 var(--u-space-8)` | leading `0` preserved ✓ |

No `calc()` or `%` appears in any in-scope box-spacing declaration (consistent with the ADR audit); none was introduced.

## 4. Value-equality spot-check (the zero-diff guarantee) — **PASS, all proven identical**

I independently picked ~18 swept declarations across CSS + the two TSX moves and chased each `var(--u-space-n)` → Tier-2 alias → Tier-1 raw → literal, comparing against `git show origin/main:<file>`. Every one resolves byte-identical. Sample beyond the §3 table (all ✓):

| Site | origin/main literal | Token chain | Resolved |
|---|---|---|---|
| `RatedByRow.css` `.rated-by` | `margin-bottom: 28px` | `--u-space-28 → --u-raw-space-28` | `28px` ✓ |
| `RatedByRow.css` negative | `margin-left: -8px` | `--u-space-n8 → --u-raw-space-n8` | `-8px` ✓ |
| `PoVBar.css` `.pov` | `padding: 12px 18px` | `--u-space-12` / `--u-space-18` | `12px 18px` ✓ |
| `PoVBar.css` `.pov-switcher` | `gap: 2px; padding: 3px` | `--u-space-2` / `--u-space-3` | `2px` / `3px` ✓ |
| `Submit.css` `.sub-field input` | `padding: 9px 14px` | `--u-space-9` / `--u-space-14` | `9px 14px` ✓ |
| `Submit.css` `.sub-done` | `padding: 22px` | `--u-space-22` | `22px` ✓ |
| `SearchBox.css` `.searchbox-item` | `gap: 1px` | `--u-space-1` | `1px` ✓ |
| `base.css` `.route-status` | `padding: 48px 0` | `--u-space-48` / `0` | `48px 0` ✓ |
| `RatingControl.css` `.rate-star` | `padding: 2px` | `--u-space-2` | `2px` ✓ |
| `ToggleSwitch.css` `.toggle` | `gap: 12px; padding: 14px 16px` | `--u-space-12/14/16` | identical ✓ |
| **TSX** `NotFound.tsx` `padding: "80px 0 60px"` → `.not-found-section` | `80px 0 60px` | `var(--u-space-80) 0 var(--u-space-60)` | `80px 0 60px` ✓ |
| **TSX** `NotFound.tsx` `marginBottom: 10` → `.not-found-heading` | `10px` | `margin-bottom: var(--u-space-10)` | `10px` ✓ (heading had no prior margin-bottom on `main` — relocation, no override) |
| **TSX** `NotFound.tsx` `marginBottom: 22` → `.not-found-body` | `22px` | `margin-bottom: var(--u-space-22)` | `22px` ✓ |
| **TSX** `AuthWelcome.tsx` `marginTop: 16` → `.auth-welcome-note` | `16px` | `margin-top: var(--u-space-16)` | `16px` ✓ |

**Positioning offsets confirmed UNTOUCHED** (not in the diff at all): `SearchBox.css` `left: 11px`/`left: 14px`/`top: calc(100% + 8px)`/`left: 0`/`right: 0`; `GenreGrid.css` `top: 0`/`left: 0`; `Hero.css` `left: 14px`/`top: 50%`; `AccountMenu.css` `top: calc(...)`/`right: 0`; `ToggleSwitch.css` `top: 2px`/`left: 2px`. **`Avatar.tsx` is not in the diff** — its computed `width: size`/`height: size` is left as-is. **Sweep completeness:** a grep across `apps/web/src/**/*.css` for any in-scope spacing property carrying a bare `px`/`rem`/`em` literal (excluding `var(`) returns **nothing** — the sweep is total. I could not find a single value I could not prove identical.

## 5. The visual gate — **PASS (zero-diff, no baseline touched)**

`gh pr checks 85` → **Visual regression: pass (1m0s).** No `*.png`, snapshot, or baseline file appears in `git diff --name-only origin/main...HEAD` (confirmed: zero baseline files changed). CI green + the §4 value spot-check together are the evidence that pixels are unchanged. No baseline was updated, honoring the ADR 0039 discipline.

## 6. The new `.not-found-section` class — **PASS (the one ADR-sanctioned structural addition)**

`NotFound.css` gains `.not-found-section { padding: var(--u-space-80) 0 var(--u-space-60); }` and the section element in `NotFound.tsx` gains `className="not-found-section"` while keeping `textAlign: "center"` inline. This is exactly the ADR §"Implementation notes" direction ("move the inline `padding: "80px 0 60px"` into … the section's class"): it carries only the swept spacing and changes no resolved value (`80px 0 60px` ✓). The same migration adds `margin-bottom` to the existing `.not-found-heading`/`.not-found-body` and `margin-top` to the existing `.auth-welcome-note` — all moves of inline literals into pre-existing Story-41 classes, byte-identical. Non-spacing inline props (`textAlign`, `color`) correctly stay inline.

## 7. Guards pass + gates — **PASS**

- `pnpm --filter @unbnd/ui test`: spacing guard 0 offenders; type + color + token-refs + palette-sync + tokens.test all green (8/8).
- `pnpm -r typecheck` clean; `pnpm --filter @unbnd/web test` 300 passed; `pnpm --filter @unbnd/web build` clean.
- **Spacing guard allowlist names ONLY `packages/ui/styles/tokens.css`** (`ALLOWLIST = new Set(["packages/ui/styles/tokens.css"])`). No TS file is allowlisted (Option G: runtime literals swept into CSS, not a TS constant). `data`, `e2e`, and `test` are `SKIP_DIRS` scope-exclusions, consistent with the color and type guards — not allowlist entries.

## 8. Scope — **PASS**

Spacing axis only. Every changed CSS line is a spacing-value→`var()` swap; a grep of the CSS sweep for added/removed lines touching non-spacing properties (`color`/`background`/`border`/`font`/`line-height`/`letter-spacing`/`z-index`/`width`/`height`/`transition`/`box-shadow`/`top`/`right`/`bottom`/`left`/`border-radius`/`flex`/`display`/`grid`/etc.) returns **nothing**. Non-spacing token-sheet entries (color, type, `--u-radius*`, `--page-*`) are untouched. No primitives/icons/layout work, no `data/` changes, no behavior/copy change, no new dependency, no new tooling (the guard is a Vitest test under the existing `pnpm -r test`; ADR 0038 §7 no-build-step honored). The only TSX edits are the two leaf-route inline-style moves (removing spacing literals, no logic change).

## House rules

- **Brand tokens are the source of truth:** this story extends the two-tier source to the spacing axis. No bare spacing literal remains outside `tokens.css`.
- **No new tooling / no new dep:** confirmed (guard is Vitest; no lockfile change for this story).
- **No AI-slop in copy/visuals:** no shipped UI string changed (developer-facing refactor; render byte-identical). The em dashes / `→` arrows present are in **code comments and the ADR/story prose only**, matching the already-merged Story-40/41 precedent (their guards and `tokens.css` carry the same comment style; both prior reviews PASSed on the same basis). The no-slop ban targets shipped UI copy, not internal code comments. Non-blocking; see findings.
- **Trust tiers / crypto / DList:** N/A — no trust UI, no crypto surface, no event-shape change.
- **PRD §11.3 scope:** untouched. Developer-facing infrastructure; approaches no out-of-scope product surface.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **Em dashes / arrows in code comments** (`tokens.css`, `architecture-spacing-literals.test.ts`, `NotFound.css`). Consistent with the already-merged Story-40/41 guard/tokens comment style and outside the shipped-copy no-slop scope, so not blocking. If the project ever wants ASCII-only code comments, that is a separate sweep across the whole `@unbnd/ui` package, not this story.
2. **Richer semantic spacing role tokens** (`--u-space-inset-{sm,md,lg}`, stack/inline `gap` roles per ADR 0038 §1) deferred to a later intentional story per ADR §1 / Out of scope. Recorded debt, intentional.
3. **A genuinely rationalized spacing scale** (collapsing near-duplicate values like `13px`/`11px`/`9px` onto a clean 4px/8px grid) is a separate visual-change story under ADR 0039, not this refactor. Recorded debt.
4. **`--page-pad-x` left standalone** (the optional internal repoint to `var(--u-raw-space-24)` was not taken). Allowed per ADR §4; an optional later tidy.

## Scope / firewall
Engineering-only review. No product/PRD-scope change, no Unbnd business/grant/community rationale touched. The diff approaches none of PRD §11.3. The data layer, API, and all app fixtures are untouched in value.

---

## Verdict: **PASS / APPROVED**

Story 42 is mergeable as committed on PR #85. Per the Reviewer role I **STOP at the merge gate** — I do not commit, push, or merge; the human controls git. On this PASS I performed the doc-only story closeout (Status: Done, Review link, `git mv` the story to `done/`), left in the working tree unstaged for the human.
