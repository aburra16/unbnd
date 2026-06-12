# Test Plan: Story 84 — The guide surface

**Story:** `engineering-team/stories/84-guide-surface.md` · **ADR:** `engineering-team/decisions/0081-guide-surface.md` · **Date:** 2026-06-11

## Coverage map
| Criterion | Test | File | Level |
|---|---|---|---|
| AC-2 content pipeline (authored frontmatter; loud-fail on missing anchor/name; section grouping/order; published = ≥1 entry) | the 6 loader tests | `apps/web/test/guide/load.test.ts` | unit |
| AC-2 anatomy rendering (paragraphs, steps, links, bold; unknown constructs literal, never swallowed) | the 4 formatter tests | `apps/web/test/guide/format.test.ts` | unit |
| AC-1/AC-3/AC-4 routes + frame (anchors as ids; hash scroll; bad anchor = no scroll, no error; rail; next/prev walk published order; unknown/empty section → landing; landing lists published only; empty guide = title alone) | the 9 route tests | `apps/web/test/routes/guide-surface.test.tsx` | component |
| AC-5 no doors | structural: no nav/footer/About change in the diff (review-verified) | — | review |
| Register conformance (tokens, measure, no cards) | review against the design guide + the ui token-architecture suites | — | review |

## Infrastructure
The `GuideProvider` seam injects fixture content built through the REAL `loadGuide`, so route tests exercise the actual pipeline. `scrollIntoView` mocked on `Element.prototype`.

## Verification
Confirmed red 2026-06-11: `(19 tests | 18 failed)` against the stubs (the 1 passing: empty-content loader negative space). Typecheck clean.
