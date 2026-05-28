# Review: Story <n> — <title>

**Reviewer:** Claude (acting as Reviewer)
**Date:** <DATE>
**Diff:** `git diff <base>...HEAD` (commit <hash>)

## Quality gates (run by reviewer, not trusted)

- [ ] `pnpm -r typecheck` — pass / fail / output
- [ ] `pnpm -r test` — pass / fail / output (skip if no tests apply per the ADR)
- [ ] `pnpm --filter @unbnd/web build` — pass / fail / output (run for any change in apps/web)
- [ ] _Lint not configured — skipped._

## Spec adherence
- [ ] Every acceptance criterion has a passing test.
- [ ] No criterion is silently dropped.
- [ ] No behavior added that isn't in the story.

## ADR adherence
- [ ] Files changed match the ADR's implementation notes.
- [ ] Layering / module boundaries respected (apps/web stays UI; apps/api stays server; no cross-import).
- [ ] No new dependencies the ADR didn't authorize.

## DList integrity (if the diff touches event shapes)
- [ ] Event kinds and d-tags match the ADR.
- [ ] The librarian pubkey is resolved at runtime, never hardcoded.
- [ ] Concept header references use stable kind:pubkey:slug addresses.
- [ ] Word-wrapper JSON shape matches the ADR.

## UI integrity (if the diff touches apps/web)
- [ ] Brand tokens (from handoff §"Brand Design Tokens") used for every color, radius, and spacing decision. No new hex literals outside `tokens.css` and per-component genre/signal styling.
- [ ] No icon libraries introduced. SVGs are inline and hand-crafted.
- [ ] Copy follows `feedback_unbnd_copy_and_visual.md` rules. No em dashes, no rhetorical contrasts, no banned filler verbs.
- [ ] Trust shown as percentile tier strings, never raw GrapeRank numbers.

## Things tests can't catch
- [ ] No secrets in committed files.
- [ ] No leftover debug logging or `console.log`.
- [ ] No commented-out code.
- [ ] Error paths and edge cases handled where it matters.
- [ ] Concurrency / race conditions considered.
- [ ] Security: input validation at boundaries, no obvious injection vectors, password fields use the right autocomplete attribute.

## House rules check
- [ ] PRD scope discipline: nothing from PRD §11.3 "Out of Scope" sneaks in (file hosting, payments, ebook sales, social feed, reading progress, etc.).
- [ ] POV-first: the change does not pretend there is a single global truth where a POV-dependent answer is correct (PRD §9.5).
- [ ] No new lint/typecheck/build tooling without an ADR authorizing it.

## Findings

### Blocking
1. **<file>:<line>** — <issue>. Asked change: <change>.

### Non-blocking
1. **<file>:<line>** — <observation>. Optional improvement: <suggestion>.

## Verdict
**PASS** | **CHANGES_REQUESTED**
