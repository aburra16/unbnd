# Review: Story 51 — Re-point the design-system house rules at `@unbnd/ui`

**Story:** `engineering-team/stories/done/51-docs-repoint.md`
**ADR:** `engineering-team/decisions/0038-design-system-architecture.md` (umbrella); per-axis ADRs 0040–0050
**Type:** Doc-only (epic story 14, closing story of epic 0001)
**Reviewer:** independent Reviewer, fresh context
**Date:** 2026-06-04

**Verdict: PASS**

---

## 1. No code changed (scope discipline)

Confirmed. Base is `origin/main` = `main` = `HEAD` = `a89309a` (Story 50). The Story 51 work is in the working tree (PR pending). `git diff HEAD` plus untracked files shows exactly four artifacts and nothing else:

- `CLAUDE.md` — modified (+18 / −1 lines, doc prose only)
- `AGENTS.md` — modified (+12 / −5 lines… net, doc prose only)
- `engineering-team/stories/51-docs-repoint.md` — new (the story)
- `packages/ui/README.md` — new (the package README)

Zero `.ts` / `.tsx` / `.css` / `.json` changes. Zero workflow / guard / config changes. No token, component, or guard file touched. Confirmed via `git diff --stat HEAD -- '*.ts' '*.tsx' '*.css' '*.json' 'packages/ui/test/*' '.github/*'` returning empty.

## 2. Accuracy cross-check (every reference is real)

Every path, primitive, export, and guard cited in the edits + README was cross-checked against the repo. **No invented or wrong reference found.**

**Paths / imports:**
- `packages/ui/styles/tokens.css` — exists (34 KB).
- `@unbnd/ui/styles/tokens.css` export — exists in `packages/ui/package.json` `exports` map, and is imported once in `apps/web/src/main.tsx:4` (`import "@unbnd/ui/styles/tokens.css";`). The "imported once in `apps/web/src/main.tsx`" claim is accurate.
- Two-tier token system — verified in `tokens.css`: `--u-raw-*` raw tier (466 occurrences), semantic `--u-*` / `--signal-*` / `--genre-*` tiers all present. Amber `#C4763C` is `--u-raw-color-amber-500`. Matches the docs.

**Primitives (all real `@unbnd/ui` exports in `packages/ui/src/index.ts`):**
`Button`, `IconButton`, `Link`, `Pill` (+ `GenrePill`), `Avatar`, `Label`, `Field`, `Container` — all exported. `Icon` registry (`<Icon name>`, typed `IconName` union) — exported from `components/Icon/Icon`. `breakpoints` constant — exported. Names match the docs exactly.

**Guard files — count and names.** All 12 cited guards exist under `packages/ui/test/` with exact names:
`architecture-token-refs`, `-color-literals`, `-type-literals`, `-spacing-literals`, `-shape-literals`, `-breakpoints`, `-motion-literals`, `-svg-literals`, `-button-literals`, `-palette-sync`, `-page-frame`, `-theme-completeness` (`.test.ts`). The README's guard table lists all 12 correctly. (Note: the story *background* prose says "11 guards" — that text predates Story 50's `theme-completeness` guard and is descriptive background, not a cited reference in the shipped docs; the shipped README/CLAUDE.md edits cite the guards correctly. Not blocking.)

**Theming claims:** `[data-theme]`-scoped substrate confirmed in `tokens.css` (`[data-theme="dark"]` block at line 672, default light skin under `:root`). The block carries an inline comment confirming it is INERT (no `data-theme` attribute set anywhere) and a SKELETON (not a finalized palette, not activated). The "dark skeleton exists for structural validation but is inert and not activated" claim is accurate.

**README package-shape claims:** `@unbnd/trust` precedent verified — `packages/trust/package.json` has `"private": true`, `"type": "module"`, `"." : "./src/index.ts"` export, no build step. `packages/ui/package.json` matches: `"private": true`, `"type": "module"`, `test` = `vitest run`, `typecheck` = `tsc --noEmit`, react/react-dom as peer deps. Accurate.

## 3. Intent preserved (no rule relaxed)

Confirmed. Every edit changes only WHERE the source of truth lives (`apps/web/src/styles/tokens.css` → `@unbnd/ui` / `packages/ui/styles/tokens.css`) and HOW it is enforced (convention-only review → named CI guards). No house rule was weakened, removed, or broadened:

- **Amber-only accent** — preserved in both files, now noted as token-backed in `@unbnd/ui` and "still binding."
- **Signal colors** (green positive / red negative / purple sovereign) — preserved verbatim.
- **No icon library** — preserved; tightened to route through the `Icon` registry with the `architecture-svg-literals` guard. Strictly equal-or-stronger, not relaxed.
- **No hardcoded color** — preserved; moved from "no new hex outside tokens.css" to "no raw color literals outside the token layer," now guard-enforced. Not broadened.
- **No-new-tooling rule** (CLAUDE.md §"No new lint/typecheck/build tooling without an ADR") — untouched.
- **Crypto policy** (CLAUDE.md) — untouched.
- **Copy/visual ban list** (CLAUDE.md §"No AI-slop") — untouched.
- **Stack-table fix** (AGENTS.md §6): `future packages/*` → `packages/* (incl. @unbnd/ui design system)`. Accurate — `@unbnd/ui` now exists as a real workspace package, so "future" was stale. Correct fix, no rule change.

The new CLAUDE.md §"The design system lives in `@unbnd/ui`" section adds orientation; it does not introduce a new house rule, it documents the now-shipped reality.

## 4. No AI-slop in added lines

Confirmed. No em dashes in any added line (checked the `+` lines of the CLAUDE.md/AGENTS.md diff and the full README). The `→` and `…` glyphs present are arrows / ellipses (allowed typographic glyphs, not em dashes). No rhetorical contrasts ("not X but Y"), no hedged openers, no banned filler verbs, no three-item throat-clearing lists. Prose is declarative and points at concrete files.

## 5. Gates (docs-only, expected untouched-green)

Re-run by the Reviewer:

| Gate | Command | Result |
|---|---|---|
| Typecheck | `pnpm -r typecheck` | PASS — all 10 packages/apps Done |
| Web build | `pnpm --filter @unbnd/web build` | PASS — `tsc --noEmit` clean, vite built 459 modules in 595ms |
| UI tests | `pnpm --filter @unbnd/ui test` | PASS — 13 files, 20 tests, all green (all 12 architecture guards pass) |

## Findings

None blocking. One non-blocking note: the story's *background* paragraph references "11 CI architecture guards"; the actual count is 12 (Story 50 added `theme-completeness`). The shipped docs (README table, CLAUDE.md/AGENTS.md edits) cite the guards correctly, so the accuracy criterion is met; the background prose is stale-by-one but is not a shipped reference. No action required for this story.

---

**PASS.** Doc-only change, zero code touched, every cited path / primitive / export / guard verified real against the repo, intent preserved on every house rule, no slop, all three gates green.
