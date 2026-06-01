# Test Plan: Story 27b — Custodial display-name rename (re-publish kind-0, merge-preserving)

**Story:** `engineering-team/stories/done/27b-custodial-displayname-rename.md`
**ADR:** `engineering-team/decisions/0028-custodial-displayname-rename.md`
**Date:** 2026-06-01

## Approach

The new router `buildProfileDisplayNameRouter(deps)` is dependency-injected exactly
like `buildProfileSubstackRouter` (ADR 0028 "Testability seams"): `sessionUser`,
`publish`, `fetchRaw`, `custodialSign`, `updateDisplayName`, `config` are all injected
as `vi.fn`. No live relay, no Postgres, **no intra-module `vi.mock`** (the prior gotcha).
The API suite mirrors `apps/api/test/routes/profile-substack.test.ts`'s `makeApp({ ...overrides })`.

**Determinism.** The "strictly newer `created_at`" assertion (AC-1) is anchored to the
`createdAt` value we inject via `fetchRaw` (a fixed integer such as `1_000_000`). The
route's own `nextCreatedAt` helper bumps strictly past it; the test asserts
`published.created_at > FETCHED_AT` and `template.created_at > FETCHED_AT`. No `Date.now`
appears in any asserted output. The signer is a `capturingSigner()` that really signs the
handed template with a fresh test keypair (audited primitives via `nostr-tools/pure`,
per the crypto policy — no hand-rolled crypto in the test) so the published event is
wire-realistic and we read merged content + `created_at` straight off it. It also captures
the unsigned template so content/`created_at`/`kind`/`tags` assertions don't depend on the
signer's behavior.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (rename re-publishes, merge-preserving) | `it("merges name+display_name into the freshest kind-0 and preserves substack/website, signs and publishes with a strictly-newer created_at")` | `apps/api/test/routes/profile-display-name.test.ts` | unit (route + DI) |
| AC-2 (DB lockstep) | `it("calls updateDisplayName exactly once with (user.id, D2) on success")`; `it("does NOT update the DB when the local publish fails (publish ordered before DB)")`; `it("does NOT update the DB on a 401 / 400 / 403 failure path")` | `apps/api/test/routes/profile-display-name.test.ts` | unit |
| AC-3 (authnz own-profile-only) | `it("401 no_session for an anonymous request, with no publish/sign/fetch/DB")`; `it("401 reauth_required when a custodial session has no live signing key (custodialSign → null), no publish/DB")`; `it("renames the SESSION user and ignores any user id in the request body (no body-id path)")` | `apps/api/test/routes/profile-display-name.test.ts` | unit |
| AC-4 (validation + privacy) | `it("400 invalid_display_name BEFORE any fetch/sign/publish/DB on an empty/whitespace name")`; `it("400 invalid_display_name on a name over the length cap (101 chars), before any I/O")`; `it("the rename never introduces session/request-body PII into the published kind-0, and merge-preserves the prior whitelisted fields")` | `apps/api/test/routes/profile-display-name.test.ts` | unit |
| AC-5 (Settings field, web) | `it("prefills the field from the resolved kind-0 name")`; `it("falls back to the session displayName when the resolved kind-0 has no name")`; `it("on success calls api.profile.setDisplayName and invalidateProfileMeta(npub), with an honest saved state")`; `it("shows an error state when the rename API rejects (no fabricated success)")`; `it("the field's labels/hints carry no em dash and no emoji")` | `apps/web/test/routes/settings-display-name.test.tsx` | component (Vitest + Testing Library) |
| AC-6 (sovereign untouched, API) | `it("403 sovereign_self_signed and nothing built/signed/published/DB-updated")` | `apps/api/test/routes/profile-display-name.test.ts` | unit |
| AC-6 (sovereign untouched, web field hidden) | `it("does not render a display-name field for a sovereign (email === null) user")` | `apps/web/test/routes/settings-display-name.test.tsx` | component |
| Failure posture (ADR 0028 §3, the gate's two cases) | `it("502 publish_failed when the local publish returns { ok: false }, DB UNCHANGED")`; `it("502 publish_failed when updateDisplayName throws AFTER a successful publish (kind-0 already live)")` | `apps/api/test/routes/profile-display-name.test.ts` | unit |

## Pinned contract asserted (verbatim against ADR 0028 §1)

| Caller / condition | Status | Error code | Response shape |
|---|---|---|---|
| Anonymous / no session | 401 | `no_session` | `{ error: { code, message } }` |
| Custodial, `custodialSign` ⇒ null | 401 | `reauth_required` | `{ error: { code, message } }` |
| Invalid display name (fails `validateDisplayName`) | 400 | `invalid_display_name` | `{ error: { code, message } }` |
| Sovereign | 403 | `sovereign_self_signed` | `{ error: { code, message } }` |
| Custodial, local publish fails | 502 | `publish_failed` | `{ error: { code, message } }` |
| Custodial, `updateDisplayName` throws (after publish) | 502 | `publish_failed` | `{ error: { code, message } }` |
| Custodial success | 200 | — | `{ displayName: D2 }` |

## The AC-4 no-PII assertion (exact)

Scope (gate adjudication, Option 1 / ADR 0028 §5): AC-4 tests that the rename never
**introduces PII from the surfaces it controls** — the **SESSION** and the **REQUEST BODY**
— into the published kind-0. It does **not** test scrubbing of a pre-poisoned `rawPrev`
(`rawPrev` is already-public relay data; the route reuses Story-27's
`buildProfileKind0Content`, whose `rawPrev` passthrough is lossless by design — no new merge
logic / whitelist here).

The session the route receives carries the user's real `email`; the prior kind-0 is
**whitelist-clean** (`{ name: "Old Name", substack, website }` — legit public fields, which
also lets us assert merge-preserve); and the request body maliciously smuggles
`email`/`password`/`userId`. After a successful publish, the test serializes the **whole
signed event** and proves the session/body secrets are absent anywhere, that the rename
introduces no PII keys, and that the prior whitelisted fields survive:

```ts
const published = (deps.publish as ReturnType<typeof vi.fn>).mock.calls[0]![0];
expect(JSON.stringify(published)).not.toContain(EMAIL);
expect(JSON.stringify(published)).not.toContain("hunter2");
expect(JSON.stringify(published)).not.toContain("leak-me");
const content = JSON.parse((published as { content: string }).content);
expect(content).not.toHaveProperty("email");
expect(content).not.toHaveProperty("password");
expect(content).not.toHaveProperty("userId");
expect(content.name).toBe(D2);
expect(content.display_name).toBe(D2);
expect(content.substack).toBe("https://mira.substack.com");
expect(content.website).toBe("https://example.com");
```

Note on the closed patch surface: the rename's patch (`{ displayName: D2 }`) only carries
whitelisted keys via `buildProfileKind0Content`. `rawPrev` passthrough is lossless by design
(ADR 0027), so scrubbing a `rawPrev` that *already* held `email`/`password` is explicitly OUT
OF SCOPE — that would be a contract change the PO/Architect must add to AC-4 first. The test
therefore feeds the secrets through the **session and the request body** (the surfaces the
rename controls) and proves they cannot enter; the assertion still fails the moment a future
change pipes session or request-body PII into the event.

## Edge cases covered

- [x] Empty / whitespace display name → 400 before any I/O.
- [x] Over-length display name (101 chars, `DISPLAY_NAME_MAX = 100`) → 400 before any I/O.
- [x] No prior kind-0 / name-less prior kind-0 (covered indirectly: `fetchRaw` returning
  `{ content: { name: "Mira" }, createdAt: 100 }` and the merge still sets `name`/`display_name`).
- [x] Local publish returns `{ ok: false }` → 502, DB untouched (consistent-on-failure).
- [x] `updateDisplayName` throws after a successful publish → 502, kind-0 already live
  (bounded self-limiting DB-stale drift per ADR 0028 §3).
- [x] Request body carrying another user's `id`/`userId`/`pubkeyHex` → ignored; the session
  user is renamed (no body-id path, AC-3).
- [x] Sovereign field hidden in the web UI (AC-6) and 403 on the API (AC-6).
- [x] No-slop copy: rendered settings text carries no em dash and no emoji (AC-5 / copy rule).

## Test infrastructure

- Test runner: Vitest (workspace default). API tests under `apps/api/test/routes/`;
  web component tests under `apps/web/test/routes/` (happy-dom + Testing Library).
- **No live relay, no Postgres, no network.** All seams are injected `vi.fn` (API) or
  `vi.mock`-ed module boundaries for `useSession` / `useProfileMeta` / `api` (web), mirroring
  the existing `settings.test.tsx`.
- No `docker compose` prerequisite — these are pure unit/component tests.
- No new test framework or tooling introduced (CLAUDE.md house rule).

## How to run

```
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/web test
pnpm -r test
```

## Verification

The new tests fail with the current code, for the right reason (feature not implemented),
not a typo or import-of-a-test-helper error. Confirmed on 2026-06-01 at commit `39e4c30`.

### API (`apps/api`) — the route module does not exist yet

```
⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  test/routes/profile-display-name.test.ts [ test/routes/profile-display-name.test.ts ]
Error: Failed to load url ../../src/routes/profile-display-name (resolved id:
../../src/routes/profile-display-name) in
/Users/avinashburra/Documents/unbnd/apps/api/test/routes/profile-display-name.test.ts.
Does the file exist?

 Test Files  1 failed | 66 passed | 2 skipped (69)
      Tests  545 passed | 10 skipped (555)
```

The whole suite fails at import because `apps/api/src/routes/profile-display-name.ts` and its
exports (`buildProfileDisplayNameRouter`, `ProfileDisplayNameDeps`, `SessionUser`) do not
exist yet. Every other API suite (sovereign auth, the Substack route, etc.) stays green — no
regression. Once the Implementer creates the router with the contract above, the import
resolves and the per-AC assertions become the gate.

### Web (`apps/web`) — the display-name field does not exist yet

```
 ❯ test/routes/settings-display-name.test.tsx (6 tests | 5 failed)
   × Settings — display-name field, custodial (AC-5) > prefills the field from the resolved kind-0 name
   × Settings — display-name field, custodial (AC-5) > falls back to the session displayName when the resolved kind-0 has no name
   × Settings — display-name field, custodial (AC-5) > on success calls api.profile.setDisplayName and invalidateProfileMeta(npub), with an honest saved state
   × Settings — display-name field, custodial (AC-5) > shows an error state when the rename API rejects (no fabricated success)
   × Settings — display-name copy passes the no-slop rule (AC-5) > the field's labels/hints carry no em dash and no emoji

 Test Files  1 failed | 35 passed (36)
      Tests  5 failed | 162 passed (167)
```

The 5 failures all come from `findByLabelText(/display name/i)` finding no such field on
`/settings` — the field isn't implemented yet (not a test bug). The 6th test in the suite
("does not render a display-name field for a sovereign user") currently passes because the
field is genuinely absent; it stays a meaningful guard after implementation (it asserts the
field is hidden for sovereign). All 35 other web suites pass, including the existing
`settings.test.tsx` (the Substack field), so no regression.

## Files

- `apps/api/test/routes/profile-display-name.test.ts` (new) — 14 tests across AC-1/2/3/4/6 + failure posture.
- `apps/web/test/routes/settings-display-name.test.tsx` (new) — 6 tests across AC-5 + AC-6 field-hidden.

No existing test files were modified.
