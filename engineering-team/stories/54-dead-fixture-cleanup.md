# Story 54: Remove the dead `apps/web/src/data` fixtures and close the guard blind spot

**Status:** In progress
**Created:** 2026-06-04
**Type:** Cleanup / guard hardening

## Background

The design-system epic (stories 38–51) built nine literal-scanning architecture guards in `packages/ui/test/architecture-*.test.ts`. Each guard's `walk()` skips a `SKIP_DIRS` set, and every guard except the token-refs one carries `"data"` in that set. That entry exists to skip `apps/web/src/data/`, a directory of static fixtures that pre-date the live-data swap (Story 9) and the submission/profile work (Story 20, which already retired `profile-fixtures.ts`). ADR 0040 §5 logged the exclusion as a deliberate, temporary scope-out: "the dead `apps/web/src/data/*-fixtures.ts` color literals are left for a separate cleanup (not in the render path)."

That directory is now provably dead. It holds three files:

- `book-fixtures.ts` — exports `bookRecords` (carries raw color literals: `coverFrom`/`coverTo`/`coverInk`/`avatarBg`/`avatarInk`, e.g. `#7A2E14`).
- `genre-fixtures.ts` — exports `genreRecords` (same kind of literals).
- `fixture-constants.ts` — exports `FIXTURE_LIBRARIAN_PUBKEY`, imported only by the two fixtures above.

The only importer of `bookRecords`/`genreRecords` anywhere in the repo is `apps/web/test/fixtures.test.ts`, a self-referential conformance test that validates the fixtures conform to `@unbnd/schemas` but exercises no application code. No live route, component, e2e fixture, or config references any of these files (verified by repo-wide grep; the e2e visual harness has its own separate `apps/web/e2e/visual/fixtures/`). The fixtures render nowhere; the test only proves dead data is well-formed.

So the cleanup and the guard hardening are one move: delete the dead directory and its dead test, and drop the now-unnecessary `"data"` scope-exclusion from every guard that carries it. That converts a documented blind spot into genuine coverage — any future `data/` directory under a scan root will be scanned like everything else.

## User-facing description

There is no user-facing change. As an engineer (or agent) working on Unbnd, I want the dead fixture data removed and the architecture guards to have no `data/` blind spot, so that the guards scan all source under their roots and a future contributor cannot reintroduce raw literals in a `data/` directory unnoticed.

## Acceptance criteria

Testable from the outside.

- [ ] **Dead directory removed.** `apps/web/src/data/` (`book-fixtures.ts`, `genre-fixtures.ts`, `fixture-constants.ts`) is deleted; the now-empty directory is gone.
- [ ] **Dead test removed.** `apps/web/test/fixtures.test.ts` (the sole importer of the deleted fixtures) is deleted.
- [ ] **Guard blind spot closed.** Every guard in `packages/ui/test/architecture-*.test.ts` that carried `"data"` in `SKIP_DIRS` no longer does; the stale `apps/web/src/data` scope-exclusion comments are removed or corrected so the guard docs match the new behavior. No guard's universal skips (`node_modules`, `dist`, `.git`, `engineering-team`, `e2e`, `test`) change.
- [ ] **Red→green demonstrated.** With the `"data"` skip removed, a planted raw literal in a new `apps/web/src/data/*.ts` file makes the relevant guard fail; removing the planted file makes it pass — proving the skip removal is real (Reviewer reproduces this on at least the color guard).
- [ ] **No production code touched.** No change to any file under `apps/web/src` outside the deleted `data/` directory, and no change to `packages/ui/src`, `packages/ui/styles`, or any app behavior.
- [ ] **Gates green.** `pnpm -r typecheck`, `pnpm -r test` (all guards + the now-smaller web suite), and `pnpm --filter @unbnd/web build` are green. The Story-39 `visual` job runs zero-diff (no render change); no baseline updated.
- [ ] **Slop-free.** Any comment or doc edited reads cleanly (no em dashes, no rhetorical contrasts, no filler).

## DList shapes touched

None. No DList kinds, events, or data-layer changes. This deletes dead front-end fixtures and tightens test-only guard scope.

## Out of scope

- Any token, primitive, or app-CSS change.
- The other open follow-ups surfaced in this session (ephemeral key TTL sweeper, CI buildx flake retry, the author-claim border/error-text token repoint) — each is its own future story if actioned.
- The `searchbox-hit` deferred-class allowlist entry in the button guard (awaits a future listbox/Option primitive; unrelated to the `data/` scope).

## Open questions

None.

## Linked artifacts

- ADR: `engineering-team/decisions/0053-guard-scope-tighten.md`
- Test plan: deletion + guard-scope change; the red→green check is the test (Reviewer reproduces).
- Review: `engineering-team/reviews/54-dead-fixture-cleanup.md` (pending)
