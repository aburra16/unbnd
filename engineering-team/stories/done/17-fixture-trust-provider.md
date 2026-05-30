# Story 17 — Fixture TrustProvider + staging seed harness

**Phase:** 2, Block A (foundations). **ADR:** 0017. **Status:** Done.

## Why
Phase 2's trust features (weighted display, promotion signals, accusatory gate,
search re-ranking, personalization, shelves) all consume the `TrustProvider`
seam. Their real signal depends on community activity that doesn't exist yet, so
building them against the live Brainstorm provider means building blind. This
story adds a **deterministic fixture provider** so every trust-consuming feature
can be built and verified in CI with known weights — no Brainstorm, no relays,
no humans — and documents a **staging seed harness** to reproduce a real
House↔Yours divergence on demand. It is the keystone that decouples the Phase 2
engineering track from the community track (PRD §2.0).

## Scope
- A `FixtureTrustProvider` implementing the full `TrustProvider` interface
  (`weights`, `hasScores`, `authChallenge`, `personalize`) from a deterministic
  spec, selectable by config (`TRUST_PROVIDER=fixture` + `TRUST_FIXTURE` JSON).
- Resolver + config wiring, mirroring the existing `SEARCH_PROVIDER` pattern.
- The ADR 0014 architecture guard stays green (no backend specifics leak; the
  fixture introduces none).
- A trust-consuming feature verified against the fixture in CI: the ratings
  `weightedRatings` path yields a known weighted average that differs from raw.
- A documented staging seed-harness procedure (`ops/trust-seed-harness.md`).

## Out of scope
- New trust-consuming features (those are later Phase 2 stories).
- Changing the Brainstorm adapter or the live trust behavior.

## Acceptance criteria
1. `FixtureTrustProvider` implements the full interface and returns deterministic
   results from its spec.
2. `TRUST_PROVIDER` selects the provider (default `brainstorm`); `TRUST_FIXTURE`
   supplies the fixture spec and is required + validated when fixture is chosen.
3. `resolveTrustProvider` constructs the fixture provider; the brainstorm path is
   unchanged.
4. The trust architecture-guard test still passes.
5. A CI test drives a trust-consuming feature (`weightedRatings`) through the
   fixture provider and asserts a deterministic weighted-vs-raw divergence.
6. `ops/trust-seed-harness.md` documents how to reproduce a House↔Yours
   divergence on staging (fixture mode + real-Brainstorm mode).
