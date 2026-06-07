# Story 68: Vouch control + the Curate surface

**Status:** Approved
**Created:** 2026-06-06
**Type:** Feature

## Background
Story #67 built the curator-role mechanism (the vouch write, the count-gate, the badge) but left the write-side UI and the curator's tools for here. This story gives a trusted user a way to vouch from a profile, shows how many trusted people have vouched, and gives a recognized curator a dedicated entry to the submission and promotion tools that already exist (PRD §5.1 vouch control + count, §5.7 the Curate surface). This completes the Founding Curator's "grow the circle" loop (journey 4.1 step 4). Reuses the #67 vouch write (`POST /api/curator-roles`) and curator-status read. Folds in the #67 review follow-up (a server-side event-shape validator on the sovereign vouch submit).

Anchor: `product-team/prd/social-loop.md` §5.1, §5.7.

## User-facing description
As a Founding Curator, I want a clear way to vouch for someone as a curator and a dedicated place to do my curation work, so that I can grow the trusted circle and act on submissions without hunting for the tools.

## Acceptance criteria
- [ ] An eligible viewer (a trusted user permitted to vouch) sees a "Vouch as curator" action on another person's profile; an ineligible or signed-out viewer sees no such control, and no one sees it on their own profile.
- [ ] Vouching records the viewer's curator-role assertion; afterwards the control shows "Vouched" and offers to withdraw (which records a dispute).
- [ ] A profile shows "N trusted people vouched" once at least one trusted vouch exists.
- [ ] A signed-in curator sees a "Curate" entry in the navigation; non-curators and signed-out users do not.
- [ ] The Curate entry surfaces the existing submission and promotion tools.

## DList shapes touched
- Reuses the `curator-roles` concept from #67 (the vouch write + the vouch read). No new concept.

## Out of scope
- The curator-role mechanism itself (#67, shipped) and the gate knobs.
- Any new curator capability beyond surfacing the existing submission/promotion tools.

## Open questions
1. **Two distinct viewer signals:** the "Vouch" control needs the viewer's *vouch-eligibility* (their own house-weight ≥ the threshold, the #67 write gate), while the "Curate" nav needs the viewer's *curator status* (seed OR vouched OR emergent). Recommendation: Curate nav = curator status; Vouch control = vouch-eligibility. The exact read(s) exposing these for the session user are the Architect's call.
2. **Vouch count source:** "N trusted people vouched" needs the trusted-asserter count for a subject (the #67 read returns only the boolean today). Architect to decide whether to extend that read or add a sibling.

## Deviations
- **`GET /api/profile/:id/curator` gained `vouchCount`** (additive per ADR 0067), which broke #67's two strict `toEqual({isCurator})` route assertions; relaxed them to `toMatchObject` (assertions unchanged in intent). The `computeCuratorStatus` gate in the route is now expressed via `trustedVouchCount(...) >= minAsserters` (same result), so `computeCuratorStatus` is no longer imported by the route (still exported + used by #67's tests).
- **`CurateNavLink` resilience:** it lives in the global `Nav`, so its `meCurator` fetch is wrapped (`Promise.resolve().then(...)→.catch`) to never crash `Nav` on a failure or an absent method in a partial test mock. Avoids editing ~15 signed-in route-test mocks for a nav-internal fetch.
- **Two `curatorStatus` reads per profile:** the `CuratorBadge` (isCurator) and the Profile vouch-count both read `curatorStatus`; left as two reads to avoid reworking the #67 `CuratorBadge` contract. Minor; could be unified later.

## Linked artifacts
- ADR: `engineering-team/decisions/0067-vouch-control-curate-surface.md` (Accepted)
- Test plan: `engineering-team/stories/68-vouch-control-curate-surface.test-plan.md`
- Review: (filled in after Review phase)
