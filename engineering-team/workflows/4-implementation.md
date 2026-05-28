# Phase 4: Implementation

## Role
Implementer. See `engineering-team/roles/implementer.md`.

## Input
- An approved user story.
- An approved ADR.
- An approved test plan with failing tests committed.

## Output
- Code that makes the failing tests pass.
- Quality gates clean:
  - `pnpm -r typecheck`
  - `pnpm -r test`
  - `pnpm --filter @unbnd/web build` (for any change in `apps/web`)

## Steps

1. **Run the gates first.** `pnpm -r typecheck` and `pnpm -r test`. Confirm what's actually failing right now.
2. **Re-read story, ADR, test plan** before touching code.
3. **Survey existing patterns.** If the change touches DList shapes, recheck the Tapestry branch the ADR cites (`concept-graph`, `feat/communities`, or `feat/pubkey-tagging-target`).
4. **Write the smallest code** that makes the tests pass while honoring the ADR.
5. **Honor architecture rules:**
   - POV-first: any trust-weighted answer is computed per observer, not stored.
   - Decentralized-first: accept signed events from any pubkey; aggregate per-POV.
   - Filter-at-view-time: don't precompute per-POV denormalizations.
6. **Honor house rules:**
   - Brand tokens from the handoff are the source of truth for any UI color, spacing, or radius. No new hex literals outside `tokens.css` and per-component genre styles.
   - The Unbnd Librarian pubkey is resolved at runtime, never hardcoded.
   - No new lint/typecheck/build tooling without an ADR.
   - Copy follows `memory/feedback_unbnd_copy_and_visual.md` rules. No em dashes, no rhetorical contrasts, no banned filler verbs.
7. **Run the gates again:** `pnpm -r typecheck && pnpm -r test`. Must be clean. If not, fix it before claiming done.
8. **If forced outside the ADR,** stop and escalate. The ADR needs amending before you continue.
9. **Hand off:** `/review-changes`.

## Common pitfalls
- Doing more than the story asks. Add a TODO or a follow-up story instead.
- Refactoring neighbors "while we're here". Not authorized by the ADR. Don't.
- Modifying tests to make them pass. If a test is wrong, kick back to Tester.
- Hardcoding the librarian pubkey or any other identity literal that should resolve at runtime.
- Writing UI copy without re-reading the no-slop rules.

## Per-phase commits
Yes. Commit when the gates are clean. Reference the story and ADR in the commit message (e.g., `impl: <slug> (story #<n>, ADR <NNNN>)`).
