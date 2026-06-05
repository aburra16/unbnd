# Test Plan: Story 58 — Production librarian identity (adopt + secure) and the house-observer swap enablers

**Story:** `engineering-team/stories/58-production-librarian-identity.md`
**ADR:** `engineering-team/decisions/0057-production-librarian-identity.md`
**Date:** 2026-06-05

## Scope of the red set

This story's testable surface is the **pure builders** + the two **injected-deps cycles** of the new `apps/librarian` worker, plus one fold-in to the shared `@unbnd/relay` package. Per ADR 0057, everything that touches a key, relay, or Brainstorm is **injected**, so the cycles run with no real network and no real `LIBRARIAN_NSEC`. The GrapeRank trigger is exercised with a **mocked `TrustProvider`** (the worker takes it as a dep). Relay routing, ordering, fail-open, and config validation are all asserted off the injected deps.

The runbooks (secret-management, house-observer-swap), the compose service, `.env.production.example`, and `docs/DEPLOY.md` are **operator-observable / doc deliverables** (ADR §5, §Runbooks) — they are not unit-testable and are verified by Review, not by this red set. The ADR-0031 guard (`apps/api/test/security/no-librarian-nsec-in-api.test.ts`) is an **existing** test that must stay green; the new code lives under `apps/librarian/src`, outside its `apps/api/src` scan, so no new test is needed for it.

**Firewall:** every fixture uses **synthetic 64-hex** pubkeys (`"a".repeat(64)`, `"1".repeat(64)`, …). No real curator pubkey or name appears anywhere.

## Coverage map

Maps each acceptance criterion (story §Acceptance criteria) to the tests that pin it. Names pinned EXACTLY to ADR 0057's signatures, config keys, relay-routing rule, and GrapeRank-trigger sequence.

| Criterion (story) | Test name | Test file | Level |
|---|---|---|---|
| kind-3 builder: **exactly one `p` tag per seed curator**, deterministic, no I/O | `mergeSeedFollows — null existing kind-3 (first publish) > produces exactly one \`p\` tag per seed curator, in input order` | `apps/librarian/test/follows-template.test.ts` | unit |
| kind-3 builder: **merge-preserving** on re-run (mirror `follow-template.ts`) | `mergeSeedFollows — merge-preserving over an existing kind-3 > preserves every non-\`p\` tag verbatim …`; `> preserves an existing \`p\` tag's relay-hint / petname payload …`; `> does NOT add a duplicate when a seed is already followed …`; `> is idempotent: re-running with the merged result …` | `apps/librarian/test/follows-template.test.ts` | unit |
| kind-3 builder: deterministic / pure | `mergeSeedFollows — purity > does not mutate the input rawTags or its inner tag arrays`; `buildLibrarianKind3Template > builds a kind-3 … content preserved verbatim` | `apps/librarian/test/follows-template.test.ts` | unit |
| kind-0 builder: **valid kind-0 from config**, required `name`, deterministic | `buildLibrarianProfileContent — required name > sets both \`name\` and \`display_name\` …`; `buildLibrarianKind0Template > builds a kind-0 event with empty tags and the content as JSON`; `buildLibrarianProfileContent — purity / determinism > returns the same content …` | `apps/librarian/test/profile-content.test.ts` | unit |
| kind-0 builder: optional fields included only when present | `buildLibrarianProfileContent — optional fields > includes about / picture / nip05 only when present`; `> omits absent optionals entirely …`; `> omits an optional supplied as an empty string …` | `apps/librarian/test/profile-content.test.ts` | unit |
| kind-3 publish: **trust relays + general relays, NOT dcosl** (relay routing asserted) | `runFollowsCycle — relay routing > publishes the kind-3 to TRUST_RELAYS ∪ LIBRARIAN_GENERAL_RELAYS`; `> never targets dcosl with the kind-3 …`; `> publishes a kind-3 carrying one \`p\` tag per seed curator …` | `apps/librarian/test/follows-cycle.test.ts` | unit (injected deps) |
| GrapeRank trigger: `authChallenge`→sign kind-27235→`personalize`, **signed by the librarian**, mocked provider; **publish FIRST, then trigger** | `runFollowsCycle — ordering + GrapeRank trigger > publishes the kind-3 before triggering GrapeRank, in the right order`; `> signs the challenge with the librarian key and passes that signed event to personalize` | `apps/librarian/test/follows-cycle.test.ts` | unit (mocked TrustProvider) |
| GrapeRank trigger: **fail-open** (null challenge / throw / false → log + cycle still exits 0; kind-3 is the durable part) | `runFollowsCycle — GrapeRank trigger is FAIL-OPEN > a null challenge logs and the cycle still resolves`; `> a thrown personalize is swallowed …`; `> a personalize() === false is tolerated …` | `apps/librarian/test/follows-cycle.test.ts` | unit |
| kind-3 publish is the **durable** part — a publish failure errors so the operator re-runs (and the trigger does NOT run) | `runFollowsCycle — durable kind-3 publish failure > errors when the kind-3 fails to publish … (does NOT trigger GrapeRank)` | `apps/librarian/test/follows-cycle.test.ts` | unit |
| Config validation: empty/missing `SEED_CURATORS` is a hard error; non-`^[0-9a-f]{64}$` entries rejected | `runFollowsCycle — config validation > hard-errors on an empty seed-curator set`; `> hard-errors on a non-\`^[0-9a-f]{64}$\` seed entry`; plus `parseSeedCurators` unit cases | `apps/librarian/test/follows-cycle.test.ts`, `apps/librarian/test/env.test.ts` | unit |
| kind-0 publish: **dcosl + PROFILE_RELAYS** (relay routing asserted); the published event is the built kind-0 | `runProfileCycle — relay routing > publishes the kind-0 to dcosl unioned with the profile relays`; `> publishes a kind-0 event (not some other kind)`; `runProfileCycle — the published event is the built kind-0 > publishes exactly the signed kind-0 …` | `apps/librarian/test/profile-cycle.test.ts` | unit (injected deps) |
| kind-0 publish: required `LIBRARIAN_NAME` (missing → hard error) | `runProfileCycle — config validation > hard-errors when the profile name is missing/empty` | `apps/librarian/test/profile-cycle.test.ts` | unit |
| Config parsing: `SEED_CURATORS` CSV→hex[] with validation; relay CSV parsing; `LIBRARIAN_GENERAL_RELAYS` default list (no dcosl) | `parseSeedCurators — CSV of 64-hex pubkeys` (6 cases); `parseRelays — CSV of wss URLs with a fallback default` (2 cases); `DEFAULT_LIBRARIAN_GENERAL_RELAYS — ADR §2 default list (no dcosl)` (2 cases) | `apps/librarian/test/env.test.ts` | unit |
| No-slop: unit tests for the two pure builders + the GrapeRank trigger (mocked); `pnpm -r typecheck` / `pnpm -r test` green | the whole `apps/librarian/test/**` set + the existing suites stay green | all of the above | — |
| **Fold-in (ADR §relay-client RESOLVED):** `@unbnd/relay` `query` `REQ`-send guard — a `send` throw on the leading `REQ` **rejects** with a transport error and clears the timer (hardens the REQ path the librarian now exercises) | `connectRelay.query — REQ send throw is a transport reject (Story 58) > rejects the query with a transport Error and clears the pending timer` | `packages/relay/test/query.test.ts` | unit |

## Names / paths pinned from ADR 0057

Source modules the Implementer must create (the test imports pin these EXACTLY):

- `apps/librarian/src/follows-template.ts` — `mergeSeedFollows(rawTags: string[][] | null, seedCuratorHexes: readonly string[]): string[][]`; `buildLibrarianKind3Template(tags, content, createdAt): NostrEventTemplate` (ADR §3).
- `apps/librarian/src/profile-content.ts` — `buildLibrarianProfileContent({ name, about?, picture?, nip05? }): Record<string, unknown>`; `buildLibrarianKind0Template(content, createdAt): NostrEventTemplate` (ADR §3).
- `apps/librarian/src/follows-cycle.ts` — `runFollowsCycle(deps)`; `type FollowsDeps` (ADR §4, §Impl notes).
- `apps/librarian/src/profile-cycle.ts` — `runProfileCycle(deps)`; `type ProfileDeps` (ADR §4, §Impl notes).
- `apps/librarian/src/env.ts` — `parseSeedCurators(csv): string[]`; `parseRelays(csv, fallback): string[]`; `DEFAULT_LIBRARIAN_GENERAL_RELAYS` (ADR §2, §Impl notes).
- `apps/librarian/src/main.ts` — arg-dispatch `profile` / `follows` (ADR §1; not directly unit-tested — thin wiring, the cycles carry the logic).

Relay-routing rule pinned (ADR §2/§4): **kind-3 → `TRUST_RELAYS` ∪ `LIBRARIAN_GENERAL_RELAYS`, never dcosl**; **kind-0 → `DCOSL_RELAY_URL` ∪ `PROFILE_RELAYS`**. GrapeRank-trigger sequence pinned (ADR §4): publish kind-3 **first** → on confirmed publish → `trust.authChallenge(librarianHex)` → `finalizeEvent(challenge, sk)` (librarian-signed) → `trust.personalize(librarianHex, signed)`, fail-open.

### Deps shapes (pinned by the tests; the Implementer's `*-cycle.ts` must export matching types)

- `FollowsDeps`: `librarianPubkey`, `seedCurators: string[]`, `trustRelays: string[]`, `generalRelays: string[]`, `readExistingKind3(): Promise<{ tags; content } | null>`, `sign(template) → SignedNostrEvent`, `publish(event, relays) → Promise<PublishResult>`, `trust: TrustProvider`, `now()`.
- `ProfileDeps`: `librarianPubkey`, `profile: { name; about?; picture?; nip05? }`, `dcoslUrl: string`, `profileRelays: string[]`, `sign`, `publish(event, relays)`, `now()`.

The `publish(event, relays)` seam (event + the target relay set in one call) is the Tester's choice for asserting routing; the Implementer is free to realize it as a fan-out over `@unbnd/relay` connections as long as the recorded relay set matches.

## Edge cases covered

- [x] Empty seed list to the pure builder (`mergeSeedFollows(null, [])` → `[]`).
- [x] Empty / whitespace-only `SEED_CURATORS` → hard error (both `parseSeedCurators` and the cycle).
- [x] A non-hex / wrong-length / uppercase seed entry → rejected.
- [x] An already-followed seed → no duplicate `p` tag, existing payload intact (idempotent re-run).
- [x] kind-3 content preserved verbatim (legacy relay-list JSON not clobbered), `""` when none.
- [x] kind-0 optional supplied as empty string → omitted (no empty strings on the wire).
- [x] GrapeRank trigger fail-open on `null` challenge, a thrown `personalize`, and `personalize() === false`.
- [x] Durable kind-3 publish failure → cycle errors AND the trigger does not run.
- [x] `@unbnd/relay` `query`: a `REQ`-send transport throw rejects and leaks no timer.

## Edge cases deliberately NOT unit-tested (out of this red set)

- The secret-management + house-observer-swap **runbooks** and `.env.production.example` / `docs/DEPLOY.md` copy — doc deliverables, verified by Review against the quality bar (ADR §Runbooks, §5).
- The `docker-compose.prod.yml` `librarian` service + CI image build — ops wiring, verified by the deploy path, not a unit test (ADR §1).
- The ADR-0031 guard — an **existing** test (`apps/api/test/security/no-librarian-nsec-in-api.test.ts`) that stays green because the new code is under `apps/librarian/src`, outside its scan.
- Live Brainstorm / live relay round-trips — out of CI by design (mocked `TrustProvider`, injected `publish`).

## Test infrastructure

- Test runner: **Vitest** (workspace default). New tests live under `apps/librarian/test/**/*.test.ts` (scaffolded `package.json` / `tsconfig.json` / `vitest.config.ts` mirror `apps/promoter`); the `@unbnd/relay` fold-in is in `packages/relay/test/query.test.ts`.
- No live strfry / Neo4j / Brainstorm needed: every relay + key + provider dep is injected/mocked. No `docker compose up` prerequisite.
- Fixtures: inline synthetic 64-hex pubkeys only (firewall) — no fixture file, no real curator.

## How to run

```
pnpm --filter @unbnd/librarian test
pnpm --filter @unbnd/relay test
pnpm -r test
pnpm -r typecheck
```

## Verification

The new tests fail with the current code (no `apps/librarian/src` yet; the `@unbnd/relay` `query` `REQ` send is unguarded). Confirmed 2026-06-05 at commit `4987cb1`.

**`pnpm --filter @unbnd/librarian test`** — all 5 suites fail at module-resolution (the RIGHT reason: missing `src/*`, not a tsc/syntax wall):

```
 FAIL  test/env.test.ts — Failed to load url ../src/env. Does the file exist?
 FAIL  test/follows-cycle.test.ts — Failed to load url ../src/follows-cycle.
 FAIL  test/follows-template.test.ts — Failed to load url ../src/follows-template.
 FAIL  test/profile-content.test.ts — Failed to load url ../src/profile-content.
 FAIL  test/profile-cycle.test.ts — Failed to load url ../src/profile-cycle.
 Test Files  5 failed (5)
```

**`pnpm --filter @unbnd/relay test`** — the new query-guard case fails at the **assertion** level (the leaked timer), the other 17 stay green:

```
 ❯ test/query.test.ts (6 tests | 1 failed)
   × connectRelay.query — REQ send throw is a transport reject (Story 58)
     → expected 1 to be +0   // a timer was left pending after the reject
 Test Files  1 failed | 2 passed (3)
      Tests  1 failed | 17 passed (18)
```

**Existing suites stay green:** `@unbnd/promoter` (28), `@unbnd/seeder` (121), `@unbnd/api` (790 passed / 10 skipped — incl. the ADR-0031 guard), and the other two `@unbnd/relay` suites.

**`pnpm -r typecheck`:** every package is clean EXCEPT `apps/librarian`, whose only errors are the **expected** `TS2307: Cannot find module '../src/*'` (5 of them) — they clear the moment the Implementer writes `src/`. The `@unbnd/relay` query-guard addition typechecks. No other type errors exist in the red set (the cycle-deps mocks are typed to the pinned signatures).

## Hand-off

Test plan saved. Failing tests written at:
- `apps/librarian/test/follows-template.test.ts`
- `apps/librarian/test/profile-content.test.ts`
- `apps/librarian/test/follows-cycle.test.ts`
- `apps/librarian/test/profile-cycle.test.ts`
- `apps/librarian/test/env.test.ts`
- `packages/relay/test/query.test.ts` (added the `REQ`-send-guard case)

Plus the worker test harness scaffold (`apps/librarian/{package.json,tsconfig.json,vitest.config.ts,esbuild.config.mjs,Dockerfile}`). The `apps/librarian/src/*` modules are the Implementer's. Run `/implement-feature`.
