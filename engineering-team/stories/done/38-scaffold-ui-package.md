# Story 38: Scaffold the `@unbnd/ui` package and consume existing tokens from it

**Status:** Done
**Created:** 2026-06-03
**Type:** Refactor

## Background

The front end carries an MVP's worth of styling debt, and a future designer-led visual overhaul cannot be done cheaply or safely while styling is fused into components and the token rules are enforced by review alone. ADR 0038 (Accepted) sets the target: an overhaul-ready design system in a dedicated `@unbnd/ui` workspace package, delivered as a staged epic of behavior-preserving refactors (Epic 0001).

This is epic story 1, the structural beachhead. Before any token axis can be split into two tiers, before any primitive or guard can land, the design system needs a home. Today the only token source is `apps/web/src/styles/tokens.css`, an in-app file with no package boundary, so there is nowhere for tokens, primitives, the icon registry, and the motion layer to live as a versioned shipping unit. This story creates that home and moves the current token sheet into it with zero change to anything rendered.

Phase classification: Phase 2 platform hardening (extends PRD §2.11 / Block E), to be recorded in the post-Phase-2 PRD addendum. It changes no product behavior and no PRD claim. House-rule anchor: `CLAUDE.md` "Brand tokens are the visual source of truth" and "No new lint/typecheck/build tooling without an ADR" (this story adds no new tooling; it reuses pnpm workspaces, Vitest, and `tsc`). ADR governing: 0038. In-repo prior art the package mirrors: `packages/trust`.

## User-facing description

As an Unbnd engineer, I want the design system to have its own `@unbnd/ui` package that `apps/web` consumes the existing tokens from, so that the upcoming overhaul stories have a home to build in and a future re-skin becomes a token-and-internals change instead of an edit across the app, with the gain held by guards once they arrive.

This story is developer-facing infrastructure. No Reader, Curator, or Author sees any difference; the rendered app is byte-for-byte identical before and after.

## Acceptance criteria

Testable from the outside.

- [ ] Given the workspace, when `pnpm -r typecheck` runs, then it passes including a new `@unbnd/ui` package that exposes a `typecheck` script.
- [ ] Given the workspace, when `pnpm -r test` runs, then it passes including `@unbnd/ui` (a package with a `test` script that runs Vitest, even if its initial test set is minimal).
- [ ] Given the workspace, when the `apps/web` build runs (`pnpm --filter @unbnd/web build`), then it succeeds with `apps/web` consuming the token stylesheet from `@unbnd/ui`.
- [ ] Given `packages/ui`, when its `package.json` is inspected, then it declares `"name": "@unbnd/ui"`, is `private`, is `type: module`, points `main`/`types`/`exports` at raw `./src/index.ts` with no build step, and declares `react`/`react-dom` as peer dependencies (not regular dependencies).
- [ ] Given `apps/web/package.json`, when its dependencies are inspected, then it includes `"@unbnd/ui": "workspace:*"`.
- [ ] Given the `apps/web` app entry, when it is read, then it imports the token stylesheet from `@unbnd/ui` rather than from a local `apps/web/src/styles/tokens.css`.
- [ ] Given the relocated token stylesheet in `@unbnd/ui` and the previous `apps/web/src/styles/tokens.css`, when their contents are compared, then every token name and value is identical (the relocation changes nothing that resolves or renders).
- [ ] Given the move is complete, when `apps/web/src/styles/tokens.css` is checked, then it has been removed, so there is exactly one source of truth for the tokens.
- [ ] Given the pre-existing `apps/web` test suite, when it runs, then it stays green.
- [ ] Given the running app before and after this change, when the operator views the key screens, then the render is visually identical. (No visual-regression gate exists yet; that is repo Story 39 / epic story 2. The proof for this story is identical token content plus a green build plus a recorded manual render confirmation by the operator.)
- [ ] Given `packages/ui` alongside `packages/trust`, when their shapes are compared, then `@unbnd/ui` matches the `@unbnd/trust` package conventions: no build step, raw `src` export, `workspace:*` consumption, and the same `package.json` / `tsconfig` / `vitest` layout.

## DList shapes touched

None. This is a front-end packaging and CSS-architecture refactor, not a DList-shaped change. (ADR 0038 records that the Tapestry branch survey does not apply here; the governing prior art is in-repo: `packages/trust`.)

## Out of scope

Everything below belongs to later stories in Epic 0001 or is explicitly excluded by ADR 0038. None of it may grow into this story.

- The two-tier token refactor (raw to semantic aliases), any new token axis (type, spacing, motion, breakpoints, radii, elevation, z-index), and any literal sweep. Those are repo Stories 40+ (epic stories 3+).
- Primitives (`Button`, `IconButton`, `Input`, `Card`, `Pill`, `Avatar`, `Link`).
- The icon registry and `<Icon>` abstraction.
- The motion layer and `prefers-reduced-motion` handling.
- Layout primitives (`Stack`, `Grid`, `Container`).
- The Playwright visual-regression harness. That is the next story (repo Story 39 / epic story 2) and carries its own tooling sign-off gate.
- Any CI guard test. Guards arrive in the same story as the sweep they protect, not here.
- Any change to `apps/web/src/styles/base.css` or any other stylesheet. Only `tokens.css` relocates.
- Any behavior or visual change of any kind, and any copy or information-architecture change.
- Resolving genre/cover palette triplication, the `--u-bg`/`--u-line`/`--u-danger` drift, or any other token-correctness work. Those are the color-token story (repo Story 40 / epic story 3).
- Re-pointing the `CLAUDE.md` / `AGENTS.md` "brand tokens are the source of truth" rule at `@unbnd/ui`. That doc update is epic story 14; this story leaves the docs as they are.

PRD §11.3 "Out of Scope" check: this story touches no product surface (no payments, file hosting, ebook sales, bounty marketplace, social feed, reading progress, federation, or notifications). It is behavior-preserving infrastructure and does not approach the §11.3 line.

## Open questions

- **Dev-dependency version pinning.** `packages/trust` pins its runtime crypto dep exactly (`nostr-tools 2.10.4`) but uses `^` ranges for tooling dev deps (`typescript ^5.5.3`, `vitest ^2.1.0`), and its `version` is `0.0.0`. The `CLAUDE.md` exact-pin rule is anchored in ADR 0002, which is about cryptographic libraries. `@unbnd/ui` has no crypto deps. Should `@unbnd/ui` match the `@unbnd/trust` precedent verbatim (caret dev deps), or pin its dev deps exactly? Recommend matching the precedent for consistency, but flag it for the gate. This is a convention call for the Architect/operator, not a product decision.

## Linked artifacts

- ADR: `engineering-team/decisions/0038-design-system-architecture.md` (umbrella ADR for the epic; a refining ADR for this story is optional and the Architect's call).
- Epic: `engineering-team/epics/0001-design-system-overhaul-ready.md` (epic story 1).
- Test plan: none (lean Impl→Reviewer tier; Test-Design skipped by approval).
- Review: `engineering-team/reviews/38-scaffold-ui-package.md` (PASS, 2026-06-03).
