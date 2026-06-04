# Story 51: Re-point the design-system house rules at `@unbnd/ui`

**Status:** Done
**Created:** 2026-06-04
**Type:** Doc

## Background

This is epic story 14, the closing story of the design-system overhaul (`engineering-team/epics/0001-design-system-overhaul-ready.md`). Stories 38 through 50 built `@unbnd/ui`: the two-tier token system in `packages/ui/styles/tokens.css` (raw `--u-raw-*` aliased by a semantic tier, consumed by `apps/web` via the `@unbnd/ui/styles/tokens.css` export), the primitives (`Button`, `IconButton`, `Link`, `Pill`, `Avatar`, `Label`, `Field`, `Container`), the typed `Icon` registry, the `breakpoints` export, the `[data-theme]` theming substrate with an inert dark skeleton, and 11 CI architecture guards in `packages/ui/test/architecture-*.test.ts` that hold every axis.

ADR 0038 §"Consequences" recorded the follow-up: "`CLAUDE.md` / `AGENTS.md` should be updated (after implementation) to point the 'brand tokens are the source of truth' rule at `@unbnd/ui` instead of `apps/web/src/styles/tokens.css`, and to cite the new guards; that is a doc follow-up, not a PRD change." The design-system house rules in both files still name `apps/web/src/styles/tokens.css` as the source of truth and describe several rules as review-enforced. Both statements are now stale: the source of truth moved to `@unbnd/ui`, and the rules are CI-enforced by named guards. This story closes that gap.

## User-facing description

There is no user-facing change. As an engineer (or agent) starting work on Unbnd, I want the design-system house rules in `CLAUDE.md` and `AGENTS.md` to name the real source of truth (`@unbnd/ui`) and the guards that enforce them, so that I read accurate guidance and do not edit the retired `apps/web/src/styles/tokens.css` path or assume the rules are review-only.

## Acceptance criteria

Testable from the outside. Each criterion gets at least one test (here, Reviewer cross-check against the repo).

- [ ] **Source-of-truth re-point.** Every reference in `CLAUDE.md` and `AGENTS.md` to `apps/web/src/styles/tokens.css` as the visual source of truth names `@unbnd/ui` (`packages/ui/styles/tokens.css`, two-tier raw to semantic, consumed via the package export) instead.
- [ ] **Guards cited as enforcement.** The hex/color, type, spacing, motion, icon, and button rules cite the real guard file(s) in `packages/ui/test/architecture-*.test.ts` as their enforcement, by exact file name.
- [ ] **Primitives and registry named.** The "no raw `<button>`" / interactive-element rule points at the `@unbnd/ui` primitives (`Button`, `IconButton`); the icon rule points at the `Icon` registry. Names match the package exports.
- [ ] **Theming pointer added.** A brief, accurate note that the `[data-theme]` substrate exists (a redesign is a token-tier swap) and that dark is an inert skeleton, not activated.
- [ ] **Intent preserved.** No house rule is relaxed or removed; only the WHERE (source of truth) and HOW (enforcement) are updated. Amber-only accent and the signal-color rule stay, now token-backed in `@unbnd/ui`.
- [ ] **Accurate and slop-free.** Every package path, primitive name, and guard file name in the edits is real (cross-checked against the repo). No em dashes, no rhetorical contrasts, no filler.
- [ ] **No code change, gates green.** No token, component, guard, or behavior change. `pnpm -r typecheck`, `pnpm -r test`, and `pnpm --filter @unbnd/web build` stay green (untouched).

## DList shapes touched

None. This is a documentation story; it touches no DList kinds, no events, and no data layer.

## Out of scope

- Any code, token, component, or guard change. Docs only (`CLAUDE.md`, `AGENTS.md`, this story, an optional `packages/ui/README.md`).
- Relaxing, removing, or adding any house rule. Intent stays identical.
- The engineering-team role and workflow files, and the memory files.
- Activating dark mode or building any second skin (ADR 0038 keeps that as later work).

## Open questions

None.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella); per-axis ADRs 0040 through 0050.
- Test plan: doc-only; Reviewer cross-checks the edits against the repo.
- Review: `engineering-team/reviews/51-docs-repoint.md` (PASS)
