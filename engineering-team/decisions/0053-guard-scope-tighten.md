# ADR 0053: Remove the dead `apps/web/src/data` fixtures and drop the `data/` guard scope-exclusion

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/54-dead-fixture-cleanup.md`

**Accepted 2026-06-04.** Delete the dead `apps/web/src/data/` directory (`book-fixtures.ts`, `genre-fixtures.ts`, `fixture-constants.ts`) and its sole importer `apps/web/test/fixtures.test.ts`; then remove `"data"` from `SKIP_DIRS` in every `packages/ui/test/architecture-*.test.ts` guard that carries it (color, type, spacing, shape, motion, button, svg, page-frame, breakpoints) and correct the stale scope-exclusion comments. The token-refs guard never carried `"data"` and is untouched. This converts ADR 0040 §5's documented, temporary `data/` blind spot into genuine coverage: any future `data/` directory under a guard scan root is scanned like any other source. Zero production-code change; zero-diff `visual`. The other follow-ups raised this session (ephemeral key TTL sweeper, CI buildx flake retry, author-claim border/error-text repoint) are explicitly NOT in this story.

This is a follow-up under the umbrella **ADR 0038** (the `@unbnd/ui` design system and its CI guards) and directly retires the deferral logged in **ADR 0040** §5 ("the dead `apps/web/src/data/*-fixtures.ts` color literals are left for a separate cleanup, not in the render path"). Held to the **ADR 0039** gate (the Story-39 `visual` job at `maxDiffPixelRatio: 0`); since nothing in the render path changes, the default render is byte-identical and no baseline moves.

## Context

The architecture guards built across the epic each scan their roots (`apps/web/src` and, for most, `packages/ui`) and flag raw literals outside the token/primitive layer. To avoid false positives from a directory of pre-live-data static fixtures, each guard's `SKIP_DIRS` included `"data"`, skipping `apps/web/src/data/`. ADR 0040 §5 recorded this as a deliberate temporary measure rather than an allowlist, on the understanding the fixtures were dead and would be removed in a dedicated cleanup.

The directory is now confirmed dead end-to-end:

- `apps/web/src/data/book-fixtures.ts` and `genre-fixtures.ts` are imported only by `apps/web/test/fixtures.test.ts` (repo-wide grep; no live route, component, e2e fixture, or config imports them). The e2e visual harness has its own separate fixtures under `apps/web/e2e/visual/fixtures/`.
- `apps/web/src/data/fixture-constants.ts` (`FIXTURE_LIBRARIAN_PUBKEY`) is imported only by those two fixtures.
- `fixtures.test.ts` is a self-referential conformance test: it validates the fixtures against `@unbnd/schemas` shapes but exercises no application code. With the fixtures gone, the test has nothing left to assert.
- `apps/web/src/data` is the only `data` directory under any guard scan root (verified by `find`), so removing the skip exposes nothing else.

### Acceptance criteria (quoted from the story)

- Dead directory removed (`book-fixtures.ts`, `genre-fixtures.ts`, `fixture-constants.ts`); empty directory gone.
- Dead test removed (`apps/web/test/fixtures.test.ts`).
- `"data"` dropped from `SKIP_DIRS` in every guard that carried it; stale `apps/web/src/data` comments removed or corrected; universal skips unchanged.
- Red→green demonstrated: a planted raw literal in a new `apps/web/src/data/*.ts` makes the relevant guard fail; removing it passes.
- No production code touched outside the deleted directory.
- `pnpm -r typecheck`, `pnpm -r test`, `pnpm --filter @unbnd/web build` green; `visual` zero-diff, no baseline updated.

## Decision

1. **Delete the dead fixture directory and test.** `git rm` `apps/web/src/data/book-fixtures.ts`, `apps/web/src/data/genre-fixtures.ts`, `apps/web/src/data/fixture-constants.ts`, and `apps/web/test/fixtures.test.ts`. The empty `apps/web/src/data/` directory disappears with its last file.

2. **Drop the `data/` scope-exclusion from every guard that has it.** Remove the `"data"` entry from `SKIP_DIRS` in `architecture-color-literals`, `-type-literals`, `-spacing-literals`, `-shape-literals`, `-motion-literals`, `-button-literals`, `-svg-literals`, `-page-frame`, and `-breakpoints`. Correct each guard's header/inline comment so it no longer claims `apps/web/src/data` is excluded. Leave `architecture-token-refs` untouched (it never carried `"data"`). Leave the universal skips (`node_modules`, `dist`, `.git`, `engineering-team`, `e2e`, `test`) exactly as they are.

3. **Prove the hardening.** The red→green check (a planted literal under a new `data/` file fails the color guard; removing it passes) is the test that the skip removal is real, not cosmetic. The Reviewer reproduces it.

## Consequences

- The `data/` blind spot is gone: a future `data/` directory under a scan root is scanned, so raw literals cannot re-enter through that path unnoticed.
- The web test suite shrinks by one dead conformance test; total guard behavior is otherwise identical (same offenders, same allowlists, minus the obsolete skip).
- No render path changes, so the `visual` gate stays zero-diff and no baseline moves.
- ADR 0040 §5's deferral is retired. The remaining session follow-ups (ephemeral key TTL sweeper, CI buildx flake retry, author-claim border/error-text token repoint) stay open as separate future stories.
