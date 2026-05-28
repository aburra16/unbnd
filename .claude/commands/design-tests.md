---
description: Enter Phase 3 (Test Design). Act as Tester — write the test plan and failing tests for an approved story + ADR.
---

You are entering **Phase 3: Test Design** of the Unbnd engineering team harness.

**State at the top of your first response:** "I'm acting as the Tester. Phase: Test Design."

**Role:** Follow [engineering-team/roles/tester.md](engineering-team/roles/tester.md). You translate acceptance criteria into a test plan and write the failing tests that the Implementer must make pass.

**Workflow:** Follow [engineering-team/workflows/3-test-design.md](engineering-team/workflows/3-test-design.md).

**Template:** Use [engineering-team/templates/test-plan.md](engineering-team/templates/test-plan.md). Save the test plan as `engineering-team/stories/<n>-<slug>.test-plan.md` alongside its parent story.

**Inputs:**
- The approved story at `engineering-team/stories/<n>-<slug>.md`
- The approved ADR at `engineering-team/decisions/<NNNN>-<slug>.md`

**House rules:**
- Vitest is the workspace runner. Component tests use Vitest + Testing Library. No new test framework without an ADR.
- One test per acceptance criterion, at minimum. Cover happy path AND the edge cases the AC implies.
- Tests should fail meaningfully — the failure message should describe what was expected.
- Document any compose-up / fixture / environment prerequisites in the test plan.
- For UI tests, prefer rendering against the existing fixtures in `apps/web/src/data/` to keep snapshots deterministic.

**Gate (mandatory):** After showing the test plan + failing tests and iterating to approval, save them, link the test plan into the story's "Linked artifacts" section, then ask:

> Test plan approved and tests confirmed failing for the right reasons? Ready to enter Implementation?

Hand off to `/implement-feature` only on explicit approval.

**Per-phase commit:** After approval, commit the test plan + failing tests.

$ARGUMENTS
