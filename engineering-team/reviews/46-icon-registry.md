# Review: Story 46 — `Icon` registry (typed `<Icon name>` over hand-authored SVGs, inline-`<svg>` migration, no-raw-`<svg>` guard)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-04
**Diff:** `git diff origin/main...HEAD` (PR #89, branch `story-46-icon-registry`, impl commit `951ab50`)
**Story:** `engineering-team/stories/done/46-icon-registry.md`
**ADR:** `engineering-team/decisions/0046-icon-registry.md` (Accepted)

This is ZERO-DIFF structural work — invisible to users. The binding constraint is byte-identical reproduction of all five icons; the Story-39 `visual` job (`maxDiffPixelRatio: 0`) is the backstop, and no baseline may move.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS**. All 10 workspace projects (incl. `packages/ui`, `apps/web`) Done; the new `IconName` union + discriminated `IconProps` typecheck clean.
- [x] `pnpm --filter @unbnd/ui test` — **PASS**. 11 files / 16 tests. New `architecture-svg-literals.test.ts` GREEN; all prior guards GREEN (color, type, spacing, shape/breakpoint, motion, palette-sync, token-refs, button-literals, tokens).
- [x] `pnpm --filter @unbnd/web test` — **PASS**. 52 files / **300 tests** pass. (One mocked-network `ECONNREFUSED :3000` log line is pre-existing test noise, not a failure.)
- [x] `pnpm --filter @unbnd/web build` — **PASS**. `tsc --noEmit && vite build`; 453 modules; built in ~560ms.
- [x] `gh pr checks 89` — **all pass**: Typecheck/test/build ✅, Validate Caddyfile ✅, **Visual regression ✅**.
- [ ] _Lint not configured — skipped._

## Guard integrity (Tester-authored, must be untouched by Implementer)

- The guard `packages/ui/test/architecture-svg-literals.test.ts` was authored in the **Tester** commit `f8ca237` (218 insertions, that file only).
- The **Implementer** commit `951ab50` touches **14 files**, none of which is the guard test or `tokens.test.ts` or any other `architecture-*.test.ts`. Confirmed via `git show --stat`.
- **The guard is real.** Injected a raw `<svg aria-hidden><rect/></svg>` into `Footer.tsx` → guard FAILED with `apps/web/src/components/Footer.tsx:25 raw <svg> (migrate to <Icon name=…>)`. Restored → GREEN. So it flags raw `<svg>`, reports file:line, and is not a no-op.
- **Comment-aware:** `stripComments` whitespaces `//` and `/* */` spans (string/template-literal-aware) before scanning; the guard's own header (which mentions `<svg>`) does not self-trip. Detection: `RAW_SVG = /<svg(?=[\s/>])/g` (lowercase, word-boundary lookahead so `<Icon>`/`<Svg>` are not matched), plus `createElement("svg")` and a polymorphic `"svg"` tripwire.
- **Registry out of SCAN_ROOT:** `SCAN_ROOT = apps/web/src`; the registry lives in `packages/ui/src/components/Icon/`, outside the scan, so it needs no allowlist entry — the ADR §5 "Scope exclusion (recommended)" approach. Same `SCAN_ROOT`/`walk`/`SKIP_DIRS` scaffolding as the button guard. No deferred-class countdown (correct — all five sites migrate in this story; guard reaches 0 and holds).
- `grep -rn "<svg" apps/web/src` → **zero** raw `<svg>` remain.

## Per-icon byte-identity audit (registry markup vs `git show origin/main:<file>`)

Each render function in `packages/ui/src/components/Icon/icons.tsx` compared character-for-character against the pre-migration source. All five are **byte-identical** (same `viewBox`, child elements, `d`/`points`/`cx`/`cy`/`r`, `fill`/`stroke`/`strokeWidth`/`strokeLinecap`/`strokeLinejoin`, default size, per-element opacity, aria, attribute source-order):

| Icon | Source (main) | viewBox / dims | stroke/fill/widths | aria | Per-call variation | Verdict |
|---|---|---|---|---|---|---|
| `search` | `SearchIcon.tsx` | `0 0 24 24`, `size`=16 | `fill=none`, `strokeWidth={2}`, `strokeLinecap=round` | `aria-hidden` | SearchBox = all defaults | **identical** |
| `logo` | `LogoMark.tsx` | `0 0 100 100`, `size`=26 | `fill=none` root, per-element `fill`+`fillOpacity` | `role=img`+`aria-label={title}` (NOT hidden) | Nav 26/solid, Hero 48/soft, Footer 16/muted/soft, AuthShell 40/`logoFill`/soft | **identical** |
| `check` | `FollowButton.tsx` `CheckGlyph` | `0 0 16 16`, 14×14 | polyline `fill=none`, `currentColor`, `strokeWidth=1.8`, `linecap`/`linejoin`=round | `aria-hidden` | `className="follow-check"` passthrough | **identical** |
| `bolt` | `AuthMethodCard.tsx` `NostrBolt` | `0 0 24 24`, 16×16 | `fill=currentColor` | `aria-hidden` | defaults only | **identical** |
| `star` | `RatingControl.tsx` `Star` | `0 0 24 24`, 22×22 | `currentColor` stroke, `strokeWidth=1.4`, `strokeLinejoin=round`, **NO `strokeLinecap`** | `aria-hidden` | `filled` → `fill={filled?"currentColor":"none"}` | **identical** |

Load-bearing details verified:
- **`logo` undefined-`fill`→amber fallback.** `renderLogo` uses a **default parameter** `fill = SEMANTIC_COLORS.amber`. `AuthShell.tsx` still passes `fill={logoFill}` (undefined for `AuthMethodSelect`/`AuthEmailSignup`); `undefined` triggers the default → amber, exactly as the old `LogoMark` default did. Not a bare `fill={props.fill}` (which would drop the attribute → render `none`). Correct — no transparent-logo diff.
- **`logo` per-element opacity.** `cornerOpacity` (solid 1 / soft 0.85) on the two `<path>`s, `circleOpacity` (solid 1 / soft 0.7) on the two `<circle>`s, via `fillOpacity`. Verbatim.
- **All four `logo` call sites** preserve their exact prop combos (Nav solid-default, Hero/Footer/AuthShell soft). `Footer` keeps `fill={SEMANTIC_COLORS.muted}`.
- **`check`** `className="follow-check"` now flows in as a prop and is applied onto the root `<svg>` (`className={className}`) — the `.follow-following .follow-check` descendant CSS selector still matches.
- **`star`** has NO `strokeLinecap` added (source had none). The `filled` toggle is preserved.

The registry adds `className={className}` as the first `<svg>` attribute on every icon; for non-`className` callers it is `undefined` and React drops it → identical DOM. Visual job confirms zero pixel diff.

## Migration + deletions

- All **5** raw `<svg>` sites migrated to `<Icon name>`; `SearchBox`, `Nav`, `Hero`, `Footer`, `AuthShell`, `AuthMethodSelect`, `FollowButton`, `RatingControl` repointed with correct props.
- `SearchIcon.tsx` and `LogoMark.tsx` **deleted** (not re-exported, per ADR §4). `CheckGlyph`, `NostrBolt`, `Star` local/inline SVGs deleted.
- **No dangling imports/refs:** `grep -rn "LogoMark|SearchIcon|NostrBolt|CheckGlyph|<Star|function Star" apps/web/src` → none.
- `RatingControl` star children migrated to `<Icon name="star" filled=…>` inside the existing `IconButton` wrappers; **`IconButton.tsx` is NOT in the diff** — contract genuinely unchanged (fulfills the ADR 0045 doc-comment promise).
- **`Avatar`** and the `@`/`G`/`A` `<span>` glyphs (`EmailGlyph`/`GLetter`/`AppleLetter`) untouched and still present. `Avatar.tsx` not in diff.

## Type safety

- `IconName = keyof typeof ICONS` — derived from the registry, cannot drift. A typo'd `name` is a type error.
- The discriminated union (`{ name: K } & BaseIconProps & IconPropsByName[K]`) was probed: `<Icon name="search" filled />`, `<Icon name="serch" />`, `<Icon name="star" stroke="x" />` each required a `@ts-expect-error` (all satisfied → all correctly rejected); all valid usages compiled. So wrong-icon props and typo'd names are compile errors.
- The Implementer used `Record<never, never>` for `check`/`bolt` extras instead of the ADR sketch's `{}`. In an intersection, `Record<never, never>` is an empty-object type that contributes no properties — **type-equivalent intent, no behavior change**. Acceptable (arguably better: `{}` has the well-known "accepts almost anything" footgun; `Record<never,never>` is the more precise empty-extras spelling). Not blocking.

## ADR adherence

- Option A implemented exactly: `packages/ui/src/components/Icon/{Icon.tsx, icons.tsx}`, `ICONS` map `as const`, `keyof` union, discriminated props, no `Icon.css`. `Icon` + `IconName` + `IconProps` exported from `index.ts` after the `IconButton` exports.
- No icon library, no SVGR, no sprite pipeline, no new dependency, no new tooling (guard is a Vitest test under existing `pnpm -r test`). No new token; icons reference `currentColor` + existing `SEMANTIC_COLORS`.

## House rules / scope

- **Icon axis only.** Diff outside `engineering-team/`, the `Icon/` registry, `index.ts`, and the guard touches **no** token/CSS/other-primitive package file. No redesign, no normalization, no aria change.
- No secrets, no `console.log`/`debugger`/`TODO`/`FIXME` in the new files. No commented-out code. Working tree clean.
- No DList shapes touched. No PRD §11.3 surface approached. POV-first / decentralized-first not implicated (pure front-end structural refactor).

## Findings

### Blocking
None.

### Non-blocking
1. **`packages/ui/src/components/Icon/Icon.tsx:45`** — the `BaseIconProps` comment still says "`size` is the single numeric dimension prop…" but `size` was (correctly) moved into the per-icon `search`/`logo` extras and is no longer on `BaseIconProps`. Minor stale comment; does not affect behavior or types. Optional tidy in a future touch.

## Verdict
**PASS**

All gates green (typecheck, ui tests incl. the new guard + all prior guards, 300 web tests, build, and CI incl. the **Visual regression zero-diff** job with no `.png` baseline changed). The guard is Tester-authored, untouched, and demonstrably real. All five icons reproduce byte-identical, including the two non-trivial surfaces (`logo`'s undefined-`fill`→amber default + per-element opacity, `star`'s `filled` toggle with no `strokeLinecap`). Deletions are complete with no dangling refs; `IconButton`/`Avatar`/typographic glyphs untouched; type safety rejects wrong-icon props and typo'd names. Scope is icon-axis only. Mergeable as-is.
