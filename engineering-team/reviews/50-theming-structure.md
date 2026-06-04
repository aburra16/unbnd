# Review: Story 50 — Theming substrate + dark-mode structure

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-04
**Diff:** `git diff origin/main...HEAD` (head commit `677f7ae`)
**Story:** `engineering-team/stories/done/50-theming-structure.md`
**ADR:** `engineering-team/decisions/0050-theming-structure.md` (Accepted)
**PR:** #94 (branch `story-50-theming`)

Fresh-context independent review. Author claims were not trusted; every assertion below was re-derived.

## What the diff is

Additions-only across exactly four files (619 insertions, 0 deletions):

```
A  engineering-team/decisions/0050-theming-structure.md   (+182)
A  engineering-team/stories/50-theming-structure.md        (+83)
M  packages/ui/styles/tokens.css                           (+121, additions-only)
A  packages/ui/test/architecture-theme-completeness.test.ts (+233)
```

No `apps/**` and no `packages/ui/src/**` file is touched. The only source change is the additive theme section appended to `tokens.css`; the only test added is the new completeness guard.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS** (10/10 workspace projects: schemas, search, ui, web, promoter, seeder, indexer, trust, shelves, api — all `Done`).
- [x] `pnpm --filter @unbnd/ui test` — **PASS** (13 test files, 20 tests). New `architecture-theme-completeness.test.ts` GREEN (3 tests); `tokens.test.ts` GREEN (2); all 10 prior `architecture-*` guards GREEN.
- [x] `pnpm --filter @unbnd/web test` — **PASS** (52 files, **300 tests**). (The `ECONNREFUSED :3000` lines are an expected in-test log, not a failure; suite is all-green.)
- [x] `pnpm --filter @unbnd/web build` — **PASS** (`tsc --noEmit` + `vite build`, 459 modules, built in ~573ms).
- [x] `gh pr checks 94` — **all PASS**: `Typecheck, test, build` pass; `Validate Caddyfile` pass; **`Visual regression` pass**.
- [ ] _Lint not configured — skipped._

## Guard integrity (Tester's work not tampered with)

- The Tester authored `packages/ui/test/architecture-theme-completeness.test.ts` in commit `9f19e54` (233 insertions, that file only).
- The Implementer's commit `677f7ae` touched **only** `packages/ui/styles/tokens.css` (121 insertions). `git diff 9f19e54 HEAD -- <guard>` is **empty** — the Implementer did not modify the guard.
- `tokens.test.ts` and all other `architecture-*.test.ts` are **untouched** on the branch (`git diff origin/main...HEAD` lists only the new guard under `packages/ui/test/`).
- **The guard is real**, verified by reading it, not by trusting it goes green:
  - *Assertion 1 (completeness):* `inScope` is DERIVED as `{ every --u-raw-color-* defined under :root }` (line 130), never hand-listed. For each declared `[data-theme]`, any in-scope raw missing from the theme block is an offender. A half-defined theme → RED. Adding a new `--u-raw-color-*` to `:root` without updating the dark block → RED.
  - *Assertion 2 (swap-proof / anti-Tier-2-repoint):* requires ≥1 declared theme (NOT vacuously green on zero — lines 163-167), the theme must be complete, must differ from `:root` on ≥1 raw, AND must leave `--u-amber`'s Tier-2 definition unchanged. Lines 213-220 make a Tier-2-alias repoint a FAILURE — exactly the anti-pattern ADR 0050 §3 fences. A theme that "swapped" by editing the semantic layer would not satisfy the proof.
  - *Wiring sanity:* a guard test asserts `inScope` is non-empty so a parser regression cannot make the real assertions vacuously pass.

## Zero-diff default audit (the prime directive)

- **`:root` is byte-identical.** SHA of the `:root { … }` block on `origin/main` and on HEAD match (`2b092d4d…`). The entire pre-existing file (all 644 lines on main, incl. `:root` and the `@media (prefers-reduced-motion)` block) is identical to HEAD's first 644 lines (`diff` empty). The 121 added lines are purely the new theme section (line 645 onward).
- **`tokens.css` diff is additions-only** — nothing inside `:root` is removed or changed; only the doc comment + the `[data-theme="dark"]` block are added.
- **No `data-theme` is set anywhere.** `apps/web/index.html` is `<html lang="en">` (no attribute). Grep across `apps/web` + `packages/ui/src` for `data-theme | dataset.theme | setAttribute` returns nothing. The only `data-theme` occurrences in the repo are the CSS definition, the new test, and the (gitignored, untracked) `apps/web/dist/` build artifact — the skeleton is bundled but inert because no attribute activates it.
- **Visual gate confirms it.** `Visual regression` job on PR #94 is **pass**, and **no `*.png` baseline / snapshot file changed** on the branch (`git diff origin/main...HEAD -- '*.png'` empty; no snapshot/baseline path in the diff). Defined-but-not-activated is proven by the visual gate showing zero diff with no baseline update (ADR 0039 honored).

## Dark-skeleton check

- **Complete.** The `[data-theme="dark"]` block redefines exactly **67** `--u-raw-color-*` tokens; `:root` defines exactly **67** `--u-raw-color-*` tokens; the two sets are equal (no missing, no stray).
- **Swap-proof.** `--u-raw-color-ink-900` is `#1A1A2E` under `:root` and `#ECECF2` under `[data-theme="dark"]` (and many more differ). `--u-amber` (Tier-2 alias) is NOT present in the dark block, so the swap flows purely through the raw tier.
- **No out-of-scope token touched.** The dark block defines ONLY `--u-raw-color-*` — no Tier-2 alias, no non-color raw, no `--u-raw-elevation-*`, no `--page-*` (verified by extracting every `--name:` in the block and filtering: the non-`--u-raw-color-*` set is empty). Matches ADR 0050 §4 / §"dark skeleton scope" precisely.
- **Marked as inert skeleton.** A prominent comment block states SKELETON, "Structural validation only; NOT a finalized dark palette; NOT activated," and the substrate comment explains the block is inert until the attribute is set (which this story never does). Placed AFTER the `@media (prefers-reduced-motion)` block (line 672, after line 635), matching the sanctioned scoped-override precedent.

## App CSS unchanged + JS-injected boundary

- No app CSS or TSX changed: `git diff origin/main...HEAD -- 'apps/**' 'packages/ui/src/**'` is empty.
- `GENRE_PALETTE` (`packages/ui/src/palette.ts`) and `SEMANTIC_COLORS` (`packages/ui/src/colors.ts`) are **untouched** — the documented out-of-scope boundary (ADR 0050 §"The JS-injected-color boundary") is respected. The CSS-only dark skeleton leaves the JS-injected avatar/cover/icon colors at light values, which is correct and recorded for a future real dark mode.

## Spec adherence

- [x] Substrate formalized; `:root` unchanged in content and resolved values.
- [x] App CSS references only the semantic tier (no app-CSS raw refs; locked — see note below).
- [x] A second skin re-resolves a semantic token with no app-CSS change (swap-proof assertion).
- [x] `[data-theme="dark"]` skeleton structurally complete, unpolished, NOT activated.
- [x] Theme-completeness guard passes; green on landing, red on any half-defined theme.
- [x] Default render byte-identical; visual job zero-diff; no baseline updated.
- [x] All prior guards green; typecheck/test/build pass.

## ADR adherence

- [x] Option A (override Tier-1 raw color tier) implemented exactly; Tier-2 aliases untouched.
- [x] Files match the ADR implementation notes (tokens.css + new completeness guard only).
- [x] No new dependency, no new tooling, no build step — the guard is a Vitest test under the existing `pnpm -r test` (ADR 0038 §7 honored). The `definedTokens()` helper is COPIED (not extracted) into the new file, which the ADR explicitly leaves to Implementer latitude and which keeps `architecture-token-refs.test.ts` green (confirmed).

## UI integrity

- [x] Brand tokens are the source of truth; no new hex literal outside `tokens.css`. The new hexes live only in the skeleton raw-color block in `tokens.css`, where raw literals belong.
- [x] No icon library, no emoji added.
- [x] Copy / comments pass the no-slop rules: no em dashes in the added block (verified); no rhetorical contrasts or hedged openers in the comment prose.
- [x] No trust/GrapeRank surface touched.

## Things tests can't catch

- [x] No secrets, no debug logging, no commented-out code in the diff.
- [x] No race conditions or error-path concerns (pure declarative CSS + a static-analysis test).
- [x] No scope creep: no theme activation, no toggle UI, no persistence, no doc re-point (epic story 14), no non-color theming.

## House rules

- [x] PRD §11.3 scope: nothing from the out-of-scope list touched. Phase 2 platform hardening; no PRD claim changes.
- [x] POV-first / decentralized-first untouched (presentation-layer CSS only).
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`tokens.css` substrate comment (lines ~645-668)** — a hard line break splits "resolve through the / overridden raws" mid-sentence awkwardly. Cosmetic only; not a slop-rule breach, not blocking.
2. **App-CSS-only (`zero var(--u-raw-` in `apps/web/src`) assertion** — ADR 0050 §"The app-CSS-only guard" specifies a thin CI assertion locking this precondition, with placement left to Implementer latitude. The condition holds today (grep returns zero), and the swap-proof guard plus Guard A/B cover the practical risk, but no dedicated `var(--u-raw-` scan over `apps/web/src` was added in this diff. Non-blocking: the AC is satisfied (verified-zero today, and a raw leak would not by itself break theming since the dark block redefines every raw), but a future story or a follow-up could add the explicit scan the ADR sketched to make the precondition self-policing. Recorded, not required for merge.

## Verdict

**PASS**

The diff matches the story and ADR 0050 exactly. Zero-diff default is provably preserved (`:root` byte-identical, no activation anywhere, visual gate green with no baseline change). The dark skeleton is complete (67/67 raws), swap-proven, scope-clean, and unmistakably marked inert. The Tester's guard is intact and genuinely teeth-bearing. All gates pass. Mergeable as-is.
