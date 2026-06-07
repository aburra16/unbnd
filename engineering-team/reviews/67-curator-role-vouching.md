# Review: Story 67 — Curator status by trusted-user vouching

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-06-06
**Diff:** `git diff main...HEAD` (commit `91b3bb3`)
**Story:** `engineering-team/stories/done/67-curator-role-vouching.md`
**Test plan:** `engineering-team/stories/done/67-curator-role-vouching.test-plan.md`

## Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck` — **pass** (exit 0, 12 packages).
- [x] `pnpm -r test` — **pass** (exit 0; `@unbnd/api` 903/10 skipped, `@unbnd/web` 334, `@unbnd/schemas` 153, `@unbnd/ui` 20 guards green).
- [x] `pnpm --filter @unbnd/web build` — **pass** (~0.6s).

## Spec adherence
- [x] Every acceptance criterion has a passing test. AC-1 (vouch assertion + no self-vouch): schema round-trip + route self-vouch reject. AC-2 (≥ N trusted): resolver count-gate (both sides of N) + route vouched case. AC-3 (badge): `curator-badge` component. AC-4 (dispute/untrusted lowers): resolver symmetric-dispute + below-floor cases. AC-5 (seed regardless): route seed case.
- [x] No behavior added beyond the story (the submit endpoint is the write mechanism the story needs; logged Deviation).

## ADR adherence (0066)
- [x] Clones the author-verified machinery exactly: `CuratorRoleAssertion` mirrors `AuthorVerifiedAssertion` (pubkey `#p` target, no `#a`), `computeCuratorStatus` mirrors `computeVerification` (≥N distinct above-floor asserters, self-excluded, latest-apply, one batched `weights` call, honest degrade). Curator = seed OR vouched OR emergent, as decided. `W` reuses `CURATOR_THRESHOLD`; `N` = new `CURATOR_VOUCH_MIN_ASSERTERS`; seed = new `CURATOR_SEED_PUBKEYS`.
- [x] No new dependency. Config knobs validated (int ≥ 1; hex allowlist).

## DList integrity
- [x] New concept `curator-roles` (kind-39998) + `CuratorRoleAssertion` (kind-39999) match the ADR. Per-(asserter, subject) replaceable d-tag. The librarian pubkey is resolved at runtime (`buildCuratorRolesHeaderAddress(asHexPubkey(config.librarianPubkey))`), never hardcoded.

## UI integrity
- [x] `CuratorBadge` is a neutral `@unbnd/ui` `Pill` (token-only, no hex, no new CSS). Copy "Curator" passes the no-slop rules. No raw GrapeRank/trust number on the wire — curator status is a boolean.

## Things tests can't catch
- [x] The write gate (`houseWeightOf`) degrades to 0 (gate closes) on any trust failure. Self-vouch is excluded **structurally in the resolver** (asserter ≠ subject) AND rejected at the template write — so even a crafted self-vouch is inert.
- [x] Sybil-resistant: below-floor / untrusted asserters carry no weight and cannot cross the bar (resolver test).
- [x] Seed allowlist is lowercased + 64-hex validated in config.
- [x] No secrets, no `console.log`, no commented-out code. POV-first: status resolved from the house vantage at read time, never stored.

## House rules check
- [x] PRD scope discipline, POV-first, no new tooling. The `LIBRARIAN_NSEC` is never touched (the asserter signs their own vouch; custodial via the existing ephemeral wrap).

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/api/src/routes/curator-roles.ts` (sovereign submit, ~line 200)** — the sovereign `POST /api/curator-roles` validates only `event.pubkey === user.pubkeyHex`, not the event *shape* (that it is a well-formed `curator-roles` assertion targeting a non-self subject), where author-verified uses a dedicated `validateSignedAuthorVerified`. This is **not** a correctness or security hole — the count-gate resolver independently drops self / malformed / untrusted assertions, so no invalid curator status can result. Optional: add a `validateSignedCuratorRole` for defense-in-depth and to avoid publishing junk events. Suitable as a small follow-up or to fold into #68.
2. **Three Profile route test mocks** gained `curatorStatus` (the badge fetches unconditionally) — logged Deviation, correct maintenance.
3. **Submit endpoint** beyond the tested template/status — the write mechanism the story requires; logged Deviation.

## Verdict
**PASS** — the diff matches the story, ADR 0066, and the test plan; all gates clean; no blocking issues. Mergeable as-is.
