# Phase 3: Test Design

## Role
Tester. See `engineering-team/roles/tester.md`.

## Input
- An approved user story.
- An approved ADR.

## Output
1. A test plan at `engineering-team/stories/<n>-<slug>.test-plan.md`.
2. Failing tests committed to the relevant package (`apps/web/test/` or `apps/api/test/`, or alongside the file as `Foo.test.ts(x)`).
3. Verification: `pnpm -r test` (or the package-scoped equivalent) runs and the new tests fail for the right reason.

## Steps

1. **Map every acceptance criterion to at least one test.** If a criterion can't be tested, push back to PO/Architect.
2. **Decide test levels.**
   - Pure functions and DList schema serializers → unit tests in the relevant package.
   - React components → Vitest + Testing Library, component-level.
   - DList round-trip behavior against a live strfry → integration tests under `apps/api/test/integration/`, with a documented dependency on `docker compose up`.
   - End-to-end UI flows → Playwright (introduce via an ADR; not present out of the box).
3. **Use the project's testing approach:** Vitest is the default runner across the workspace. Don't introduce a second test framework without an ADR.
4. **Write failing tests.** Test names should describe behavior in plain language. A future reader should understand the spec from reading the test names alone.
5. **Run `pnpm -r test`** (or the relevant subset). Confirm the tests fail — and that they fail because the feature isn't implemented, not because of a typo or import error. **Then run `pnpm -r typecheck` and confirm it is clean** — esbuild/vitest strip types, so a mistyped mock passes the runner but breaks `tsc` (and CI's build gate). Don't commit a red set that doesn't typecheck.
6. **Show plan + diff.** Iterate to approval.
7. **Gate:** "Test plan approved and tests fail correctly? Ready for Implementation?"
8. Hand off to `/implement-feature`.

## Common pitfalls
- Testing implementation details that the spec doesn't constrain. Brittle.
- Single happy-path test. Edge cases need explicit tests too.
- Skipping the "confirm the test fails" step. A test that doesn't actually fail tells you nothing.
- Committing a red set that doesn't `tsc`. The runner strips types, so a wrong-arity `vi.fn`, a too-narrow `describe.each` table, or a stub missing a parameter passes vitest but fails `pnpm -r typecheck` and the CI build — forcing a later type-only fix. Always typecheck the red set before committing.
- Tests that depend on relay state without saying so. Document prerequisites in the test plan (which fixture events, which compose services, which environment variables).

## Per-phase commits
Yes. Commit the failing tests before moving on. The commit message should make clear these are intentionally failing (e.g., `test: failing tests for <slug> (story #<n>)`).
