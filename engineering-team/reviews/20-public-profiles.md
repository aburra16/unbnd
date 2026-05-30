# Review: Story 20 — Real public profile at `/profile/:npub` (retire the Mira fixture) + Substack link display

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-30
**Diff:** `git diff 21394b44...feat/public-profiles` (merge-base `21394b44`; reviewed at `eb5ca03`)
**Story:** `engineering-team/stories/done/20-public-profiles.md`
**ADR:** `engineering-team/decisions/0020-public-profiles.md`
**Test plan:** `engineering-team/stories/done/20-public-profiles.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **PASS.** 6 workspace projects (`packages/search`, `packages/schemas`, `apps/indexer`, `apps/api`, `apps/seeder`, `apps/web`) all `Done`, no errors.
- [x] `pnpm -r test` — **PASS.** All suites green:
  - `packages/schemas` 72 passed (8 files)
  - `packages/search` 11 passed (2 files)
  - `apps/indexer` 6 passed (2 files)
  - `apps/seeder` 12 passed (4 files)
  - `apps/api` **330 passed | 10 skipped** (47 files) — includes the new `profile-shelves-public.test.ts`, `profile-stats-public.test.ts`, `profile-substack.test.ts`, plus the untouched Story-18/19 suites (`shelves-enriched`, `profile-stats`, `profile`) and search/trust guards.
  - `apps/web` **97 passed** (22 files) — includes `profile-public.test.tsx`, `profile-me-substack.test.tsx`, and the edited `routes.smoke.test.tsx` / `fixtures.test.ts`.
- [x] `pnpm --filter @unbnd/web build` — **PASS.** `tsc --noEmit` clean; `vite build` 425 modules, built in ~0.6s.
- [x] _Lint not configured — skipped._

## Spec adherence — every AC covered by a real-behavior test

- [x] **AC-1 (identity header from kind-0):** `profile-public.test.tsx` → `renders the target's name, nip05, and about from their kind-0` (asserts heading "Satoshi N", nip05 text, about text, and **no** "Mira Calloway") + `resolves identity by the npub path param` (asserts `useProfileMeta` called with the path npub).
- [x] **AC-2 (initials + npub fallback):** `shows the npub and still renders shelves/counts when the target has no kind-0` — `meta=null`, asserts full npub shown, shelves ("Orbital") and a count ("Books rated") still render, no fabricated name.
- [x] **AC-3 (public shelves, target-scoped, omit+recount):** API `profile-shelves-public.test.ts` asserts `authors:[TARGET_HEX]` on the shelf read, enriched `PublicBook` fields, omit-unresolved + recount to 1, hex acceptance, and 200-empty for a valid empty target; web side asserts title+author (not slug) and detail-page links.
- [x] **AC-4 (honest counts, target-scoped):** API `profile-stats-public.test.ts` asserts every query filter is `authors:[TARGET_HEX]` + `kinds∋39999`, real count computation (latest-wins dedupe → booksRated 2 / reviews 1; tag polarity → tagsApplied 1), **present-0** for a true zero, and **omit-on-throw** (`"tagsApplied" in stats === false` while the others stay present). No session consulted.
- [x] **AC-5 (Mira fixture retired):** `renders live API data, never the Mira fixture, even with empty reads`; smoke `renders the public Profile route for /profile/:npub from live data (no Mira fixture)`. Plus the deletion half is enforced by the clean typecheck/build with zero dangling importers (see re-grep below).
- [x] **AC-6 (invalid → NotFound; valid-empty → render):** Both poles tested. API: `404s on a segment that is neither npub nor hex` with `error.code === "not_found"` (both twins). Web: `renders the NotFound state when the API twins answer 404` AND the discriminator `does NOT render NotFound for a valid npub whose twins return 200-empty (renders the header)`. The web `notFound` flag flips only on a twin 404; 200-empty leaves it false. The twins are the source of truth, matching ADR Decision 3.
- [x] **AC-7 (Substack link, both views):** `profile-public.test.tsx` and `profile-me-substack.test.tsx` each assert a `role="link"` named `/writes on substack/i` with the validated `href`, and the no-link-when-absent case. Server parse: `profile-substack.test.ts` surfaces https and http.
- [x] **AC-8 (malformed Substack dropped at parse):** `profile-substack.test.ts` drops `javascript:`, non-URL, `ftp:`, non-string, and the all-malformed → `null` case. Validation lives in `parseKind0` (`httpUrl`), so a malformed value never reaches the wire — the web does not re-validate.

## ADR adherence

- [x] Files changed match ADR 0020 Implementation Notes exactly: new `apps/api/src/nostr/npub.ts` (extracted `toHex`); `nostr/profile.ts` (`substack` + `httpUrl`); `routes/profile.ts` (imports shared `toHex`); `routes/shelves.ts` + `routes/profile-stats.ts` (public twins + per-twin TTL cache + shared pure-fn helpers `enrichedShelvesFor` / `statsFor`); `web/lib/api.ts` (`substack` type + `api.profile.shelves/stats`); `App.tsx` (`:handle`→`:npub`); `Profile.tsx` rewrite; `ProfileMe.tsx` Substack link; fixture + 5-component deletions.
- [x] Layering respected: public reads in the API layer; web consumes typed `api.profile.*`. No cross-import. The session-gated `/me` handlers are untouched (verified — `git diff` shows no change to their gating).
- [x] No new dependencies. `URL` is a platform global; npub decode reuses `nostr-tools/nip19`. No new tooling.
- [x] Option A honored: two thin public handlers, shared pure functions, one extracted `toHex` validator. The public/gated boundary is physical, not a session-or-param fork.

## Audit findings against the brief

### No-hex-leak — VERIFIED clean
`PublicBook` (`routes/books.ts`) is a `Pick` of catalog fields only (slug/title/authorName/blurb/coverUrl/publishYear/pageCount/language/subjects/openLibraryId/isbn13/purchaseUrl/format) — no pubkey, no parentHeader. The shelves twin returns `{ slug, name, count, books: PublicBook[] }`; the stats twin returns integer counts. The resolved hex is used **only** as the `authors:` filter. The identity endpoint returns `npub` (re-encoded via `npubEncode`), never hex. Enforced by `profile-shelves-public.test.ts` → `keeps the PublicBook boundary`, which stringifies the whole response body and asserts neither the librarian hex, the target hex, `parentHeader`, nor `bookAtag` appear.

### Honesty model — VERIFIED
Stats twin (`statsFor`): each read independently `{ok}`-wrapped; a throw omits only its field; a resolved read yields a present count, and a true zero renders as `0`. Web `statCells` pushes a cell only for `!== undefined` fields, so an omitted field disappears (not shown as 0) and a present 0 renders. Shelves enrichment reuses the Story-19 `groupOwnShelves` + one-batch catalog read; unresolved slugs are filtered and `count = books.length` recounts to survivors. Counts reuse `countOwnRatings` / `countOwnAppliedTags` verbatim. No fabricated data.

### 404-vs-valid-empty discriminator (AC-6) — VERIFIED
The API twins answer `404 {error:{code:"not_found"}}` only when `toHex` returns null (unresolvable segment); a valid npub with no events returns `200 { shelves: [] }` / `200 { stats: {present-0…} }`. `Profile.tsx` sets `notFound=true` only on a twin rejection with `status === 404` (`is404`); a 200-empty leaves it false and the header + empty states render. `NotFound.tsx` copy ("That page is not on the shelf.") matches the test regex. The twins are the source of truth — the identity read's legacy 400 is not relied on.

### TTL cache — VERIFIED genuine, not flaky, key-isolated
`Map<string, {value, at}>` per twin, freshness `now() - at < 60_000`, `now` injectable via deps (default `Date.now`). One cache per router instance — correct for the single mount in `index.ts` (no `now` threaded in production, which is right). Tests are deterministic: a controlled `clock` advanced 30s (asserts `query.mock.calls.length` unchanged) and 61s (asserts it grew) — no `setTimeout`, no wall-clock dependence. The cache key is the **resolved target hex**, so npub/hex forms of one target share an entry and two different targets get different entries; serving one user's data for another is structurally impossible. Caching an omit-on-throw partial for ≤60s is acceptable per the time-only invalidation the ADR pins.

### Fixture retirement — VERIFIED complete (re-grep results)
- `apps/web/src/data/profile-fixtures.ts` — **deleted** (confirmed gone).
- All 5 components + CSS — **deleted**: `TrustCard.{tsx,css}`, `GenreAffinity.{tsx,css}`, `ProfileActivity.{tsx,css}`, `ProfileShelves.{tsx,css}`, `ProfileHeader.{tsx,css}` (all confirmed gone).
- `FIXTURE_MIRA_PUBKEY` — **removed** from `fixture-constants.ts`; `FIXTURE_LIBRARIAN_PUBKEY` — **kept** (still exported, used by book fixtures).
- Route param `:handle` → `:npub` in `App.tsx` — **done**.
- Re-grep across `apps/` + `packages/` (excluding deleted files):
  - `profile-fixtures` → only two **test comment** lines, zero code imports.
  - `FIXTURE_MIRA_PUBKEY` → **zero**.
  - `getProfileRecord` → **zero**.
  - `mira-calloway` → **zero**. (`"Mira Calloway"` survives only in `book-fixtures.ts` as a book author name and in `AuthEmailSignup.tsx` as a form placeholder — both pre-existing, unrelated to the retired profile fixture, out of scope.)
  - `TrustCard|GenreAffinity|ProfileActivity|ProfileShelves|ProfileHeader` → only one **test comment** string ("// TrustCard gone"), zero importers.
  - No dangling `/profile/mira-calloway` link anywhere (Q1 confirmed).

### No test weakened — VERIFIED
Only 7 test files changed: 5 new Story-20 files + 2 fixture-retirement edits. `fixtures.test.ts` removed only the Mira well-formedness `describe` block (it validated retired data); the 3 book/genre tests are untouched. `routes.smoke.test.tsx` rewrote the Mira-heading smoke into an npub-fallback render that additionally asserts `queryByText("Mira Calloway")` is **absent** — a stronger assertion, not a loosened one. No Story-18/19 suite, no `profile-stats.test.ts` / `shelves-enriched.test.ts` / `profile.test.ts` / `profile-me-polish.test.tsx`, and no search/trust guard was modified. The Implementer's "no test modified beyond the Tester's adjustments" claim holds.

## UI integrity

- [x] Brand tokens: the new Substack link uses `--u-amber` via a `.me-substack` class. No new hex literal anywhere in the diff (grepped — zero outside `tokens.css`).
- [x] No icon library; `↗` is the allowed typographic glyph.
- [x] Copy "Writes on Substack ↗" passes the no-slop rules (no em dash, no banned verb, no rhetorical contrast). The em-dashes in the diff are confined to **code comments**, not shipped UI strings. Other strings ("Shelves", "No public shelves yet.", the stat labels) are reused from Story 19.
- [x] npub-display / hex-internal honored throughout. Trust-tier badge correctly **omitted** (out of scope; trust not live).

## Things tests can't catch
- [x] No secrets, no `console.log`/debug, no TODO/FIXME, no `nsec` in added lines (grepped clean).
- [x] No commented-out code left behind.
- [x] Error paths: best-effort kind-0 read degrades to null (fallback); per-field stat omit-on-throw; 404 on unresolvable; 503 on missing librarian (mirrors existing guards).
- [x] No race condition: the `Profile.tsx` effect uses a `cancelled` guard on both fetches.
- [x] Librarian pubkey resolved at runtime via `lib()` everywhere; no hardcode (the fixture's `FIXTURE_LIBRARIAN_PUBKEY` is a web *test* constant, not shared API code).

## House rules check
- [x] PRD §11.3 scope discipline: read + Substack-display only. No kind-0 write, no activity feed, no genre-affinity chart, no trust-tier badge, no follow/follower counts. Nothing out-of-scope sneaks in.
- [x] POV-first: every read is `authors:[targetHex]` (single author); no trust weighting, no observer parameter — correctly N/A.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/api/src/routes/profile-stats.ts` / `shelves.ts` (TTL cache)** — a partial stats result produced by an omit-on-throw read is cached for up to 60s, so a transient relay failure can suppress a field for the cache window even after the relay recovers. This is consistent with the ADR's time-only invalidation and is not a correctness violation (the field is honestly omitted, never faked). Optional future improvement: skip caching results that had a failed sub-read. Not blocking.

## Verdict
**PASS**

All three gates are green, every one of the eight acceptance criteria is covered by a test asserting real behavior, the ADR's file set and Option-A boundary are honored, the no-hex-leak / honesty / 404-discriminator / TTL-cache invariants are verified, the fixture retirement is complete with zero dangling references, and no existing test was weakened. No blocking issues.
