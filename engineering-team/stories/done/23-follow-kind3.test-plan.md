# Test Plan: Story 23 — Follow / unfollow a user (kind-3 contact-list write, safe merge)

**Story:** `engineering-team/stories/done/23-follow-kind3.md`
**ADR:** `engineering-team/decisions/0023-follow-kind3.md`
**Date:** 2026-05-31

Tests are written against the exact ADR 0023 surface, mirroring the Story-22
kind-0 suites 1:1. They are intentionally RED until the Implementer adds the new
files/exports/component. No production code was touched in this phase.

## Coverage map
Every acceptance criterion maps to at least one test. Edge cases get explicit tests.

| Criterion | Test name (abbreviated) | Test file | Level |
|---|---|---|---|
| AC-1 (control by tier/session; own profile → none; signed-out → sign-in) | "signed-out → renders a sign-in affordance…"; "viewing your OWN profile → renders no control" | `apps/web/test/components/follow-button.test.tsx` | component |
| AC-2 (status drives Follow vs Following; read from viewer's kind-3) | "shows 'Follow' with aria-pressed=false…"; "shows 'Following' with aria-pressed=true…" (web); "returns { following: true } when the viewer's kind-3 has the target p-tag" + false/no-kind-3/self (api) | `follow-button.test.tsx`; `apps/api/test/routes/profile-follow.test.ts` | component + route |
| AC-3 (follow = add p-tag, merge-preserve; fresh list on no kind-3; idempotent) | "follow appends ['p', targetHex]…"; "builds a fresh single-follow list from null tags"; "is idempotent: …adds NO duplicate"; route "follow/template…appends…preserving existing follows"; route "idempotent…still publishes…(no dup)" | `apps/api/test/profile/follow-template.test.ts`; `profile-follow.test.ts` | unit + route |
| AC-4 (unfollow = remove only that p-tag; no-op when not following) | "removes only the matching p-tag…"; "removes the target even when it carries a relay-hint + petname"; "unfollow-when-not-following is a no-op…"; route unfollow template + custodial unfollow | `follow-template.test.ts`; `profile-follow.test.ts` | unit + route |
| AC-5 (merge-don't-clobber: whole list survives byte-intact; relay-hints + petnames + non-p) | "FOLLOW preserves every pre-existing tag…verbatim and in order"; "UNFOLLOW of one mid-list target preserves…payloads of all the rest"; clone-not-mutate trio | `follow-template.test.ts` | unit |
| AC-6 (sovereign signs via NIP-07; no extension → honest message) | `validateSignedKind3` accept/reject suite; route sovereign `{event}` publish + 403 mismatch; web "followTemplate → signEvent → follow"; web "no nostr extension" message | `apps/api/test/profile/validate-kind3.test.ts`; `profile-follow.test.ts`; `follow-button.test.tsx` | unit + route + component |
| AC-7 (custodial server-side sign; reauth when key gone) | route "server-merges + signs…publishes"; "401 reauth_required when the custodial session has no live key"; web "custodial follows via followCustodial, not the extension" | `profile-follow.test.ts`; `follow-button.test.tsx` | route + component |
| AC-8 (publish to local awaited + profile relays best-effort; NOT dcosl; bump created_at) | `publishPublicRelayKind` suite (local gates; fan-out best-effort; failure doesn't fail save; no dcosl); route "bumps created_at strictly past the fetched event"; 502 on local fail | `apps/api/test/nostr/publish-kind3.test.ts`; `profile-follow.test.ts` | unit + route |
| AC-9 (following count = target's distinct kind-3 p-tag count; omit-on-throw) | api "followingCount = …distinct…count"; "counts DISTINCT…"; "present 0…"; "OMITS followingCount when the read throws"; web "Following stat cell" + present-0 + absent | `apps/api/test/routes/profile-stats-following-count.test.ts`; `apps/web/test/routes/profile-following-count.test.tsx` | route + component |
| AC-10 (honest control states; accessible; aria-pressed; optimistic + revert) | "shows 'Follow' with aria-pressed=false"/"…=true"; "reveals an 'Unfollow' affordance on hover/focus"; "reverts…and shows an honest error when the write fails" | `follow-button.test.tsx` | component |

## Test files + counts (all new, all intentionally red)

| File | Tests | What it pins |
|---|---|---|
| `apps/api/test/profile/follow-template.test.ts` | 17 | `mergeFollow` (the anti-clobber core: append/remove one p-tag, idempotent both ways, clone-not-mutate, byte-intact preservation of relay-hints/petnames/non-p tags); `buildKind3Template` (kind 3, verbatim content, given created_at); `FollowError`. |
| `apps/api/test/profile/validate-kind3.test.ts` | 7 | `validateSignedKind3`: kind 3 + pubkey match + valid sig; accepts relay-hints/petnames/legacy content/empty list; rejects wrong kind / pubkey mismatch (`pubkey_mismatch`) / bad sig (`invalid_signature`) / junk. |
| `apps/api/test/nostr/profile-raw-kind3.test.ts` | 4 | `fetchRawKind3`: freshest-by-created_at fan-out returning untouched `{tags, content, createdAt}`; preserves relay-hints/petnames/non-p verbatim; null/'' /null on no event; ignores non-kind-3. |
| `apps/api/test/routes/profile-follow.test.ts` | 24 | `/follow/template` (follow + unfollow templates, created_at bump, 401 anon, 400 self_follow / invalid_target); `/follow` submit (sovereign publish + 403 + self_follow + 502; custodial merge-sign-publish + reauth 401 + self_follow + first-follow no-kind-3 + idempotent no-dup; anon 401); `GET /follows/:target` (true/false/no-kind-3/self/401 anon/404). |
| `apps/api/test/routes/profile-stats-following-count.test.ts` | 6 | `followingCount` folded into `/profile/:npub/stats`: distinct p-tag count, DISTINCT de-dup, author-scoped to target hex, present 0 (with/without kind-3), omit-on-throw. |
| `apps/api/test/nostr/publish-kind3.test.ts` | 6 | `publishPublicRelayKind` (publishKind3): local awaited gates; local fail → ok:false; profile-relay fan-out after local success; fan-out failure does NOT fail the save; no fan-out when local failed; dcosl excluded. Publisher INJECTED (Story-22 lesson). |
| `apps/web/test/components/follow-button.test.tsx` | 11 | `FollowButton`: signed-out → sign-in link; own profile → no control; Follow/Following labels + aria-pressed; Unfollow reveal on focus; sovereign followTemplate→signEvent→follow; no-extension honest message; revert-on-failure; custodial followCustodial path. |
| `apps/web/test/routes/profile-following-count.test.tsx` | 3 | Profile "Following" stat cell from `stats.followingCount` (present number, present 0, absent → no cell). |

**Total: 78 new test cases across 8 new files** (6 API, 2 web).

## Edge cases covered (beyond the happy path)
- [x] Viewer has NO kind-3 (follow ⇒ fresh single-follow list; unfollow ⇒ empty; status ⇒ following:false; count ⇒ present 0). — Q5 confirmed allow.
- [x] Idempotent follow (already following ⇒ no duplicate p-tag, full payload of the existing tag preserved) — still publishes + echoes.
- [x] Unfollow when not following ⇒ no-op, no one stripped, still publishes a bumped event.
- [x] A `p` tag carrying a relay-hint AND a petname survives a follow/unfollow of an unrelated target byte-for-byte; a non-`p` tag (`["t","books"]`) likewise survives.
- [x] Clone-not-mutate: the input `tags` array AND its inner tag arrays are never mutated (deep-enough clone).
- [x] `created_at` bumped strictly past the fetched event (incl. a future-dated fetched event) so NIP-01 replacement wins.
- [x] Self-follow rejected before any fetch/merge/sign (template, custodial submit, sovereign hinted submit) → 400 `self_follow`; status read self → following:false.
- [x] Invalid / unresolvable target → 400 `invalid_target` (write) / 404 `not_found` (status read).
- [x] Custodial key gone (post-restart) → 401 `reauth_required`, nothing published.
- [x] Local relay publish fails → 502 (gates the response); profile-relay fan-out failure does NOT fail the save.
- [x] dcosl never receives kind-3 (the injected fan-out targets the profile relays only).
- [x] following-count omit-on-throw (never a fabricated 0); DISTINCT de-dup so a duplicate p-tag is not double-counted; non-`p` tags not counted.
- [x] Sovereign with no NIP-07 extension → honest message, nothing published.
- [x] FollowButton optimistic pending + revert-on-failure with an honest inline alert (no fabricated success).

## Test infrastructure
- Runner: Vitest (workspace default). API tests under `apps/api/test/`; web tests under `apps/web/test/` (Testing Library, `apps/web/test/setup.ts` loads jest-dom).
- No live relay / Docker dependency: every test injects mocked deps (`sessionUser`, `publish`, `fetchRaw`, `custodialSign`, `query`) and stubs the web `api` client + `useSession` + `useProfileMeta`, exactly as the Story-22 suites do. Real crypto is used only for deterministic test keypairs (`nostr-tools/pure` `generateSecretKey`/`finalizeEvent`) to produce wire-valid signed kind-3 events for `validateSignedKind3` — no hand-rolled crypto, no network.
- **Story-22 lesson honored (publishKind3):** the publisher is INJECTED as an argument (`publishPublicRelayKind(label, { publishLocal, publishMany, … })`), NOT intercepted via an un-mockable intra-module `vi.mock`. The Story-22 defect was a module-level mock that could not intercept `publishToMany`'s in-module reference to `publishEvent` under vitest/ESM. The publish-kind3 suite drives injected `publishLocal`/`publishMany` spies directly.

## How to run
```
pnpm --filter @unbnd/api exec vitest run
pnpm --filter @unbnd/web exec vitest run
pnpm -r test
```
Subset (this story):
```
pnpm --filter @unbnd/api exec vitest run \
  test/profile/follow-template.test.ts test/profile/validate-kind3.test.ts \
  test/nostr/profile-raw-kind3.test.ts test/nostr/publish-kind3.test.ts \
  test/routes/profile-follow.test.ts test/routes/profile-stats-following-count.test.ts
pnpm --filter @unbnd/web exec vitest run \
  test/components/follow-button.test.tsx test/routes/profile-following-count.test.tsx
```

## Verification — RED for the right reason
Confirmed on 2026-05-31, branch `feat/follow`. Each failure is "feature not implemented yet," not a typo or a test bug:

**API** (`vitest run` on the 6 new files):
```
FAIL test/nostr/publish-kind3.test.ts
  Error: Failed to load url ../../src/nostr/publish-public-relay-kind … Does the file exist?
FAIL test/profile/follow-template.test.ts
  Error: Failed to load url ../../src/profile/follow-template … Does the file exist?
FAIL test/profile/validate-kind3.test.ts
  Error: Failed to load url ../../src/profile/validate-kind3 … Does the file exist?
FAIL test/routes/profile-follow.test.ts
  Error: Failed to load url ../../src/routes/profile-follow … Does the file exist?
FAIL test/nostr/profile-raw-kind3.test.ts > fetchRawKind3 > …
  TypeError: fetchRawKind3 is not a function          (profile.ts resolves; export missing)
FAIL test/routes/profile-stats-following-count.test.ts > … followingCount (AC-9) > …
  AssertionError: expected undefined to be +0          (route emits no followingCount yet)
```

**Web** (`vitest run` on the 2 new files):
```
FAIL test/components/follow-button.test.tsx
  Error: Failed to resolve import "../../src/components/FollowButton" … Does the file exist?
FAIL test/routes/profile-following-count.test.tsx > … Following count cell (AC-9) > …
  TestingLibraryElementError: Unable to find an element with the text: Following
```
(The third following-count web case — "renders NO 'Following' cell when absent" — passes already, which is correct: the cell genuinely is not rendered yet, and it will stay green after implementation.)

## Fixture / fallout notes for the Implementer
1. **`profile-public.test.tsx` will go red when `FollowButton` lands.** `apps/web/test/routes/profile-public.test.tsx` (Story 20) renders `<Profile />` and mocks only `useProfileMeta` + a partial `api` (no `useSession`, no `api.profile.followStatus`/`followTemplate`/`follow`/`followCustodial`). Once `Profile.tsx` mounts `<FollowButton>`, that test must add a `useSession` mock and the follow `api` methods (see `profile-following-count.test.tsx` for the exact additions). Update it as part of the implementation diff, not as a "tester missed it."
2. **`ProfileStatsResponse` needs `followingCount?: number`** in `apps/web/src/lib/api.ts`, and the web `api.profile` set needs `followTemplate({target, action})`, `follow(event, {target, action})`, `followCustodial({target, action})`, `followStatus(target)` (ADR Decision 5 / web section). The web tests mock these names exactly — keep them stable.
3. **`publishPublicRelayKind` surface.** The publish-kind3 suite pins a small exported factory `publishPublicRelayKind(label, { localRelay, profileRelays, publishLocal, publishMany })` in `apps/api/src/nostr/publish-public-relay-kind.ts`, returning `(event) => Promise<PublishResult>` that awaits `publishLocal` (gates), fires `publishMany` best-effort on local success only, swallows fan-out rejection, and excludes dcosl by construction (the caller passes `config.profileRelays`). If the Implementer prefers to keep the closure inline in `index.ts`, extract this thin factory anyway so the injection-based test can drive it (this is the Story-22 anti-pattern fix). `index.ts` then wires `publish: publishPublicRelayKind("profile-publish", { localRelay: config.strfryUrl, profileRelays: config.profileRelays ?? [], publishLocal: publishEvent, publishMany: publishToMany })` into `buildProfileFollowRouter`.
4. **`ProfileFollowDeps` shape.** The route suite imports `buildProfileFollowRouter`, `ProfileFollowDeps`, `SessionUser` from `apps/api/src/routes/profile-follow.ts`. `fetchRaw` returns `{ tags: string[][] | null; content: string; createdAt: number | null }` (the kind-3 shape — distinct from the kind-0 `{content, createdAt}`); `custodialSign(sessionIdHex, template)` returns the signed event or `null`. `publish(event) => Promise<PublishResult>`. Mirror `ProfileSubstackDeps`.
5. **following-count read mechanism.** The stats suite drives the kind-3 read through the EXISTING injected `query` dep with a `{ kinds: [3], authors: [target], limit: 1 }` filter (a fourth parallel read inside `statsFor`). If the Implementer instead injects a dedicated `fetchRaw`-style dep on `ProfileStatsDeps`, the test's `query`-dispatch-by-kind assertion ("reads the kind-3 author-scoped to the resolved TARGET hex") must be revisited — but the simpler path (reuse `query`) keeps the test green as written.
6. **`config.profileRelays` may be undefined.** Existing wiring uses `config.profileRelays ?? []`. Keep that guard for the kind-3 fetch + publish so a deployment without profile relays still serves the local-only path.
