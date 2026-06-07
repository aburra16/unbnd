# ADR 0072: Followers count via NIP-85 (a `followers()` method on the trust seam)

**Status:** Accepted
**Date:** 2026-06-07
**Story:** `engineering-team/stories/74-followers-count-nip85.md`

## Context
Profiles show a *following* count (the target's own kind-3 list, `distinctFollowCount`, `apps/api/src/profile/follow-count.ts`) but no *followers* count. ADR 0023 ("FOLLOWERS COUNT — deferred") already fixed the direction: **never** a kind-3 `#p` relay scan (unbounded, dishonest against the 500-cap, only a per-relay lower bound); **instead** source it from NIP-85 `kind:30382` via the GrapeRank / Brainstorm trust data already wired for trust-weighting (ADR 0014/0017).

The seam is in place. `BrainstormProvider` (`packages/trust/src/brainstorm.ts`) resolves an observer's `30382:rank` service key via `/setup/{observer}`, then reads `kind:30382` events authored by that key with `#d = targets`, parsing the `rank` tag → weight. Those **same events carry a `followers` tag** (`packages/trust/test/brainstorm.test.ts:22` → `["followers","5"]`). So the follower datum co-locates with the rank already being read. The neutral `TrustProvider` interface (`packages/trust/src/types.ts`) today exposes `weights()`, `hasScores()`, `authChallenge()`, `personalize()` — **no followers method**. `ProfileStatsDeps` (`apps/api/src/routes/profile-stats.ts`) has `config`, `sessionUser`, `query`, `queryPaged`, `now` — **no `trust`**. The `Stats` shape returns optional `followingCount` etc.; the web Profile renders them (`apps/web/src/routes/Profile.tsx`).

Constraints: POV-first; honest-empty/never-throw (the trust seam contract is already best-effort); no new `#p` fan-out; brand tokens for any UI; no-slop copy.

## Options considered

### Option A — Add a `followers()` method to the `TrustProvider` seam, read from the house vantage; surface via profile-stats
Extend the neutral interface with `followers(observerHex, targetHexes): Promise<Map<string, number>>`, symmetric with `weights()` and under the same best-effort/honest-empty contract. `BrainstormProvider` implements it by parsing the `followers` tag off the `kind:30382` read (same path as `weights`). `FixtureTrustProvider` implements it from a new `FixtureSpec.followers` map. The profile-stats route gains a `trust` dep and computes `followersCount` via `trust.followers(houseObserver, [targetHex])`. The web Profile renders the number, or "No followers yet." when absent/zero.
- **Pros:** uses the seam the deferral named; symmetric with the existing trust read (one mental model); honest-empty falls out of the seam contract; the count is a single, stable, trust-anchored number shown to everyone (incl. signed-out) read from the **house** vantage — consistent with the house community rating; no `#p` scan; additive (no existing behavior changes).
- **Cons:** adds a method to the interface → both implementers (Brainstorm, Fixture) must implement it (two, both small). A second 30382 read when both `weights` and `followers` are needed by the same caller (profile-stats only needs `followers`, so not a concern here; a shared read is a future optimization).

### Option B — Read the `followers` tag inside the existing `weights()` and return a richer record
Fold followers into the weights read.
- **Cons:** `weights()` returns `Map<hex, number>` (weights); widening its return is invasive and conflates two concerns; every weights caller pays for follower parsing it doesn't use. Rejected.

### Option C — A dedicated profile-stats relay read (bypass the trust seam)
Read 30382 directly in the API.
- **Cons:** duplicates the Brainstorm `/setup` + service-key + relay-union logic outside the trust package, breaking the seam boundary the architecture guards protect; the API would learn Brainstorm specifics. Rejected.

## Decision
We chose **Option A** — a `followers()` method on the `TrustProvider` seam, read from the **house** vantage, surfaced through the profile-stats endpoint.

It honors ADR 0023's named source (NIP-85 30382, no `#p` scan), keeps Brainstorm specifics inside the trust package, is symmetric with `weights()`, and gives a single honest trust-anchored count shown to every viewer.

**POV reconciliation (story open Q2):** the count is read from the **house observer** (`config.houseObserverPubkey`) — the same house vantage as the homepage shelves and the house community rating. It is therefore one stable number per profile, shown identically to signed-out and signed-in viewers, not a per-viewer tally. This is POV-first-honest: an explicit house-anchored count, never a claimed global truth.

## Consequences
- **Enables:** an accurate, bounded followers count on profiles; a reusable `followers()` seam for any future follower-aware surface.
- **Constrains:** the `TrustProvider` interface grows by one method — both implementers must satisfy it; a new implementer must too (documented in the interface).
- **Availability dependency (honest-empty until live):** the `30382:followers` value must actually be published by the Brainstorm backend for a pubkey. Until then `followers()` returns an empty map and every profile shows "No followers yet." — correct by construction. Lighting it up is an ops/source dependency (like #72's `PUBLIC_ORIGIN`), recorded in the book's Deploy/ops notes.
- **Affects existing fixtures?** The `FixtureSpec` gains an optional `followers` map (additive; existing fixtures omit it → empty). No event/data fixtures change.
- **New dependency?** No.
- **PRD section change required?** No. Implements §5.1/§6.

## Implementation notes
Concrete; the Implementer reads this.

**1. Trust seam** (`packages/trust`):
- `types.ts`: add to `TrustProvider`:
  `followers(observerHex: string, targetHexes: readonly string[]): Promise<Map<string, number>>` — "Best-effort, never throws; absent target = no datum (omit from the map); counts are non-negative integers." Add `readonly followers?: Readonly<Record<string, Readonly<Record<string, number>>>>` to `FixtureSpec` (`observerHex → targetHex → count`).
- `fixture.ts`: implement `followers()` mirroring `weights()` — return the configured count for each requested target the observer has a datum for (≥0 integers); absent → omitted.
- `brainstorm.ts`: implement `followers()` mirroring the `weights()` read path — resolve the observer service key via `/setup`, read `kind:30382` (`#d = targets`), parse the `followers` tag (`Number`, finite, `Math.max(0, Math.trunc(n))`); skip events without it; honest-empty on any failure; cache parallel to `#weights` (a `#followers` TTL map).
- `index.ts` (package barrel) needs no change beyond the type re-export already present.

**2. API** (`apps/api`):
- `profile-stats.ts`: add `readonly trust?: TrustProvider` to `ProfileStatsDeps`; add `followersCount?: number` to `Stats`. In the handler, when `deps.trust` and `config.houseObserverPubkey` are present, `const m = await deps.trust.followers(houseObserver, [targetHex]); const n = m.get(targetHex); if (typeof n === "number" && n > 0) stats.followersCount = n;` (omit on 0/absent → honest-empty). Never block the rest of stats on it (the seam never throws, but guard anyway).
- `index.ts`: pass `trust` into `buildProfileStatsRouter({ …, trust })`.

**3. Web** (`apps/web`):
- `lib/api.ts`: add `followersCount?: number` to the profile-stats type.
- `routes/Profile.tsx`: render the followers count beside the following count, labeled "followers" (singular "follower" at 1). When `!stats.followersCount` (undefined or 0) render the honest empty state text **"No followers yet."** (AC-3/AC-4). Tokens-only; no new hex; no-slop copy.

**4. AC-2 is structural:** the count comes only from `trust.followers` (the 30382 seam). The profile-stats route adds no `#p` filter and `NostrFilter` still has no `#p` wiring — no relay fan-out is introduced.

## Out of scope
- The list of *who* the followers are; per-viewer follower counts; real-time updates.
- Any change to `weights()`, the following count, or the kind-3 follow write.
- Standing up the Brainstorm backend that publishes the `followers` datum (availability dependency; honest-empty covers it).
