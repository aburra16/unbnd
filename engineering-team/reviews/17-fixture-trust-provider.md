# Review — Story 17: Fixture TrustProvider + staging seed harness

**ADR:** 0017. **Verdict:** approved.

## Acceptance criteria
- [x] `FixtureTrustProvider` implements the full `TrustProvider` interface from a
  deterministic spec (`apps/api/src/trust/fixture.ts`). No network/time/randomness.
- [x] `TRUST_PROVIDER` selects the backend (default `brainstorm`); `TRUST_FIXTURE`
  supplies + validates the spec when `fixture` is chosen (fail-fast on missing/
  invalid JSON or a missing `weights` map). Mirrors `SEARCH_PROVIDER`.
- [x] `resolveTrustProvider` builds the fixture provider; `TrustOptions` is now a
  discriminated union so each provider declares only the config it needs. The
  single caller (app wiring) updated; consuming features untouched.
- [x] ADR 0014 architecture guard still green — the fixture introduces no
  Brainstorm/NIP-85 specifics (`test/trust/architecture.test.ts` passes).
- [x] Trust-consuming feature verified against the fixture in CI:
  `weightedRatings` over fixture weights yields a deterministic 4.5 vs raw 3.0,
  with the untrusted rater excluded (`test/trust/fixture.test.ts`).
- [x] `ops/trust-seed-harness.md` documents fixture mode (deterministic) and real
  mode (Brainstorm) for reproducing a House↔Yours divergence on staging.

## Checks
- `pnpm -r typecheck` clean; `pnpm -r test` green (api 261, web 64, schemas 64,
  search 11, seeder 12, indexer 6); both architecture guards pass.
- Config-fixture fallout from the new required `Config.trustProvider` fixed across
  9 API test fixtures (set `trustProvider: "brainstorm"`, matching the existing
  required `searchProvider` convention).
- `noUnusedParameters` respected (`_signedChallenge` in the fixture).

## Notes / follow-ups
- The fixture deliberately keeps `personalize()` flipping the observer to "scored"
  to mirror real post-run behavior; documented in the ADR.
- No live behavior changes: default remains `brainstorm`, so staging/prod are
  unaffected until `TRUST_PROVIDER=fixture` is set.
