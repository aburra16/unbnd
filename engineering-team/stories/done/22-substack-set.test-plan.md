# Test Plan: Story 22 — Set your Substack link (the first kind-0 profile write, safe merge)

**Story:** `engineering-team/stories/done/22-substack-set.md`
**ADR:** `engineering-team/decisions/0022-substack-set.md`
**Date:** 2026-05-30

## Scope

Nine ACs covering the app's first kind-0 (NIP-01 profile metadata) write: a
signed-in user sets / changes / clears a `substack` URL, the merge preserves
every other kind-0 field (including ones Unbnd does not model), the write signs
per tier (sovereign NIP-07 / custodial ephemeral-wrap / anon blocked), and the
result fans out to the profile relays. Tests pin the ADR surface exactly:

- `apps/api/src/nostr/profile.ts` — RAW read helpers `pickNewestKind0`,
  `parseRawKind0Content`, `fetchRawKind0` (distinct from the lossy `parseKind0`).
- `apps/api/src/profile/substack-template.ts` (new) — `validateSubstackUrl`,
  `mergeSubstack`, `buildKind0Template`, `SubstackError`.
- `apps/api/src/profile/validate-kind0.ts` (new) — `validateSignedKind0`.
- `apps/api/src/nostr/publish.ts` — `publishToMany` (fan-out primitive).
- `apps/api/src/routes/profile-substack.ts` (new) — `buildProfileSubstackRouter`
  with `POST /api/profile/substack/template` + `POST /api/profile/substack`.
- `apps/web/src/routes/Settings.tsx` (new), `apps/web/src/components/AccountMenu.tsx`
  (Settings item), `apps/web/src/hooks/useProfileMeta.ts` (`invalidateProfileMeta`).

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (settings affordance / Settings item) | `renders a 'Settings' menuitem linking to /settings`; `orders Settings between 'Your shelves' and 'Sign out'` | `apps/web/test/components/account-menu-settings.test.tsx` | component |
| AC-1 (gated route / prefill / Substack-only) | `redirects a signed-out visitor to sign-in`; `shows a loading state while the session resolves`; `prefills the field from the user's current substack value`; `shows an empty field when the user has no substack value`; `exposes ONLY the Substack field` | `apps/web/test/routes/settings.test.tsx` | component |
| AC-2 (set persists; merged content with substack) | `returns a kind-0 template … with the merged substack content`; sovereign `publishes a valid signed kind-0 …` | `apps/api/test/routes/profile-substack.test.ts` | route |
| AC-3 (merge-don't-clobber, incl. unknown field) | `sets substack while preserving EVERY other field, including the unknown one`; `the raw read keeps fields the lossy parseKind0 SILENTLY DROPS (the AC-3 trap)`; route `… existing fields survive into the template` | `apps/api/test/profile/substack-template.test.ts`, `apps/api/test/nostr/profile-raw.test.ts`, `apps/api/test/routes/profile-substack.test.ts` | unit + route |
| AC-4 (clear deletes the key) | `DELETES the substack key entirely (not '', not null)`; `clearing content that has no substack is a clean no-op`; route `an empty url CLEARS the field`; web `Clear submits an empty value` | `apps/api/test/profile/substack-template.test.ts`, `apps/api/test/routes/profile-substack.test.ts`, `apps/web/test/routes/settings.test.tsx` | unit + route + component |
| AC-5 (validation before publish) | `rejects a javascript: scheme` / `rejects an ftp: scheme` / `rejects a value that is not a URL` / `rejects a non-string value`; template route `400 on a malformed URL, before any fetch/merge`; custodial `400 on a malformed url before signing`; web `rejects a malformed URL inline before any API call` | `apps/api/test/profile/substack-template.test.ts`, `apps/api/test/routes/profile-substack.test.ts`, `apps/web/test/routes/settings.test.tsx` | unit + route + component |
| AC-6 (sovereign signs via NIP-07) | route `publishes a valid signed kind-0 whose pubkey matches the session`; `403 when the signed event pubkey is not the session user`; `400 when the signed event carries an invalid … substack`; validate `accepts an honest signed kind-0 …` / `rejects … pubkey_mismatch` / `rejects a tampered event`; web `runs substackTemplate → signEvent → setSubstack …` / `shows an honest 'no extension' message …` | `apps/api/test/routes/profile-substack.test.ts`, `apps/api/test/profile/validate-kind0.test.ts`, `apps/web/test/routes/settings.test.tsx` | route + unit + component |
| AC-7 (custodial server-signs; reauth) | route `server-signs the merged kind-0 and publishes it`; `401 reauth_required when the session has no live signing key`; web `custodial user saves via setSubstackCustodial …` | `apps/api/test/routes/profile-substack.test.ts`, `apps/web/test/routes/settings.test.tsx` | route + component |
| AC-7 / Q3 (custodial, no existing kind-0) | route `custodial with NO existing kind-0 builds a fresh minimal kind-0 holding just substack`; unit `null raw content ⇒ a fresh minimal kind-0 holding only substack` | `apps/api/test/routes/profile-substack.test.ts`, `apps/api/test/profile/substack-template.test.ts` | route + unit |
| AC-8 (propagation / fan-out) | `attempts a publish to every relay in the list`; `a single relay failure does NOT sink the others`; `a thrown publish is captured as an { ok: false } result`; route `bumps created_at strictly past the fetched event`; route `awaits publish and returns 200 on local success` + `502 when publishing … fails` | `apps/api/test/nostr/publish-many.test.ts`, `apps/api/test/routes/profile-substack.test.ts` | unit + route |
| AC-9 (honest states; cache-bust; Substack-only) | web `shows an error state when the API rejects the save (no fabricated success)`; `… then echoes + invalidates the cache`; hook `drops the cached entry so a remount re-reads` / `clears the sessionStorage entry`; `exposes ONLY the Substack field` | `apps/web/test/routes/settings.test.tsx`, `apps/web/test/hooks/invalidate-profile-meta.test.tsx` | component + unit |
| (trap) raw read vs lossy parse | `pickNewestKind0 picks the kind-0 with the highest created_at`; `parseRawKind0Content returns the raw content object with all fields untouched`; `fetchRawKind0 fans out … returns the freshest content + its createdAt` | `apps/api/test/nostr/profile-raw.test.ts` | unit |

## Test files + counts (all new, all intentionally red)

| File | Tests | Targets |
|---|---|---|
| `apps/api/test/nostr/profile-raw.test.ts` | 9 | `pickNewestKind0`, `parseRawKind0Content`, `fetchRawKind0` |
| `apps/api/test/profile/substack-template.test.ts` | 18 | `validateSubstackUrl`, `mergeSubstack`, `buildKind0Template`, `SubstackError` |
| `apps/api/test/profile/validate-kind0.test.ts` | 7 | `validateSignedKind0` |
| `apps/api/test/nostr/publish-many.test.ts` | 4 | `publishToMany` |
| `apps/api/test/routes/profile-substack.test.ts` | 16 | `buildProfileSubstackRouter` (template + three-tier submit) |
| `apps/web/test/components/account-menu-settings.test.tsx` | 2 | `AccountMenu` Settings item |
| `apps/web/test/hooks/invalidate-profile-meta.test.tsx` | 2 | `invalidateProfileMeta` |
| `apps/web/test/routes/settings.test.tsx` | 11 | `Settings` route (gate / prefill / save tiers / clear / validation / states) |
| **Total** | **69** | 49 API + 20 web |

## Edge cases covered

- [x] Empty / whitespace / absent URL → "clear" (not "" or null on the wire).
- [x] Clear when there was no substack → clean no-op, all fields preserved.
- [x] Null raw content (custodial with no kind-0) → fresh minimal kind-0.
- [x] Unknown / unmodeled field (`lud16`, `banner`, `website`, a custom object) survives the merge.
- [x] Input object NOT mutated by `mergeSubstack` (clone, not in-place).
- [x] `created_at` strictly bumped past the fetched event (NIP-01 replacement wins).
- [x] Single profile-relay failure / thrown publish does not sink the batch (AC-8 best-effort).
- [x] Empty relay list → no publish attempts.
- [x] Sovereign signed event with mismatched pubkey (403) / tampered signature / junk input.
- [x] Sovereign with no Nostr extension → honest message, nothing published.
- [x] Custodial reauth_required (live key gone) → 401, no publish.
- [x] Anonymous on both body shapes (`{event}` and `{url}`) → 401.

## Test infrastructure

- Runner: Vitest. API tests under `apps/api/test/`; web tests under `apps/web/test/` (happy-dom + Testing Library, `test/setup.ts`).
- No live relay / Docker dependency. All tests are pure unit or dependency-injected:
  - Route tests inject `sessionUser` / `publish` / `fetchRaw` / `custodialSign` (mirrors the ratings suite), so no strfry / profile-relay socket is opened.
  - `publishToMany` tests INJECT the single-relay publisher as a 3rd arg `publishToMany(relayUrls, event, publish = publishEvent)` and pass a local `vi.fn()` spy (no socket; no `vi.mock` — an export-level mock can't intercept the intra-module `publishEvent` call, a known vitest/ESM limit).
  - Signed kind-0 fixtures are built in-test with `nostr-tools/pure` `finalizeEvent` for a fresh keypair (real signatures, JSON round-tripped to drop the verifiedSymbol memo — same discipline as `apps/api/test/ratings/_fixtures.ts`). No hand-rolled crypto.
  - Web tests mock `useSession`, `useProfileMeta`/`invalidateProfileMeta`, and `api.profile.*`; NIP-07 is stubbed as `window.nostr.signEvent`.
- No new framework, no Playwright (none introduced by ADR 0022).

## How to run

```
pnpm --filter @unbnd/api exec vitest run test/nostr/profile-raw.test.ts test/profile/substack-template.test.ts test/profile/validate-kind0.test.ts test/nostr/publish-many.test.ts test/routes/profile-substack.test.ts
pnpm --filter @unbnd/web exec vitest run test/components/account-menu-settings.test.tsx test/hooks/invalidate-profile-meta.test.tsx test/routes/settings.test.tsx
pnpm -r test
```

## Verification — red for the right reason

Confirmed on 2026-05-30 at commit `dc0b9c6` (pre-implementation). Every failure is
"feature not implemented" (missing module, missing export, missing UI element),
not a test bug. Pre-existing suites stay green (`pnpm -r test`: schemas 72,
search 11, seeder 12, indexer 6 all pass; api 353 passed beside the 5 new red
files; web 102 passed beside the 3 new red files).

API — failure reasons (collected via `vitest run`):

```
Error: Failed to load url ../../src/profile/substack-template … Does the file exist?   (substack-template.test.ts)
Error: Failed to load url ../../src/profile/validate-kind0 … Does the file exist?       (validate-kind0.test.ts)
Error: Failed to load url ../../src/routes/profile-substack … Does the file exist?      (profile-substack.test.ts)
TypeError: pickNewestKind0 is not a function                                            (profile-raw.test.ts)
TypeError: parseRawKind0Content is not a function                                       (profile-raw.test.ts)
TypeError: fetchRawKind0 is not a function                                              (profile-raw.test.ts)
[vitest] No "publishToMany" export is defined on the "../../src/nostr/publish" mock      (publish-many.test.ts)

 Test Files  5 failed | 48 passed | 2 skipped (55)
 (profile-raw 9/9, publish-many 4/4 runnable-and-red; substack-template / validate-kind0 /
  profile-substack abort at import → reported "(0 test)", 41 it() blocks pending the new files)
```

Web — failure reasons:

```
Error: Failed to resolve import "../../src/routes/Settings" … Does the file exist?       (settings.test.tsx)
TypeError: invalidateProfileMeta is not a function                                       (invalidate-profile-meta.test.tsx)
TestingLibraryElementError: Unable to find an accessible element with the role
  "menuitem" and name `/^settings$/i`                                                    (account-menu-settings.test.tsx)

 Test Files  3 failed | 24 passed (27)
      Tests  4 failed | 102 passed (106)
 (account-menu-settings 2/2, invalidate-profile-meta 2/2 runnable-and-red; settings.test.tsx
  aborts at import → 11 it() blocks pending Settings.tsx)
```

## Notes for the Implementer

- **`publishKind0` is built inline in `apps/api/src/index.ts`** per the ADR (local-awaited + fire-and-forget `publishToMany` fan-out), which is not directly unit-testable. The AC-8 contract is pinned in two testable pieces instead: (a) `publishToMany` unit tests prove the fan-out attempts every relay and survives per-relay failure; (b) the route tests inject `publish` and assert the route awaits it and lets the LOCAL result gate the response (200 on ok, 502 on failure). When you wire `publishKind0`, make `publish` (the injected dep) return the local result and keep the fan-out off the awaited path — the route tests will pass as long as the injected `publish` resolves with the local `PublishResult`.
- **Sovereign submit body.** The route tests send `{ event, url }` together and expect the server to validate the signed event's `substack` against a valid http(s)-or-absent check (ADR minimum). If you instead derive `expectedSubstack` purely from the signed event's content, the `400 when the signed event carries an invalid … substack` test still holds; the `url` in the body is accepted as a redundant hint. Pick the tighter of the two per the ADR note — both satisfy the tests.
- **`validateSignedKind0` return shape** is asserted as a discriminated union `{ ok: true } | { ok: false; code }` with codes `pubkey_mismatch` and `invalid_signature` exercised explicitly (mirror `validateSignedRating`). Other codes (`wrong_kind`, `invalid_event`, `malformed`) are exercised only via `ok === false`.
- **`SubstackError`** must be a named export carrying a `.code` (the `invalid_url` value is asserted). `validateSubstackUrl` returns the string `"clear"` for empty/absent input and the normalized URL otherwise, and THROWS `SubstackError` on malformed input (not a return value).
- **`mergeSubstack` must clone** — a test asserts the input object is not mutated.
- **`fetchRawKind0` signature** is `(relays, pubkeyHex, queryFn?)` returning `{ content, createdAt }`; the queryFn injection point matches `fetchProfileMeta` so the existing relay-query mock pattern carries over.
- **Web `api.profile`** needs three new methods the Settings test mocks: `substackTemplate(url)`, `setSubstack(event)`, `setSubstackCustodial(url)`. The Clear action calls `substackTemplate("")` for sovereign.
- **`Settings.tsx` field** must be reachable by accessible label matching `/substack/i` and must NOT render name/bio/picture/nip05 inputs (asserted). Save button label matches `/save/i`, Clear matches `/clear/i`, the no-extension message matches `/no nostr extension/i`, validation + API errors surface via `role="alert"`, the loading gate via `role="status"`, signed-out → `<Navigate to="/auth">`.
- **No fixture files added.** Signed kind-0 fixtures are inlined in the two files that need them; nothing under `test/fixtures/` changes. Existing Story-20 read-side test `apps/api/test/nostr/profile-substack.test.ts` is untouched and stays green.
