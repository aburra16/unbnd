# Test Plan: Story 26 — Custodial personalization (the server-signed "Personalize" trigger)

**Story:** `engineering-team/stories/done/26-custodial-personalization.md`
**ADR:** `engineering-team/decisions/0026-custodial-personalization.md` (AMENDED — `authChallenge` returns a TEMPLATE; the seam moved behind the provider; the guard gains `brainstorm_login`)
**Date:** 2026-05-31

All new tests are deterministic via the `FixtureTrustProvider`, injected as the route `trust` dep (no Brainstorm, no relays, no `vi.mock` of intra-module internals). The new route deps (`config`, `followCount`, `custodialSign`) are injected and mocked.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 custodial happy path | `server-signs the fixture template, calls personalize, returns { ok, building }` | `apps/api/test/routes/trust-custodial.test.ts` | route |
| AC-1 (errors) | `502 challenge_failed when the provider cannot issue a template` / `502 trigger_failed when the provider declines to queue the run` | `apps/api/test/routes/trust-custodial.test.ts` | route |
| AC-2 status eligibility | `canPersonalize:true at/above the gate` / `canPersonalize:false below the gate` / `hasScores reflects whether the user's calc has landed` | `apps/api/test/routes/trust-custodial.test.ts` | route |
| AC-2 (challenge relax) | `GET /api/trust/challenge — custodial template … returns the server-built kind-27235 TEMPLATE … at/above the gate` | `apps/api/test/routes/trust-custodial.test.ts` | route |
| AC-3 reauth | `401 reauth_required when the wrap is gone; personalize NOT called` | `apps/api/test/routes/trust-custodial.test.ts` | route |
| AC-4 follow gate (server) | `403 below_follow_gate below the threshold; does not sign or personalize` / `at the threshold the trigger is allowed (200)` / `GET …/challenge … 403 below_follow_gate below the threshold` | `apps/api/test/routes/trust-custodial.test.ts` | route |
| AC-4 follow gate (config) | `PERSONALIZE_MIN_FOLLOWS (ADR 0026)` — defaults to 10 / numeric override / throws on garbage | `apps/api/test/config.test.ts` | unit |
| AC-4 follow gate (web prompt) | `gated: shows the follow-a-few-curators prompt, no Personalize button` | `apps/web/test/components/pov-bar.test.tsx` | component |
| AC-4 follow gate (web status) | `custodial below the gate → gated (no trigger offered)` | `apps/web/test/hooks/use-trust-view.test.tsx` | hook |
| AC-5 UI parity | `custodial personalize triggers in-session with NO NIP-07 prompt → building` / `custodial at/above the gate → none (offers Personalize)` / `custodial ready when scores already landed (Yours parity)` | `apps/web/test/hooks/use-trust-view.test.tsx` | hook |
| AC-6 sovereign unchanged (API) | `posts the client-signed { event }; server does not call custodialSign` / `400 when the sovereign event pubkey is not the session user (unchanged)` | `apps/api/test/routes/trust-custodial.test.ts` | route |
| AC-6 sovereign unchanged (web) | `none when sovereign without scores; personalize SIGNS THE SERVER TEMPLATE + triggers → building` | `apps/web/test/hooks/use-trust-view.test.tsx` | hook |
| AC-7 guard tightened | `Brainstorm API specifics live only in the adapter` (now includes `brainstorm_login`) | `apps/api/test/trust/architecture.test.ts` | guard |
| AC-8 fixture-verifiable e2e | `status(eligible, no scores) → personalize → status(hasScores)` | `apps/api/test/routes/trust-custodial.test.ts` | route |

## Edge cases covered

- [x] Provider cannot issue a challenge template → `502 challenge_failed`, never signs (AC-1 error).
- [x] Provider declines to queue (`personalizeOk:false`) → `502 trigger_failed` (AC-1 error).
- [x] Ephemeral wrap gone → `401 reauth_required`, `personalize` never called (AC-3, fail-closed).
- [x] Exactly at the threshold → allowed (boundary; gate is `>=`).
- [x] Below the threshold → `403 below_follow_gate` on BOTH `/personalize` and `/challenge` (typed, not a silent no-op).
- [x] Sovereign branch never invokes `custodialSign` (server never server-signs for sovereign).
- [x] Fixture template carries NO `brainstorm_login` (the literal is now adapter-only).

## Migrated existing tests (CONTRACT migration — `authChallenge` string → TEMPLATE)

These are contract updates, not assertion-weakening. Each tracks the ADR-0026 ripple list and pins the NEW contract at equal or greater strength. Every change is annotated inline with a `CONTRACT MIGRATION (ADR 0026 …)` comment.

| File | Old contract asserted | New contract asserted | Why it is a contract update, not a weakening |
|---|---|---|---|
| `apps/api/test/trust/fixture.test.ts` | `authChallenge(O)` returns `"fixture-challenge:<O>"` / `"abc"` / `null` (string) | returns a kind-27235 TEMPLATE with a `["challenge", …]` tag (same deterministic value), overridable challenge, `null` when disabled; asserts NO `brainstorm_login` | Same three behaviors (deterministic default, overridable value, null) pinned at the same strength; the assertion now matches the template the ADR mandates and adds the negative `brainstorm_login` check. Stronger, not weaker. |
| `apps/api/test/trust/brainstorm.test.ts` | `authChallenge` returns the challenge **string** `"chal-123"` | returns the kind-27235 TEMPLATE with `["challenge","chal-123"]` AND `["t","brainstorm_login"]`; plus a new `null`-on-backend-failure case | The same fetched challenge value is now asserted inside the template; the `brainstorm_login` tag is asserted to live in the adapter (the seam the ADR enforces). Added the null path → strictly more coverage. |
| `apps/api/test/routes/trust.test.ts` | `provider().authChallenge → "chal"`; `/challenge` body `{ challenge: "chal" }`; custodial `/challenge` → `400`; custodial `canPersonalize:false` (hardcoded) | mock returns a template; `/challenge` body `{ template: {kind:27235, tags:[["challenge","chal"]]} }`; custodial `/challenge` below gate → `403 below_follow_gate`; custodial `canPersonalize:false` now gate-driven | The sovereign "fetch a challenge to sign" intent is preserved (now a template). The old hard `400 not_supported` is replaced by the ADR's typed gate (`403`). `canPersonalize:false` still asserted but for the new gate reason. Router now receives the new DI deps. |
| `apps/api/test/routes/ratings.test.ts` | provider mock `authChallenge: vi.fn(async () => "c")` | `… => ({kind:27235, created_at:1, tags:[["challenge","c"]], content:""})` | Compile-only ripple: these tests never call `authChallenge`; the mock return type is updated so the `TrustProvider` shape type-checks. No behavioral assertion changed. Tests still pass. |
| `apps/api/test/routes/tags-weighted.test.ts` | provider mock `authChallenge: vi.fn(async () => "c")` | `… => ({kind:27235, created_at:1, tags:[["challenge","c"]], content:""})` | Same compile-only ripple. No behavioral assertion changed. Tests still pass. |
| `apps/web/test/hooks/use-trust-view.test.tsx` | `/challenge` returns `{ challenge: "chal" }`; sovereign `personalize` builds + signs its own kind-27235 (with `brainstorm_login`) | `/challenge` returns `{ template }`; sovereign signs the SERVER template verbatim (`signEvent(SERVER_TEMPLATE)`); web no longer constructs `brainstorm_login`; added `personalizeCustodial` to the api mock + custodial parity/gated cases | Sovereign behavior (NIP-07 sign a kind-27235, POST it) is preserved; only WHERE the template is built moves (web → provider). New custodial cases ADD coverage. |
| `apps/api/test/trust/architecture.test.ts` | forbidden pattern = `/setup/`, `/authChallenge`, `/user/graperank`, `graperankResult`, `30382` | same + `brainstorm_login` (kind `27235` intentionally NOT added) | The ADR amendment tightens the guard. RED until the Implementer removes `brainstorm_login` from `useTrustView.ts` (the intended red — drives the refactor). |

## New test files

| File | New tests | Purpose |
|---|---|---|
| `apps/api/test/routes/trust-custodial.test.ts` | 14 | The custodial branch of `/personalize`, the gate, `/status` eligibility, `/challenge` template, sovereign-unchanged, fixture e2e (AC-1/2/3/4/6/8). |
| `apps/api/test/config.test.ts` (added block) | 3 | `PERSONALIZE_MIN_FOLLOWS` default/override/validation (AC-4). |
| `apps/web/test/hooks/use-trust-view.test.tsx` (added cases) | 4 new (custodial none/gated/personalize/ready) + sovereign case rewritten to the template contract | Web parity + gated prompt + sovereign template-sign (AC-4/5/6). |
| `apps/web/test/components/pov-bar.test.tsx` (added case) | 1 | The `gated` PoVBar prompt (AC-4 web). |

## Test infrastructure

- Runner: Vitest. API tests under `apps/api/test/`; web under `apps/web/test/`.
- No relay / Neo4j / Brainstorm dependency: the route tests inject a `FixtureTrustProvider` plus mocked `followCount`/`custodialSign`/`config` deps. The web tests mock `useSession` and `api`.
- No new framework, no Playwright, no live network. No `docker compose up` prerequisite.

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/routes/trust-custodial.test.ts test/routes/trust.test.ts test/trust/fixture.test.ts test/trust/brainstorm.test.ts test/trust/architecture.test.ts test/config.test.ts
pnpm --filter @unbnd/web exec vitest run test/hooks/use-trust-view.test.tsx test/components/pov-bar.test.tsx
pnpm -r test
```

## Verification

The new + migrated tests FAIL with the current (unimplemented) code, and the rest of the suite is unaffected. Confirmed on 2026-05-31 at commit `c860bdd`.

- **API:** `Test Files 6 failed | 56 passed | 2 skipped (64)` — `Tests 18 failed | 487 passed | 10 skipped (515)`.
- **Web:** `Test Files 2 failed (2 of the touched files)` — `Tests 6 failed | 155 passed (161)`.

All 24 failures are in the files this story touches; no collateral regression. The migrated `ratings.test.ts` / `tags-weighted.test.ts` still pass (compile-only mock change).

### Red reasons (not-implemented / contract, NOT test bugs)

```
apps/api/test/routes/trust-custodial.test.ts (10 failed)
  custodial /personalize happy/502/502, reauth, gate, status, challenge, e2e
  → the route still returns 400 not_supported for custodial and canPersonalize:false:
      "expected 400 to be 200" / "expected 400 to be 401" / "expected 400 to be 403"
      / "expected 400 to be 502" / "expected false to be true"
    (the custodial branch + followCount/custodialSign deps + the template /challenge
     are not implemented yet)

apps/api/test/config.test.ts (3 failed)
  PERSONALIZE_MIN_FOLLOWS default/override/validation
  → config.personalizeMinFollows is undefined (knob not added yet)

apps/api/test/routes/trust.test.ts (2 failed)
  /challenge returns the TEMPLATE / custodial 403 below_follow_gate
  → endpoint still returns { challenge: "chal" } and 400 not_supported
      "expected undefined to match object { kind: 27235 }" / "expected 400 to be 403"

apps/api/test/trust/fixture.test.ts (1 failed)
  → authChallenge still returns the string "fixture-challenge:<O>", not a template:
      "expected 'fixture-challenge:dddd…' to match object { kind: 27235, content: '' }"

apps/api/test/trust/brainstorm.test.ts (1 failed)
  → authChallenge still returns the string "chal-123", not a template:
      "expected 'chal-123' to match object { kind: 27235, content: '' }"

apps/api/test/trust/architecture.test.ts (1 failed)  [AC-7 — intended red]
  → guard now forbids brainstorm_login; it still appears in useTrustView.ts:
      "apps/web/src/hooks/useTrustView.ts leaks Brainstorm/NIP-85 API specifics"
    Stays red until the Implementer moves the template behind the provider and
    removes brainstorm_login from useTrustView.ts.

apps/web/test/hooks/use-trust-view.test.tsx (5 failed)
  sovereign template-sign + custodial none/gated/personalize/ready
  → the hook still collapses non-sovereign to house-only and signs a web-built
    event rather than the server template:
      "expected 'house-only' to be 'none' / 'gated' / 'ready'"
      "expected spy to be called with [ { kind: 27235, … } ]" (server template)

apps/web/test/components/pov-bar.test.tsx (1 failed)
  → PoVBar has no `gated` branch yet:
      "Unable to find an element with the text: /follow a few curators/i"
```
