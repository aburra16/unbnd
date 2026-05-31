# Test Plan: Story 24 — Make user identities clickable → reach any profile

**Story:** `engineering-team/stories/24-clickable-profiles.md`
**ADR:** `engineering-team/decisions/0024-clickable-profiles.md`
**Date:** 2026-05-31

Web-only story. The API already returns every rater's npub (`PublicRating.npub`)
and the submitter's npub (`SubmittedBook.submitter`); no API change is in scope,
so there are no API tests. All tests are Vitest + Testing Library component/route
tests under `apps/web/test/`, mirroring `account-menu.test.tsx`,
`follow-button.test.tsx`, `ratings-panel.test.tsx`, and `profile-public.test.tsx`
(MemoryRouter for `Link` hrefs; `useProfileMeta` and `api` mocked, no relay).

## Coverage map
Every acceptance criterion maps to at least one test.

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (all raters surfaced; reviewers + rate-only; count matches) | `renders a badge per rater (no overflow) when there are 5 or fewer raters`; `shows only the first 5 badges plus a '+N' chip when there are more than 5 raters`; `reveals a linked badge for EVERY rater after the chip is clicked`; `renders a badge for a rater with no reviewText` | `apps/web/test/components/rated-by-row.test.tsx` | component |
| AC-2 (each rater identity links to `/profile/<npub>`) | `links each visible badge to that rater's npub-addressed profile`; `reveals a linked badge for EVERY rater after the chip is clicked`; (byline) `links the named byline to /profile/<that npub>` | `rated-by-row.test.tsx`, `reviews-list-byline.test.tsx` | component |
| AC-3 (rate-only rater shows name + score, links, no fabricated text) | `renders a badge for a rater with no reviewText`; `shows the rater's score in the expanded grid (★ score), name resolved from kind-0` | `rated-by-row.test.tsx` | component |
| AC-4 (submitter present → link; absent → nothing, no crash) | `renders 'added by <submitter>' as a link to /profile/<submitter npub>`; `renders no 'added by' text and no broken link when submitter is absent`; `does not crash and still lists the book when submitter is absent` | `apps/web/test/routes/submissions-submitter-link.test.tsx` | route |
| AC-5 (npub for display, hex never required) | `never renders a hex pubkey in any href or visible text (npub-only, AC-5)`; `renders no hex pubkey in any byline href or visible text (AC-5)`; `renders no hex pubkey in the submitter link href or text (AC-5)` | all three files | component/route |
| AC-6 (perspective consistency — links whatever the passed array carries) | `renders exactly the perspective array's raters, in order, each linked` | `rated-by-row.test.tsx` | component |
| AC-7 (layout preserved — summary block unchanged, reviews keep weight) | Covered by the **existing** `ratings-panel.test.tsx` (summary average/count assertions stay green) plus the structural guarantee that `RatedByRow` is additive (`renders the 'Rated by' label`). Not separately re-asserted to avoid pinning layout details the spec doesn't fix. | `ratings-panel.test.tsx` (existing) | component |
| AC-8 (no fabrication; zero ratings → nothing) | `renders nothing for an empty ratings array (no shell, no placeholder)`; rate-only-only path covered by `ReviewsList` returning null (existing behavior) + `RatedByRow` rendering the roster | `rated-by-row.test.tsx` | component |
| AC-9 (review byline resolves kind-0 name, falls back to shortNpub, links) | `shows the resolved display name (not the short-npub) for a reviewer with a kind-0 name`; `falls back to shortNpub when the reviewer has no kind-0 name, still linked`; `links the named byline to /profile/<that npub>`; `resolves the byline name via the cached useProfileMeta path (one resolution per reviewer)` | `apps/web/test/components/reviews-list-byline.test.tsx` | component |

### Lazy-on-expand guarantee (ADR 0024 note 1)
`does not render the 6th+ rater (nor fire its kind-0 fetch) before expand` in
`rated-by-row.test.tsx` pins the structural lazy mount: collapsed render mounts
≤5 badges, and the overflow raters' `useProfileMeta` is not called until the user
expands. This is the contract that keeps a popular book from firing a burst of
kind-0 fetches on first paint.

> Test-design correction (2026-05-31): badge-6 absence while collapsed is asserted
> by exact npub-href (`collapsedHrefs not.toContain "/profile/<npub(6)>"`), not by a
> `queryByRole` accessible-name substring. All fixture npubs share the same `shortNpub`
> (`slice(0,10)` = `"npub1rater"`, the per-rater digit is elided), so a by-name query
> matched all 5 visible badges and threw "multiple elements" — un-satisfiable, not an
> implementation gap. The exact-href check (plus the `useProfileMeta`-not-called check)
> proves the same lazy guarantee without name collision.

## Edge cases
- [x] Zero raters → `RatedByRow` renders nothing (AC-8).
- [x] Exactly ≤5 raters → no "+N" chip.
- [x] >5 raters → "+N" chip; expand reveals all, each linked.
- [x] Rate-only rater (no `reviewText`) → still a badge; expanded grid shows ★ score.
- [x] Reviewer with no kind-0 name → byline falls back to `shortNpub`, still a link.
- [x] Submitter absent → no "added by", no broken link, no crash (current behavior preserved).
- [x] Hex never leaks: no 64-char hex string in any href or visible text (AC-5), asserted on all three surfaces.
- [x] Perspective subset (e.g. trust-weighted) → row links exactly the passed array, in order (AC-6).

## Test infrastructure
- Test runner: **Vitest** + Testing Library (`apps/web/test/...`). No relay, no network.
- `useProfileMeta` is mocked (returns the kind-0 metadata per case; default `null`
  → `shortNpub` fallback). `displayNameOf` is the real fallback chain.
- `api` is mocked per file (submissions list; `auth.me` rejects → signed-out so
  `Nav`/`useSession` settle without a real fetch).
- `MemoryRouter` wraps every render so `Link` produces an `href` to assert.
- No `docker compose` dependency: this is presentation over data the app already
  fetches; no fixture-seeded relay state is required.

## How to run

```
pnpm --filter @unbnd/web exec vitest run test/components/rated-by-row.test.tsx test/components/reviews-list-byline.test.tsx test/routes/submissions-submitter-link.test.tsx
```

Full web suite (use the workspace-correct invocation — NOT `--filter <pkg> test run`):

```
pnpm --filter @unbnd/web exec vitest run
```

## Verification (intentionally RED)
The new tests fail with the current code. Confirmed on 2026-05-31 at commit `35acd45`.

- **`rated-by-row.test.tsx` — Failed Suite (collection error).** `RatedByRow`
  does not exist yet, so the import fails before any case runs. This is the
  intended not-implemented signal for a not-yet-created component; the 9 cases in
  the file become live red→green checks once `apps/web/src/components/RatedByRow.tsx`
  exists.
- **`reviews-list-byline.test.tsx` — 5 failed.** The byline is currently plain
  `shortNpub` text with no `Link` and no name resolution, so: name not shown,
  no `link` role, `useProfileMeta` never called. Fails for the right reason
  (feature not implemented), not a test bug.
- **`submissions-submitter-link.test.tsx` — 2 failed, 2 passed.** The two
  failures are the present-submitter link assertions (submitter is plain text
  today, no `Link`). The two passes are the **absent-submitter** cases, which
  assert *current preserved behavior* (no "added by", no crash) — correctly green
  per AC-4's negative path.

```
 ❯ Failed Suites 1
 FAIL  test/components/rated-by-row.test.tsx
 Error: Failed to resolve import "../../src/components/RatedByRow" from
        "test/components/rated-by-row.test.tsx". Does the file exist?

 ❯ Failed Tests 7
 FAIL  reviews-list-byline > shows the resolved display name … for a reviewer with a kind-0 name
   TestingLibraryElementError: Unable to find an element with the text: Ada Lovelace
 FAIL  reviews-list-byline > links the named byline to /profile/<that npub>
   Unable to find an accessible element with the role "link" and name `/ada lovelace/i`
 FAIL  reviews-list-byline > falls back to shortNpub when the reviewer has no kind-0 name, still linked
   Unable to find an accessible element with the role "link" and name `/npub1anon0…/i`
 FAIL  reviews-list-byline > resolves the byline name via the cached useProfileMeta path …
   AssertionError: expected "spy" to be called with arguments: [ Array(1) ]
 FAIL  reviews-list-byline > renders no hex pubkey in any byline href or visible text (AC-5)
   Unable to find an accessible element with the role "link"
 FAIL  submissions-submitter-link > renders 'added by <submitter>' as a link to /profile/<submitter npub>
   Unable to find an accessible element with the role "link" and name `/npub1submtr0…|added by/i`
 FAIL  submissions-submitter-link > renders no hex pubkey in the submitter link href or text (AC-5)
   Unable to find an accessible element with the role "link" and name `/npub1submtr0…|added by/i`

 Test Files  3 failed (3)
      Tests  7 failed | 2 passed (9)
```

## Fixture / fallout notes for the Implementer
These are flags to keep existing suites green WITHOUT weakening any assertion —
do not relax the new tests to accommodate them.

1. **`ratings-panel.test.tsx` mocks `api` but NOT `useProfileMeta`.** Once
   `RatingsPanel` mounts `<RatedByRow ratings={reviews} />` and `ReviewsList`
   calls `useProfileMeta`, that hook will run with the *real* implementation in
   that test. It currently passes because every `ratings`/`weighted.ratings`
   array in the fixtures is **empty** (`ratings: []`), so neither a `RaterBadge`
   nor a review byline mounts and no hook fires. **Watch-item:** if you add any
   non-empty `ratings` fixture to that file, mock `useProfileMeta` there (mirror
   `profile-public.test.tsx`'s mock) so it doesn't call the unmocked
   `api.profile.get`. Do not change the existing empty-array cases.

2. **Any future book-detail / RatingsPanel test that renders non-empty ratings**
   must mock `useProfileMeta` (and ensure `api.profile.get` exists on its mock),
   because both `RatedByRow` and the resolved `ReviewsList` byline now resolve
   kind-0 per distinct rater via that hook. Flagged so the Implementer updates
   the mock rather than discovering an unmocked-fetch flake.

3. **`shortNpub` form in assertions.** The byline/submitter fallback assertions
   match the `npub1xxxxxxxx…last4` shape (`shortNpub`: first 10 chars + `…` +
   last 4). The Implementer must use the shared `shortNpub` (web `view-model.ts`
   for `ReviewsList`; the file-local `shortNpub` already in
   `CommunitySubmissions.tsx`) so the elision matches.

4. **No new API surface.** If the Implementer finds themselves wanting a batched
   profile endpoint, that's ADR Option B (rejected, out of scope). Stay on the
   per-badge cached `useProfileMeta` path.
