# Review: Story 68 — Vouch control + the Curate surface

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-06
**Diff:** `git diff main...HEAD` (commit `8682716`)
**Story:** `engineering-team/stories/done/68-vouch-control-curate-surface.md`
**Test plan:** `engineering-team/stories/done/68-vouch-control-curate-surface.test-plan.md`

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` — **pass** (exit 0, 12 packages).
- [x] `pnpm -r test` — **pass** (exit 0; `@unbnd/api` 912/10 skipped, `@unbnd/web` 340, `@unbnd/schemas` 153, `@unbnd/ui` 20 guards green). The #67 curator-roles route tests still pass after the route rewrite.
- [x] `pnpm --filter @unbnd/web build` — **pass** (~0.66s).

## Spec adherence
- [x] Every AC has a passing test. AC-1 (control visibility + eligibility): `vouch-control` component + `me/curator` route. AC-2 (vouched/withdraw): component `'Vouched'` + `vouch-status` route. AC-3 (N vouched): `trustedVouchCount` unit + `vouchCount` route. AC-4/5 (Curate nav → /submissions): `CurateNavLink` component.
- [x] No behavior dropped; the write gained polarity (vouch/withdraw) as the story requires.

## ADR adherence (0067)
- [x] No new DList concept (reuses #67's `curator-roles`). `GET /api/me/curator` `{isCurator,canVouch}`, `vouchCount` on the subject read, `GET .../vouch-status` — all as specified. `VouchButton` clones `FollowButton`; the Curate entry links to the existing `/submissions`. The #67 follow-up (sovereign event-shape validator) is included.
- [x] `trustedVouchCount` shares a `countedAsserters` core with `computeCuratorStatus` (the latter's #67 behavior is unchanged — its tests pass). No new dependency, no new config.

## DList / POV integrity
- [x] No new shape. Curator status + counts resolved from the house vantage at read time, never stored. The librarian pubkey is read from config. The sovereign vouch is validated server-side (well-formed assertion, signed by the asserter, non-self subject).

## UI integrity
- [x] `VouchButton` is the `@unbnd/ui` `Button` primitive (`aria-pressed`, optimistic + revert); `CurateNavLink` is a `Link` reusing `nav-link`. No new hex/icon; color guard green. Copy ("Vouch as curator", "Vouched", "N trusted people vouched") passes the no-slop rules. No raw trust number on the wire (booleans + a plain count).

## Things tests can't catch
- [x] `VouchButton` is session-gated and `canVouch`-gated and self-gated → signed-out profile tests never call its endpoints. `CurateNavLink`'s `meCurator` fetch is wrapped so it cannot crash the global `Nav` (the cause of a 103-test blast radius, fixed). No secrets, no debug logging.
- [x] me/curator `isCurator` = seed OR canVouch(==emergent) OR vouched; `canVouch` = house-weight ≥ threshold. Honest degrade closes the gate.

## House rules check
- [x] PRD scope discipline, POV-first, no new tooling. `LIBRARIAN_NSEC` untouched.

## Findings

### Blocking
None.

### Non-blocking
1. **`.me-vouches` and `.vouch-error`** (Profile / VouchButton) have no token CSS yet — they render with default styling. Visual polish; add a small token-only rule in a follow-up. Not a guard violation (no literals).
2. **Withdraw polarity path** (action=withdraw → −1) is implemented but not unit-tested at the route/component level (the vouch/apply path and the gate are). Optional: add a withdraw test.
3. **Two `curatorStatus` reads per profile** (badge + count) — logged Deviation; could be unified.

## Verdict
**PASS** — the diff matches the story, ADR 0067, and the test plan; all gates clean (including the unchanged #67 behavior); no blocking issues. Mergeable as-is.
