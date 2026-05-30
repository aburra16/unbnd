# Test Plan: Story 20 — Real public profile at `/profile/:npub` (retire the Mira fixture) + Substack link display

**Story:** `engineering-team/stories/20-public-profiles.md`
**ADR:** `engineering-team/decisions/0020-public-profiles.md`
**Date:** 2026-05-30
**Branch:** `feat/public-profiles`

These are **failing (red) tests written before implementation**. They pin the eight
acceptance criteria against the ADR surface (the by-pubkey public twins, the Substack
display, and the fixture retirement). They mirror the Story-19 session twins:
`profile-stats.test.ts`, `shelves-enriched.test.ts`, `nostr/profile.test.ts`, and the
web `profile-me-polish.test.tsx`. The public twins are the un-gated, author-by-path
versions of those.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 identity header | `renders the target's name, nip05, and about from their kind-0` / `resolves identity by the npub path param (not the session user)` | `apps/web/test/routes/profile-public.test.tsx` | component |
| AC-2 fallback | `shows the npub and still renders shelves/counts when the target has no kind-0` | `apps/web/test/routes/profile-public.test.tsx` | component |
| AC-3 public shelves (API) | `resolves npub → hex and author-scopes the shelf read to the TARGET`, `returns the target's shelves as enriched PublicBooks`, `keeps the PublicBook boundary`, `omits a shelved slug with no catalog record and recounts`, `accepts a 64-char hex`, `returns an empty list (not 404) for a valid npub with no shelves` | `apps/api/test/routes/profile-shelves-public.test.ts` | route |
| AC-3 public shelves (web) | `renders the target's shelf books with title + author, not the raw slug`, `fetches shelves for the npub path param`, `links each shelf book to its detail page` | `apps/web/test/routes/profile-public.test.tsx` | component |
| AC-4 honest counts (API) | `author-scopes every read to the resolved TARGET hex, no session required`, `returns booksRated, reviews, and tagsApplied`, `shows a true zero as a PRESENT 0`, `OMITS a stat whose underlying read throws`, `accepts a 64-char hex` | `apps/api/test/routes/profile-stats-public.test.ts` | route |
| AC-4 honest counts (web) | covered via AC-2's `Books rated` present + AC-5 empty render; stat present/absent rendering reused from Story-19 `profile-me-polish.test.tsx` (the web `statCells` logic the public view shares) | `apps/web/test/routes/profile-public.test.tsx` | component |
| AC-5 fixture retired | `renders live API data, never the Mira fixture, even with empty reads`; smoke `renders the public Profile route for /profile/:npub from live data (no Mira fixture)` | `apps/web/test/routes/profile-public.test.tsx`, `apps/web/test/routes.smoke.test.tsx` | component |
| AC-6 invalid npub (API) | `404s on a segment that is neither npub nor hex` (both twins) | `apps/api/test/routes/profile-shelves-public.test.ts`, `apps/api/test/routes/profile-stats-public.test.ts` | route |
| AC-6 invalid npub (web) | `renders the NotFound state when the API twins answer 404 for an unresolvable npub` + the discriminator `does NOT render NotFound for a valid npub whose twins return 200-empty` | `apps/web/test/routes/profile-public.test.tsx` | component |
| AC-7 Substack display | `renders a 'Writes on Substack' link to the target's substack URL` / `renders no Substack link when the field is absent` (public) and the same pair on `/profile/me` | `apps/web/test/routes/profile-public.test.tsx`, `apps/web/test/routes/profile-me-substack.test.tsx` | component |
| AC-7 Substack parse (server) | `surfaces a well-formed https Substack URL`, `accepts a plain http Substack URL` | `apps/api/test/nostr/profile-substack.test.ts` | unit |
| AC-8 malformed substack dropped at parse | `drops a non-http(s) scheme`, `drops a value that is not a URL`, `drops an ftp scheme`, `drops a non-string value`, `a kind-0 whose ONLY field is a malformed substack parses as no metadata` | `apps/api/test/nostr/profile-substack.test.ts` | unit |

## Edge cases covered

- [x] Valid npub, no events → `{ shelves: [] }` / `{ stats: {0…} }`, render (not NotFound). (shelves: `returns an empty list (not 404)`; stats: `shows a true zero as a PRESENT 0`; web: the AC-6 discriminator + AC-2)
- [x] Hex pubkey accepted as well as npub on both twins.
- [x] `EnrichedShelf` boundary: librarian hex, target hex, `parentHeader`, and `bookAtag` never on the wire.
- [x] Unresolvable shelf book omitted and shelf count recounted to survivors (mirrors Story-19 AC-2).
- [x] A single failing stat read omits only its field; a true 0 stays present (the AC-8 honesty rule reused from Story 19, author = target).
- [x] Malformed Substack values (`javascript:`, non-URL, `ftp:`, non-string) dropped at parse so they never reach `ProfileMeta` / the web link.
- [x] 60s TTL cache: a second call inside the window does not re-query; past the window it re-queries (deterministic via the injectable `now` the ADR pins — Decision 4).

## TTL cache testing (Decision 4)

ADR 0020 Decision 4 pins an **injectable `now: () => number`** on the twins' `Deps`
(mirroring `apps/api/src/trust/brainstorm.ts`). Because the clock is injectable, the
cache is tested deterministically (no flaky `setTimeout`): the tests advance a
controlled `clock` by 30s (still cached) and 61s (re-query) and assert the underlying
`query` mock call-count. This is therefore an executable test, not a review-only note.

## Test infrastructure

- Runner: Vitest. API tests under `apps/api/test/`; web under `apps/web/test/`.
- API route tests use `supertest` against an `express()` app built from
  `buildShelvesRouter` / `buildProfileStatsRouter` with injected `query` / `sessionUser`
  / `now` deps (the established pattern in `shelves-enriched.test.ts` and
  `profile-stats.test.ts`). No live strfry/Neo4j needed — the relay read is mocked per
  `#z` concept.
- Web component tests use Testing Library + happy-dom; `useProfileMeta`, `useSession`,
  and `api.profile.*` are mocked. No real network, no real crypto.
- npub/hex test keys are generated with `nostr-tools/pure` `generateSecretKey` /
  `getPublicKey` and encoded with `nostr-tools/nip19` `npubEncode` — no hand-rolled crypto.

## How to run

```
pnpm --filter @unbnd/api exec vitest run
pnpm --filter @unbnd/web exec vitest run
```

(Note: `pnpm --filter <pkg> test run` passes a stray `run` arg to the package's
`vitest run` script and errors with "No test files found"; use `exec vitest run`.)

## Verification — confirmed RED for the right reason

Confirmed on 2026-05-30 at commit `94a3010` (pre-implementation).

### API — `pnpm --filter @unbnd/api exec vitest run`
```
 Test Files  3 failed | 42 passed | 2 skipped (47)
      Tests  18 failed | 312 passed | 10 skipped (340)

 FAIL test/nostr/profile-substack.test.ts        (2 failed | 6 passed)
 FAIL test/routes/profile-shelves-public.test.ts (8 failed)
 FAIL test/routes/profile-stats-public.test.ts   (8 failed)
```
Representative failures (not-implemented, not test bugs):
- `GET /api/profile/:npub/shelves … resolves npub → hex` → `expected 404 to be 200`
  (the public route does not exist; Express falls through to 404).
- `… invalid npub → 404 … 404s on a segment` → `Cannot read properties of undefined (reading 'code')`
  (no structured `{error:{code:"not_found"}}` body yet — the handler is unbuilt).
- `… 60s TTL cache … serves a second call from cache` → `expected 0 to be greater than 0`
  (no route ran, so `query` was never called; the cache + route are unbuilt).
- `parseKind0 — Substack field … surfaces a well-formed https Substack URL` →
  `meta.substack` is `undefined` (the `substack` field is not parsed yet).

### Web — `pnpm --filter @unbnd/web exec vitest run`
```
 Test Files  3 failed | 19 passed (22)
      Tests  12 failed | 85 passed (97)

 FAIL test/routes/profile-public.test.tsx     (10 failed)
 FAIL test/routes/profile-me-substack.test.tsx (1 failed | 1 passed)
 FAIL test/routes.smoke.test.tsx              (1 failed: the rewritten Profile smoke)
```
Representative failures (assertion misses against the unbuilt rewrite, not crashes):
- AC-1 `renders the target's name …` → `Unable to find role="heading" and name "Satoshi N"`.
- AC-3 `renders the target's shelf books …` → `Unable to find … text: Orbital`.
- AC-3 `fetches shelves for the npub path param` → `expected "spy" to be called with arguments: [Array(1)]`
  (`api.profile.shelves(npub)` does not exist / is not called yet).
- AC-6 discriminator `does NOT render NotFound for a valid npub …` → `Unable to find role="heading" and name "Live User"`.
- AC-7 `renders a 'Writes on Substack' link …` → `Unable to find role="link" and name /writes on substack/i`.
- smoke `… from live data (no Mira fixture)` → `Unable to find … text: npub1n0ewa4…`
  (the rewritten header must show the npub fallback).

### Expected-green-now subtests (documented, intentional)

A handful of subtests in the new files pass against current code. This is intentional —
they pin the **end state** so the implementer cannot regress it, and they will become
load-bearing once the implementation lands:

- `profile-substack.test.ts` — the 6 AC-8 "drop malformed / absent → undefined" cases
  pass today because `parseKind0` currently ignores unknown fields. Once the implementer
  adds `meta.substack = httpUrl(content.substack)`, these guard the `httpUrl` validation
  (a naive pass-through would flip them red).
- `profile-public.test.tsx` AC-6 `… NotFound when the API twins answer 404` passes today
  because the current fixture-driven `Profile.tsx` renders `NotFound` for the renamed
  `:npub` param (undefined `handle`). Its **paired discriminator** (valid-empty must
  render the header, NOT NotFound) is red, so the AC-6 block as a whole only goes green
  when the rewrite distinguishes 404-unresolvable from 200-empty.
- `profile-me-substack.test.ts` `renders no Substack link when absent` passes today
  (nothing renders it yet); its partner (`renders a link when present`) is red.

## Fixture-retirement test fallout — for the Implementer

Deleting `apps/web/src/data/profile-fixtures.ts` + the 5 fixture components
(`TrustCard`, `GenreAffinity`, `ProfileActivity`, `ProfileShelves`, `ProfileHeader`) and
`FIXTURE_MIRA_PUBKEY` breaks test references. Handled in this commit / flagged below:

1. **`apps/web/test/routes.smoke.test.tsx` — REWRITTEN here.** The old
   `renders the Profile route for /profile/mira-calloway` asserted the Mira heading
   against `/profile/:handle`. It now renders `/profile/:npub` from mocked public reads
   (`api.profile.shelves/stats` → empty, `useProfileMeta` → null) and asserts the honest
   npub-fallback header with no Mira data. The smoke file's module-level `vi.mock` now
   also stubs `api.profile.shelves/stats` and mocks `../src/hooks/useProfileMeta`.
   → Currently RED (the rewrite must render the npub); goes green when `Profile.tsx` lands.

2. **`apps/web/test/fixtures.test.ts` — EDITED here.** Removed the
   `describe("profile-fixtures shelves are well-formed …")` block and its
   `import { profileRecords, type ProfileShelfFixture } from "../src/data/profile-fixtures"`.
   That block only validated the retired Mira fixture. The file now references nothing in
   `profile-fixtures.ts`, so it survives the file deletion. (Still green: 3 book/genre tests.)

3. **`FIXTURE_MIRA_PUBKEY`** in `apps/web/src/data/fixture-constants.ts` — no test
   references it directly; the only consumer was `profile-fixtures.ts`. Safe to remove with
   the fixture (keep `FIXTURE_LIBRARIAN_PUBKEY`, used by book fixtures).

4. **No other test references** the 5 fixture components or the Mira handle. `grep` for
   `profile-fixtures`, `FIXTURE_MIRA_PUBKEY`, `getProfileRecord`, `mira-calloway` after the
   rewrite should return nothing in `apps/web/src` or `apps/web/test`. The Implementer must
   re-grep before each deletion (a consumer may appear) and confirm the typecheck/build is
   clean once imports are gone — that build-clean is the enforcement for AC-5's deletion
   half (these tests assert the live-render half).

## Notes for the Implementer (contract pins, not implementation detail)

- The two public twins must return the **same** response shapes as the `/me` reads:
  `{ shelves: EnrichedShelf[] }` and `{ stats: { booksRated?, reviews?, tagsApplied? } }`.
- Invalid npub on the twins → `404 { error: { code: "not_found", … } }` (the tests assert
  `res.body.error.code === "not_found"`). The existing identity endpoint `/api/profile/:id`
  keeps its `400 invalid_pubkey` (not retested here).
- The `now` dep is `now?: () => number` on `ShelvesDeps` / `ProfileStatsDeps`, default
  `Date.now`; the cache TTL the tests assume is **60_000 ms** (30s cached, 61s re-query).
- The web `Profile.tsx` must call `useProfileMeta(npub)`, `api.profile.shelves(npub)`,
  `api.profile.stats(npub)` with the **path npub** (tests assert the spy arg), and show the
  npub fallback when `useProfileMeta` returns null.
- The Substack link is `role="link"` with accessible name matching `/writes on substack/i`
  and `href` = the validated URL, on **both** `Profile.tsx` and `ProfileMe.tsx`.
```
