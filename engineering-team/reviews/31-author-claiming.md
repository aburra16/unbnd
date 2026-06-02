# Review: Story 31 — Author claiming (trust-independent core)

**Story:** `engineering-team/stories/done/31-author-claiming.md`
**ADR:** `engineering-team/decisions/0032-author-claiming.md`
**Test plan:** `engineering-team/stories/done/31-author-claiming.test-plan.md`
**Branch:** `feat/author-claiming` (base `main`)
**Reviewed:** 2026-06-01
**Reviewer:** independent Reviewer (did not write the code or tests)

## Verdict: APPROVED (PASS)

The diff matches the story (5 active ACs; AC-3/4/5 deferred to Story 32), conforms to ADR 0032,
covers every active AC with meaningful tests, and clears the hard invariants: no privilege
escalation, no librarian secret on the API, canonical record never mutated, no hex on the wire,
"claimed ≠ verified" honored, no hand-rolled crypto. The one Implementer test edit is purely a
type annotation, not a weakening. One non-blocking process note recorded below.

## Gates (run by the Reviewer)

| Gate | Result |
|---|---|
| `pnpm -r typecheck` | PASS (all 7 projects, clean) |
| `pnpm -r test` | PASS on re-run — schemas 85, api 619 (+10 env-gated skips), web 259, search 11, seeder 12, promoter 11, indexer 6. (First full run showed a single non-deterministic failure in `apps/api/test/routes/auth.test.ts:152` — `GET /auth/me` no_session — which **passed** on an isolated `@unbnd/api` run and on a second full run. That test file and the auth route are **unchanged** by this branch; it is a pre-existing flake, not a regression. The web `ECONNREFUSED :3000` lines are happy-dom noise, also pre-existing.) |
| `pnpm --filter @unbnd/web build` | PASS (`tsc --noEmit` + vite build, 439 modules) |

No story test is `.skip`/`.only`/`.todo`. The 10 API skips are pre-existing DB/strfry integration
tests gated on `DATABASE_URL`/`STRFRY_TEST_URL` — they hide no Story-31 work.

## AC-by-AC (5 active)

- **AC-1 (claim is an author-signed kind-39999 event, idempotent):** PASS. `BookClaim.ts` emits
  `["a", 39999:<librarian>:<slug>]`, `["p", claimantHex]`, `["t", slug]`, `["z", book-claims header]`,
  d-tag `claim--<slug>--<claimant8>` (stable per claimant+book → re-claim replaces). Write route
  is session-gated only; anon → 401 `no_session` on both `/api/claims/template` and `/api/claims`;
  event pubkey ≠ session → 403 `pubkey_mismatch`. Covered by `BookClaim.test.ts` and `claims.test.ts`.
- **AC-2 (honest "Claimed by" badge, multi-claimant, no winner):** PASS. `AuthorBadge.tsx` renders
  "Claimed by {name}" + "and N others"; 0 claimants → null. `projectClaimants` dedupes by claimant,
  sorts deterministically (created_at, then npub). `books-claimants.test.ts` covers 0/1/N/replaced and
  the hex-leak assertion; `author-badge.test.tsx` covers the rendering, shortNpub fallback, and
  verified-absent.
- **AC-6 ("Books by this author"):** PASS. `profile-claims.ts` reads `authors:[hex]` from the
  **path** npub via `queryPaged` (cap-safe, ADR 0021), resolves `#t`/`#a` slugs, batch-hydrates,
  skips missing, `{books:[]}` when none. Web sections in `Profile.tsx`/`ProfileMe.tsx` read by
  path/own npub, absent when empty. Covered by `profile-claimed-books.test.ts` and
  `profile-books-by-author.test.tsx`.
- **AC-7 (honest states; "claimed ≠ verified"):** PASS. `ClaimControl.tsx` shows idle/Claiming…/
  "You claimed this book."/error in place (no toast). The word "verified" appears nowhere in shipped
  UI; Submit toggle copy fixed to "Marks this submission as a self-claim of authorship. It signals
  you wrote the book; it is not a vetted credential." No trust-tier string, no GrapeRank number.
- **AC-8 (both tiers, no new crypto, trust-independent in CI):** PASS. Sovereign = template→NIP-07
  sign→submit; custodial = `submitCustodial`→`custodialSign` (ADR 0006), 401 `reauth_required` when
  the wrap is gone, 502 `publish_failed` on relay reject. Crypto is `verifyEvent` + `npubEncode`
  (nostr-tools) and the pre-existing custodial `finalizeEvent` signer — no new primitives. All tests
  run with no trust provider, relay, or human.

## Hard-invariant assessments

- **No privilege escalation / no librarian secret:** PASS. `claims.ts` gates on `sessionUser` only,
  never trust/role/verification. The author signs their own claim (`["p", claimantHex]` = session
  pubkey, enforced by `validateSignedClaim` pubkey check). `grep LIBRARIAN_NSEC apps/api/src` →
  **none**; it lives only in `apps/seeder` + `apps/promoter`, and the existing
  `no-librarian-nsec-in-api.test.ts` guard still passes. No new librarian signing path on the API.
- **Canonical record never mutated:** PASS. `books.ts` adds the claims read as a parallel
  `Promise.all` and returns `book` unchanged alongside `claimants`. The `{ book, claimants }` assembly
  is the Story-32 read-merge seam and is a pass-through today (`effectiveBook === canonical`; no
  overlay exists). No write to the librarian record anywhere.
- **No hex on the wire:** PASS. `projectClaimants` emits `{ npub: npubEncode(hex) }` only; the by-author
  read returns hydrated `PublicBook`s. `books-claimants.test.ts:131` asserts
  `JSON.stringify(res.body)` does not contain the hex — and the production code structurally cannot
  put hex on the wire (it never carries the hex past the npub encode).
- **"claimed ≠ verified" honesty:** PASS. "verified"/GrapeRank/trust-tier strings absent from
  `AuthorBadge`, `ClaimControl`, their CSS, and `Submit`. Multiple claimants shown, no silent winner.

## Test-edit adjudication (explicit mandate)

The Implementer edited exactly one test file:
`apps/api/test/routes/profile-claimed-books.test.ts:105`.

`git diff 93f8665 HEAD -- apps/api/test/routes/profile-claimed-books.test.ts`:

```
-    const queryPaged = vi.fn(async () => ({ events: [claimEvent("ol-a", AUTHOR_HEX)], capped: false }));
+    const queryPaged = vi.fn(async (_filter: Record<string, unknown>) => ({ events: [claimEvent("ol-a", AUTHOR_HEX)], capped: false }));
```

**Verdict: PURELY a type annotation. Acceptable. NOT a weakening, NOT masking a production bug.**
The change adds an unused `_filter: Record<string, unknown>` parameter to the `vi.fn` mock factory
(the conventional fix for the recurring unused-binding TS error). The mock's return value is byte-for-byte
identical. The assertion that follows (lines 109–113) is intact and meaningful: it reads
`queryPaged.mock.calls[0][0]` and asserts `call.authors === [AUTHOR_HEX]` (the **path** npub),
`call["#z"][0] === 39998:<lib>:book-claims`, and `call.kinds` contains 39999. No assertion, return,
or behavior was changed or relaxed.

## Migration / integrity check

- `books.test.ts`: the `:slug` mock now routes by `#z` (the new `bookOnly` helper returns `[]` for the
  claims read), so the book record can't be mis-parsed as a claim. Existing `book.title`/`authorName`
  assertions exact; one additive `claimants: []` assertion. Faithful.
- The 9 web migrations (`book-detail-trust-view`, `routes.smoke`, the 6 `profile-me-*`,
  `profile-public`, `profile-following-count`) add `claimants: []` to the book-get mock and stub
  `api.claims.*` / `api.profile.claimedBooks` empty. Mocks typed to the real shape (a dropped field
  fails). No protected assertion weakened or removed.
- `BookHeader`'s new `claimants` prop is **optional** (`claimants ?? []`), so `tag-consensus-labels.test.tsx`
  (props-only render, no claimants) stays green — confirmed.
- New tests are deterministic: signed-event fixtures use `nostr-tools/pure` (`finalizeEvent`/`getPublicKey`,
  audited); no `Date.now()` in asserted output (it appears only in the production template builders for
  `created_at`); role-scoped web queries; no intra-module `vi.mock`.

## Scope / firewall

PASS. No edit surface, no `BookAuthorOverlay` schema, no `author-edits` header (reserved name only),
no verification gate, no `author-verified` consensus, no trust read, no canonical mutation. ADR and
story are consistent (story tightened to 5 ACs; AC-3/4/5 explicitly deferred to Story 32). DList shapes
match the ADR (kind 39999, d-tag `claim--<slug>--<claimant8>`, `book-claims` header; librarian pubkey
resolved at runtime, never hardcoded). No new lint/typecheck/build tooling. No PRD §11.3 surface.

## Findings

**BLOCKING:** none.

**NON-BLOCKING:**

1. **Process note (recurring).** The Tester's red commit (`93f8665`) shipped a `vi.fn` mock that did
   not typecheck under the API project's strict settings, forcing the Implementer to edit a test to fix
   a `TS2493`-class error. The Tester should run `pnpm -r typecheck` before committing a red set so the
   intentionally-failing tests still compile. This has recurred across stories; worth folding into the
   Tester workflow.

## Close-out (NOTED — not executed; gate left to the user)

On the user's go-ahead, retire the story per `engineering-team/workflows/5-review.md`:
1. Set `**Status:** Done` on `engineering-team/stories/done/31-author-claiming.md`.
2. `git mv` the story + test-plan into `engineering-team/stories/done/`.
3. Flip ADR 0032 to `**Status:** Accepted` and update its `**Story:**` path; update the test-plan and
   this review's `**Story:**`/`**Test plan:**` paths to the `done/` locations.
4. Story 32 (Verified Author) is where the metadata-edit surface, the `BookAuthorOverlay` event +
   `author-edits` header, the verification gate, and the read-time overlay merge land (the seam this
   story leaves as a pass-through).

**Verdict: APPROVED.**
