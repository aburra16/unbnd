# Test Plan: Story 32 — Verified Author + gated author metadata editing (Block C)

**Story:** `engineering-team/stories/32-verified-author.md`
**ADR:** `engineering-team/decisions/0033-verified-author.md`
**Date:** 2026-06-01
**Branch:** `feat/verified-author`
**Baseline commit (red confirmed):** `7565140`

Trust-DEPENDENT story → every trust path uses the deterministic **fixture
`TrustProvider`** (`FixtureTrustProvider`), never Brainstorm, never a live relay,
never a human (AC-9). `N` (the head count) is pinned to a fixture value (2) and
behavior is asserted on both sides of it. No `Date.now()` in any asserted output;
no intra-module `vi.mock` on the unit under test; web component queries are
role-scoped.

## Coverage map

| Criterion | Test name | Test file | Level |
|---|---|---|---|
| AC-1 (assert/dispute, curator-gated write, idempotent) | `above-threshold curator → unsigned template (#a book, #p author)` / `anon → 401 no_session` / `below-floor curator → 403 below_gate (server-enforced)` / `above-floor sovereign valid → publishes once + {ok}` / `403 pubkey_mismatch` / `502 publish_failed` / `re-asserting same (curator, author, book) reuses a stable d-tag` | `apps/api/test/routes/author-verified.test.ts` | route (DI) |
| AC-1 (schema target + idempotent d-tag) | `builds authorverified--<slug>--<author8>--<curator8>` / `idempotent same (curator,author,book)` / `differs by curator` / `differs by author` / `targets the book by #a, carries #p(author), t(slug), polarity, z, empty content` / `round-trips an apply and a dispute` | `packages/schemas/test/AuthorVerifiedAssertion.test.ts` | unit |
| AC-2 (count-gate ≥ N, both sides; dispute lowers; untrusted volume can't verify) | `verifies when ≥ N distinct above-floor curators net-apply` / `does NOT verify with only N-1` / `pins behavior on both sides of N` / `a curator's latest DISPUTE drops them` / `latest-per-(curator,author) wins` / `a below-floor curator does not count` / `many zero-weight asserters cannot push over the bar` | `apps/api/test/author-verified/verify.test.ts` | unit (pure + fixture) |
| AC-3 (self-verification excluded) | `the author's own apply assertion does not count` / `an author cannot self-verify even with a high own weight` | `apps/api/test/author-verified/verify.test.ts` | unit |
| AC-2/AC-3 (in the read-merge) | `a curator's latest dispute drops the count below N → not verified, no overlay` / `the author's own assertion does not count toward their own verification` | `apps/api/test/routes/books-verified-merge.test.ts` | route (DI) |
| AC-4 (badge upgrade, honest distinction, no leak) | `renders "Verified Author" for a verified claimant` / `stays "Claimed by {name}" for an UNVERIFIED claimant` / `the two states are honestly distinct` / `mixed verified/unverified set, each honest` / `shows no raw GrapeRank number or curator count` | `apps/web/test/components/author-badge-verified.test.tsx` | component |
| AC-5 (verified-only edit write: three-field whitelist, URL validation, gate, both tiers) | `a Verified author → unsigned template prefilled` / `a NON-verified user → 403 not_verified` / `signed-out → 401 no_session` / `non-http(s) coverUrl → 400 invalid_url` / `non-http(s) purchaseUrl → 400 invalid_url` / `publishes a valid overlay once + read-back` / `non-verified author POST → 403, no publish` / `403 pubkey_mismatch` / `non-whitelisted field (title) → 400 invalid_event, no publish` / `502 publish_failed` | `apps/api/test/routes/author-edits.test.ts` | route (DI) |
| AC-5 (overlay schema: payload only blurb/cover/purchase, replaceable d-tag) | `builds authoredit--<slug>--<author8>` / `carries ONLY blurb / coverUrl / purchaseUrl` / `targets the book by #a, #p(author), z(author-edits), empty content` / `round-trips a full overlay` | `packages/schemas/test/BookAuthorOverlay.test.ts` | unit |
| AC-5 (web edit surface revealed only to the verified self; three fields; states; URL inline) | `shows the inline edit surface with exactly the three fields to the verified author` / `hides … from a NON-verified claimant` / `hides … from a verified author who is NOT the session user` / `hides … from a signed-out viewer` / `sovereign saves via template→sign→submit, success in place` / `custodial saves via the server-signed path` / `a bad cover URL shows an inline message and does NOT submit` / `shows an honest error in place when the save fails` | `apps/web/test/routes/book-detail-author-edit.test.tsx` | component |
| AC-6 (read-merge: one verified → overlay applied + attribution; bare → canonical; reversibility; canonical never mutated; canonical recoverable) | `applies the verified author's blurb/cover and lists them in authorProvided` / `a cleared overlay field reverts to the canonical value` / `an unverified claimant's overlay is ignored; canonical renders; verified:false` / `below-N verification does not apply the overlay` / `never mutates the canonical record event tags` / `fetches asserter weights in exactly ONE batched trust call` | `apps/api/test/routes/books-verified-merge.test.ts` | route (DI) |
| AC-6 (attribution surfaced in UI) | `labels an applied author-provided field as attributed in the UI` ("From the author") | `apps/web/test/routes/book-detail-author-edit.test.tsx` | component |
| AC-7 (none-on-conflict, all badged) | `two verified claimants → NO overlay applied, ALL badged verified` | `apps/api/test/routes/books-verified-merge.test.ts` | route (DI) |
| AC-8 (honest degrade: no fabricated verification/overlay; gate closes; never throws) | `an empty weight map → no one verified` / `a throwing trust seam degrades to not-verified` / `returns [] for an empty assertion set` (verify) ; `no trust provider → 403 below_gate` / `a throwing trust seam still closes the gate` (author-verified write) ; `honest degrade (no house observer) → canonical, verified:false, no 500` / `no trust provider → canonical, no 500` (read-merge) | `verify.test.ts`, `author-verified.test.ts`, `books-verified-merge.test.ts` | unit + route |
| AC-9 (both tiers; fixture-verified; architecture guard) | custodial cases in `author-verified.test.ts` + `author-edits.test.ts` (server-signs / reauth 401 / publish 502 / below-gate before signing); sovereign cases throughout; `Brainstorm API specifics live only in the adapter` | route tests + `apps/api/test/trust/architecture.test.ts` (stays green) | route + guard |
| Config (`VERIFIED_AUTHOR_MIN_CURATORS`) | `defaults to 2` / `respects a numeric override` / `accepts the minimum of 1` / `throws on zero` / `throws on a negative value` / `throws on a non-integer` | `apps/api/test/config-verified-author.test.ts` | unit |

## How the count-gate is pinned (the load-bearing assertions)

- **Self-exclude (AC-3):** in `verify.test.ts`, the AUTHOR is given a high fixture
  weight (0.95) and asserts on their own claim; the verdict still drops below `N`,
  proving exclusion is structural (not a weight accident). Re-asserted in the
  read-merge with `verifiedEvent(slug, AUTHOR, AUTHOR, +1, …)`.
- **Dispute symmetry (AC-2):** a curator applies, then disputes later
  (`latest created_at` wins) → net count drops below `N` → not verified. A later
  re-apply re-counts them.
- **≥ N both sides (AC-2):** the same two-curator fixture is asserted verified at
  `N=2` and not-verified at `N=3`.
- **Batched weights (no N+1):** `vi.spyOn(trust, "weights")` asserts **exactly one**
  call, over the union of distinct curator hexes — both in `verify.test.ts` and in
  the `GET /api/books/:slug` read-merge.
- **Zero-weight volume can't verify:** 10 assertions from an untrusted (absent from
  the map) key → still not verified at `N=1`.

## How the verified-only read-merge + none-on-conflict + canonical-never-mutated are pinned

- **One verified → overlay applied:** `effectiveBook.blurb/coverUrl` reflect the
  author's overlay; `authorProvided` lists exactly the applied fields; the claimant
  is `verified:true`.
- **Reversibility:** a `null` overlay field reverts that field to the canonical
  value while keeping the others; `authorProvided` lists only the applied field.
- **Bare claim:** no verification assertions (or below-N) → overlay ignored,
  canonical renders, `authorProvided: []`, `verified:false`.
- **None-on-conflict (AC-7):** two claimants both clear `N` → NO overlay
  (`authorProvided: []`), both claimants `verified:true` (no fabricated winner).
- **Canonical never mutated:** the source canonical event object is snapshotted
  (`JSON.stringify`) before the request and asserted byte-identical afterward — the
  read-time compose must not write back onto the librarian-signed record. Canonical
  values remain recoverable (they are the un-overlaid `book` field on the bare /
  conflict / degrade paths).

## How both tiers are covered

Every write route (`author-verified`, `author-edits`) is exercised for **sovereign**
(client-signed event in the body → `validate…` → `publish`) and **custodial**
(`custodialSign`: success publishes; `null` → 401 `reauth_required`; `publish` fail
→ 502; a below-gate / not-verified custodial caller is rejected **before** signing).
No new crypto: signed-event fixtures are built with `nostr-tools` (`finalizeEvent`)
in `apps/api/test/author-verified/_fixtures.ts`, mirroring `claims/_fixtures.ts`.

## Edge cases covered

- [x] Anon (signed-out) on every write → 401, server-enforced (not UI-hidden).
- [x] Below-gate curator on assert (template AND write) → 403 `below_gate`.
- [x] Non-verified user on edit (template AND write) → 403 `not_verified`.
- [x] `pubkey ≠ session` on both signed writes → 403 `pubkey_mismatch`.
- [x] Bad `http(s)` cover/purchase URL → 400 `invalid_url`, no publish.
- [x] Smuggled non-whitelisted field (title) in the overlay → 400 `invalid_event`.
- [x] Idempotent re-assert / re-save (stable per-key d-tags).
- [x] Honest degrade: empty weights / no observer / no provider / throwing seam →
  gate closes, no verification, no overlay, never a 500, `weights` never throws.
- [x] No claims at all → empty claimants, `authorProvided: []`, canonical renders.
- [x] No raw GrapeRank number / curator count / trust-tier string on the badge.

## Test infrastructure

- Runner: **Vitest** (`apps/api/test/**`, `apps/web/test/**`, `packages/schemas/test/**`).
- Component tests: Vitest + Testing Library; boundary mocks only (`api`,
  `useSession`, `useTrustView`, `useBookRatings`, `useProfileMeta`).
- Route tests: DI'd `query` / `publish` / `sessionUser` / `custodialSign` / `trust`;
  no Express app booted beyond the router under test.
- Trust: `FixtureTrustProvider` (`TRUST_PROVIDER=fixture` semantics) with a
  deterministic weight map. **No `docker compose up` dependency** — every test is
  network-free and deterministic. The whole story is green in CI under the fixture
  provider with no Brainstorm/relay/human (AC-9).

## How to run

```
pnpm --filter @unbnd/schemas test
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/web test
pnpm -r test
pnpm -r typecheck
```

## Verification — the red set fails for the right reason, and typechecks clean of mock errors

Confirmed on 2026-06-01 at commit `7565140` (tests authored, no production code).

### Test run (assertions fail — feature not implemented)

```
SCHEMAS:  Test Files  2 failed | 9 passed (11)        Tests  85 passed (85)
          (AuthorVerifiedAssertion.test.ts + BookAuthorOverlay.test.ts fail to
           load: ../src/AuthorVerifiedAssertion and ../src/BookAuthorOverlay don't
           exist yet — the schema modules the Implementer creates.)

API:      Test Files  6 failed | 73 passed | 2 skipped (81)
          Tests  19 failed | 618 passed | 10 skipped (647)
          (author-verified.test.ts, author-edits.test.ts, verify.test.ts —
           missing src modules; config-verified-author.test.ts — missing config
           key; books-verified-merge.test.ts + the migrated books.test.ts — the
           response has no `authorProvided`/`verified` yet.)

WEB:      Test Files  2 failed | 46 passed (48)        Tests  8 failed | 265 passed (273)
          (author-badge-verified.test.tsx — no "Verified Author" state yet;
           book-detail-author-edit.test.tsx — no "Your book details" surface /
           "From the author" attribution yet.)
```

Sample failure (right reason, not a test bug):

```
× AuthorBadge — verified upgrade (AC-4) > renders "Verified Author" for a verified claimant
  → Unable to find an element with the text: /verified author/i
× GET /api/books/:slug > returns the book record … > additive authorProvided
  → expected undefined to deeply equal []
```

The one-off `profile-follow.test.ts` "Expected HTTP/" line seen in a parallel run
is a pre-existing supertest port flake (passes in isolation: 25/25); it is untouched
by this change.

### Typecheck (`pnpm -r typecheck`) — clean of mistyped-mock errors

Every typecheck error is a "production code not written yet" error the Implementer
resolves; **zero** errors come from a mistyped mock (wrong `vi.fn` arity, too-narrow
table, stub missing a parameter).

```
WEB:      0 errors — completely clean. (The web red set fails the RUNNER's
          assertions while tsc stays green: the new web tests reference only
          existing symbols + plain object literals through untyped vi.fn mocks.)

SCHEMAS:  4 errors — all missing-feature:
            TS2307 ×2  Cannot find module '../src/AuthorVerifiedAssertion' / '../src/BookAuthorOverlay'
            TS2724 ×2  no exported member 'buildBookAuthorVerifiedHeaderAddress' / 'buildBookAuthorEditsHeaderAddress'

API:      17 errors — all missing-feature:
            TS2305 ×10 '@unbnd/schemas' has no exported member 'toAuthorVerifiedEvent' /
                       'toBookAuthorOverlayEvent' / 'AuthorVerifiedAssertion' / 'BookAuthorOverlay'
            TS2307 ×3  Cannot find module '../../src/author-verified/verify' /
                       '../../src/routes/author-verified' / '../../src/routes/author-edits'
            TS2339 ×4  Property 'verifiedAuthorMinCurators' does not exist on type 'Config'

  Filter check (errors NOT in {missing module, missing export, missing Config field}):
    → empty. No mistyped-mock errors anywhere.
```

Test-authoring hygiene fixed during the red pass so the only tsc errors are the
genuinely-missing production symbols: typed the `tags.map((t: readonly string[]) …)`
callbacks (were implicit-any), removed an unused import + an unused helper, and
loosened the `books-verified-merge` `makeApp` `over` param to `Record<string,unknown>`
(so the `{ trust }` literal — `BooksDeps.trust` doesn't exist until the Implementer
adds it — casts cleanly through `unknown`).
```

## Existing tests migrated (additive `verified` / `authorProvided` / 4-read merge)

| File | Why it broke | Migration | Faithfulness |
|---|---|---|---|
| `apps/api/test/routes/books.test.ts` | `GET /api/books/:slug` grows from 2 to 4 parallel reads + `authorProvided`. The `bookOnly` mock only routed `book-claims` away; the new `author-verified`/`author-edits` reads would mis-return book records. | `bookOnly` now also routes `author-verified` + `author-edits` to `[]`; deps cast `as unknown as BooksDeps`; added `authorProvided: []` + canonical-blurb assertions on the no-claims path. | The original book-shape + 404/503 assertions are unchanged; only additive expectations were added. |
| `apps/api/test/routes/books-claimants.test.ts` | Same 4-read change; `routedQuery` only handled `book-claims`. | `routedQuery` routes `author-verified` + `author-edits` to `[]`; deps cast `as unknown as BooksDeps`. | All claimant-projection assertions unchanged; the verified read-merge is exercised in the sibling `books-verified-merge.test.ts`. |
| `apps/web/test/book-detail-trust-view.test.tsx` | `api.books.get` mock returned `{ book, claimants }`; the contract now carries `authorProvided`. | Added `authorProvided: []` to the resolved value (settles signed-out → no edit surface). | The observer/POV tag-read assertions are unchanged. |
| `apps/web/test/routes.smoke.test.tsx` | Same. | Added `authorProvided: []` (signed-out smoke render → no edit surface). | All smoke assertions unchanged. |
| `apps/web/test/routes/book-detail-claim.test.tsx` | Same, plus BookDetail now mounts the edit surface that reads `api.authorEdits.*`. | Added `authorProvided: []` to the book mock and an `authorEdits: { template, submit, submitCustodial }` stub to the mocked api (surface hidden: no claimant `verified:true` matches the session). | Every claim-action assertion is unchanged. |

`apps/api/test/trust/architecture.test.ts` (ADR-0014 guard) is **unchanged** and
asserted to stay green: the feature consumes only the neutral `TrustProvider`; no
Brainstorm/NIP-85/30382 specifics leak.

The Story-31 `apps/web/test/components/author-badge.test.tsx` is **not** migrated:
its claimants carry no `verified` flag, so the optional flag defaults to the
unverified "Claimed by" state and its "never verified" assertions still hold.

## New files (Tester-owned)

**Schema (`packages/schemas/test/`):**
- `AuthorVerifiedAssertion.test.ts`
- `BookAuthorOverlay.test.ts`

**API (`apps/api/test/`):**
- `config-verified-author.test.ts`
- `author-verified/_fixtures.ts` (signed-event fixtures; no `.test` — a helper)
- `author-verified/verify.test.ts` (the count-gate)
- `routes/author-verified.test.ts` (curator-gated write)
- `routes/author-edits.test.ts` (verified-only edit write)
- `routes/books-verified-merge.test.ts` (read-merge)

**Web (`apps/web/test/`):**
- `components/author-badge-verified.test.tsx`
- `routes/book-detail-author-edit.test.tsx`
