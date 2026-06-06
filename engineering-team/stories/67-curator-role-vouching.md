# Story 67: Curator status by trusted-user vouching

**Status:** Approved
**Created:** 2026-06-06
**Type:** Feature

## Background
Today the curator graph can only grow by the operator editing the librarian's seed-follow list. Phase 3's growth mechanism lets the graph deepen on its own: existing trusted users vouch for new curators, and once enough trusted people have vouched, that person *is* a curator (PRD §6 Curator Role Assertion, §7 curator-status lifecycle, §5.1 the "Curator" badge). This is the Founding Curator's "grow the circle" loop (journey 4.1 step 4) and the engine behind the whole social loop. The mechanism mirrors the existing author-verified pattern (a trusted-curator, pubkey-targeted, count-gated assertion); the Architect will design the concept against that prior art. This story delivers the vouch write, the count-gate that resolves curator status, and the badge; the vouch button and the Curate nav are Story #68.

Anchor: `product-team/prd/social-loop.md` §5.1, §6, §7.

## User-facing description
As a Founding Curator, I want my vouch for another reader to count toward making them a recognized curator, so that the community of trusted curators grows without the operator hand-editing a list.

## Acceptance criteria
- [ ] A trusted user (above the configured asserter-weight floor) can record a vouch that another person is a curator; a person cannot vouch for themselves.
- [ ] A person becomes a curator once at least the configured number of distinct trusted users have vouched for them.
- [ ] A "Curator" badge appears on the profile of anyone who is a curator.
- [ ] Withdrawing or disputing a vouch lowers the count; dropping below the gate removes the curator status and the badge.
- [ ] A person on the operator's seed-curator allowlist is a curator regardless of vouch count.

## DList shapes touched
- **New concept** `curator-roles` (`kind:39998` header) holding curator-role assertions (`kind:39999`, targeting a pubkey with apply/dispute polarity). The Architect specifies the exact shape against the existing `author-verified` pattern. First new DList concept of Phase 3.

## Out of scope
- The vouch button on profiles and the "Curate" nav entry (Story #68).
- Any curator-only capability beyond the badge (promotion, accusatory write picker already exist behind their own gates).
- The trust-weighted variant of anything; this is a count-gate of trusted asserters.

## Open questions
1. **Gate knobs (PRD §11 Q2):** the asserter count `N` and the per-asserter weight floor `W` (seed placeholder N=10, W=0.2 on the 0–1 scale). Recommendation: ship them configurable (like `CURATOR_THRESHOLD`), operator-tuned; the seed allowlist covers cold-start so `N` can be meaningful. (PO recommendation, approved.)
2. **Emergent-gate coexistence (PRD §11 Q3):** the existing Phase-2 house-weight gate (`canPromote`, weight ≥ `CURATOR_THRESHOLD`) also confers curator status, OR'd with vouching + the seed allowlist (curator = seed OR vouched OR emergent), keeping it as the cold-start fallback. (PO recommendation, approved; Architect to confirm the resolution.)

## Linked artifacts
- ADR: `engineering-team/decisions/0066-curator-role-vouching.md` (Accepted)
- Test plan: `engineering-team/stories/67-curator-role-vouching.test-plan.md`
- Review: (filled in after Review phase)
