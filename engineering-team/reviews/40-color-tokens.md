# Review: Story 40 — Two-tier color tokens, drift fix, palette unification, first CI guards

**Reviewer:** Claude (acting as Reviewer — independent; fresh context, re-derived; did not write the code, guards, ADR, or story)
**Date:** 2026-06-03
**Diff:** `git diff origin/main...HEAD` on branch `story-40-color-tokens`, PR #83. Commits: `db23b01` (story draft) → `8c3b452` (ADR 0040 Accepted) → `70ff712` (Tester: three CI guards, red set) → `d07fb49` (Implementer: two-tier sweep). 51 files, +1165/-182.
**Story:** `engineering-team/stories/done/40-color-tokens.md` (the review wrote this path post-move)
**ADR:** `engineering-team/decisions/0040-color-tokens.md` (Accepted; refining ADR under umbrella 0038, held to the Story-39 `visual` gate via 0039)
**Epic:** `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 3, the color axis)
**Classification:** behavior-preserving zero-diff refactor. Flow PO → Architect → Tester → Implementer → Reviewer.

## Verdict: **PASS** (APPROVED)

The diff delivers exactly what ADR 0040 specifies and nothing more: a two-tier color token model, the structural drift fix (D2, zero-diff), the genre/cover palette unified to one TS source, the runtime-injected component colors re-sourced, and the three CI guards landing green. The prime directive — **zero-diff, behavior-preserving** — holds. Every gate I ran is green; PR #83's `Visual regression` job is zero-diff success with no baseline touched. Guard integrity is intact (the Implementer did not modify any of the three Tester-authored guards). The `tokens.test.ts` change is a faithful two-tier migration, not a weakening. All findings are non-blocking.

---

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm --filter @unbnd/ui test` — **PASS.** 4 files, 6 tests. Guard A (`architecture-token-refs`) green (0 undefined refs), Guard B (`architecture-color-literals`) green (0 literals outside the token layer), `architecture-palette-sync` green (both equality assertions), `tokens.test.ts` green.
- [x] `pnpm -r typecheck` — **PASS, zero errors.** All workspace projects clean, including `apps/web` and `packages/ui` (which now compiles the new `palette.ts`/`colors.ts`).
- [x] `pnpm --filter @unbnd/web test` — **PASS.** 52 files, **300 passed**, unchanged from `main`.
- [x] `pnpm --filter @unbnd/web build` — **PASS clean.** `tsc --noEmit` + `vite build`, 447 modules. (CSS asset hash legitimately changes — `index-DPUkYPYl.css`, 53.79 kB — because the token sheet text changed; this is structural CSS-source change, not a rendered-value change. The visual gate is the authority on pixels, and it is zero-diff.)
- [x] **PR #83 CI** (`gh pr checks 83`): **all three jobs pass** — "Typecheck, test, build", "Validate Caddyfile", and **"Visual regression" (1m0s, zero-diff success)**.
- [ ] _Lint not configured — skipped (house rules)._

The visual suite was not run locally (no Docker; baselines are Linux-canonical under the pinned Playwright image). Verified via CI status + the value spot-check below, which is the local proxy for pixel-identity.

---

## 1. Guard integrity (process check) — **PASS**

The Tester authored three guards in commit `70ff712`. I verified the Implementer commit `d07fb49` did **not** modify any of them:

- `git diff --name-only 70ff712 d07fb49` lists **none** of the three guard files.
- `git diff 70ff712 HEAD -- <guard>` is **empty (byte-identical)** for all three: `architecture-token-refs.test.ts`, `architecture-color-literals.test.ts`, `architecture-palette-sync.test.ts`.
- `git log --diff-filter=A` confirms each was introduced in `70ff712` (the Tester commit) and nowhere since.

No guard was weakened. The Implementer made the guards green by removing offenders, not by editing the guards.

I additionally confirmed the guards are **real, not vacuous**: Guard B walks 105 app `.css/.ts/.tsx` files; planting `color: #abcdef` in `apps/web/src/styles/base.css` turns it RED with a precise offender message, and it returns green on revert. The guards genuinely exercise the source tree.

## 2. The `tokens.test.ts` change adjudication — **FAITHFUL, not a weakening**

`packages/ui/test/tokens.test.ts` is the Story-38 smoke test, **not** one of the three protected guards (confirmed: it is absent from `70ff712`'s guard set and is a pre-existing file). The Implementer's change is faithful to the two-tier migration:

- Old (single-tier): `expect(css).toContain("--u-amber: #C4763C")` (literal on the semantic name).
- New (two-tier): asserts **both** tiers — `--u-raw-color-amber-500: #C4763C` (literal on the raw token) **and** `--u-amber: var(--u-raw-color-amber-500)` (semantic name aliases raw, never a literal). Same for ink and parchment.

The resolved value (`--u-amber` → `#C4763C`) is preserved; the new assertion is strictly *stronger* (it pins the literal-on-raw + alias-on-semantic invariant the migration introduces). This is the equivalent two-tier invariant, exactly as flagged. Verdict: faithful.

## 3. Two-tier structure (ADR §1) — **PASS**

`packages/ui/styles/tokens.css` is cleanly two-tier:
- **Tier 1** (`--u-raw-color-*`): literal values only — amber/ink/parchment/white/muted/green/red/purple, the four D2 drift-preservation neutrals, the eight genre `bg` hues + teal, and one raw per distinct in-use rgba alpha. No semantics.
- **Tier 2** (semantic): every entry points at Tier 1 via `var(--u-raw-color-…)`, **never at a literal**. Grepped the Tier-2 block: no Tier-2 token holds a hex/rgba literal.

**`--signal-*` / `--genre-*` kept as-is (gate decision):** the 3 `--signal-*` and 8 `--genre-*` tokens retain their exact names and are repointed to raw (`--signal-positive: var(--u-raw-color-green-500)`, `--genre-literary: var(--u-raw-color-genre-literary)`, etc.). **No rename to `--u-signal-*`/`--u-genre-*`, no deprecated aliases introduced.** Confirmed. Guard A treats them as defined tokens.

## 4. Drift fix is zero-diff (ADR §2 table) — **PASS**; two genuine-bug fixes correctly DEFERRED

All 7 drifted refs repointed per the §2 table, inline literal fallbacks removed, each resolving to a token equal to its old rendered fallback (verified against `git show origin/main:<file>`):

| Ref | Old fallback | New token → raw | Resolved | OK |
|---|---|---|---|---|
| `AuthorEdit.css:4` | `#e5e5e5` | `--u-line-200` → `--u-raw-color-line-200` | `#E5E5E5` | ✓ |
| `AuthorEdit.css:29` | `#d4d4d4` | `--u-line-300` → `--u-raw-color-line-300` | `#D4D4D4` | ✓ |
| `AuthorEdit.css:33` | `#fff` | `--u-surface-input` → `--u-raw-color-white` | `#FFFFFF` | ✓ |
| `AuthorEdit.css:47` | `#fff` | `--u-on-ink` → `--u-raw-color-white` | `#FFFFFF` | ✓ |
| `AuthorEdit.css:65` | `#b00020` | `--u-text-error` → `--u-raw-color-red-700` | `#B00020` | ✓ |
| `AuthorBadge.css:37` | `#fff` | `--u-on-ink` → `--u-raw-color-white` | `#FFFFFF` | ✓ |
| `ClaimControl.css:7` | `#d8d4cc` | `--u-line-warm` → `--u-raw-color-line-warm` | `#D8D4CC` | ✓ |

**Deferred-as-bug calls confirmed NOT done (as required):**
- Borders still resolve to their distinct greys (`#E5E5E5`/`#D4D4D4`/`#D8D4CC`), **not** `--u-border`.
- Error text still resolves to `#B00020`, **not** `--signal-negative` (`#DC3545`).
- `ClaimControl.css:8` `var(--u-surface, #fff)` correctly had its dead `#fff` fallback dropped (the token was already defined as `rgba(26,26,46,0.03)`); no value change.

The structural fix (no undefined refs, no silent fallback) is made without the pixel change, exactly per the gate decision and ADR 0039 discipline.

## 5. Palette unification (ADR §3) — **PASS**

One source: `GENRE_PALETTE` in `packages/ui/src/palette.ts` (re-exported from `@unbnd/ui`). `Avatar.tsx` derives `BGS = GENRE_PALETTE.map(r=>r.bg)` / `INKS = …map(r=>r.ink)`; `view-model.ts` derives `COVERS = …map(r=>({from:r.bg, to:r.coverTo, ink:r.ink}))`. The FNV-1a `hash()` and `% length` indexing are unchanged.

**Order preserved exactly (byte-for-byte against origin/main).** I compared all 8 rows of `GENRE_PALETTE` against `origin/main`'s `BGS`, `INKS`, and `COVERS` arrays:

| idx | bg (=BGS, COVERS.from) | ink (=INKS, COVERS.ink) | coverTo (=COVERS.to) |
|---|---|---|---|
| 0 | #085041 | #9FE1CB | #0A6B56 |
| 1 | #133F7A | #B5D4F4 | #1B5AAD |
| 2 | #7A2E14 | #F5C4B3 | #A5421E |
| 3 | #4340A0 | #CECBF6 | #534AB7 |
| 4 | #8B5A1B | #F5E3C7 | #B07423 |
| 5 | #993556 | #F4C0D1 | #B34068 |
| 6 | #27500A | #D1ECB6 | #3B6D11 |
| 7 (teal, `genre:null`) | #0E3F4D | #B6DDE5 | #185D70 |

Identical in value and order. The runtime hash → color mapping does not move.

**`SEMANTIC_COLORS` (`colors.ts`) + runtime-injected components.** Each prop resolves to its identical original value (verified against `git show origin/main`):
- SearchIcon stroke `#8B8698` → `SEMANTIC_COLORS.muted` (`#8B8698`) ✓
- LogoMark fill `#C4763C` → `.amber` (`#C4763C`) ✓
- Footer fill `#8B8698` → `.muted` (`#8B8698`) ✓
- AuthWelcome `logoFill #1D9E75` → `.signalPositive` (`#1D9E75`) ✓
- AuthNostrConnect `logoFill #7845FF` → `.signalSovereign` (`#7845FF`) ✓
- AuthMethodSelect `iconBg` rgba props → `var(--u-amber-tint-12)` / `var(--u-purple-tint-12)` / `var(--u-ink-tint-06)`, each resolving to its original rgba ✓

The `architecture-palette-sync` guard binds the CSS `--u-raw-color-genre-*` raws to `GENRE_PALETTE.bg` (7 named rows) and `SEMANTIC_COLORS` to its raw counterparts; both assertions pass. The teal (`genre:null`) and `history` (token, no array row) asymmetries are preserved as pre-existing, exactly per ADR §3.

## 6. Value-equality spot-check (zero-diff proxy) — **PASS, all proven identical**

I independently picked ~18 swapped literals across CSS + TS and chased each `var()` to the raw tier. Every one resolves byte-identical to its `origin/main` value. Sample (all ✓):

`AccountMenu` `#fff`→white, `rgba(…,0.12)`→ink-a12, `rgba(…,0.16)`→ink-a16, `rgba(220,53,69,0.08)`→red-a08; `BookCard` green-a10/red-a10/purple-a10/amber-a10; `PoVBar` ink-a02; `RatingsPanel` ink-a05; `SearchBox` `--u-surface` (dead 0.03 fallback dropped); `ProfileMe` ink-a74, `--u-border` (dead 0.1 fallback dropped, token=0.08, never rendered); `base.css` amber-a20; `AuthMethodCard` `#fffbf6`→parchment-warm, amber-a06, ink-a18, ink-a20; plus the 6 runtime-injected component props in §5 and the 7 drift refs in §4.

I could not find a single value I could not prove identical. The dead/disagreeing inline fallbacks (e.g. `var(--u-border, rgba(…,0.1))` shadowing a 0.08 token) were no-render-impact code that the sweep correctly removed.

## 7. The visual gate — **PASS (zero-diff, no baseline touched)**

`gh pr checks 83` → **Visual regression: pass (1m0s).** No `*.png` or snapshot file appears in `git diff --name-only origin/main...HEAD` (confirmed: zero baseline files changed). The CI green + the §6 value spot-check together are the evidence that pixels are unchanged. No baseline was updated, honoring the ADR 0039 discipline.

## 8. Guards pass + are real — **PASS**

- `pnpm --filter @unbnd/ui test`: Guard A 0 offenders, Guard B 0 offenders, palette-sync both assertions green. `pnpm -r typecheck` clean, `pnpm --filter @unbnd/web test` 300 passed, `pnpm --filter @unbnd/web build` clean.
- **Guard B allowlist** names ONLY `packages/ui/styles/tokens.css`, `packages/ui/src/palette.ts`, `packages/ui/src/colors.ts` — the three legitimate token-source files. No app-source file is allowlisted.
- **`data/` exclusion is honest:** `SKIP_DIRS` excludes `data` (dead `*-fixtures.ts`, imported only by `apps/web/test`, not in the render path), `e2e` (visual-harness fixtures), and `test`. Per ADR §5 these are scope exclusions, not allowlist entries, and the diff leaves `apps/web/src/data/*-fixtures.ts` untouched (confirmed: no fixture file in the diff). The boundary matches the ADR.
- Guard B genuinely red on a planted literal (demonstrated, reverted; tree clean).

## 9. Scope — **PASS**

Color axis only. `git diff` of all app CSS shows every changed line is a color value→`var()` swap or a dead-fallback removal; **no** `--font-*`/`--radius`/`--page-*`/`font-size`/`font-weight`/`line-height`/`z-index`/`transition`/`animation` churn (grep returned nothing). Non-color token-sheet entries (`--font-*`, `--page-*`, `--u-radius*`) are untouched. No primitives/icons/layout work, no `data/*-fixtures.ts` literal changes, no behavior/copy change. No new dependency, no new tooling (the guards are Vitest under existing `pnpm -r test`; ADR 0038 §7 no-build-step honored). The new `index.ts` exports (`GENRE_PALETTE`, `GenreRow`, `SEMANTIC_COLORS`) are the minimal JS surface ADR §3/§4 authorize.

## House rules

- **Brand tokens are the source of truth:** this story *makes* them the two-tier source. Amber-only accent, green/red/purple signal roles preserved (same hue plays same role).
- **No new tooling / no new dep:** confirmed (no lockfile dep add for this story; guards are Vitest).
- **No AI-slop:** the new code comments and the ADR/story prose are ASCII-hyphen, no em dashes, no banned filler verbs or rhetorical contrasts (spot-checked the token sheet, `palette.ts`, `colors.ts`, guard headers).
- **Trust tiers / crypto / DList:** N/A — no trust UI, no crypto surface, no event-shape change.
- **PRD §11.3 scope:** untouched. Developer-facing infrastructure; approaches no out-of-scope product surface.

---

## Findings

### BLOCKING
- **None.**

### Non-blocking follow-ups
1. **`color: #fff` mapped to `--u-surface-card` in a couple of text-on-fill spots** (e.g. `DuplicateCheck.css`), where a "text on a dark fill" role token (`--u-on-ink`) would read more semantically than a "card surface" token. Both resolve to `--u-raw-color-white` (`#FFFFFF`), so it is **zero-diff and harmless** — a semantic-naming nit, not a value issue. Not blocking; not worth a re-spin.
2. **Deferred drift visual-fixes** (`--u-line-*` → `--u-border`; `--u-text-error` → `--signal-negative`) remain open as a separate labeled baseline-update story, per ADR §2/Consequences. Recorded debt, intentional, out of scope here.
3. **Dead color literals in `apps/web/src/data/*-fixtures.ts`** are left as-is (scope-excluded by Guard B, not in the render path). Separate non-color tidy, per ADR §5/Consequences. No action this story.
4. **`history`/teal genre-token asymmetry** preserved as-is (history token has no array row; teal array row has no genre token). Pre-existing, recorded, the palette-sync guard checks only the 7 named rows. No action this story.

## Scope / firewall
Engineering-only review. No product/PRD-scope change, no Unbnd business/grant/community rationale touched. The diff approaches none of PRD §11.3. The data layer, API, and all app fixtures (`apps/web/src/data/*`) are untouched in value.

---

## Verdict: **PASS / APPROVED**

Story 40 is mergeable as committed on PR #83. Per the Reviewer role I **STOP at the merge gate** — I do not commit, push, or merge; the human controls git. On this PASS I performed the doc-only story closeout (Status: Done, Review link, `git mv` the story to `done/`), left in the working tree unstaged for the human.
