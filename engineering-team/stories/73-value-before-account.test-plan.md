# Test Plan: Story 73 — Value before account on shared links

**Story:** `engineering-team/stories/73-value-before-account.md`
**ADR:** `engineering-team/decisions/0071-value-before-account.md`
**Date:** 2026-06-07

## Coverage map
The new coverage centers on the shared `AccountPrompt` component (copy + CTA) and the six write controls' signed-out branches (each now renders the prompt). AC-1/AC-2/AC-6 (open read, no interstitial) are largely *structural* — there is no route guard in `App.tsx`, and `AccountPrompt` only ever renders inside a write control's signed-out branch — and are anchored by the control tests proving the gate is inline alongside read content.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-3 (every write action prompts, consistently) | the six signed-out tests below | per-control | component |
| AC-3 (Vouch dead end closed) | `signed out → renders the account prompt, does not query eligibility (Story 73)` | `test/components/vouch-control.test.tsx` | component |
| AC-3 (rate) | `shows the create-account prompt and does not call the API when signed out (Story 73)` | `test/components/rating-control.test.tsx` | component |
| AC-3 (save) | `prompts account creation and offers no shelf picker when signed out (Story 73)` | `test/components/shelf-control.test.tsx` | component |
| AC-3 (follow) | `signed-out → renders the create-account prompt (link to /auth), no follow control (Story 73)` | `test/components/follow-button.test.tsx` | component |
| AC-3 (tag) | `prompts account creation and offers no picker when signed out (Story 73)` | `test/components/tag-control.test.tsx` | component |
| AC-3 (submit) | `blocks submit and shows the create-account prompt when signed out (Story 73)` | `test/routes/submit.test.tsx` | route |
| AC-4 (create-account framing + routes to /auth) | `routes the Create-account CTA to /auth (AC-4)` + every control asserts the `/auth` CTA | `test/components/account-prompt.test.tsx` + six controls | component |
| AC-5 (states the unlock per action) | `action=%s shows the create-a-free-account line naming the unlock` (it.each over all six) | `test/components/account-prompt.test.tsx` | component |
| AC-4 (not "sign in") + no-slop copy | `is a note affordance, never a sign-in-only label` + `uses no AI-slop punctuation (no em dash)` | `test/components/account-prompt.test.tsx` | component |
| AC-1/AC-2/AC-6 (open read, inline gate, no interstitial) | structural — see below | — | — |

## Edge cases
- [x] Vouch eligibility is NOT probed while signed out (the prompt renders without the `vouchStatus` query) — asserted in vouch-control.
- [x] The signed-out prompt does not render the underlying write control (no rating stars, no shelf/tag combobox, no follow button) — each control test asserts both the prompt AND the absence of its control.
- [x] No raw `<button>` for the CTA — it is a react-router `<Link>` to `/auth` (asserted via `getByRole("link", { name: /create account/i })`), which also keeps the no-raw-`<button>` guard happy.
- **AC-1/AC-2/AC-6 (structural, no automated page test added):** there is no `ProtectedRoute`/route guard in `apps/web/src/App.tsx` (`/book/:slug`, `/profile/:npub` are open), and `AccountPrompt` is only rendered inside a write control's signed-out branch — never as a route guard or page interstitial. The control tests demonstrate the gate is inline (the control's own read scaffolding, e.g. the "Shelves" heading, renders alongside the prompt), so read content is never replaced by a wall. A heavy full-page BookDetail/Profile signed-out render test is intentionally not added (it would duplicate the per-control coverage and the structural guarantee); this is called out so the coverage is honest, not silently assumed.

## Test infrastructure
- Vitest + Testing Library; component tests mock the boundary only (`useSession`, `api`) via the established `sessionMock()` swap; all wrap in `MemoryRouter` (the CTA is a router `<Link>`).
- `apps/web/test/components/account-prompt.test.tsx` is the new core; the six existing signed-out tests are **updated** (intended behavior change per ADR 0071) from the old "Sign in" assertions to the new create-account copy + `/auth` CTA.

## How to run

```
pnpm --filter @unbnd/web exec vitest run test/components/account-prompt.test.tsx
pnpm --filter @unbnd/web test
pnpm -r typecheck && pnpm --filter @unbnd/web build
```

## Verification
The new + updated tests fail against the stub. Confirmed 2026-06-07:

```
 ❯ test/components/account-prompt.test.tsx (9 tests | 8 failed)   ← stub renders null
 ❯ test/components/vouch-control.test.tsx  (6 tests | 1 failed)
 ❯ test/components/follow-button.test.tsx  (9 tests | 1 failed)
 ❯ test/components/tag-control.test.tsx    (4 tests | 1 failed)
 ❯ test/components/shelf-control.test.tsx  (9 tests | 1 failed)
 ❯ test/components/rating-control.test.tsx (4 tests | 1 failed)
 ❯ test/routes/submit.test.tsx             (3 tests | 1 failed)
```

`pnpm --filter @unbnd/web typecheck` is clean (the stub `AccountPrompt` compiles). No regressions: only these 7 files fail; the rest of the web suite is green (`7 failed | 53 passed`).
