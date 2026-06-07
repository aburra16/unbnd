# Story 74: Followers count via NIP-85

**Status:** Approved
**Created:** 2026-06-07
**Type:** Feature

## Background
A profile page today shows the person's *following* count (the accounts they follow, from their own kind-3 list) plus activity counts, but **no followers count** — so a Founding Curator cannot see their curation's reach, the number of people who follow them. The social-loop PRD calls for "a followers count" in the profile header (§5.1) and lists "the follow relationship gains a followers count via NIP-85" as a Block 2 deliverable (§6, §8.1).

This was deliberately deferred in Phase 2 with the direction recorded for this follow-up. ADR 0023 ("FOLLOWERS COUNT — deferred") is explicit: **do not** compute followers by scanning relays for kind-3 events whose `#p` includes the target — that is an unbounded, network-wide fan-out that is dishonest against the relay 500-cap and only yields a per-relay lower bound. **Instead, source the count from NIP-85 `kind:30382`** via the GrapeRank / Brainstorm trust data already wired for trust-weighting (ADR 0014/0017; `config.brainstormApiUrl` / `config.trustRelays`). That is a bounded, trust-anchored count that is honest to display and engages POV-first correctly (followers anchored in the web of trust, not a raw gameable global tally). The kind:30382 events the trust provider already reads carry a `followers` datum.

This story adds that followers count to the profile. It serves the Founding Curator (journey 4.1 — seeing their reach).

Anchor: `product-team/prd/social-loop.md` §5.1, §6, §8.1. Direction: `engineering-team/decisions/0023-follow-kind3.md` ("FOLLOWERS COUNT — deferred"). Wireframe: `product-team/guides/social-loop-wireframes.html#profile`.

## User-facing description
As a Founding Curator, I want my profile to show an accurate followers count, so that I can see the reach of my curation — and when no one follows me yet, I want an honest "No followers yet." rather than a fabricated or missing number.

## Acceptance criteria
Testable from the outside.

- [ ] A profile shows a followers count — the number of accounts that follow this person — alongside the existing following / activity counts, clearly labeled as "followers" (distinct from "following").
- [ ] The count is sourced from the NIP-85 `kind:30382` trust data (the trust-anchored follower attestation), not from an unbounded kind-3 `#p` relay scan. No new `#p`-filtered relay fan-out is introduced.
- [ ] A profile with no followers shows "No followers yet."
- [ ] When the NIP-85 follower datum is unavailable for a pubkey (the trust source has no value, or the read degrades/fails), the profile shows "No followers yet." (honest absence) rather than a fabricated, stale, or error state — and the page never throws.

## DList shapes touched
- Reads NIP-85 `kind:30382` (the trust-service follower attestation for a pubkey), via the existing trust seam / Brainstorm provider already used for trust weights. Read-only.
- No `#p` relay scan, no kind-3 followers read, no new event written.

## Out of scope
- The list of *who* the followers are (this story is the count only).
- Any change to the following count or the kind-3 follow write (FollowButton / `POST /api/profile/follow` are unchanged).
- Real-time follower updates or follow notifications.
- A per-viewer followers list. (Whether the count itself is observer-relative or a single trust-service value is an architecture question, below — the displayed number is still "followers count.")
- Standing up the Brainstorm/NIP-85 backend that publishes the follower datum (an availability dependency, handled by the honest-empty path above).

## Open questions
For the Architect (Phase 2):
1. **Surfacing through the trust seam.** Whether to extend the `TrustProvider` interface (`packages/trust/src/types.ts`) with a followers-count method, read the `followers` datum from the existing kind:30382 read in `packages/trust/src/brainstorm.ts`, or add it via the profile-stats path. The `30382:followers` provider tuple is referenced in the trust tests but not yet wired to live data — the Architect confirms the source shape.
2. **Observer-relative vs service-global.** Whether the kind:30382 `followers` value is a single trust-service-published number per pubkey or an observer-relative count, and how that reconciles with POV-first. The PO's intent: an honest, trust-anchored "followers count," however the source expresses it.
3. **Serve + cache.** Where the count is computed/served (extend the profile-stats endpoint vs a dedicated read) and its caching posture, consistent with the existing trust reads. Honest-empty when the source has no datum.

## Linked artifacts
- ADR: `engineering-team/decisions/0072-followers-count-nip85.md` (Accepted)
- Test plan: `engineering-team/stories/74-followers-count-nip85.test-plan.md`
- Review: (filled in after Review phase)
