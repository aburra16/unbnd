# Test Plan: Story 18 — Shelves (add/remove a book, view your own shelves)

**Story:** `engineering-team/stories/done/18-shelves.md`
**ADR:** `engineering-team/decisions/0018-shelves.md`
**Date:** 2026-05-30
**Phase:** Test Design (red). Tests are intentionally failing — the production surface does not exist yet.

The feature mirrors tags 1:1 (ADR 0018). Tests are mirrored from the tag equivalents:
- Schema: `packages/schemas/test/BookTagAssertion.test.ts`
- API aggregate: `apps/api/test/tags/aggregate.test.ts`
- API routes: `apps/api/test/routes/tags.test.ts`
- Web control: `apps/web/test/components/tag-control.test.tsx`
- Web profile: the `ProfileMe` render pattern

## Coverage map

Every acceptance criterion has at least one test.

| Criterion | Test name (it) | Test file | Level |
|---|---|---|---|
| AC-1 (add publishes an apply) | `targets the book by #a and carries d/z/t/polarity/p tags`; `runs template → signEvent → submit when adding to Want to Read`; `200 returns a kind-39999 template …`; `publishes a valid client-signed apply` | `packages/schemas/test/BookShelfAssertion.test.ts`, `apps/web/test/components/shelf-control.test.tsx`, `apps/api/test/routes/shelves.test.ts` | unit / component / route |
| AC-2 (remove publishes a retract) | `encodes a retract (removal) as polarity -1`; `drops a book whose latest assertion is SHELF_OFF`; `publishes a retract via polarity -1`; `submits a polarity -1 retract when removing a book already on a shelf` | schema, `apps/api/test/shelves/aggregate.test.ts`, route, shelf-control | unit / route / component |
| AC-3 (add idempotent / latest wins) | `keeps the latest assertion per (book, shelf) so re-adding stays single` | `apps/api/test/shelves/aggregate.test.ts` | unit |
| AC-4 (custom shelf) | `carries a name tag only on a custom-shelf apply`; `round-trips a custom-shelf apply …`; `resolves a custom shelf's name from the latest surviving apply`; `carries the custom display name into the template`; `sends a slug derived from the typed name plus the display name` | schema, aggregate, route, shelf-control | unit / route / component |
| AC-5 (default mutual exclusivity = move) | `after a retract from Reading and an apply to Read, the book lives on exactly one default`; `removes the old default then adds the new default (two writes)` | `apps/api/test/shelves/aggregate.test.ts`, `apps/web/test/components/shelf-control.test.tsx` | unit / component |
| AC-6 (three-tier signing) | `prompts sign-in … when signed out`; `runs template → signEvent → submit` (sovereign); `server-signs via submitCustodial …` (custodial); route `400 on bad polarity, 401 without session`; `server-signs the intent; 401 reauth_required when the wrap is gone`; `401 and no publish for an anonymous caller` | shelf-control, `apps/api/test/routes/shelves.test.ts` | component / route |
| AC-7 (read own shelves, grouped, honest) | `returns an empty list for a user with no shelf assertions`; `groups books by shelf slug and reports a real per-shelf count`; `lists the three defaults first … then custom alphabetically`; `queries the user's own kind-39999 shelf assertions and groups them`; `returns an empty list … (honest empty)`; `401 without a session` | `apps/api/test/shelves/aggregate.test.ts`, `apps/api/test/routes/shelves.test.ts` | unit / route |
| AC-8 (own-shelves view on /profile/me) | `renders each grouped shelf from the live read with a real per-shelf count`; `shows an honest empty state when the user has no shelves` | `apps/web/test/routes/profile-me-shelves.test.tsx` | component |
| AC-9 (verified live on staging) | Manual staging verification — see below. Not a unit test. | — | manual |

## AC-9 — manual staging verification (not automated)

Per the story, AC-9 is verified live on staging, not by a unit test. Steps for the verifier:

1. On `staging.unbnd.ink`, sign in as a **sovereign** (NIP-07) user.
2. Open a book detail page and add the book to "Want to Read" via the shelf control; sign the NIP-07 prompt.
3. Confirm the kind-39999 apply assertion lands on the relay (local strfry + dual-publish to dcosl per ADR 0011) — check via relay query for `kinds:[39999]`, `#t:["want-to-read"]`, `authors:[<your hex>]`.
4. Reload `/profile/me` and confirm the book appears under "Want to Read" with a real count.
5. Remove it from the control; reload `/profile/me`; confirm it drops off (retract resolved out).

## Edge cases covered

- [x] Honest empty state — user with zero shelf assertions returns `[]` (aggregate + route + ProfileMe).
- [x] Idempotent re-add — latest apply per (book, shelf) wins, no duplicate (AC-3).
- [x] Retract resolution — latest SHELF_OFF drops the book; re-apply after retract restores it.
- [x] Move sequencing — retract-old + apply-new yields the book on exactly one default (AC-5), both schema-level (aggregate) and UI-level (two `submitCustodial`/`submit` calls).
- [x] Custom name denormalization — `name` tag present only on custom applies, absent on defaults; resolved from latest surviving apply.
- [x] Default-shelf name resolution from fixed constants, never the wire.
- [x] Slug normalization — `toShelfSlug` lowercases/collapses/trims, is deterministic, rejects empty.
- [x] Ordering — three defaults first in PRD order, then custom shelves alphabetically.
- [x] Tier gating — signed-out (sign-in prompt, no picker), sovereign (NIP-07), custodial (server sign, reauth_required), anonymous route (401, no publish), pubkey mismatch (403).

### Edge cases intentionally NOT covered (out of scope per story/ADR)
- Browsing other users' shelves (POV-first multi-author read) — Story 19.
- Named-empty custom shelf persistence and rename/delete — Story 19 (Option B `shelfdef` header).
- Private (NIP-44) shelves / visibility toggle.
- Sorting/pagination/reordering within a shelf.

## Test infrastructure

- **Runner:** Vitest (workspace default). No new framework.
- **Schema tests** (`packages/schemas/test/`): pure unit, no env. Use `hex64` from `test/_helpers.ts`.
- **API tests** (`apps/api/test/`): supertest against an Express app built from the new `buildShelvesRouter` with fully mocked DI deps (`config`, `sessionUser`, `publish`, `query`, `custodialSign`) — mirrors `tags.test.ts`. Real signatures via `nostr-tools/pure` `finalizeEvent`/`generateSecretKey`. **No live relay / Neo4j / Meilisearch needed** — all deps are stubbed.
- **Web tests** (`apps/web/test/`): Vitest + Testing Library. `useSession`, `useProfileMeta`, and `../../src/lib/api` are mocked; `window.nostr.signEvent` is stubbed. No real network or crypto.
- **Compose prerequisite:** none for these automated tests. Only AC-9 (manual) needs the deployed staging stack (strfry + dual-publish).

## Fixtures / prerequisites for the Implementer

These tests pin the contract; the Implementer makes them pass by building:

1. **`packages/schemas/src/BookShelf.ts` (reworked)** — exports the tests import:
   `DEFAULT_SHELVES`, `DEFAULT_SHELF_SLUGS`, `SHELF_ON`, `SHELF_OFF`,
   `BOOK_SHELF_WORD_TYPE` (now `"bookShelfAssertion"`), `toShelfSlug`,
   `buildBookShelfDTag(owner, bookSlug, shelfSlug)` (new 3-arg signature),
   `toShelfAssertionEvent`, `fromShelfAssertionEvent`, type `BookShelfAssertion`.
   Re-export `Polarity`. `@unbnd/schemas` index already `export *`s `BookShelf`.
2. **`apps/api/src/shelves/aggregate.ts`** — `groupOwnShelves(events): Shelf[]`.
3. **`apps/api/src/shelves/template.ts`** — `buildShelfTemplate` (used by the route; covered indirectly via the route tests).
4. **`apps/api/src/routes/shelves.ts`** — `buildShelvesRouter`, `ShelvesDeps`, `ShelvesSessionUser`; wire into `apps/api/src/index.ts` where `buildTagsRouter` is wired (reuse the same wrapped `publish` for ADR 0011 dual-publish).
5. **`apps/web/src/lib/api.ts`** — add a `shelves` block: `mine()`, `template(input)`, `submit(event)`, `submitCustodial(input)`; add `Shelf`/`ShelfBook` types.
6. **`apps/web/src/components/ShelfControl.tsx`** — props `{ bookSlug }`; default-shelf `<select>` with `__new__` "New shelf…" option revealing a name input; `Add`/`Remove` buttons; the AC-5 move sequences two writes from the web layer.
7. **`apps/web/src/routes/ProfileMe.tsx`** — add a "Your shelves" section reading `api.shelves.mine()`; honest empty copy ("You have not added any books to a shelf yet.").

### ⚠️ Existing tests the rework will BREAK — Implementer must clean up

`packages/schemas/test/BookShelf.test.ts` (7 tests, **currently passing**) tests the
**old single-big-list** `BookShelf` model: `toBookShelfEvent`/`fromBookShelfEvent`,
`BookShelfPayload.books[]`, parallel `bookSlugs`/`bookAddresses`, `visibility`, and
the old 2-arg `buildBookShelfDTag(owner, shelfSlug)`. ADR 0018 removes that model.
The Implementer must **replace `BookShelf.test.ts`** with the assertion-model tests
(this plan's `BookShelfAssertion.test.ts`), deleting or rewriting the old file so the
schema suite is green against the new model. Do not leave the old list-model tests in
place — they pin a contract that no longer exists. (Tester does not delete production
code or rewrite passing tests in the red phase; flagged here for the Implementer.)

Also grep for any `bookShelf`-shaped fixture under `apps/web/src` and old
`buildBookShelfDTag(owner, shelfSlug)` callers (ADR 0018 "Affects existing fixtures?").

## How to run

```
pnpm --filter @unbnd/schemas test run test/BookShelfAssertion.test.ts
pnpm --filter @unbnd/api test run test/shelves/aggregate.test.ts test/routes/shelves.test.ts
pnpm --filter @unbnd/web test run test/components/shelf-control.test.tsx test/routes/profile-me-shelves.test.tsx
pnpm -r test   # full workspace gate
```

## Verification — confirmed RED for the right reason

Confirmed on 2026-05-30 at commit `710412b` on branch `feat/shelves`. Each suite fails
because the not-yet-implemented module/export is missing, **not** because of a typo or
import error in the tests themselves.

### Schema — `packages/schemas/test/BookShelfAssertion.test.ts`
Module loads (old `BookShelf.ts` still resolves), but the new functions are `undefined`:
```
TypeError: toShelfAssertionEvent is not a function
 ❯ test/BookShelfAssertion.test.ts:135:36
...
 Test Files  1 failed (1)
      Tests  14 failed | ... (15)
```
(All assertions fail because `DEFAULT_SHELVES`, `SHELF_ON/OFF`, `toShelfSlug`,
`buildBookShelfDTag` 3-arg, `toShelfAssertionEvent`, `fromShelfAssertionEvent` do not
exist yet.)

### API — `apps/api/test/shelves/aggregate.test.ts` + `test/routes/shelves.test.ts`
New source modules do not exist yet:
```
 FAIL  test/routes/shelves.test.ts
Error: Failed to load url ../../src/routes/shelves ... Does the file exist?

 FAIL  test/shelves/aggregate.test.ts
Error: Failed to load url ../../src/shelves/aggregate ... Does the file exist?

 Test Files  2 failed (2)
      Tests  no tests
```

### Web — `apps/web/test/components/shelf-control.test.tsx`
Component does not exist yet:
```
 FAIL  test/components/shelf-control.test.tsx
Error: Failed to resolve import "../../src/components/ShelfControl" ... Does the file exist?
```

### Web — `apps/web/test/routes/profile-me-shelves.test.tsx`
`ProfileMe` renders, but the "Your shelves" section / honest empty copy is not wired yet:
```
 FAIL  test/routes/profile-me-shelves.test.tsx > ProfileMe — Your shelves (AC-8)
   > shows an honest empty state when the user has no shelves
 ❯ screen.findByText(/have not added any books to a shelf/i)  // not found
 Test Files  1 failed (1)
      Tests  2 failed (2)
```

All four files are red for the intended reason: the implementation does not exist.
No test-bug / typo failures.
