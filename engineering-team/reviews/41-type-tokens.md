# Review: Story 41 — Two-tier type tokens (sizes, weights, leading, tracking, families) and the type CI guard

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, re-derived; did not write the code, guard, ADR, or story)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` on branch `story-41-type-tokens`, PR #84. Commits: `d457ee1` (story draft) → `dba0e5a` (ADR 0041 Accepted) → `7c0c02f` (Tester: type CI guard, red set) → `ca36288` (Implementer: two-tier type sweep). 49 files, +1085/-407.
**Story:** `engineering-team/stories/done/41-type-tokens.md` (this review wrote this path post-move)
**ADR:** `engineering-team/decisions/0041-type-tokens.md` (Accepted; refining ADR under umbrella 0038, mirrors 0040, held to the Story-39 `visual` gate via 0039)
**Epic:** `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 4, the type axis)
**Classification:** behavior-preserving zero-diff refactor. Flow PO → Architect → Tester → Implementer → Reviewer.

## Verdict: **PASS** (APPROVED)

The diff delivers exactly what ADR 0041 specifies and nothing more: a two-tier type token model (Tier-1 raw value-keyed registry, Tier-2 thin per-property 1:1 aliases) across all four scale axes plus the family fold, the runtime-injected TSX font literals swept into CSS (Option G, no TS constant), and one new CI guard landing green. The prime directive — **zero-diff, behavior-preserving** — holds. Every gate I ran is green; PR #84's `Visual regression` job is zero-diff success with no baseline touched. Guard integrity is intact (the Implementer did not modify any guard file). The ADR's header gate resolutions are honored exactly: letter-spacing is in scope; NO `--u-text-*` bundles; NO `--u-family-*` aliases; `--font-sans`/`--font-mono` kept and repointed. All findings are non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm --filter @unbnd/ui test` — **PASS.** 5 files, 7 tests. New `architecture-type-literals` green (0 type literals outside the token layer); `architecture-color-literals`, `architecture-token-refs`, `architecture-palette-sync`, and `tokens.test.ts` all still green.
- [x] `pnpm -r typecheck` — **PASS, zero errors.** All workspace projects clean (web, ui, api, trust, schemas, seeder, indexer, promoter, shelves).
- [x] `pnpm --filter @unbnd/web test` — **PASS.** 52 files, **300 passed**, unchanged from `main`.
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build`, 448 modules. (CSS asset hash legitimately changes — `index-CqUjg-uA.css`, 65.68 kB — because the token-sheet and app-CSS source text changed; structural CSS-source change, not a rendered-value change. The visual gate is the authority on pixels, and it is zero-diff.)
- [x] **PR #84 CI** (`gh pr checks 84`): **all three jobs pass** — "Typecheck, test, build" (1m49s), "Validate Caddyfile" (5s), and **"Visual regression" (1m5s, zero-diff success)**.
- [ ] _Lint not configured — skipped (house rules)._

The visual suite was not run locally (no Docker; baselines are Linux-canonical under the pinned Playwright image). Verified via CI status + the value spot-check below, which is the local proxy for pixel-identity.

---

## 1. Guard integrity (process check) — **PASS**

The Tester authored `packages/ui/test/architecture-type-literals.test.ts` in commit `7c0c02f`. I verified the Implementer commit `ca36288` did **not** modify it or any other guard:

- `git diff --name-only 7c0c02f ca36288 -- packages/ui/test/` lists **nothing** — the Implementer touched no file under `test/`.
- `git diff 7c0c02f HEAD -- packages/ui/test/architecture-type-literals.test.ts` is **empty (byte-identical)**. The other guards (`architecture-color-literals`, `architecture-token-refs`, `architecture-palette-sync`) and `tokens.test.ts` are likewise untouched in the Implementer commit.
- `git log --diff-filter=A` confirms the type guard was introduced only in `7c0c02f` (the Tester commit) and nowhere since.

The Implementer made the guard green by removing offenders, not by editing the guard.

**The guard is real, not vacuous.** I read it in full. It `walk()`s the live source tree (`SCAN_ROOTS = [apps/web/src, packages/ui]`), `readFileSync`s each `.css/.ts/.tsx` (excluding `.test.*`), and aggregates into one `expect(offenders).toEqual([])`. The CSS patterns key on each property name (`font-size:` / `font-weight:` / `line-height:` / `letter-spacing:` / `font-family:`), capture the value up to `;`/`}` (`[^;}]+`, which correctly excludes the terminator so it never bleeds into the next rule), and `cssValueIsLiteral()` flags anything that is neither a `var(` reference nor a CSS keyword — so `13px`, `0.9rem`, `600`, `1.6`, `-0.6px`, `0.04em`, and the bare `0` resets all match. The TSX number pattern uses a `(?=[,}\n])` lookahead terminator so `fontSize: 26` matches but `fontSize: Math.round(size * 0.4)` does not (the value is an expression, not a bare literal), correctly passing `Avatar.tsx:43`. I confirmed by reasoning that planting `font-size: 13px` in any app CSS file, or `fontSize: 26` inline in a `.tsx`, would turn the guard RED with a precise offender message. The guard genuinely exercises the source tree. **Not weakened.**

## 2. Two-tier type structure (ADR §1) — **PASS**

`packages/ui/styles/tokens.css` is cleanly two-tier:

- **Tier 1** (`--u-raw-*`): literal values only, one token per distinct in-use value, units as authored (no rem→px, no consolidation). Counts verified against the ADR inventory: **21 `--u-raw-font-size-*`** (17 px + 4 rem), **4 `--u-raw-weight-*`** (the one honest 400/500/600/700 ladder), **12 `--u-raw-leading-*`**, **17 `--u-raw-tracking-*`**, **2 `--u-raw-family-*`** (sans/mono). (Raw grep counts are 2× because each raw also appears once inside its Tier-2 alias's `var()`; 42/8/24/34/4 ÷ 2 = 21/4/12/17/2, exact.)
- **Tier 2** (semantic / per-property aliases): every alias is `var(--u-raw-…)`, never a literal — thin 1:1 value-keyed aliases (`--u-font-size-13: var(--u-raw-font-size-13)`, `--u-font-weight-semibold`, `--u-leading-160`, `--u-tracking-n30`). App CSS references only this tier.

**Gate resolutions honored exactly:**
- **NO `--u-text-*` type bundles.** Grep finds `--u-text-*` only at the pre-existing Story-40 *color* token `--u-text-error` (line 139) and inside a comment recording the bundle *deferral* (line ~307). No composite size+weight+leading bundle was added.
- **NO `--u-family-*` aliases.** `--font-sans` / `--font-mono` are **kept and repointed** to `var(--u-raw-family-sans/-mono)` (zero call-site churn). No `--u-family-*` alias exists. The family stacks live once, byte-for-byte folded into the Tier-1 raws.
- **letter-spacing in scope:** all 17 distinct values tokenized + guarded.

## 3. Value-equality spot-check (zero-diff proxy) — **PASS, all proven identical**

I independently picked ~16 swept declarations across CSS + the two TSX moves and chased each `var()` → Tier-2 alias → Tier-1 raw → literal, comparing against `git show origin/main:<file>`. Every one resolves byte-identical. Sample (all ✓):

| Site | origin/main literal | Token chain | Resolved |
|---|---|---|---|
| `About.css` heading | `font-size: 26px; font-weight: 600; letter-spacing: -0.6px` | `--u-font-size-26` / `--u-font-weight-semibold` / `--u-tracking-n60` | `26px` / `600` / `-0.6px` ✓ |
| `About.css:33` | `font-size: 14px !important` | `var(--u-font-size-14) !important` | `14px !important` (flag kept at call site) ✓ |
| `About.css` body | `font-size: 15px; line-height: 1.75` | `--u-font-size-15` / `--u-leading-175` | `15px` / `1.75` ✓ |
| `RatingControl.css:42` | `line-height: 0` | `--u-leading-0` → `0` | `0` ✓ (icon-reset zero) |
| `FollowButton.css` | `font-size: 0.92rem` | `--u-font-size-92rem` → `0.92rem` | `0.92rem` ✓ (rem kept as rem) |
| `RatingControl.css` | `font-size: 0.85rem` / `0.95rem` | `-85rem` / `-95rem` | `0.85rem` / `0.95rem` ✓ |
| `base.css` | `font-size: 17px; line-height: 1.6` | `--u-font-size-17` / `--u-leading-160` | `17px` / `1.6` ✓ |
| `AuthForm.css` | `font-size: 12px; font-weight: 500` | `--u-font-size-12` / `--u-font-weight-medium` | `12px` / `500` ✓ |
| `AuthForm.css` | `letter-spacing: 0.5px` / `0.3px` | `--u-tracking-p50` / `-p30` | `0.5px` / `0.3px` ✓ |
| `NotFound.tsx` → `NotFound.css` | inline `fontSize: 26, fontWeight: 600, letterSpacing: "-0.6px"` | `--u-font-size-26` / `-semibold` / `--u-tracking-n60` | `26px` / `600` / `-0.6px` ✓ |
| `NotFound.tsx` → `.not-found-body/-link` | inline `14`, `13`, `fontWeight: 500` | `-14`, `-13`, `--u-font-weight-medium` | `14px` / `13px` / `500` ✓ |
| `AuthWelcome.tsx` → `.auth-welcome-note` | inline `fontSize: 11, lineHeight: 1.5` | `--u-font-size-11` / `--u-leading-150` | `11px` / `1.5` ✓ |

**Edge cases all confirmed:** `line-height: 0` → `--u-leading-0` (preserved as `0`); `14px !important` keeps `!important` at the call site (token carries only `14px`); the four rem sizes (`0.85/0.9/0.92/0.95rem`) kept as rem, never converted to px; `font: inherit` (3 sites: `AuthorEdit.css`, `AuthShell.css`, `ClaimControl.css`) appears only as unchanged context (no `+/-`); `Avatar.tsx` is **not in the diff at all** — its computed `Math.round(size * 0.4)` was left untouched (not tokenized). I could not find a single value I could not prove identical.

## 4. The visual gate — **PASS (zero-diff, no baseline touched)**

`gh pr checks 84` → **Visual regression: pass (1m5s).** No `*.png`, snapshot, or baseline file appears in `git diff --name-only origin/main...HEAD` (confirmed: zero baseline files changed). CI green + the §3 value spot-check together are the evidence that pixels are unchanged. No baseline was updated, honoring the ADR 0039 discipline.

## 5. The incidental comment reword — **comment-only, no behavior change**

The reworded line is the Tier-2 family-fold comment in `tokens.css` (now `/* font-family — existing names kept and repointed to raw (zero churn, zero diff); the 9 app-CSS font-family references resolve unchanged. */`). The `token-refs` guard's reference regex (`/var\(\s*(--[a-zA-Z0-9-]+)/g`) would have captured a `var(--font-…)` substring had the prose been phrased that way; the rewrite phrases it as plain English ("font-family references") and contains no `var(--…)` token reference. It sits entirely inside a `/* … */` comment, adds no token, changes no value, and alters no behavior. The `architecture-token-refs` guard is green. **Adjudication: comment-only, benign.**

## 6. Guards pass + gates — **PASS**

- `pnpm --filter @unbnd/ui test`: type guard 0 offenders; color guards + palette-sync + token-refs + smoke all green (7/7).
- `pnpm -r typecheck` clean; `pnpm --filter @unbnd/web test` 300 passed; `pnpm --filter @unbnd/web build` clean.
- **Type guard allowlist names ONLY `packages/ui/styles/tokens.css`** (`ALLOWLIST = new Set(["packages/ui/styles/tokens.css"])`). No TS file is allowlisted (Option G: the runtime literals were swept into CSS, not a TS constant). `data`, `e2e`, and `test` are `SKIP_DIRS` scope-exclusions, consistent with the color guard — not allowlist entries.
- Independent leak check: `grep` for bare `font-size|font-weight|line-height|letter-spacing` literals (excluding `var(`) across all `apps/web/src/**/*.css` returns **nothing**. The sweep is complete.

## 7. Scope — **PASS**

Type axis only. Every changed CSS line is a type-value→`var()` swap; a grep for off-axis property churn (`color`/`background`/`padding`/`margin`/`border-radius`/`z-index`/`transition`/`animation`/`gap`/`width`/`height`/`box-shadow`) in the CSS sweep returns **nothing**. Non-type token-sheet entries (color, `--u-radius*`, `--page-*`) are untouched. No primitives/icons/layout work, no `data/` changes, no behavior/copy change, no new dependency, no new tooling (the guard is a Vitest test under the existing `pnpm -r test`; ADR 0038 §7 no-build-step honored). The two structural additions — `NotFound.css` (new, holds the three swept NotFound classes) and the `.auth-welcome-note` block appended to `AuthForm.css` (holds the swept AuthWelcome note) — exist solely to hold the moved inline literals, with byte-identical resolved values; the non-type inline props (`color`, `textAlign`, `margin*`, `padding`) correctly stay inline on the JSX.

## House rules

- **Brand tokens are the source of truth:** this story extends the two-tier source to the type axis. No new type literal outside `tokens.css`.
- **No new tooling / no new dep:** confirmed (guard is Vitest; no lockfile change for this story).
- **No AI-slop in copy/visuals:** no shipped UI string changed (developer-facing refactor; render byte-identical). The em dashes / `→` arrows present are in **code comments and the ADR/story prose only**, matching the already-merged Story-40 precedent (its guard and `tokens.css` carry the same comment style; the Story-40 review PASSed on the same basis). The no-slop ban targets shipped UI copy, not internal code comments. Non-blocking; see findings.
- **Trust tiers / crypto / DList:** N/A — no trust UI, no crypto surface, no event-shape change.
- **PRD §11.3 scope:** untouched. Developer-facing infrastructure; approaches no out-of-scope product surface.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **Em dashes / arrows in code comments** (`tokens.css`, `architecture-type-literals.test.ts`, `NotFound.css`). Consistent with the already-merged Story-40 guard/tokens comment style and outside the shipped-copy no-slop scope, so not blocking. If the project ever wants ASCII-only code comments, that is a separate sweep across the whole `@unbnd/ui` package, not this story.
2. **Composite semantic role bundles** (`--u-text-{body,heading,caption}`) deferred to a later intentional typography story per ADR §3 / Out of scope. Recorded debt, intentional.
3. **A genuinely rationalized type scale** (collapsing near-duplicate sizes/leading/tracking onto a cleaner ramp, and the px/rem unit split) is a separate visual-change story under ADR 0039, not this refactor. Recorded debt.

## Scope / firewall
Engineering-only review. No product/PRD-scope change, no Unbnd business/grant/community rationale touched. The diff approaches none of PRD §11.3. The data layer, API, and all app fixtures are untouched in value.

---

## Verdict: **PASS / APPROVED**

Story 41 is mergeable as committed on PR #84. Per the Reviewer role I **STOP at the merge gate** — I do not commit, push, or merge; the human controls git. On this PASS I performed the doc-only story closeout (Status: Done, Review link, `git mv` the story to `done/`), left in the working tree unstaged for the human.
