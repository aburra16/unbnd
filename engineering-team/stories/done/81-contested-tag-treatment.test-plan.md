# Test Plan: Story 81 — Contested-tag treatment

**Story:** `engineering-team/stories/81-contested-tag-treatment.md`
**ADR:** `engineering-team/decisions/0079-contested-tag-treatment.md`
**Date:** 2026-06-09

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (trusted net-disputed → contested; counts unchanged) | `trusted net-disputed → contested: true …` | `apps/api/test/tags/aggregate-contested.test.ts` | unit |
| AC-1 (the ADR's tie rule) | `a trusted TIE is contested …` | same | unit |
| AC-2 (net-applied → omitted, not false) | `trusted net-applied → the contested key is OMITTED` | same | unit |
| AC-3 (raw view never; untrusted can't flip) | the raw-view + untrusted-volume tests | same | unit |
| AC-4 (no collision with revealed/gated) | `an accusatory tag never carries contested …` (revealed + trusted-net-disputed) | same | unit |
| AC-1/AC-4 web treatment (struck, labelled, count suppressed, precedence over community) | the 2 `GenrePill` tests | `apps/web/test/components/contested-chips.test.tsx` | component |
| Both chip surfaces pass through | the `BookHeader` + `TagControl` tests | same | component |
| AC-5 (surfacing/wire unchanged) | structural: additive optional flag (omitted unless true); every existing aggregate/route/web suite passes unmodified | — | regression |

## Edge cases
- [x] Tie = contested (the ADR's deliberate `>=`); net-applied omits the key entirely (fixture-stability, the revealed/gated pattern).
- [x] Heavy RAW disputes with no trust → never contested; untrusted dispute volume against a trusted apply → never contested.
- [x] A revealed accusatory tag that IS trusted-net-disputed still never carries contested (`!accusatory` by construction).
- [x] Pill precedence: `contested` beats `community`; a plain pill (and its count) renders exactly as today.

## Test infrastructure
- Vitest. Aggregate: the existing assertion-event fixture pattern + `FixtureTrustProvider` weights (deterministic, no network). Web: jsdom render of `GenrePill` (direct) + `BookHeader`/`TagControl` with mocked session/api.
- Stubs (red): `contested?` added to the api/web `TagConsensus` types and the Pill genre props (accepted, ignored) — typecheck-clean; the set fails on assertions.

## How to run
```
pnpm --filter @unbnd/api exec vitest run test/tags/aggregate-contested.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/contested-chips.test.tsx
pnpm -r typecheck
```

## Verification
Confirmed red 2026-06-09: api `(6 tests | 2 failed)` (the omitted/never cases pass as negative space against today's code), web `(4 tests | 4 failed)`. `pnpm -r typecheck` clean; no regressions in the existing suites.
