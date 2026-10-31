# Test Plan: Story 113 — Built on Brainstorm at the foot of every page

**Story:** `engineering-team/stories/113-built-on-brainstorm.md`
**ADR:** `engineering-team/decisions/0101-built-on-brainstorm.md`
**Date:** 2026-10-31

## Coverage map

| Criterion | Test | File | Level |
|---|---|---|---|
| AC-1 | `standard pages (PageShell) > carry the line once, on a chrome row of its own under the footer's row` | `apps/web/test/components/built-on-brainstorm-placement.test.tsx` | component |
| AC-1 | `sign-in pages (AuthShell) > carry the line once, under the card` | same | component |
| AC-1 | `every route > is a route module, imported as it is, that composes PageShell or AuthShell, so no page ships without the line` | same | guard |
| AC-2 | `the copy > is Brainstorm's version 1 file, byte for byte` | `apps/web/test/components/built-on-brainstorm.test.tsx` | guard |
| AC-2 | `the copy > can be loaded twice without throwing` | same | unit |
| AC-2 | `the line > is one link to Brainstorm's site, in a new tab, told nothing of where the reader came from` | same | component |
| AC-2 | `the line > says 'Built on Brainstorm', and to a screen reader that it opens in a new tab` | same | component |
| AC-2 | `the line > draws Brainstorm's mark before the words ...` | same | component |
| AC-2 | `the line > takes its look from Brainstorm's site and sends it nothing of the page` | same | component |
| AC-3 | `the line > gets its class as class, which React 18 passes to a custom element` | same | component |
| AC-3 | `the fit > is the footer's muted caption, the ink when pointed at or focused, with Unbnd's amber focus ring` | same | guard |
| AC-3 | `the fit > never restyles the line's parts` | same | guard |
| AC-4 | `the frame > sits the line alone in a bounded frame, which takes the room it is given` | same | component |
| AC-4 | `the fit > bounds the frame's paint, with room for the focus ring, and keeps the line on its row's edge` | same | guard |
| AC-5 | `the policy check > ...` (two tests of the reader itself) and `what Unbnd is served with > lets the line's stylesheet in` | `apps/web/test/csp-built-on.test.ts` | guard |
| AC-6 | the seven captures, with `mockApi` refusing brainstorm.world. No test fails if the refusal is removed while brainstorm.world serves no `v1.css`, or one identical to the copy's look; the refusal matters from the first restyle | `apps/web/e2e/visual/visual.spec.ts` | visual |
| AC-7 | `the footer on a phone > stacks its row at 480px and below` | `apps/web/test/components/built-on-brainstorm-placement.test.tsx` | guard |
| AC-7, AC-8 | browser check: light ground, `data-theme="dark"`, 375px phone, keyboard focus | recorded in the review | manual |

## Edge cases
- [x] The file loaded twice (a second bundle, a hot reload): the copy's own guard, tested.
- [x] A policy with `style-src-elem`, which wins over `style-src` for a stylesheet link; a `default-src` alone; a policy with neither.
- [x] The shared stylesheet cannot load (production before the promotion, the visual harness): the element's own look. Checked in the browser and pinned by the baselines.
- [ ] A screen reader's name in a real browser: checked through the accessibility tree in the browser check, since happy-dom computes names from `aria-label` alone.

## Test infrastructure
- Vitest with happy-dom (`apps/web/vitest.config.ts`). The element defines itself in happy-dom and draws its shadow root on creation. happy-dom fetches a stylesheet link for real, so the config now skips stylesheet loads for every web test file (`disableCSSFileLoading`, with `handleDisabledFileLoadingAsSuccess` so the skip raises no error event and logs nothing).
- The guards read source files from the repo, as the `packages/ui` architecture guards do.
- Visual: Playwright 1.60.0 in `mcr.microsoft.com/playwright:v1.60.0-jammy` (ADR 0039).

## How to run

```
pnpm --filter @unbnd/web test
pnpm --filter @unbnd/web test:visual
pnpm -r --no-bail typecheck && pnpm -r --no-bail test
```

## Verification
The new tests fail with the current code. Confirmed on 2026-10-31 at `fd75b2f` plus these tests:

```
 ✓ test/csp-built-on.test.ts (3 tests)
 ❯ test/components/built-on-brainstorm-placement.test.tsx (4 tests | 3 failed)
   × standard pages (PageShell) > carry the line once, on a chrome row of its own under the footer's row
   × sign-in pages (AuthShell) > carry the line once, under the card
   × the footer on a phone > stacks its row at 480px and below ...
 FAIL  test/components/built-on-brainstorm.test.tsx
Error: Failed to resolve import "../../src/components/BuiltOnBrainstorm" from "test/components/built-on-brainstorm.test.tsx". Does the file exist?
```

The route guard and the policy guard pass today, as they should: every route already composes a shell, and Unbnd sends no policy. They hold the line in place from here on.
