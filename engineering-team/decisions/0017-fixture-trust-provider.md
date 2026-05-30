# ADR 0017: Fixture TrustProvider + staging seed harness

**Status:** Accepted
**Date:** 2026-05-30
**Story:** `engineering-team/stories/done/17-fixture-trust-provider.md`

## Context

The `TrustProvider` seam (ADR 0014) abstracts the trust-score source behind a
neutral interface (`weights`, `hasScores`, `authChallenge`, `personalize`), with
`BrainstormProvider` as the only backend-aware file and a repo-wide architecture
guard enforcing that. Phase 2 layers many features on this seam, but their real
signal depends on community activity that doesn't exist yet (the live house
observer trusts none of our seeded raters). Building those features against the
live provider means building against an empty engine: nothing to assert, nothing
to demo.

We need a way to build and verify every trust-consuming feature deterministically
— no Brainstorm round-trip, no relays, no recruited users — while keeping the
production path unchanged and the architecture guard intact.

## Decision

### A second provider behind the existing seam: `fixture`

- `TrustProviderName` becomes `"brainstorm" | "fixture"`.
- `TrustOptions` becomes a discriminated union so each provider carries only the
  config it needs:
  - `{ provider: "brainstorm"; apiUrl; relays }` (unchanged)
  - `{ provider: "fixture"; fixture: FixtureSpec }`
- `FixtureTrustProvider` (`apps/api/src/trust/fixture.ts`) implements the full
  interface from a plain, deterministic spec:
  ```ts
  type FixtureSpec = {
    weights: Record<observerHex, Record<targetHex, number /*0..1*/>>;
    scoredObservers?: string[];   // hasScores() set; defaults to observers with weights
    challenge?: string | null;    // authChallenge(); undefined => deterministic default
    personalizeOk?: boolean;      // personalize() result; default true
  };
  ```
  - `weights(o, targets)` returns the configured weights for `targets` present in
    `spec.weights[o]` (clamped to (0,1]); unknown targets/observers are absent —
    matching the Brainstorm semantics ("targets the observer doesn't trust are
    absent").
  - `hasScores(o)` is membership in the scored set.
  - `authChallenge(o)` returns the canned challenge or a deterministic
    `fixture-challenge:<o>`.
  - `personalize(o)` returns `personalizeOk` and, on success, marks `o` scored
    (mirrors a real run making the observer scored afterward).
  - No network, no time, no randomness → fully deterministic.

### Config selection (mirrors `SEARCH_PROVIDER`)

- `TRUST_PROVIDER` ∈ {`brainstorm` (default), `fixture`} → `config.trustProvider`.
- `TRUST_FIXTURE` (JSON `FixtureSpec`) → `config.trustFixture`; **required and
  validated** when `TRUST_PROVIDER=fixture` (fail fast on missing/invalid JSON or
  a missing `weights` map). Ignored otherwise.
- `resolveTrustProvider` switches on the union; the app enables trust when a house
  observer is set and the chosen provider is configured (fixture needs
  `trustFixture`; brainstorm needs `apiUrl` + `relays`, as before).

### Architecture guard

The ADR 0014 guard (Brainstorm/NIP-85 specifics — `/setup/`, `/authChallenge`,
`/user/graperank`, `graperankResult`, kind `30382` — only in `brainstorm.ts`)
stays as-is. The fixture introduces none of these, so it passes unchanged. The
provider *name* and config live at the seam, which the guard already permits.

### Staging seed harness (`ops/trust-seed-harness.md`)

Two documented ways to produce a reproducible House↔Yours divergence on staging:
- **Fixture mode** (deterministic, no external dependency): set
  `TRUST_PROVIDER=fixture` + a `TRUST_FIXTURE` giving the house observer weights
  over a few seed rater pubkeys. The weighted view diverges from raw instantly
  and reproducibly. Best for demos and smoke checks.
- **Real mode** (end-to-end): the librarian follows operator-owned seed keys
  (kind-3), those keys publish ratings on a known book subset, GrapeRank is
  triggered, and the live Brainstorm provider produces a real divergence.

## Consequences

- Every trust-consuming feature (weighted display, promotion signals, accusatory
  gate, search re-ranking, personalization, shelves) can now be built and unit/
  integration-tested in CI against known weights. Production signal later flips in
  via config through the identical code paths.
- The seam gains a second implementation, proving the abstraction (as the
  Meili/Vespa search seam does) and de-risking a future trust-source change.
- Staging can demonstrate the value proposition (House↔Yours) on demand without
  recruiting users.
- Minor surface change: `TrustOptions` is now a union and `TrustProviderName`
  has a second member. The only `resolveTrustProvider` caller (app wiring) and
  the config are updated; the consuming features are untouched.

## Alternatives considered

- **A throwaway mock per test** instead of a first-class provider: rejected — it
  wouldn't be config-selectable for staging demos, wouldn't exercise the resolver/
  config seam, and would drift per test.
- **Compose-time/relay fixtures (seed a fake nip85 relay)**: heavier, slower,
  non-deterministic, and still couples tests to Brainstorm specifics.
- **`TrustOptions` with optional fields** instead of a union: less type-safe; the
  union makes each provider's required config explicit.
