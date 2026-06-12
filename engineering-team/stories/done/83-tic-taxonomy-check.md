# Story 83: The tic taxonomy lands with its mechanical check

**Status:** Done
**Created:** 2026-06-11
**Type:** Feature (tooling + process; the reader-guide epic's foundation)
**Source brief:** `product-team/stories-queue.md` Story 1 · **PRD:** `product-team/prd/reader-guide.md` §5.3/§7 · **Law:** `product-team/guides/reader-guide-style-guide.md` (the tic taxonomy)

## Background
The reader-guide epic ships ~35 documentation entries whose every sentence is governed by the tic taxonomy: 30 named machine-text tells across six families, each marked **[M]** (mechanically checkable by text search) or **[J]** (judgment, applied in the edit pass). The PRD makes the mechanical half enforceable: a scan over the guide's content that reports every [M] hit with its location and tic id, wired into CI, **data-driven** so extending the taxonomy never touches scan logic (the style guide's "Extending the taxonomy" contract is binding), with the protocol-wall exception for exactly one marked entry expressible without weakening the wall elsewhere.

The brief names the failure mode to design against: **drift between the taxonomy document and the machine list.** Two artifacts that must agree will not stay agreeing; the architecture should make them one artifact.

No guide content exists yet (story #84 builds the surface; #85+ write entries). This story establishes the scan and its zero-hit baseline over the (initially empty) content set, so every later content story lands already gated.

## User-facing description
As a reader of the guide (eventually), every published sentence has passed a machine check for the tells the taxonomy bans, so the guide sounds like a person on every page; as the team, extending the taxonomy is one edit to one document, and the next CI run enforces the extension.

## Acceptance criteria
From the brief, testable from the outside:
- [ ] The taxonomy is established in the repository as the single source of truth for prose rules (its own header already states what it supersedes).
- [ ] A mechanical scan runs over the guide's content location and reports every [M]-rule hit with its file, line, and tic id.
- [ ] The scan is data-driven: adding a word or pattern to the mechanical list makes the scan catch it with **no change to scan logic** (provable by a test that extends the list).
- [ ] CI fails when published guide content has a hit; the protocol-wall exception for the one marked entry is expressible per-file and exempts only the E-wall, never the other rules.
- [ ] The scan runs clean on the initially empty content set (the zero-hit baseline).

## Out of scope
- The guide surface, routes, and rendering (#84); any guide content (#85+).
- The [J] rules (the human edit pass; the scan flags F2 hint-words for the judgment read but never fails on judgment calls).
- Applying the scan to existing app copy (the deferred retroactive-sweep story).

## Open questions
For the Architect:
1. **One artifact, zero drift.** The brief allows "parsed from the style guide, or a sibling data file generated from it." A sibling file is two artifacts pretending to be one. Decide whether the style guide itself carries a machine-readable appendix (a fenced block the scanner parses), making document and list the same edit by construction; and where the boundary sits (engineering reads product artifacts; the appendix remains product-owned and extension stays one product-side edit).
2. **Where the scanner lives** (a small workspace package so `pnpm -r` typecheck/test cover it, vs a loose script) and the content location it scans (must be the same place #84 ships content from).
3. **Hit semantics.** Word-boundary matching (the #75 matcher lesson), case rules per list (C2 openers are sentence-initial; "just" is steps-only), and how the F2 hint-words report as flags without failing CI.

## Linked artifacts
- ADR: `engineering-team/decisions/0080-tic-taxonomy-check.md` (Accepted)
- Test plan: `engineering-team/stories/83-tic-taxonomy-check.test-plan.md`
- Review: `engineering-team/reviews/83-tic-taxonomy-check.md` (PASS)
