# Review: Story 84 — The guide surface

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-11
**Diff:** `git diff main...HEAD`

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · `pnpm -r test` exit 0 (story suites 19/19; the ui breakpoint guard green after the 900px → canonical 880px fix it caught) · web build ok · guide-lint baseline clean (0 files, 0 errors).

## Spec adherence
- [x] AC-1: both routes render in the document register (Container + a 66ch measure, no cards, tokens only; the breakpoint guard enforced the canonical set).
- [x] AC-2: the four-part anatomy renders from versioned md through the raw-glob pipeline; frontmatter is authored and loud-fails on a missing anchor or name (anchors can never be derived from a reworded heading).
- [x] AC-3: entries carry their anchor as the element id; the hash scrolls after render; a bad anchor stays at the section top; an unknown or empty section recovers to the landing, never an error page.
- [x] AC-4: the entry rail (sticky, collapsed under 880px), the per-section entry list, next/previous over the published order.
- [x] AC-5: no nav/footer/About/auth surface touched (verified in the diff); the landing lists published sections only, and an empty guide renders the title alone.

## ADR adherence (0081)
- [x] No new dependency: the subset formatter covers exactly the anatomy's constructs and renders unknown constructs as literal text (pinned by test — visibly wrong in review, never swallowed).
- [x] The loader seam: route tests inject fixtures built through the REAL loadGuide, so the pipeline itself is what is tested.
- [x] `src/guide/README.md` documents the authoring contract and deliberately sits outside the scan glob.

## Findings
### Blocking
_None._
### Non-blocking
1. The ui breakpoint guard caught a non-canonical 900px media query during implementation; fixed to 880px. Recorded as evidence the guard works, not as residue.
2. The landing's spare state (title + contents) is intentional scaffolding; #85 replaces the opening with the narrative. Nothing links in until then.
3. Related-link resolution falls back to the raw anchor text when the target entry is not yet published; once Block 2 fills in, every related ref resolves to its on-screen name. Acceptable during the build window.

## Verdict
**PASS** — all five ACs covered by passing tests; the anchors-forever and never-an-error-page invariants are pinned; the pipeline is test-injected through its real code path; zero new dependencies.
