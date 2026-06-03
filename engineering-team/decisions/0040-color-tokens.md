# ADR 0040: Two-tier color tokens, drift fix, palette unification, and the first two CI guards

**Status:** Accepted
**Date:** 2026-06-03
**Story:** `engineering-team/stories/done/40-color-tokens.md`

**Approved 2026-06-03** at the architecture gate. Gate decisions: (1) the two genuine-bug drift fixes (borders → `--u-border`, error text → `--u-signal-negative`) are DEFERRED to a separate labeled visual-change story, not folded into this zero-diff refactor; (2) **`--signal-*` / `--genre-*` are LEFT AS-IS** as Tier-2 semantic names repointed to the raw tier — NO rename to `--u-signal-*`/`--u-genre-*`, NO deprecated aliases, NO deferred call-site sweep (avoids a half-migrated state; any cosmetic `--u-` unification, if ever wanted, is its own complete story); (3) the dead `apps/web/src/data/*-fixtures.ts` color literals are left for a separate cleanup (not in the render path). §1, Consequences, and Out-of-scope below are updated to match decision (2).

Refining ADR under the umbrella **ADR 0038** (Accepted 2026-06-03, §1 two-tier token layer, §6 CI guards, §7 package shape). Held to the gate established by **ADR 0039** (the Story-39 Playwright `visual` job: `maxDiffPixelRatio: 0`, and the discipline that an intentional visual change is its own clearly-labeled baseline-update commit, never blended with a refactor). Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 3, the color axis, sequenced first because it is the lowest-entanglement sweep). This ADR resolves the color-taxonomy, drift-fix, palette-unification, tints, and guard-scope open questions the story carries. It does not relitigate 0038 or 0039.

## Context

The color axis is the first axis migration of the design-system overhaul. The umbrella (ADR 0038 §1) sets the target: a two-tier token layer in `@unbnd/ui` where Tier 1 is a raw color ramp of literal values and Tier 2 is semantic aliases that point at Tier 1 and never at a literal; app CSS references only Tier 2. The hard constraint from the user and orchestrator is that this story is a refactor and must be **zero-diff**: every resolved color value stays identical, the Story-39 `visual` job is zero-diff against committed baselines, and **no baseline is updated**.

### Acceptance criteria (quoted from the story)

- Color tokens are two-tier: a raw ramp of literal values and semantic aliases that reference the raw tier and never a literal; the app references the semantic tier.
- No color literals (hex, `rgb()`/`rgba()`, named colors) remain outside the token layer; color usage references semantic tokens.
- The three drifted refs in `AuthorEdit.css`, `AuthorBadge.css`, `ClaimControl.css` each resolve to a token defined in `@unbnd/ui`, with the inline literal fallbacks removed.
- A "no undefined token references" guard scans app CSS and passes (every `var(--u-…)` resolves to a defined token).
- A "no raw color literals" guard scans app CSS and components, passes, and its allowlist names only legitimate token-source files.
- The genre/cover palette has one source of color truth in `@unbnd/ui`; `Avatar.tsx` `BGS`/`INKS` and `view-model.ts` `COVERS` derive from it with identical resolved values.
- `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/web build` all pass.
- The Story-39 `visual` job is zero-diff; no baseline is updated.

### Verified current state (read directly against the `story-40-color-tokens` working tree, 2026-06-03)

**The token sheet** (`packages/ui/styles/tokens.css`) is single-tier and small. Every color name carries a literal value directly:

- Core: `--u-ink: #1A1A2E`, `--u-amber: #C4763C`, `--u-amber-hover: #B06A35`, `--u-amber-light: #E8A96A`, `--u-parchment: #FAF6F0`, `--u-parchment-deep: #EFEBE4`, `--u-muted: #8B8698`, `--u-night: #0E0E1A`.
- Derived (translucent ink ramp + radii): `--u-border: rgba(26,26,46,0.08)`, `--u-border-hover: rgba(26,26,46,0.15)`, `--u-surface: rgba(26,26,46,0.03)`, plus the non-color `--u-radius`/`--u-radius-lg` (left untouched, per story out-of-scope).
- Genre: `--genre-literary: #085041`, `--genre-scifi: #133F7A`, `--genre-mystery: #8B5A1B`, `--genre-romance: #993556`, `--genre-fantasy: #4340A0`, `--genre-thriller: #7A2E14`, `--genre-biography: #27500A`, `--genre-history: #555362`.
- Signals: `--signal-positive: #1D9E75`, `--signal-negative: #DC3545`, `--signal-sovereign: #7845FF`.
- Non-color (left as-is): `--font-sans`, `--font-mono`, `--page-max`, `--page-pad-x`.

**The live drift.** Three refs use tokens that are not defined, so each renders its inline fallback:

| File | Line | Declaration | Property | Renders (fallback) |
|---|---|---|---|---|
| `AuthorEdit.css` | 4 | `border: 1px solid var(--u-line, #e5e5e5)` | border | `#e5e5e5` |
| `AuthorEdit.css` | 29 | `border: 1px solid var(--u-line, #d4d4d4)` | border (input/textarea) | `#d4d4d4` |
| `AuthorEdit.css` | 33 | `background: var(--u-bg, #fff)` | input/textarea fill | `#fff` |
| `AuthorEdit.css` | 47 | `color: var(--u-bg, #fff)` | text on `--u-ink` pill | `#fff` |
| `AuthorEdit.css` | 65 | `color: var(--u-danger, #b00020)` | error text | `#b00020` |
| `AuthorBadge.css` | 37 | `color: var(--u-bg, #fff)` | text on `--u-ink` "verified" pill | `#fff` |
| `ClaimControl.css` | 7 | `border: 1px solid var(--u-line, #d8d4cc)` | border | `#d8d4cc` |

`ClaimControl.css:8` additionally has `background: var(--u-surface, #fff)`, but `--u-surface` **is** defined (`rgba(26,26,46,0.03)`), so it renders the token value, not `#fff`. It is not drift; it is a defined token with a misleading inline fallback. The same misleading-but-harmless pattern appears widely (`var(--u-border, rgba(26,26,46,0.1))`, `var(--u-surface, #fff)`, `var(--u-radius, 8px)` in `DuplicateCheck.css`, `ShelfControl.css`, `TagControl.css`, `Avatar.css`, `CommunitySubmissions.css`, `ProfileMe.css`, `About.css`, `SearchBox.css`). These resolve to the defined token. They are not undefined-reference drift, but they DO contain raw-literal fallbacks, which the "no raw color literals" guard must account for (see Guard 2). Several fallbacks even disagree with the token they shadow (`var(--u-border, rgba(26,26,46,0.1))` shadows `--u-border: rgba(26,26,46,0.08)`); the fallback is dead code that never renders, so it is a no-render-impact cleanup, not a behavior change.

**Color literals outside the token sheet.** In app CSS: hex `#fff` (×20), `#ffffff` (×8), `#fffbf6` (×1, `AuthMethodCard.css:20`, a warm tint with no current token), the four drift fallbacks (`#e5e5e5`, `#d4d4d4`, `#d8d4cc`, `#b00020`), `#dc3545` (×7, equals `--signal-negative`), `#1d9e75` (×4, equals `--signal-positive`); plus ~80 `rgba()` calls in three families — ink `rgba(26,26,46,α)` at many α, amber `rgba(196,118,60,α)`, muted `rgba(139,134,152,α)`, signal-positive `rgba(29,158,117,α)`, signal-negative `rgba(220,53,69,α)`, sovereign `rgba(120,69,255,0.1)`. In components (TS-injected): SVG defaults `SearchIcon stroke="#8B8698"` (= muted) and `LogoMark fill="#C4763C"` (= amber); consumer props `logoFill="#1D9E75"` (`AuthWelcome.tsx`, = positive), `logoFill="#7845FF"` (`AuthNostrConnect.tsx`, = sovereign), `fill="#8B8698"` (`Footer.tsx`, = muted); and `iconBg="rgba(…)"` strings in `AuthMethodSelect.tsx`. Named colors in CSS are only `transparent` and `currentColor` (both keyword/inherited, not literals — left alone).

**The triplicated genre/cover palette, mapped exactly.** Three shapes hold overlapping but not identical color sets:

- `--genre-*` tokens (8): literary `#085041`, scifi `#133F7A`, mystery `#8B5A1B`, romance `#993556`, fantasy `#4340A0`, thriller `#7A2E14`, biography `#27500A`, history `#555362`. **Zero CSS call sites** reference `var(--genre-*)`; they are consumed only conceptually as the palette's "intended source."
- `Avatar.tsx` `BGS` (8, different order, one different hue): `#085041, #133F7A, #7A2E14, #4340A0, #8B5A1B, #993556, #27500A, #0E3F4D`. The eighth entry is teal **`#0E3F4D`**, which has **no `--genre-*` token**; conversely the history hue `#555362` is **absent from `BGS`**. `INKS` (8, ink partners): `#9FE1CB, #B5D4F4, #F5C4B3, #CECBF6, #F5E3C7, #F4C0D1, #D1ECB6, #B6DDE5` — none of which exist as tokens.
- `view-model.ts` `COVERS` (8 rows `{from,to,ink}`): `from` equals `BGS` exactly (same order, same teal eighth); `ink` equals `INKS` exactly; `to` is a per-row gradient end stop (`#0A6B56, #1B5AAD, #A5421E, #534AB7, #B07423, #B34068, #3B6D11, #185D70`) with no token for any of the eight.

So the three sources are **disjoint at one slot** (teal vs history) and the arrays carry 16 values (`ink` × 8, `to` × 8) that have no token at all. A clean token→array 1:1 map is impossible.

**The runtime-injection constraint (decisive for unification).** `Avatar.tsx` renders `style={{ background: BGS[idx], color: INKS[idx] }}`; `BookCard.tsx` renders `style={{ background: \`linear-gradient(155deg, ${book.coverFrom}, ${book.coverTo})\` }}` and `style={{ color: book.coverInk }}`; `view-model.ts` feeds those props from `COVERS`. The color literals are interpolated into inline `style` strings by JS at runtime. Per ADR 0038 §7 the package has **no build step** and `@unbnd/ui` exports raw `./src/index.ts`. CSS custom properties cannot be read by `Avatar.tsx`/`view-model.ts` without the DOM and the cascade (`getComputedStyle`), which is not available where these values are computed and would itself be a behavior change. So "re-source the arrays from the CSS tokens" is not mechanically possible at the source level; the source of truth that BOTH the TS arrays and the CSS tokens derive from must be a TS constant.

Also confirmed: the palette index is `hash(seed) % BGS.length` (FNV-1a on the slug/npub) in both `Avatar.tsx` and `view-model.ts`. The mapping from a given seed to a given color depends on **array order**, so the unification must preserve array order exactly, not merely the value set, or a book/avatar would get a different color and the visual gate would diff.

**Dead-but-present color literals in `data/`.** `apps/web/src/data/genre-fixtures.ts` and `book-fixtures.ts` carry ~40 hex literals (the palette hues plus several unique to the fixtures: `#7A2845`, `#353533`, `#444248`, `#1D3F0A`, `#FAEEDA`, …). These files are imported only by `apps/web/test/fixtures.test.ts`; they are **not in the render path** (no route or component imports them). The guard scope must handle them deliberately (see Guard 2 allowlist / scope).

**Guard precedent.** `packages/trust/test/architecture.test.ts` is the exact pattern to mirror: `REPO = resolve(__dirname, "..","..","..")`; a `RULES` list of `{label, pattern}`; `SKIP_DIRS` set; a `walk()` that collects `.ts/.tsx` (excluding `.test.*`); `[join(REPO,"apps"), join(REPO,"packages")].flatMap(walk)`; `readFileSync` per file; offenders aggregated into a single `expect([]).toEqual([])`. It runs under `pnpm -r test` because `@unbnd/trust`'s `test` script is `vitest run` and the file lives in `packages/trust/test/`. `@unbnd/ui` already has `"test": "vitest run"` and a `test/` dir with `tokens.test.ts`, so guards placed in `packages/ui/test/` run under the existing `pnpm -r test` with no wiring change. The guard must additionally scan `.css` files, which the trust guard does not; the `walk()` filter is widened to include `.css` for the color guards.

### Constraints that bind this design

- **Zero-diff is the prime directive.** Every resolved value stays identical; the Story-39 `visual` job stays zero-diff; no baseline is updated (ADR 0039).
- Amber `#C4763C` is the only accent; green positive, red negative, purple sovereign (`CLAUDE.md`). Two-tier names must not change which hue plays which role.
- No new tooling. The guards are Vitest tests under the existing `pnpm -r test` (`CLAUDE.md`; ADR 0038 §6).
- No AI-slop in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`).
- Color axis only. Type, spacing, radii, elevation, motion, breakpoints are out of scope (story fence); the non-color token-sheet entries are left as-is.
- In-repo prior art governs; the Tapestry branch survey does not apply (ADR 0038, story "DList shapes touched: None").

## Options considered

The two genuinely load-bearing decisions are the **palette-unification mechanism** and the **drift-fix policy**. Options are framed around those; the taxonomy, tints, and guards then follow.

### Option A — CSS tokens as the single source; TS arrays re-source by reading the cascade

Keep the genre/ink/gradient values as CSS custom properties; have `Avatar.tsx`/`view-model.ts` read them at runtime via `getComputedStyle(document.documentElement)`.

- Pros: one literal home (the CSS sheet); matches the "tokens are the source" phrasing.
- Cons: **breaks the no-build-step / runtime constraint.** The values are computed where there is no element/cascade to read; introducing `getComputedStyle` is new runtime behavior (timing, SSR/first-paint hazards, a DOM dependency in a pure mapping function), which is a behavior change and a zero-diff risk. It also cannot represent the 16 array-only values (`ink`, `to`) without inventing tokens for them whose only consumer is JS reading them back. Rejected: it fights the package's no-build constraint and adds runtime risk to a refactor that must be invisible.

### Option B — One shared TS palette constant in `@unbnd/ui` is the source; CSS genre tokens and the TS arrays both derive from it; a guard asserts CSS-token equality (CHOSEN)

A single typed constant `GENRE_PALETTE` lives in `@unbnd/ui` (`packages/ui/src/palette.ts`, re-exported from `src/index.ts`). It holds the full 8-row palette in the **exact array order** the runtime hash depends on, each row `{ bg, ink, coverTo, genre? }`:

```ts
// packages/ui/src/palette.ts — the single source of color truth for the
// genre/cover palette. Order is load-bearing: Avatar and the cover gradient
// index into it by hash(seed) % length, so reordering would re-color books.
export const GENRE_PALETTE = [
  { genre: "literary",   bg: "#085041", ink: "#9FE1CB", coverTo: "#0A6B56" },
  { genre: "scifi",      bg: "#133F7A", ink: "#B5D4F4", coverTo: "#1B5AAD" },
  { genre: "thriller",   bg: "#7A2E14", ink: "#F5C4B3", coverTo: "#A5421E" },
  { genre: "fantasy",    bg: "#4340A0", ink: "#CECBF6", coverTo: "#534AB7" },
  { genre: "mystery",    bg: "#8B5A1B", ink: "#F5E3C7", coverTo: "#B07423" },
  { genre: "romance",    bg: "#993556", ink: "#F4C0D1", coverTo: "#B34068" },
  { genre: "biography",  bg: "#27500A", ink: "#D1ECB6", coverTo: "#3B6D11" },
  { genre: null,         bg: "#0E3F4D", ink: "#B6DDE5", coverTo: "#185D70" }, // teal; no genre token today
] as const;
```

`Avatar.tsx` derives `BGS = GENRE_PALETTE.map(r => r.bg)` and `INKS = GENRE_PALETTE.map(r => r.ink)`. `view-model.ts` derives `COVERS = GENRE_PALETTE.map(r => ({ from: r.bg, to: r.coverTo, ink: r.ink }))`. Resolved values and order are byte-identical to today, so the hash mapping is unchanged. The CSS `--genre-*` tokens stay in `tokens.css` (their raw definitions move to the raw tier; see taxonomy), and a guard in `@unbnd/ui` asserts that each `--genre-<name>` raw value **equals** `GENRE_PALETTE`'s `bg` for the row whose `genre` matches that name, so the CSS and the TS constant cannot drift apart again. The `history` genre token (`#555362`) and the teal palette row are reconciled honestly: history has a token but no array row (it always did), and teal has an array row but no genre token (it always did); the equality guard checks only the seven rows that DO carry a genre name, and the ADR records both asymmetries as pre-existing, out-of-scope facts (see Out of scope).

- Pros: honors the no-build-step constraint (the source is plain TS the arrays import directly, no cascade read); collapses three files to one source; the 16 array-only values (`ink`, `coverTo`) have a real home; order is preserved exactly so the hash mapping does not move; the equality guard makes the CSS↔TS link permanent and reflects the genuine teal/history asymmetry rather than papering over it; `@unbnd/ui` already exports from `src/index.ts` with no build step, so importing a constant is free.
- Cons: the literal hues live in TS, not CSS, for the genre/cover palette specifically — a slight asymmetry with the rest of the color system where literals live in `tokens.css`. Mitigated: the equality guard keeps the CSS genre tokens honest, and the asymmetry is inherent (CSS cannot be the source for runtime-injected JS values without a build step or a cascade read, both rejected). Rejected alternatives prove this is the least-bad home.

### Option C — Generate `tokens.css` genre block from the TS constant at build time

Make `GENRE_PALETTE` the source and code-generate the `--genre-*` CSS from it.

- Pros: single source with CSS staying generated-correct.
- Cons: a build/codegen step is **new tooling** (ADR 0038 §7 mandates no build step for `@unbnd/ui`; `CLAUDE.md` bars new tooling without an ADR), and it adds a generated artifact and a generation command to maintain. The equality-guard approach in Option B gets the same "cannot drift" guarantee with zero tooling. Rejected on the no-new-tooling and no-build-step rules.

### Drift-fix sub-options (per ADR 0039 discipline)

- **D1 — Repoint each drifted ref to its semantically intended token** (`--u-line` → `--u-border`, `--u-bg` → a white surface token, `--u-danger` → `--signal-negative`). This changes the rendered pixel for those components (e.g. error text from `#b00020` to `#DC3545`, borders from `#e5e5e5`/`#d4d4d4`/`#d8d4cc` to `rgba(26,26,46,0.08)`), which is a visual diff and would require a labeled baseline update.
- **D2 — Define a token whose value equals the current rendered fallback, and point the ref at it** (CHOSEN). Pixels are preserved exactly; the visual gate stays zero-diff with no baseline update.

This story's prime directive (zero-diff, no baseline update) makes **D2** the policy. Any case where the fallback looks like a genuine bug (the component should show the brand color and currently does not) is **not** fixed here; it is recorded as a deferred, separately-labeled visual-change follow-up per ADR 0039, never smuggled into this refactor.

## Decision

We choose **Option B** for palette unification and **D2** for the drift fix. Together they deliver the two-tier token model, kill the drift, and unify the palette while holding every pixel identical.

### 1. Two-tier color taxonomy

**Tier 1 — raw color tokens.** Naming `--u-raw-color-<group>-<key>` per ADR 0038 §1. Literal values only, no semantics. The ramp carries exactly the values in use today (no speculative steps; a fuller ramp is added when a value is actually needed, to avoid dead tokens). Groups and keys:

- **amber:** `--u-raw-color-amber-500: #C4763C`, `--u-raw-color-amber-600: #B06A35` (the current `-hover`), `--u-raw-color-amber-300: #E8A96A` (the current `-light`).
- **ink:** `--u-raw-color-ink-900: #1A1A2E`, `--u-raw-color-ink-950: #0E0E1A` (the current `--u-night`).
- **parchment:** `--u-raw-color-parchment-50: #FAF6F0`, `--u-raw-color-parchment-100: #EFEBE4`, `--u-raw-color-parchment-warm: #FFFBF6` (the `AuthMethodCard` tint), and `--u-raw-color-white: #FFFFFF` (the `#fff`/`#ffffff` literals collapse onto one raw white).
- **muted (neutral):** `--u-raw-color-muted-500: #8B8698`.
- **green/red/purple signals:** `--u-raw-color-green-500: #1D9E75`, `--u-raw-color-red-500: #DC3545`, `--u-raw-color-purple-500: #7845FF`.
- **drift-preservation neutrals (D2):** `--u-raw-color-line-200: #E5E5E5`, `--u-raw-color-line-300: #D4D4D4`, `--u-raw-color-line-warm: #D8D4CC`, `--u-raw-color-red-700: #B00020`. These exist solely to preserve the three drifted refs' current rendered values exactly (see §2); they are honest raw entries, not a hack, and the taxonomy notes their origin.
- **translucent ink/amber/muted/green/red/sovereign overlays:** the `rgba()` families become raw tokens named by base + opacity, e.g. `--u-raw-color-ink-a08: rgba(26,26,46,0.08)`, `--u-raw-color-ink-a10: rgba(26,26,46,0.10)`, … one per distinct alpha actually used; likewise `--u-raw-color-amber-a10`, `--u-raw-color-muted-a70`, `--u-raw-color-green-a10`, `--u-raw-color-red-a10`, `--u-raw-color-purple-a10`, etc. (See §4 Tints for the scope and the partial-deferral decision.)
- **genre/cover palette:** the genre `bg` hues are raw tokens `--u-raw-color-genre-<name>` for the seven named rows plus `--u-raw-color-teal-700: #0E3F4D` for the unnamed teal row. The `ink` partners and `coverTo` stops live in the TS `GENRE_PALETTE` constant (Option B), not as CSS raw tokens, because their only consumer is the runtime-injected JS path; minting CSS tokens whose sole reader is JS reading them back would be dead CSS. The equality guard binds the CSS `--u-raw-color-genre-*` values to the TS constant.

**Tier 2 — semantic aliases.** Naming `--u-<role>`. They point at Tier 1, never at a literal. The existing single-tier names are **kept as the Tier-2 names** wherever they are already semantic, repointed to raw, so app CSS call sites do not change (zero churn, zero diff):

| Current name | Becomes (Tier 2) | Points at (Tier 1) |
|---|---|---|
| `--u-ink` | `--u-ink` (kept) | `var(--u-raw-color-ink-900)` |
| `--u-amber` | `--u-amber` (kept) | `var(--u-raw-color-amber-500)` |
| `--u-amber-hover` | `--u-amber-hover` (kept) | `var(--u-raw-color-amber-600)` |
| `--u-amber-light` | `--u-amber-light` (kept) | `var(--u-raw-color-amber-300)` |
| `--u-parchment` | `--u-parchment` (kept) | `var(--u-raw-color-parchment-50)` |
| `--u-parchment-deep` | `--u-parchment-deep` (kept) | `var(--u-raw-color-parchment-100)` |
| `--u-muted` | `--u-muted` (kept) | `var(--u-raw-color-muted-500)` |
| `--u-night` | `--u-night` (kept) | `var(--u-raw-color-ink-950)` |
| `--u-border` | `--u-border` (kept) | `var(--u-raw-color-ink-a08)` |
| `--u-border-hover` | `--u-border-hover` (kept) | `var(--u-raw-color-ink-a15)` |
| `--u-surface` | `--u-surface` (kept) | `var(--u-raw-color-ink-a03)` |

The `--signal-*` and `--genre-*` names are **kept as-is as Tier-2 semantic tokens**, repointed to the raw tier (`--signal-positive: var(--u-raw-color-green-500)`, `--signal-negative: var(--u-raw-color-red-500)`, `--signal-sovereign: var(--u-raw-color-purple-500)`, `--genre-<name>: var(--u-raw-color-genre-<name>)`). **Decision (gate, 2026-06-03):** do NOT rename them to `--u-signal-*`/`--u-genre-*` and do NOT introduce deprecated aliases. They are already clear semantic names; renaming would either churn the 15 existing `--signal-*` call sites or leave a half-migrated alias state, and the `--u-` prefix is cosmetic. The 15 `--signal-*` call sites resolve unchanged (the token keeps its name, only its definition now points at raw). Guard A treats `--signal-*`/`--genre-*` as defined tokens. If a `--u-` naming-convention unification is ever wanted, it is its own complete story (rename token + migrate every call site + remove the old name, no aliases), not part of this refactor.

A re-skin now maps Tier-2 semantics to new raw values (or supplies a new raw set under `[data-theme]`); app CSS, which references only Tier 2, does not change. Authoring a second skin is out of scope (epic story 13); the structure admits one.

### 2. The per-ref drift fix (zero-diff, D2)

Each drifted ref is repointed to a token whose resolved value **equals the current rendered fallback**, and the inline literal fallback is removed. The visual gate stays zero-diff; no baseline is updated.

| Ref (file:line) | Property | Current rendered value | Resolved to (Tier 2 token) | Tier-2 → Tier-1 | Zero-diff |
|---|---|---|---|---|---|
| `AuthorEdit.css:4` | border | `#e5e5e5` | `--u-line-200` → `var(--u-raw-color-line-200)` | `#E5E5E5` | yes (same pixel) |
| `AuthorEdit.css:29` | input border | `#d4d4d4` | `--u-line-300` → `var(--u-raw-color-line-300)` | `#D4D4D4` | yes |
| `AuthorEdit.css:33` | input fill | `#fff` | `--u-surface-input` → `var(--u-raw-color-white)` | `#FFFFFF` | yes |
| `AuthorEdit.css:47` | text on ink pill | `#fff` | `--u-on-ink` → `var(--u-raw-color-white)` | `#FFFFFF` | yes |
| `AuthorEdit.css:65` | error text | `#b00020` | `--u-text-error` → `var(--u-raw-color-red-700)` | `#B00020` | yes |
| `AuthorBadge.css:37` | text on ink pill | `#fff` | `--u-on-ink` → `var(--u-raw-color-white)` | `#FFFFFF` | yes |
| `ClaimControl.css:7` | border | `#d8d4cc` | `--u-line-warm` → `var(--u-raw-color-line-warm)` | `#D8D4CC` | yes |

Two semantic Tier-2 names are introduced for the "text on a dark fill" and "input surface" roles (`--u-on-ink`, `--u-surface-input`) so the repointing is semantic, not a bare raw reference. The three border refs get distinct line tokens because their fallbacks are three distinct greys (`#e5e5e5`/`#d4d4d4`/`#d8d4cc`); collapsing them to one value would be a visual change and is therefore **not** done here.

**Deferred-as-bug calls (NOT fixed in this story).** Two of these fallbacks read like latent bugs: the borders almost certainly "meant" `--u-border` (the house parchment-ink border), and the error text almost certainly "meant" `--u-signal-negative` (`#DC3545`, the house red), per the `CLAUDE.md` "red for negative" rule and the smoking-gun framing in ADR 0038. Fixing either would change pixels. Per the prime directive and ADR 0039, this story does **not** fix them. They are recorded here as a **deferred, separately-labeled visual-change follow-up** (a future story: repoint `--u-line-*` → `--u-border` and `--u-text-error` → `--u-signal-negative`, regenerate the three affected components' baselines in their own labeled commit, review against brand rules). This ADR makes the structural fix (no more undefined references, no silent fallback) without making the visual change, which keeps "structure changed, pixels held" and "pixels intentionally changed" as two distinct auditable events.

### 3. Genre/cover palette unification mechanism (Option B)

`GENRE_PALETTE` in `packages/ui/src/palette.ts` (re-exported from `@unbnd/ui`) is the single source. `Avatar.tsx` derives `BGS`/`INKS` from it; `view-model.ts` derives `COVERS` from it; the CSS `--u-raw-color-genre-*` tokens are bound to it by the equality guard. Array order is preserved exactly (the runtime hash depends on it). The teal row (`genre: null`) and the `history` genre token are the two pre-existing asymmetries; the ADR records both and the equality guard checks only the seven named rows. Why Option B and not A or C: A breaks the no-build/no-cascade-read runtime constraint and adds first-paint risk; C needs codegen tooling that ADR 0038 §7 forbids; B is the only mechanism that gives one source, a permanent anti-drift guard, and zero new tooling while honoring that CSS custom properties cannot be read by the runtime-injected JS path.

### 4. Tints / translucency

The ~80 `rgba()` literals are tokenized in this pass, not deferred, because leaving them as raw literals would force the "no raw color literals" guard's allowlist to be dishonestly broad (it would have to exempt most component CSS). Each distinct base+alpha in use becomes a raw token (`--u-raw-color-<base>-a<NN>`) and gets a Tier-2 alias only where it plays a clear role (the existing `--u-border`/`--u-border-hover`/`--u-surface` already are those aliases; the remaining overlays get `--u-overlay-*` / `--u-tint-*` semantic names by role, e.g. a scrim, a hover wash, a focus ring tint). **Scope guard:** only alphas actually present in the audited CSS are minted (no speculative opacity ramp), matching the "values in use today" taxonomy rule. The `iconBg="rgba(…)"` strings passed as props in `AuthMethodSelect.tsx` and the SVG `stroke`/`fill` hex defaults/props in `SearchIcon.tsx`/`LogoMark.tsx`/`AuthWelcome.tsx`/`AuthNostrConnect.tsx`/`Footer.tsx` are the **runtime-injected** color path (same class as the palette). They cannot read a CSS custom property without a cascade read. **Decision:** these specific runtime-injected component color props are tokenized by re-sourcing from a small typed export in `@unbnd/ui` (the same mechanism as `GENRE_PALETTE`: a `SEMANTIC_COLORS` constant exporting `{ amber, muted, signalPositive, signalSovereign }` etc., kept equal to the CSS Tier-1 values by the equality guard), so the literals leave the components and the guard's component-scope allowlist names only the registry/source files. This keeps the "no raw color literals … outside the token layer" AC honest for components, not just CSS.

### 5. The two CI guards

Both live in `@unbnd/ui` (`packages/ui/test/`), mirror `packages/trust/test/architecture.test.ts` (`REPO` resolve, `walk()`, `SKIP_DIRS`, `readFileSync`, single aggregated `expect([]).toEqual([])`), and run under the existing `pnpm -r test`. The `walk()` filter is widened to include `.css` for both. `SKIP_DIRS` keeps `node_modules`, `dist`, `.git`, `engineering-team`, and adds the visual-harness fixture tree (`apps/web/e2e`) since those are test-layer fixtures, not app source.

**Guard A — `packages/ui/test/architecture-token-refs.test.ts` ("no undefined token references").**
- Scope: every `.css` file under `apps/web/src` and `packages/ui/styles`. Extract the set of defined tokens by parsing `--u-*`, `--signal-*`, `--genre-*` definitions from `packages/ui/styles/tokens.css` (the only definition site). Then scan every `var(--…)` reference in app CSS; any reference whose name is not in the defined set is an offender. This is what kills the `--u-bg`/`--u-line`/`--u-danger` drift and prevents recurrence (after this story they are all defined, so the guard is green on landing).
- Allowlist: none needed for references; the only "definition" file is the token sheet itself, which the guard reads, not scans for offenders.

**Guard B — `packages/ui/test/architecture-color-literals.test.ts` ("no raw color literals outside the token layer").**
- Scope: `.css` under `apps/web/src`, and `.ts/.tsx` under `apps/web/src` (components/routes/hooks/lib). Patterns: hex (`#[0-9a-fA-F]{3,8}` on a word boundary), `rgb()`/`rgba()`, and CSS named colors from a curated banned-name list (the keywords `transparent` and `currentColor` are explicitly NOT banned — they are not literals). An offender is any match outside the allowlist.
- Allowlist (names ONLY the legitimate token-source files): `packages/ui/styles/tokens.css` (the literal home), `packages/ui/src/palette.ts` (`GENRE_PALETTE`, the genre/cover source), and `packages/ui/src/colors.ts` (the `SEMANTIC_COLORS` source for runtime-injected component props). The dead `apps/web/src/data/*-fixtures.ts` files are handled by scope, not allowlist: the guard's app-CSS/component scan targets components/routes/hooks/lib; `apps/web/src/data` is excluded because it is fixture data (imported only by `apps/web/test`), and the ADR records that exclusion explicitly so the boundary is honest. (Alternative considered: clean the literals out of `data/` too. Rejected for this story: those fixtures are not in the render path, the cleanup is a separate non-color-axis tidy, and forcing it would widen the diff beyond the color sweep. Noted as a follow-up.)

Both guards are green the moment they land (the sweep removes every offender first), and red forever after on regression, exactly as ADR 0038 §6 requires.

## Consequences

- **Enables** a re-skin as a Tier-2-to-raw remap with no app-CSS change, a future `[data-theme]` dark skin (out of scope to author), and one-edit genre re-coloring via `GENRE_PALETTE`. Makes the two-tier color tokens the genuine source of truth the `CLAUDE.md` "brand tokens" rule names (re-pointing that doc rule at `@unbnd/ui` is epic story 14, not here).
- **Constrains** all future color work: new color must go through Tier-2 tokens (CSS) or the typed `@unbnd/ui` color/palette constants (runtime-injected props); the two guards enforce it.
- **New debt / follow-ups:** (1) the two deferred drift fixes (`--u-line-*` → `--u-border`, `--u-text-error` → `--u-signal-negative`) as a labeled visual-change story; (2) cleaning color literals out of the dead `apps/web/src/data/*-fixtures.ts`; (3) the `history`/teal genre-token asymmetry remains as-is (history has a token with no array row; teal has an array row with no genre token) — pre-existing, recorded, not changed here. (Note: `--signal-*`/`--genre-*` are intentionally left as-is per the gate decision; no rename debt is incurred.)
- **Affects existing fixtures?** No data fixtures change values. `view-model.ts` `COVERS` and `Avatar.tsx` `BGS`/`INKS` are re-sourced from `GENRE_PALETTE` with byte-identical resolved values and identical order, so rendered output is identical; the Story-39 `visual` job confirms it. The dead `data/*-fixtures.ts` literals are left unchanged (follow-up).
- **New dependency?** No. `GENRE_PALETTE`/`SEMANTIC_COLORS` are new TS modules inside the existing `@unbnd/ui` package; the guards are new Vitest tests in the existing `packages/ui/test/`. No new third-party dependency, no new tooling, no build step (ADR 0038 §7 honored).
- **PRD section change required?** No. No product behavior or PRD claim changes. Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum, not now.

## Implementation notes

Concrete anchors for the Implementer (Architect is read-only on source; these are the targets, not edits made here):

- **Token sheet:** `packages/ui/styles/tokens.css` — add the Tier-1 `--u-raw-color-*` block (amber, ink, parchment + white, muted, green/red/purple, the four drift-preservation neutrals, the teal genre raw, the in-use `rgba` alphas); repoint every existing color name to its raw via `var(--u-raw-color-…)`; repoint the existing `--signal-*`/`--genre-*` to their raw values (keep those names, no rename, no aliases); add the new Tier-2 names (`--u-on-ink`, `--u-surface-input`, `--u-text-error`, `--u-line-200/300/warm`, the overlay/tint aliases). Non-color entries (`--font-*`, `--page-*`, `--u-radius*`) are untouched.
- **Palette source:** new `packages/ui/src/palette.ts` exporting `GENRE_PALETTE` (the 8-row `as const` above, order preserved); re-export from `packages/ui/src/index.ts`.
- **Runtime-injected color source:** new `packages/ui/src/colors.ts` exporting `SEMANTIC_COLORS` (`{ amber, muted, signalPositive, signalSovereign, … }`) for the SVG/icon and `iconBg` props; re-export from `index.ts`.
- **Avatar:** `apps/web/src/components/Avatar.tsx` — replace the inline `BGS`/`INKS` literals with `GENRE_PALETTE.map(r => r.bg)` / `.map(r => r.ink)` imported from `@unbnd/ui`. No render change.
- **View model:** `apps/web/src/lib/view-model.ts` — replace the `COVERS` literal rows with `GENRE_PALETTE.map(r => ({ from: r.bg, to: r.coverTo, ink: r.ink }))`. No render change.
- **Drift refs:** `apps/web/src/components/AuthorEdit.css`, `AuthorBadge.css`, `ClaimControl.css` — repoint per the §2 table; remove the inline literal fallbacks. Optionally strip the harmless-but-dead literal fallbacks on the defined-token refs (`var(--u-border, …)`, `var(--u-surface, …)`, `var(--u-radius, …)`) repo-wide so Guard B passes without exempting them; this is a no-render-impact cleanup and is the cleaner path than allowlisting them.
- **Runtime-injected component literals:** `SearchIcon.tsx`, `LogoMark.tsx`, `Footer.tsx`, `AuthWelcome.tsx`, `AuthNostrConnect.tsx`, `AuthMethodSelect.tsx` — source the hex/`rgba` defaults and props from `SEMANTIC_COLORS` instead of inline literals. No render change.
- **Guards:** `packages/ui/test/architecture-token-refs.test.ts` (Guard A) and `packages/ui/test/architecture-color-literals.test.ts` (Guard B), copying `packages/trust/test/architecture.test.ts` structure, `walk()` widened to `.css`, `SKIP_DIRS` adding `apps/web/e2e`, allowlist = `{ packages/ui/styles/tokens.css, packages/ui/src/palette.ts, packages/ui/src/colors.ts }`, app-component scope excluding `apps/web/src/data`. They run under the existing `pnpm -r test`.
- **Equality guard:** fold a third assertion into Guard B (or a small `architecture-palette-sync.test.ts`): for each named row in `GENRE_PALETTE`, assert `tokens.css` defines `--u-raw-color-genre-<name>` equal to that row's `bg`, and assert `SEMANTIC_COLORS` values equal their `tokens.css` raw counterparts. This is the anti-drift lock for the TS↔CSS link.
- **Verification gate:** after the sweep, `pnpm -r typecheck`, `pnpm -r test` (both guards + existing suites), `pnpm --filter @unbnd/web build`, and the Story-39 `visual` job must all pass, the last zero-diff with **no baseline update**.

## Out of scope

- Authoring a dark theme or any second skin (ADR 0038; epic story 13). The two-tier structure must admit one; building one is later work.
- Any other token axis: type, spacing, radii, elevation, z-index, motion, breakpoints (epic stories 4+). Non-color token-sheet entries are left exactly as they are.
- **The two deferred drift visual-fixes** (`--u-line-*` → `--u-border`; `--u-text-error` → `--u-signal-negative`). These change pixels and must be a separate, clearly-labeled baseline-update story per ADR 0039, not part of this zero-diff refactor.
- A cosmetic `--u-` naming-convention unification of `--signal-*`/`--genre-*` (left as-is by the gate decision; if ever wanted, a separate complete rename story, not an alias-and-defer).
- Cleaning color literals out of the dead `apps/web/src/data/*-fixtures.ts` (not in the render path; a separate tidy).
- Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" doc rule at `@unbnd/ui` and citing the new guards (epic story 14).
- Primitives, the icon registry / `<Icon>` abstraction, the motion layer, and layout primitives (later epic stories). The runtime-injected SVG/icon color sourcing done here is the minimal change to make Guard B honest for components; the `<Icon>` registry itself is later.
- The `history`/teal genre-token asymmetry is preserved as-is; reconciling it (mint a teal genre token, or retire `history`, or add a history palette row) would change the token set or the array and is a deliberate later decision, not a zero-diff refactor concern.
