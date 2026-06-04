# Review: Story 49 — `Container` layout primitive (page-frame into `@unbnd/ui`)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-04
**Diff:** `git diff origin/main...HEAD` (PR #93, branch `story-49-layout-container`, head commit `e402437`)
**Story:** `engineering-team/stories/done/49-layout-primitives.md`
**ADR:** `engineering-team/decisions/0049-layout-container.md` (Accepted)

Independent verification — re-derived from `origin/main`, did not trust the author.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass.** All packages Done (ui, web, api, indexer, seeder, promoter, shelves, trust).
- [x] `pnpm --filter @unbnd/ui test` — **pass.** 12 test files, 17 tests. Includes `architecture-page-frame.test.ts` (GREEN) and `tokens.test.ts`. All nine prior architecture guards (38–47) green.
- [x] `pnpm --filter @unbnd/web test` — **pass.** 52 files, **300 tests**.
- [x] `pnpm --filter @unbnd/web build` — **pass.** `tsc --noEmit` + `vite build`; 459 modules; built bundle CSS carries `.page` byte-identical (see zero-diff audit).
- [x] `gh pr checks 93` — **Visual regression: pass** (job ran against head `e402437`). Also: "Typecheck, test, build" pass; "Validate Caddyfile" pass.
- [ ] _Lint not configured — skipped._

## Guard integrity

- Tester commit `9f51287` touched **only** `packages/ui/test/architecture-page-frame.test.ts` (116 insertions, new file). Confirmed via `git show --stat`.
- Implementer commit `e402437` touched **16 files**: the 12 route TSX files, `base.css`, `Container.tsx`, `Container.css`, `index.ts`. It did **NOT** modify the guard test or any `tokens.test.ts`. Confirmed via `git show --stat`.
- **The guard is real.** Injected a temporary offender (`.tmp-frame { max-width: var(--page-max); padding: 0 var(--page-pad-x); }`) into `base.css`; `architecture-page-frame.test.ts` went **RED** with both `var(--page-max)` and `var(--page-pad-x)` flagged. Restored `base.css` to clean state afterward.
- In the shipped state, the only `var(--page-max)`/`var(--page-pad-x)` references repo-wide (src) are `packages/ui/src/components/Container.css` and `apps/web/src/components/RatingControl.css` (`.rate`) — exactly the two guard allowlist entries. Guard is GREEN by construction.

## Zero-diff move audit

- **Byte-identical declarations.** The OLD `.page` rule (`git show origin/main:apps/web/src/styles/base.css`, lines 59–63): `max-width: var(--page-max); margin: 0 auto; padding: 0 var(--page-pad-x) var(--u-space-32);`. The three declarations in `packages/ui/src/components/Container.css` are byte-identical (same three properties, same tokens, same order).
- **Removed from `base.css`.** The diff removes exactly the 5-line `.page { … }` block (6 lines with the trailing blank); every other rule in `base.css` is untouched.
- **`Container` emits `class="page"`.** `Container.tsx`: `const merged = className ? \`page ${className}\` : "page";` → `<Tag className={merged} {...rest}>`. Default `Tag` is `"div"`. So every bare `<Container>` renders `<div class="page">` — markup byte-identical.
- **Built bundle.** `dist/assets/index-*.css` contains `.page{max-width:var(--page-max);margin:0 auto;padding:0 var(--page-pad-x) var(--u-space-32)}` — identical declarations, now sourced from `@unbnd/ui`.
- **No `.page` descendant/compound selector broke.** Repo-wide grep for `.page` in app CSS returns NONE — there is no `.page > x`, `.page .y`, or compound rule that depended on the class being on a particular element. The move is provably safe.

## 16-site conversion

- 16 `<Container>` opening tags across 12 route files: BookDetail ×3, ProfileMe ×2, Settings ×2, and ×1 each in Home, Search, Browse, GenreBrowse, Profile, Submit, CommunitySubmissions, About, NotFound. Matches the ADR §Context inventory exactly (16 sites / 12 files).
- **No `className="page"` remains** anywhere in `apps/web/src`.
- **All 16 are bare** — grep for `<Container … as=|className=` returns NONE. No extra props, no extra classes.
- **All 12 route files import `Container` from `@unbnd/ui`** (some via combined imports, e.g. `import { Button, Container } from "@unbnd/ui"`). No file with `<Container>` is missing the import.
- **Markup byte-identical.** Every conversion diff is a pure `<div className="page">` → `<Container>` / `</div>` → `</Container>` swap plus the import line; children and nesting unchanged. Spot-checked Home, BookDetail (×3), Settings against `origin/main`; reviewed all remaining route diffs.

## Visual gate

- `gh pr checks 93` → **Visual regression: pass**, ran against head commit `e402437` (matches local HEAD).
- **No `*.png` baseline changed** — `git diff origin/main...HEAD --name-only | grep .png` returns NONE.
- Zero-diff confirmed by the gate with no baseline update, consistent with ADR 0039 (`maxDiffPixelRatio: 0`).

## Scope

- Files changed: the 12 route TSX, `base.css`, `Container.tsx`, `Container.css`, `index.ts`, the guard test, the ADR, the story. Nothing else.
- **Untouched (left bespoke / deferred):** `tokens.css` (no token minted), `BookGrid.css`/`GenreGrid.css` (Grid), `RatingControl.css` (`.rate`), `AuthShell` (auth shell), all flex `Stack`-shaped layouts. Confirmed via name-only diff.
- `Container` references only existing tokens (`--page-max`, `--page-pad-x`, `--u-space-32`). No new token.

## ADR adherence

- Option A implemented as accepted: emit literal `.page`, relocate declarations to co-located `Container.css`, remove app-side rule, migrate 16 sites byte-identical.
- Prop contract matches ADR §2: polymorphic `as?` default `"div"`, additive layout-only `className` emitted as `"page <extra>"`, `children`, `...rest` passthrough. No re-skin `className`.
- Exports match ADR §2 / §Implementation: `export { Container }` + `export type { ContainerProps }` from `index.ts`, mirroring the Avatar/Field/Link re-export lines.
- The narrow page-frame-token guard (ADR §4) lands green with the `.rate` allowlist (OQ-2) — exactly as specified.

## Things tests can't catch

- No secrets, no debug logging, no commented-out code in the diff.
- Doc-comments in `Container.tsx`/`.css`/`index.ts` and the guard are accurate and free of AI-slop (no em dashes, no rhetorical contrasts, no banned filler verbs).
- No DList shapes touched; no Librarian pubkey usage; no crypto. POV-first / decentralized-first not implicated (pure presentation refactor).

## House rules check

- PRD §11.3 scope: untouched — no product surface added.
- Brand tokens remain the source of truth; no new hex literal; no icon library.
- No new lint/typecheck/build tooling; the guard is a Vitest test under the existing `pnpm -r test`.

## Findings

### Blocking
None.

### Non-blocking
None.

## Verdict
**PASS**

The diff is a clean, zero-diff `Container` extraction: byte-identical declarations relocated into `@unbnd/ui`, `.page` emitted so markup is unchanged, 16 bare-`<div className="page">` sites converted across 12 routes, `Stack`/`Grid`/`.rate`/auth-shell left bespoke, no token minted. Guard authored by the Tester is real and unmodified by the Implementer; it is green by construction and red on any hand-rolled page frame. All gates green; the visual job is zero-diff with no baseline update. Mergeable as-is.
