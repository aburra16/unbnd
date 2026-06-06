# Phase 5: Review

## Role
Reviewer. See `engineering-team/roles/reviewer.md`.

## Input
- A diff (`git diff` or `git diff <base>...HEAD`).
- The story, ADR, and test plan that the diff is supposed to satisfy.

## Output
A review file at `engineering-team/reviews/<n>-<slug>.md` ending in **PASS** or **CHANGES_REQUESTED**.

## Steps

1. **Run the gates yourself:** `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/web build` for any UI change. Record actual results in the review.
2. **Walk the diff file by file.** Note anything unclear.
3. **Spec check.** Every acceptance criterion has a test? Every test passes?
4. **ADR check.** Files match? Layering matches? No unauthorized new deps?
5. **DList integrity (if applicable):**
   - Event kinds and d-tags match the ADR.
   - The librarian pubkey resolves at runtime; no hardcoded npub or hex.
   - Concept header references use stable kind:pubkey:slug addresses.
   - Word-wrapper JSON shape matches the ADR.
6. **UI integrity (if applicable):**
   - Brand tokens used for every visual decision.
   - No new icon library, no emoji, no AI-slop visual chrome.
   - Copy passes the no-slop rules (`memory/feedback_unbnd_copy_and_visual.md`).
   - Trust shown as percentile tiers, never raw GrapeRank numbers.
7. **Things tests can't catch:** off-by-ones in untested branches, race conditions, security issues, secrets, leftover debug code, scope creep.
8. **House rules:**
   - PRD scope discipline: nothing from §11.3 "Out of Scope" sneaks in.
   - POV-first respected.
   - No new lint/typecheck/build tooling without an ADR.
9. **Write the review** using `engineering-team/templates/review-checklist.md`.
10. **State verdict:** PASS or CHANGES_REQUESTED with file:line refs.

## Calibration
Be skeptical, not pedantic. PASS means the diff is mergeable as-is. CHANGES_REQUESTED means there's at least one blocking issue. Style preferences not in house rules are not blocking.

## Per-phase commits
Yes. Commit the review file regardless of verdict. Accumulated reviews are valuable signal over time.

## On PASS — close the story out

When the verdict is PASS, do these three things in the same review commit (or a tight follow-up commit) so the story is properly retired:

1. **Set `**Status:** Done`** at the top of the story file.
2. **`git mv`** the story and its test-plan into `engineering-team/stories/done/`:
   - `engineering-team/stories/<n>-<slug>.md` → `engineering-team/stories/done/<n>-<slug>.md`
   - `engineering-team/stories/<n>-<slug>.test-plan.md` → `engineering-team/stories/done/<n>-<slug>.test-plan.md`
3. **Update path references** that now point at the moved files:
   - The story's own ADR (`engineering-team/decisions/NNNN-<slug>.md`) — `**Story:**` line.
   - The test plan's `**Story:**` line.
   - The story's `Linked artifacts` block (if it references the test-plan by path).
   - The review's own `**Story:**` / `**Test plan:**` lines if you wrote them with the pre-move paths.

This keeps `engineering-team/stories/` showing only in-flight work. Shipped stories remain readable in `done/` and the git history shows the transition.

> **For Product Owner (Phase 1):** when picking the next story number, scan **both** `engineering-team/stories/` AND `engineering-team/stories/done/` for the highest existing `<n>` — numbers are never reused.

## Completion detection — offer to close the book

The moment a *book of work* can become complete is always "the last story just passed review." So after a PASS, check the book this story belongs to (`engineering-team/audits/<book-slug>/book.md`, if one is open):

- **PRD-backed (structural):** are all stories tracing to the anchor's §sections now `Done` (in `stories/done/`)? If yes → the book looks complete.
- **No-PRD (semantic):** is every bullet of the acceptance frame now satisfied by what shipped? If yes → the book looks complete.

When a book looks complete, **offer — don't auto-run:**

> Your original ask was *<anchor summary>*. What's shipped now covers it: *<evidence, linked to stories>*. This book of work looks complete — want me to close it? I'll generate the build audit and the PRD {addendum|seed}.

- **Yes** → run `/close-book` (Phase 6). The human's "yes" is the invocation.
- **Not yet / also need X** → extend the acceptance frame (or note the remaining PRD scope), leave the book `Open`, write nothing.

The system never *declares* a book done — it *proposes* done and the human ratifies. That's the safety valve against false-positive completion. A natural-language "I think that's everything" triggers the same offer — see `CLAUDE.md` → "Intent Detection". If no `book.md` is open for this work, skip this step (book tracking is opt-in at intake).
