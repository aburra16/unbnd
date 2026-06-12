# Test Plan: Story 83 — The tic taxonomy lands with its mechanical check

**Story:** `engineering-team/stories/83-tic-taxonomy-check.md`
**ADR:** `engineering-team/decisions/0080-tic-taxonomy-check.md`
**Date:** 2026-06-11

## Coverage map

| Criterion | Test | File | Level |
|---|---|---|---|
| AC-1 one artifact | `parses the real style guide's appendix` (the REAL document is the fixture) + the two loud-throw cases (missing fence; malformed JSON/rule) | `packages/guide-lint/test/rules.test.ts` | unit |
| AC-2 hits with file/line/id | the hit-anatomy test + matching semantics (whole-word #75 lesson; sentence-initial; steps scope) | `packages/guide-lint/test/scan.test.ts` | unit |
| AC-3 data-driven extension | `a word added to the LIST is caught with no change to scan logic` | same | unit |
| AC-4 CI fails on error hits; narrow exemption | `exitCodeFor` flag-vs-error; the exemption trio (E-only silencing; non-exemptible claim = an error itself; frontmatter/marker excluded). The CI step itself is verified in review. | same | unit + review |
| AC-5 zero-hit baseline | `zero files is a clean pass` + the CLI run over the real (absent) content dir at review | same + review | unit + review |

## Edge cases
- [x] A broken appendix can never silently scan nothing (throws on missing fence, bad JSON, incomplete rule).
- [x] "seamless" never matches inside "Seamlessness"; "Just" in prose never fires, "Just" in a numbered step does.
- [x] Sentence-initial fires at text start, after a sentence end, and at line starts; never mid-sentence.
- [x] Exempting C1 via the marker is itself an error AND C1 still fires (the wall cannot widen silently).
- [x] Flag severity reports without failing (exit 0 on flags-only).

## Verification
Confirmed red 2026-06-11: `(13 tests | 11 failed)` against the stubs (the 2 passing are negative-space: the empty-baseline and one exit-code case). Typecheck clean.

## How to run
```
pnpm --filter @unbnd/guide-lint test
pnpm --filter @unbnd/guide-lint lint:guide
```
