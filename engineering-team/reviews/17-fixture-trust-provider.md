# Review: Story 17 — Fixture TrustProvider + staging seed harness

**Reviewer:** Claude (acting as Reviewer — independent retroactive review)
**Date:** 2026-05-30
**Diff:** `git diff b4745ea^ b4745ea` (commit `b4745ea`, PR #50)
**Story:** `engineering-team/stories/done/17-fixture-trust-provider.md`
**ADR:** `engineering-team/decisions/0017-fixture-trust-provider.md`

> **Retroactive review.** Story 17 was authored, implemented, ADR'd, tested, and
> self-reviewed by a single agent in one pass and merged to `main` without going
> through the isolated per-phase subagents or per-phase gates. This file is the
> independent Reviewer guardrail applied after the fact. The prior contents of
> this review file were self-authored claims; they have been discarded and
> re-verified here from scratch. See "Process gaps" below.

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 6 projects clean (schemas, search, api,
  indexer, seeder, web). No errors.
- [x] `pnpm -r test` — **PASS.** api 261 passed / 10 skipped (the 9 DB integration
  tests + 1, all env-gated); web 64; schemas 64; search 11; seeder 12; indexer 6.
  Zero failures. (`apps/web` ECONNREFUSED:3000 stderr noise is a pre-existing
  mocked-fetch log in the route smoke test, not a failure — that file passes.)
  - Trust-specific confirmation: `test/trust/fixture.test.ts` (9 tests) pass,
    `test/trust/architecture.test.ts` (1 test) passes, `test/config.test.ts`
    (32 tests) pass.
- [x] `pnpm --filter @unbnd/web build` — **N/A.** No change under `apps/web`; the
  diff is api source + tests + docs only. Build gate not required per workflow.
- [x] _Lint not configured — skipped._

## Spec adherence

Each acceptance criterion (story §"Acceptance criteria") verified against real
coverage, not the author's word:

1. **Full interface, deterministic** — `apps/api/src/trust/fixture.ts`
   implements all four `TrustProvider` members (`weights`, `hasScores`,
   `authChallenge`, `personalize`) plus `name`. No `Date`, no `Math.random`, no
   network import. Covered by `fixture.test.ts` lines 20–82. **PASS.**
2. **`TRUST_PROVIDER` selects (default brainstorm); `TRUST_FIXTURE` required +
   validated when fixture** — `config.ts:172` defaults to `brainstorm`;
   `config.ts:173-178` rejects unknown values; `config.ts:181-199` requires +
   parses + shape-validates `TRUST_FIXTURE` only on the fixture path. Covered by
   `config.test.ts:185-223` (default, unknown, select, missing, bad-JSON,
   missing-weights — 6 cases). **PASS.**
3. **`resolveTrustProvider` builds fixture; brainstorm path unchanged** —
   `trust/index.ts:14-23`: the `brainstorm` arm is byte-for-byte unchanged; a
   `fixture` arm is added; the exhaustiveness sentinel is correctly tightened to
   `const exhaustive: never = opts` (full union narrowing, not just `.provider`).
   Covered by `fixture.test.ts:84-88`. **PASS.**
4. **Architecture guard still green** — `test/trust/architecture.test.ts` passes
   (1 test). I independently grepped `apps/api/src/trust/fixture.ts` for the
   forbidden patterns (`/setup/`, `/authChallenge`, `/user/graperank`,
   `graperankResult`, `30382`): **none present.** The guard walks the whole repo
   minus the adapter, so it does cover `fixture.ts`. **PASS.**
5. **CI test drives a trust-consuming feature with deterministic weighted-vs-raw
   divergence** — `fixture.test.ts:91-115` runs the real `weightedRatings` +
   `rawFromParsed` from `src/ratings/summary.ts` (not a re-implementation) against
   fixture weights. Math independently checked: trusted A(0.9, score 5), B(0.3,
   score 3) → (0.9·5 + 0.3·3)/(0.9+0.3) = 5.4/1.2 = **4.5**; C untrusted →
   excluded; raw = (5+3+1)/3 = **3.0**. Assertions (`4.5`, `trustedCount 2`,
   `≠ raw`) are correct. **PASS.**
6. **`ops/trust-seed-harness.md` documents both modes** — Mode A (fixture,
   deterministic) and Mode B (real Brainstorm/GrapeRank) both documented with
   exact env, restart, and observe steps. Keeps operator seed keys out of the
   repo. **PASS.**

- [x] Every acceptance criterion has a passing test (criteria 1–5) or a concrete
  artifact (criterion 6).
- [x] No criterion silently dropped.
- [x] No behavior added beyond the story. The consuming features are untouched;
  `index.ts` wiring change is the minimum required by the union.

## ADR adherence

- [x] Files match ADR 0017's implementation notes: `trust/types.ts` (union +
  `FixtureSpec`), `trust/fixture.ts` (provider), `trust/index.ts` (resolver),
  `config.ts` (`TRUST_PROVIDER`/`TRUST_FIXTURE`), `index.ts` (wiring),
  `ops/trust-seed-harness.md`.
- [x] `TrustOptions` is the discriminated union the ADR specifies; `FixtureSpec`
  matches the documented shape (`weights`, optional `scoredObservers`,
  `challenge`, `personalizeOk`).
- [x] Layering respected: trust stays in `apps/api/src/trust`; no cross-import
  into `apps/web`; the fixture imports only the neutral types + a schemas type.
- [x] No new runtime dependencies. `nostr-tools/nip19` (used in the test for
  `npubEncode`) is already a dependency.
- [x] DEFAULT behavior unchanged: with no env set, `trustProvider` is
  `brainstorm` and `index.ts:227-238` enables trust only when a house observer is
  set; fixture path is reachable only with `TRUST_PROVIDER=fixture` **and** a
  valid `TRUST_FIXTURE`. Staging/prod unaffected until explicitly switched.

## DList integrity

- [x] N/A — the diff touches no event kinds, d-tags, or word-wrapper shapes. The
  fixture deals only with hex pubkeys and numeric weights.

## UI integrity

- [x] N/A — no change under `apps/web`.

## Things tests can't catch

- [x] No secrets committed. `.env.production.example` adds only commented
  placeholders; the harness doc explicitly says to keep operator seed keys out of
  the repo and treat them like the librarian nsec.
- [x] No leftover debug logging / `console.log` in the added lines.
- [x] No commented-out code.
- [x] Edge cases handled: weights clamp to `(0,1]` (`fixture.ts:36`, tested),
  unknown observer → empty map (tested), untrusted target absent (tested),
  `challenge` undefined-vs-null distinction handled correctly
  (`fixture.ts:43-45`, tested for all three states), `personalizeOk:false`
  short-circuits before mutating the scored set (`fixture.ts:51`, tested).
- [x] Concurrency: the fixture is in-process and synchronous under the async
  signatures; `personalize` mutates a `Set` but there is no shared-state race of
  concern for a deterministic CI/seed provider. Acceptable.
- [x] Security / input validation: `TRUST_FIXTURE` is parsed inside try/catch and
  shape-checked (`typeof === "object"`, non-null, has `weights` object) before the
  cast (`config.ts:188-198`). Fail-fast at boot. No injection surface.
- [x] `noUnusedParameters`: the unused `_signedChallenge` is underscore-prefixed
  (`fixture.ts:48`); typecheck confirms.

## House rules check

- [x] **No fake trust numbers.** The fixture is a *test/seed* weight source behind
  the same seam as the live provider; it is never presented to users as real
  GrapeRank, and it is opt-in via env. The consuming `weightedRatings` still
  returns honest `null` when no rater is trusted. Compliant.
- [x] **No hand-rolled crypto.** None added. `personalize` accepts a
  `SignedNostrEvent` but does no crypto (deterministic stub). `npubEncode` is from
  `nostr-tools`.
- [x] **npub for display / hex internal.** `FixtureSpec` and the provider operate
  on hex pubkeys (internal); the keystone test passes `npubEncode(O)` as the
  display observer into `weightedRatings`, consistent with `summary.ts`. Compliant.
- [x] **No new lint/build/typecheck tooling** introduced. None.
- [x] **Scope discipline.** Nothing from PRD §11.3 sneaks in. No new consuming
  features added (explicitly out of scope per the story). Diff is tightly scoped
  to the seam + config + docs + the 9 mechanical fixture edits.
- [x] **POV-first.** The change strengthens POV-dependence (per-observer weights);
  it does not assert a global truth.

## Process gaps (recorded, non-blocking to the code verdict)

These are process findings about how Story 17 was run, not defects in the diff:

1. **No test-plan artifact.** There is no
   `engineering-team/stories/17-fixture-trust-provider.test-plan.md` (nor in
   `done/`). The workflow's Phase 4/5 expect a test plan to review coverage
   against. Coverage was instead audited directly against the story's acceptance
   criteria (above), which it satisfies. Recommend backfilling a test-plan or
   formally waiving it for foundation/seam stories.
2. **Not run through isolated subagents / per-phase gates.** The same agent
   authored the story, ADR, tests, code, and the original (self-authored) review
   in one pass, then merged to `main`. That bypassed the independent-Reviewer gate
   this file now supplies. The merged code holds up under independent audit, but
   the process control was absent at merge time.

## Findings

### Blocking
None.

### Non-blocking
1. **`ops/trust-seed-harness.md` Mode A step 4** — narrative says raw "≈3.7"
   while step 1 describes R1=5, R2=5, U=1 (mean 3.67). Internally consistent;
   the "≈" is fine. No change required.
2. **`fixture.ts:36`** — weight clamp uses `Math.min(1, w)` with a lower bound of
   `> 0` from the guard, so the documented `(0,1]` range holds. A spec weight of
   exactly `0` is treated as "not trusted" (absent), matching the doc comment.
   Behavior is correct and tested; noting for clarity only.

## Verdict
**PASS**

The diff fully satisfies acceptance criteria 1–6, conforms to ADR 0017, keeps the
ADR 0014 architecture guard green, preserves the default `brainstorm` behavior,
and introduces no scope creep, secrets, or house-rule breaches. Both quality gates
are clean. The two findings are non-blocking. The process gaps above are recorded
as guardrail observations, not code defects.
