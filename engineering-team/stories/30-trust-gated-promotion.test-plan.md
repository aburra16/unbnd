# Test Plan: Story 30 — Trust-gated submission promotion (manual, with signals)

**Story:** `engineering-team/stories/30-trust-gated-promotion.md` (8 ACs)
**ADR:** `engineering-team/decisions/0031-trust-gated-promotion.md` (incl. the 2026-06-01 amendment: `submitted-by` provenance, `apps/promoter` worker, `CURATOR_THRESHOLD` default 0.5)
**Date:** 2026-06-01
**Branch:** `feat/submission-promotion`
**Posture:** failing tests only — NO production code. Fixture/DI-driven; no live relay, no Brainstorm, no real `LIBRARIAN_NSEC`.

## Approach

Every test is fixture/DI-driven and deterministic, mirroring how the Story 25 trust tests inject the `FixtureTrustProvider` and how the existing `submissions.test.ts` injects `sessionUser`/`publish`/`query`. No intra-module `vi.mock` on the API; web mocks `api`/`useSession` at the module boundary with role-scoped queries. No `Date.now` in any asserted output (ratings are signed at a fixed `created_at`; the worker signer is a deterministic stub). The gate is always computed from the HOUSE observer's vantage over the SESSION user's own weight (`weights(houseObserverHex, [sessionUserHex])`), the same seam Story 25 uses.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (emergent gate = session user's house-PoV weight ≥ threshold) | `above-threshold session user → enqueues once + 200`; `gate is the HOUSE vantage on the SESSION user's own weight … absent from the house weight map is below the gate` | `apps/api/test/routes/submissions-promote.test.ts` | integration (route + fixture trust) |
| AC-1 / AC-3 (server-enforced, not UI-hidden) | `below-threshold session user → 403 below_gate, server-enforced (NOT just UI-hidden), no enqueue`; `anon (no session) → 401, no enqueue` | `apps/api/test/routes/submissions-promote.test.ts` | integration |
| AC-2 (per-submission signals: count + identities + weighted average) | `surfaces curator rating COUNT, IDENTITIES (npubs), and the trust-WEIGHTED average`; `never leaks a raw GrapeRank number in the signals payload` | `apps/api/test/routes/submissions-signals.test.ts` | integration |
| AC-2 (web render of signals) | `renders the curator count and trust-weighted average when signals are present` | `apps/web/test/routes/community-submissions-promote.test.tsx` | component |
| AC-3 (manual curator-only Promote republishes a librarian-signed `books` record) | `signs a canonical record under the books header with d-tag = slug, source community, submitted-by the submitter (hex)`; `claims the pending job, signs with the librarian, publishes to local + dcosl, marks done` | `apps/promoter/test/{build,consume-loop}.test.ts` | unit + loop |
| AC-3 (web gated affordance) | `signed-out: shows NO Promote control`; `signed-in but below the gate: shows NO Promote control`; `above the gate: shows a Promote control`; `clicking Promote calls api.submissions.promote(slug) and shows 'Promotion queued'` | `apps/web/test/routes/community-submissions-promote.test.tsx` | component |
| AC-4 (promoted = first-class catalog record; below-bar stays in `/submissions`) | builder asserts the canonical `books`-header record with d-tag = slug so the existing catalog read paths pick it up with no special-casing (`builds a BookRecord under the librarian's books header`, `preserves the slug as the d-tag`); web `an already-promoted submission renders an in-catalog state` | `apps/promoter/test/build.test.ts`, `apps/web/.../community-submissions-promote.test.tsx` | unit + component |
| AC-5 (threshold configurable) | `a LOWER CURATOR_THRESHOLD lets a mid-weight user through`; `a HIGHER CURATOR_THRESHOLD rejects the same mid-weight user`; `a weight exactly AT the threshold clears the gate (≥, not >)`; signals: `lowering the threshold pulls a mid-weight rater into the curator count` | `apps/api/test/routes/submissions-promote.test.ts`, `apps/api/test/routes/submissions-signals.test.ts` | integration |
| AC-6 (honest degrade → gate closes / signals null) | promote: `no trust provider injected → 403`, `empty weights → 403`, `no house observer configured → 403`, `a throwing trust seam still closes the gate without surfacing a 500`; signals: `no above-threshold curators → signals: null`, `trust provider absent → signals: null`, `no house observer → signals: null`, `a throwing trust seam degrades to signals: null without a 500`; web: `renders the honest 'no trusted signal yet' state when signals is null` | `apps/api/test/routes/submissions-{promote,signals}.test.ts`, `apps/web/.../community-submissions-promote.test.tsx` | integration + component |
| AC-7 (idempotent double-promote) | enqueue: `second promote of the same slug → 200 {status:'already'}, no duplicate job`; worker: `re-running the same slug publishes under the SAME address (one canonical record, replace not duplicate)`, `a job already done is not re-signed`; web: in-catalog state | `apps/api/.../submissions-promote.test.ts`, `apps/promoter/test/consume-loop.test.ts` | integration + loop |
| AC-8 (built/verified against the fixture provider in CI; no Brainstorm leak) | the whole API suite runs with the `FixtureTrustProvider` and no relay; the ADR-0014 guard stays green (`apps/api/test/trust/architecture.test.ts`) | all of the above + existing guard | CI |
| Amendment — `submitted-by` provenance (additive `BookRecord` field) | `emits exactly one ['submitted-by', <hex>] tag when submittedBy is set, hex on the wire`; `emits NO submitted-by tag when submittedBy is unset (seeded-record shape preserved)`; payload null/hex; `round-trips submittedBy when set`; `yields no submittedBy for a record with no submitted-by tag` | `packages/schemas/test/BookRecord.test.ts` | unit |
| Gate decision 2 — `LIBRARIAN_NSEC` never on the API | `the string LIBRARIAN_NSEC appears nowhere under apps/api/src` | `apps/api/test/security/no-librarian-nsec-in-api.test.ts` | guard |
| **Remediation §3b — enriched `GET /api/submissions`: `canPromote` (USER-level, once)** | `above-gate session → canPromote:true, stamped identically on EVERY row`; `below-gate session → false`; `anon → false`; `canPromote is computed ONCE per request: trust.weights hit once, NOT once-per-row`; fail-closed (no provider / no observer / empty map / THROWING seam) → false, route still 200 (never 500) | `apps/api/test/routes/submissions-list-enriched.test.ts` | integration (REAL list route + fixture trust) |
| **Remediation §3b — enriched `GET /api/submissions`: `promotionStatus` (batched, one read)** | `each row reflects the injected readPromotionStatuses map; absent slug → null`; `readPromotionStatuses is called ONCE with the BATCH of listed slugs (not N times)`; `route still 200s when readPromotionStatuses is absent (status degrades to null)` | `apps/api/test/routes/submissions-list-enriched.test.ts` | integration |
| **Remediation §3b — enriched `GET /api/submissions`: `signals` (computed / honest null)** | `a row with an above-gate rater carries real computed signals; no raw GrapeRank leaks`; `a row with no trusted rater → signals: null`; `trust degrade (no provider) → signals: null on every row, route still 200` | `apps/api/test/routes/submissions-list-enriched.test.ts` | integration |
| **Remediation §6 — web mock sourced from the REAL list-response TYPE (closes the masking gap)** | the `list` mock + the row factory are typed against the real `SubmittedBook` (imported from `apps/web/src/lib/api.ts`) with the three Story-30 fields made REQUIRED, so a fixture that drops `canPromote`/`promotionStatus`/`signals` fails at the TYPE level (`tsc`), not silently renders nothing. Existing rendering assertions kept (Promote gated on `canPromote`; status/signals render) | `apps/web/test/routes/community-submissions-promote.test.tsx` | component (type-tied) |

## How specific hard requirements are asserted

- **Gate closes on degrade (AC-6):** four independent degrade modes each assert 403 + `enqueue` not called: (a) no `trust` dep injected, (b) `FixtureTrustProvider({weights:{}})` (empty map), (c) `houseObserverPubkey` unset, (d) a `trust.weights` stub that *throws* — the route must catch and close the gate, never surface a 500. The signals read mirrors all four → `signals: null`. This pins "weight resolves to 0 → gate closes; the seam never throws."
- **No `LIBRARIAN_NSEC` in the API (gate decision 2):** a guard test walks every `.ts/.tsx` under `apps/api/src` and asserts the literal string `LIBRARIAN_NSEC` appears in zero files. This is GREEN today and must stay green — it fails the moment Option B (API-held signer) is attempted. The worker (`apps/promoter`) is the only place the secret may live, and its tests use a deterministic FAKE signer, never a real nsec.
- **Worker idempotency (AC-7):** two guards. (1) The enqueue seam reports the `UNIQUE(slug)` collision as `{status:"already"}` → second `POST /promote` is 200 `already`, no duplicate job. (2) The consume-loop test runs the same slug twice and asserts both runs sign under the SAME `d`-tag (= slug) → the same `39999:<librarian>:<slug>` address → the relay keeps one canonical record (replace, not duplicate).
- **`submitted-by` tag (amendment):** the schema test asserts `toBookRecordEvent` emits exactly ONE `["submitted-by", <hex>]` tag when `submittedBy` is set (hex on the wire, not npub), and NO such tag when unset (so seeded records are byte-stable); `fromBookRecordEvent` round-trips it. The worker builder test asserts `mapSubmissionToCatalogRecord` sets `submittedBy` to the original submission event's author hex, and that the minted record carries the single hex tag.
- **No raw GrapeRank leak (CLAUDE.md):** a signals test serializes the `signals` payload and asserts the injected weight value (`0.9`) does not appear — only counts + identities + the weighted average (a rating-scale number) are surfaced.

## Edge cases covered

- [x] Weight exactly at the threshold (`≥`, not `>`).
- [x] Caller absent from the observer's weight map (treated as weight 0 → below gate).
- [x] Trust provider throws (route + signals must catch and degrade, not 500).
- [x] No house observer configured.
- [x] Double-promote (enqueue collision + same-address republish).
- [x] Worker: one job throws mid-run; the other still completes (`markFailed` once, `markDone` once).
- [x] Worker: publish failure → `markFailed`, no crash, retriable.
- [x] Schema: omitted `submittedBy` → no tag, payload null (seeded-record shape preserved).

## Test infrastructure

- Runner: Vitest (workspace default). API/promoter `test/**/*.test.ts` (node env); web `test/**/*.test.tsx` (happy-dom + Testing Library).
- **New test scaffolding (NOT production src):** `apps/promoter/{package.json,tsconfig.json,vitest.config.ts}` mirror the seeder's, so vitest can resolve `@unbnd/schemas`/`nostr-tools` for the worker tests. The worker `src/` is intentionally absent — its tests fail at import until the Implementer creates `apps/promoter/src/{build,index}.ts`.
- Trust: `FixtureTrustProvider` injected directly (no `TRUST_FIXTURE` env needed at the route-test level — the provider instance is the DI seam). House observer is a fixed test hex; curators are fixed hexes (gate tests) or `generateSecretKey()`-derived (signals tests, so the rater's event author hex matches the fixture weight key).
- No `docker compose up` dependency: every test is in-process with injected `query`/`publish`/`trust`/`enqueuePromotion`/queue-reader/signer/publisher.
- Web: `@testing-library/react`'s `fireEvent` (no new `user-event` dependency added). `api`, `useSession` mocked at the module boundary; role-scoped queries (`getByRole("button", {name:/promote/i})`).

## How to run

```
pnpm --filter @unbnd/schemas test
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/promoter test
pnpm --filter @unbnd/web test
pnpm -r test
```

## Migrated / affected existing tests

Enumerated by grep across the whole repo for the submissions route + components + `CommunitySubmissions` renders (Story 28/29 lesson):

```
apps/web/src/App.tsx                                  (route mount)
apps/web/src/lib/api.ts                               (api.submissions.*)
apps/web/src/routes/CommunitySubmissions.tsx          (the surface)
apps/web/src/routes/Submit.tsx, ProfileMe.tsx         (other submission consumers)
apps/api/src/routes/submissions.ts                    (the route)
apps/api/test/routes/submissions.test.ts              (existing route tests)
apps/api/test/submissions/template.test.ts            (template builder tests)
apps/web/test/routes/submissions-submitter-link.test.tsx (Story 24 submitter link)
apps/web/test/routes.smoke.test.tsx                   (mounts /submissions)
```

**No existing test required migration.** The new contract is purely additive at the seam:
- `apps/api/test/routes/submissions.test.ts` — its `makeApp` does not pass `trust`/`enqueuePromotion`; the existing write/list/mine routes don't consume them, so all 9 stay green. New gate/signals cases live in the NEW sibling files (`submissions-promote.test.ts`, `submissions-signals.test.ts`) so the existing file's protected behaviors are untouched.
- `apps/web/test/routes/submissions-submitter-link.test.tsx` (Story 24, 4 tests) — stays GREEN. My web suite preserves the "added by" credit (a dedicated test asserts it still renders alongside the new gate/signal surface), so the Implementer must keep the submitter link working.
- `apps/web/test/routes.smoke.test.tsx` — mounts `/submissions` signed-out with an empty list; the gate affordance is hidden, so it stays green. (Forward note: the Implementer should keep the smoke mock's `api.submissions` spread so `promote` exists when referenced.)

No moved assertions.

## Verification — confirmed RED for the right reasons

Confirmed 2026-06-01 at commit `e2007ff`. Failures are "feature not implemented," not test bugs:

**`@unbnd/schemas`** — `3 failed | 75 passed (78)`. The 3 reds are the `submittedBy`-set cases (tag emission, payload hex, round-trip); the unset/seeded-record cases PASS (additive/optional preserved). Existing 75 green.
```
× toBookRecordEvent — submitted-by provenance (Story 30) > emits exactly one ['submitted-by', <hex>] tag when submittedBy is set, hex on the wire
× toBookRecordEvent — submitted-by provenance (Story 30) > carries submittedBy through the wire payload as the hex when set
× fromBookRecordEvent — submitted-by round-trip (Story 30) > round-trips submittedBy when set
  → expected undefined to be "…2b" (the field/builder/reader don't exist yet)
```

**`@unbnd/api`** — `19 failed | 565 passed | 10 skipped`. All 19 reds are `expected 404 to be {200|401|403}` — the `POST /api/submissions/:slug/promote` route and `GET /api/submissions/:slug/signals` don't exist yet. The `no-librarian-nsec-in-api` guard PASSES (1/1, must stay green). All 565 pre-existing tests (incl. `submissions.test.ts`, the ADR-0014 architecture guard) stay green.
```
❯ test/routes/submissions-promote.test.ts (12 tests | 12 failed)   → 404 vs 200/401/403
❯ test/routes/submissions-signals.test.ts (7 tests | 7 failed)     → 404 vs 200
✓ test/security/no-librarian-nsec-in-api.test.ts (1 test)
```

**`@unbnd/promoter`** — `2 failed (2)` suites, 0 tests collected. Both files fail at import:
```
FAIL test/build.test.ts        → Failed to load url ../src/build … Does the file exist?
FAIL test/consume-loop.test.ts → Failed to load url ../src/index … Does the file exist?
```
This is the intended red: the worker app has no `src/` yet. The import paths match the ADR §7 planned layout (`apps/promoter/src/{build,index}.ts`). 5 builder + 8 loop = 13 worker tests are pending these modules.

**`@unbnd/web`** — `4 failed | 235 passed (239)`. The 4 reds are the affirmative gate/signal cases (Promote control shows above-gate; promote click → "Promotion queued"; signals count+average render; "no trusted signal yet" state). The 5 absence-assertions (no button when signed-out/below-gate; in-catalog hides button; "added by" still renders) PASS today. The Story-24 `submissions-submitter-link.test.tsx` stays GREEN (4/4).
```
FAIL community-submissions-promote.test.tsx > above the gate: shows a Promote control
FAIL community-submissions-promote.test.tsx > clicking Promote calls api.submissions.promote(slug) and shows 'Promotion queued'
FAIL community-submissions-promote.test.tsx > renders the curator count and trust-weighted average when signals are present
FAIL community-submissions-promote.test.tsx > renders the honest 'no trusted signal yet' state when signals is null
✓ submissions-submitter-link.test.tsx (4 tests)
```

## Remediation (2026-06-01) — the B1 masking gap: enriched `GET /api/submissions` contract

The original gate/queue/worker/signals tests above all passed once the Implementer landed
the `POST /promote` + `/:slug/signals` routes. But CHANGES_REQUESTED found Story 30 was **not
wired end-to-end**: the REAL `GET /api/submissions` list handler returns only the bare
`toSubmission` fields and **never produces** the `canPromote`/`promotionStatus`/`signals` the
web renders per row; the web tests masked it by feeding **pre-enriched, untyped mock rows**.
This remediation adds the **load-bearing real-list-endpoint test** + closes the web masking
gap. **Tests only — no production code.**

### New API test — the real list endpoint must enrich each row

`apps/api/test/routes/submissions-list-enriched.test.ts` (new, 14 tests) drives the REAL
`GET /api/submissions` handler via `buildSubmissionsRouter` with the fixture `TrustProvider`,
a fake `sessionUser`, a fake `query` (dispatches: list read on `#z:[book-submissions]` → the
submission events; per-row signals read on `#a:[39999:<lib>:<slug>]` → that slug's ratings),
and a **fake injected `readPromotionStatuses(slugs) => Promise<Map<slug,status>>`** — the new
batched DB seam (mirrors `enqueuePromotion`; not yet on `SubmissionsDeps`, which IS the gap).

**AC ↔ contract mapping (the three enriched fields):**
- **`canPromote` (AC-1/AC-3/AC-6)** — USER-level, computed ONCE from
  `weights(houseObserverHex,[sessionUserHex]) >= curatorThreshold` (same fail-closed degrade
  as the promote gate). `true` above-gate / `false` below / `false` anon / `false` on every
  degrade (no provider / no observer / empty map / THROWING seam), route still 200 (never
  500). **Stamped identically on every row.**
- **`promotionStatus` (AC-7)** — per row from the injected `readPromotionStatuses` map
  (`done`/`pending`/absent→null); the read is the SINGLE batched `WHERE slug = ANY(...)`.
- **`signals` (AC-2/AC-6)** — per row via `computeSubmissionSignals` from the house vantage
  (real `curatorRatingCount`/`curators`/`trustedAverage`), honest `null` when none/degraded;
  no raw GrapeRank weight on the wire.

**The two pinned anti-fanout assertions:**
- *canPromote computed once* — `vi.spyOn(trust,"weights")`; filter the spy's calls to those
  whose target array includes the session user's hex; assert that subset has length **1**
  (the user-level gate is resolved once, NOT once-per-row).
- *promotionStatus batched once* — `expect(readPromotionStatuses).toHaveBeenCalledTimes(1)`
  and the single call's `slugs` arg equals the page's listed slugs (sorted-equal), NOT N
  per-row calls.

### Web fix — type-tie the mock to the real list-response shape (closes the masking gap)

`apps/web/test/routes/community-submissions-promote.test.tsx`: imported the real
`SubmittedBook` type from `apps/web/src/lib/api.ts` and defined `ListSubmission = SubmittedBook
& { canPromote: boolean; promotionStatus: string | null; signals: SubmittedBook["signals"] }`
(the three Story-30 fields made **required**) + `ListResponse = { submissions: ListSubmission[]
}`. The row factory now returns `ListSubmission`, and every `listMock.mockResolvedValue(...)` is
wrapped in `resolveList(r: ListResponse): ListResponse`. **Why it now catches the contract:** the
shipped `SubmittedBook` carries the three fields *optional* (additive), so the old untyped
factory let a row silently omit them while the server never produced them — exactly the mask.
Requiring them in the test fixture makes a dropped server field a **`tsc` error**
(verified: deleting `canPromote` from the factory yields `TS2322: Type 'undefined' is not
assignable to type 'boolean'`), not a silent no-render. All existing rendering assertions are
kept (Promote gated on `canPromote`; status/signals render; "added by" credit). The web suite
stays GREEN (239) and `tsc --noEmit` is clean — the tightening is type-level, the runtime
behavior is unchanged.

### Confirmed RED for the right reasons (post-remediation, `pnpm -r test`)

`apps/api` — `11 failed | 587 passed | 10 skipped` — the 11 reds are ALL in the new
`submissions-list-enriched.test.ts`; the bare handler returns `canPromote`/`promotionStatus`/
`signals` as **undefined** and there is **no `readPromotionStatuses` seam**, so:
- `canPromote` asserts → `expected undefined to be true|false`,
- `promotionStatus` asserts → `expected undefined to be 'done'`; `expected "spy" to be called
  1 times, but got 0 times` (the seam is never wired/called),
- `signals` asserts → `Cannot read properties of undefined (reading 'curatorRatingCount')`.

Not test bugs — "field not produced / seam not wired." The 3 of 14 that PASS are the honest-
degrade `?? null` cases (no-provider signals→null; absent-seam status→null) the bare handler
satisfies trivially; they pin the degrade posture and go green when the seam lands too. All
587 other API tests stay green (incl. `submissions.test.ts`, `submissions-promote.test.ts`,
`submissions-signals.test.ts`, the ADR-0014 architecture guard, the `no-librarian-nsec-in-api`
guard). Other packages: schemas 78, promoter 11, seeder 12, indexer 6, search 11, web 239 —
all GREEN. API + web typecheck clean.

## Test file inventory

| File | New/Migrated | Tests |
|---|---|---|
| `packages/schemas/test/BookRecord.test.ts` | extended (new describe blocks added; existing kept) | +5 new (3 red, 2 green) |
| `apps/api/test/routes/submissions-promote.test.ts` | new | 12 (all red) |
| `apps/api/test/routes/submissions-signals.test.ts` | new | 7 (all red) |
| `apps/api/test/security/no-librarian-nsec-in-api.test.ts` | new (guard) | 1 (green, must-stay-green) |
| `apps/promoter/test/build.test.ts` | new | 5 (red — import) |
| `apps/promoter/test/consume-loop.test.ts` | new | 8 (red — import) |
| `apps/web/test/routes/community-submissions-promote.test.tsx` | new (now **type-tied** to the real `SubmittedBook` list shape — remediation) | 9 (4 red, 5 green) |
| `apps/promoter/{package.json,tsconfig.json,vitest.config.ts}` | new scaffolding (NOT prod src) | — |
| `apps/api/test/routes/submissions-list-enriched.test.ts` | **new (remediation §3b — the load-bearing real-list-endpoint test)** | 14 (11 red, 3 green) |

**New assertions added: 47** (across 7 test files). Reds at the original gate: 3 (schemas) + 19 (api) + 13 (promoter) + 4 (web) = 39.

**Remediation (2026-06-01) red gate:** 11 (api, all in `submissions-list-enriched.test.ts`) — the rest of the repo green; the web masking gap is closed by type-tying the mock to the real list-response shape (no new red, but a dropped server field is now a `tsc` failure).
