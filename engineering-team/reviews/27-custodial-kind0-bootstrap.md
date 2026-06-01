# Review: Story 27 — Custodial kind-0 bootstrap (publish a name-bearing profile at signup)

**Reviewer:** Claude (acting as independent Reviewer — did not write the code or tests)
**Date:** 2026-05-31
**Diff:** `git diff main...feat/custodial-kind0-bootstrap`
**Story:** `engineering-team/stories/done/27-custodial-kind0-bootstrap.md` (7 active ACs: 1-5, 7, 8; AC-6 rename deferred to Story 27b)
**ADR:** `engineering-team/decisions/0027-custodial-kind0-bootstrap.md` (amended at `0eb7241` — AC-6 split to 27b)
**Test plan:** `engineering-team/stories/done/27-custodial-kind0-bootstrap.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** All 6 projects clean (schemas, search, indexer, seeder, api, web).
- [x] `pnpm -r test` — **PASS.** api **545 passed / 10 skipped**, web 161, schemas 72, search 11, seeder 12, indexer 6. Zero failures. The +39 new Story-27 unit tests (4 new files) + 3 appended AC-7 substack cases land green; the RED baseline was 506. The 10 skips are pre-existing infra-gated integration suites (`db/integration` ×9 needs `DATABASE_URL`, `nostr/integration` ×1) — they hide no story work.
- [x] `pnpm --filter @unbnd/web build` + api `tsc` build — **PASS.**

## index.ts hoist verification (the highest-risk item)
The Implementer hoisted `localPublish`/`publish`/`publishKind0`/`custodialSign` above `buildAuthRouter` and removed the duplicate definitions. Verified safe + behavior-preserving:
- **Byte-equivalent:** hoisted consts identical to the deleted ones (same relay sets, dcosl up-sync split, local-first kind-0 + profile-relay fan-out, never dcosl). Only delta is a clarifying comment.
- **No TDZ / use-before-init:** hoisted consts depend only on module imports + `config` (defined above the hoist).
- **Same instance downstream:** `userEventDeps.publish`/`custodialSign` and every router (substack/follow/trust/ratings/tags/shelves/submissions) bind the hoisted consts; no duplicate definitions remain.
- **No double/dropped router registration.**
- **Ordering:** signup bootstrap runs after the DB commit + session-key wrap, before the 201 return, in try/catch; login reconcile guarded `if (row.tier === "custodial")`, best-effort.

## Privacy proof (AC-3 — load-bearing)
Email is structurally walled off. Signup `input` is `{email, password, displayName}` but the wiring passes only `displayName` (+ `sessionIdHex`) to `bootstrapCustodialKind0`. `buildProfileKind0Content` copies patch keys ONLY from the closed `PROFILE_KIND0_FIELDS` whitelist (no email/password/userId/token), maps `displayName`→`name`+`display_name`, emits `tags:[]`. No rawPrev-passthrough, spread, or tag leak path. The AC-3 test serializes the signed event and asserts the email/password/sessionId strings are absent.

## Spec adherence (7 active ACs)
- [x] **AC-1** — signup publishes a name-bearing kind-0 (`kind:0`, author pubkey, `name==display_name==D`), signed via injected `custodialSign`, published via `publishKind0` (local-first, profile-relay fan-out, never dcosl).
- [x] **AC-2** — `GET /api/profile/:npub` runs the real `parseKind0` over the bootstrapped event → name resolves to `D` (no npub-initials fallback).
- [x] **AC-3** — privacy whitelist + whole-event no-email assertion (proof above).
- [x] **AC-4** — fail-open: throwing/rejecting publisher, null sign, or throwing sign never rolls back the account, never fails signup, logged-and-swallowed; bootstrap runs outside the DB transaction; never publishes on a null/throw sign.
- [x] **AC-5** — reconcile on login: missing/name-less → publish with `created_at = max(now, fetched+1)`; good name present → idempotent no-op (no sign/publish); all failures swallowed; never blocks login. `hasResolvableName` treats empty/whitespace as missing.
- [x] **AC-7** — `nameFloor` supplies the name only when neither rawPrev nor patch has a non-empty name (never clobbers an existing relay name); the Substack-first write now carries name AND substack/website; pre-existing substack-template behavior preserved (+3 additive cases, originals intact).
- [x] **AC-8** — sovereign path untouched (production guard `if (row.tier === "custodial")`; no kind-0 published on their behalf; sovereign auth/profile tests green).

## Findings

### Blocking
None.

### Non-blocking
1. **AC-8 is verified by code-read + contract test, not an executable wiring test** (`resolve-after-bootstrap.test.ts`). `runAuthSideEffect` mirrors the index.ts tier guard rather than exercising the real wiring — the documented, ADR-endorsed consequence of the auth deps not being unit-testable. The production guard is real and was verified by source-read. Acceptable.
2. **`PublishOutcome` type-widening is sound, not a regression** (`bootstrap-kind0.ts`). Byte-identical to the deliberately-loose `Publisher` return type in `publish.ts`; the narrow `PublishResult` is assignable; helpers read only `.ok`/`.reason`. Typecheck confirms.

## Scope / firewall / quality
27b rename surface genuinely NOT built (no `profile-display-name.ts`, no `updateDisplayName`, no Settings field). No UI files touched. No business/grant/community content. No hand-rolled crypto (sign via `custodialSign`→`useSessionKey`→`finalizeEvent`). No debug code, secrets, or hardcoded hex/npub. `console.warn` calls log only `reason`/generic error, never key material or template content. Tests deterministic (injected clock + publisher + fetcher; real `nostr-tools/pure` signing; no `Date.now()` in asserted output; no intra-module `vi.mock`). The one existing test touched (`substack-template.test.ts`) is +37/−0 — pure extension.

## Verdict
**APPROVED**
