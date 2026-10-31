# Review: Story 113 — Built on Brainstorm at the foot of every page

**Reviewer:** independent reviewer
**Date:** 2026-10-31

## Round 1: PASS, no blocking findings
Reviewed `fd75b2f...0a8ff01` in the story's worktree. The copy is byte-identical to Brainstorm-UI `staging` (empty `diff`; SHA-256 `c769ec44…2f97` at both `9cedf9c0` and the staging tip), and only `BuiltOnBrainstorm.tsx` imports it or draws the tag. react-dom 18.3.1 sets `className` on a custom element as a `className` attribute and `class` as `class`, so the wrapper is right; the JSX augmentation adds `{ class?: string }` for this one tag and loosens nothing else. Every early return was traced by hand: BookDetail and Profile return `NotFound` (which uses `PageShell`), GuideSection, ProfileMe and Settings return a `Navigate`, and the loading states render `PageShell`. No route renders without a shell. Each test fails without its change, except the policy guard, which passes today by design. vitest 2.1.9 spreads `happyDOM.settings` into happy-dom 15.11.7's window; both settings are needed (without the second, happy-dom dispatches an error event), and all 86 web test files pass. The harness's brainstorm.world route is registered last, so Playwright checks it first, and the other two globs do not match it. Every token used exists; the copy is outside the guards by extension. No new shipped strings, no people's names or business rationale in docs or commits; "NosFabrica" appears only in the copied file's own header.

Non-blocking, fixed after the verdict:
- The ADR's implementation notes and the test plan now record the `vitest.config.ts` change, which applies to every web test file.
- The harness docs (`fixtures/index.ts` header and `mockApi` docstring, `e2e/visual/README.md`) said two route handlers; they now name the third.
- The route guard read only source text, so a lazy route or a route element from outside `src/routes/` would have passed. It now also holds every `element={<X />}` in `App.tsx` to a module imported directly from `src/routes/`, and refuses `lazy(` and `import(`. AC-1 now says what the guard checks, and that early returns are checked by review.
- `calc(-1 * var(--u-space-4))` was the first spacing `calc` in app CSS. It is now `var(--u-space-n4)`, a new negative step in the ADR 0042 §3 pattern beside `--u-space-n8`.
- The ADR's consequences record that the frame bounds what the shared sheet paints, not the frame's size.
- The policy reader now reads a Caddy value in backticks across lines, with a test.

Accepted and recorded:
- AC-6 has no test of its own: removing the refusal fails nothing while brainstorm.world serves no `v1.css`, or one identical to the copy's look. It matters from the first restyle (test plan, coverage map).
- Not verifiable here: screen readers beyond Chromium's accessibility tree, Safari and Firefox, and the shared look itself until production brainstorm.world serves `/built-on/v1.css`.

## Browser check (AC-7, AC-8)
Against the dev server, and the reviewer's own headless Chromium run against the dev server and the production build:
- One line per page on `/`, `/about`, `/guide`, `/browse`, an unknown route, a missing book, and `/auth` (by client-side navigation; a direct `/auth` load hits the dev proxy).
- Light ground: 11px, muted `#8B8698` at rest; ink `#1A1A2E` with an underline on hover and on keyboard focus. Focus follows the footer's last link and draws a 2px amber `#C4763C` ring, offset 2px, unclipped by the frame. The line starts under Unbnd's mark.
- Dark skin (`data-theme="dark"`): muted `#9A95A6` at rest, `#ECECF2` on hover, from the tokens.
- 375px phone: the footer row stacks (identity, links, the line), scroll width 375, no sideways scroll. Before the fix the row ran to 418px.
- Sign-in page: the line sits centred under the card.
- Chromium's accessibility tree (over CDP) names the link "Built on Brainstorm (opens in a new tab)"; the mark is hidden.
- The frame: pointed at a hostile stylesheet that fixes the element over the viewport, the page centre stayed the page's own paragraph and only the 8px frame changed. With `contain` switched off, the same sheet covered the page with words of its own.
- `v1.css`: one failed request per page view, blocked by CORS, until production brainstorm.world serves `/built-on/`. The line keeps its own look, as expected.

## Visual baselines (AC-6)
All seven regenerated in `mcr.microsoft.com/playwright:v1.60.0-jammy` with brainstorm.world refused. Each changes only at the foot: every pixel row above the new line matches the previous baseline (checked row by row). The previous set mixes two architectures (book-detail and guide-section from CI's amd64 render, story 101), and the arm64 and emulated amd64 renders differ in a few mid-page regions, so each file is the render that matches its previous baseline above the foot; both renders agree on the foot. CI's `visual` job is the final check.

## Quality gates (at HEAD)
- [x] `pnpm -r --no-bail typecheck`: clean.
- [x] `pnpm -r --no-bail test`: web 480 (was 462), api 1046 + 13 skipped, seeder 280, schemas 183, trust 68, promoter 47, librarian 44, shelves 36, relay 24, search 21, ui 20, guide-lint 13.
- [x] `pnpm -r --no-bail build` and `pnpm --filter @unbnd/web build`: clean.

## Verdict
**PASS.** Nothing to run after merge and deploy. When production brainstorm.world starts serving `/built-on/v1.css`, the console error goes away with no change here.
