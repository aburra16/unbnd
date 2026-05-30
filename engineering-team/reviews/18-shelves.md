# Review: Story 18 — Shelves (add/remove a book, view your own shelves)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-30
**Diff:** `git diff e73a536b166b20a0d9219174c434e2e775a8e2e7..feat/shelves` (HEAD `0b7bb0f`)
**Story:** `engineering-team/stories/done/18-shelves.md`
**ADR:** `engineering-team/decisions/0018-shelves.md`
**Test plan:** `engineering-team/stories/done/18-shelves.test-plan.md`

## Quality gates (run by reviewer, not trusted)

- [x] `pnpm -r typecheck` — **pass** (exit 0, all packages).
- [x] `pnpm -r test` — **pass** (exit 0). Totals:
  - `@unbnd/search` 11/11; `@unbnd/schemas` 72/72; `@unbnd/seeder` 12/12;
    `@unbnd/indexer` 6/6; `@unbnd/api` 281 passed / 10 skipped (40 files);
    `@unbnd/web` 73/73 (19 files).
  - Story-18 suites all green: `BookShelfAssertion.test.ts` (schema),
    `shelves/aggregate.test.ts`, `routes/shelves.test.ts` (api),
    `shelf-control.test.tsx`, `profile-me-shelves.test.tsx` (web). 44 new `it`
    blocks across the five files (several pack multiple sub-cases, e.g. the
    template-route `it` exercises both bad-polarity and no-session), covering
    every automated AC.
  - Architecture guards green: `apps/api/test/search/architecture.test.ts` (2/2)
    and `apps/api/test/trust/architecture.test.ts` ran clean inside the suite.
- [x] `pnpm --filter @unbnd/web build` — **pass** (exit 0).
- [x] _Lint not configured — skipped._

## Spec adherence
- [x] AC-1 (add → apply) — schema `targets the book by #a and carries d/z/t/polarity/p tags`; route `200 returns a kind-39999 template` + `publishes a valid client-signed apply`; web `runs template → signEvent → submit`.
- [x] AC-2 (remove → retract) — schema `encodes a retract … polarity -1`; aggregate `drops a book whose latest assertion is SHELF_OFF`; route `publishes a retract via polarity -1`; web `submits a polarity -1 retract`.
- [x] AC-3 (idempotent / latest-wins) — aggregate `keeps the latest assertion per (book, shelf) so re-adding stays single`.
- [x] AC-4 (custom shelf) — schema `carries a name tag only on a custom-shelf apply` + round-trip; aggregate `resolves a custom shelf's name from the latest surviving apply`; route `carries the custom display name into the template`; web `sends a slug derived from the typed name plus the display name`.
- [x] AC-5 (default mutual exclusivity = move) — aggregate `after a retract from Reading and an apply to Read, the book lives on exactly one default`; web `removes the old default then adds the new default (two writes)` asserting two `submitCustodial` calls with `(reading,-1)` and `(read,1)`.
- [x] AC-6 (three-tier signing) — gating test (signed-out prompt, no picker); sovereign template→sign→submit; custodial server-sign + `reauth_required` when wrap null; route `403 on pubkey mismatch`, `401 + no publish` anonymous.
- [x] AC-7 (read own, grouped, honest) — route asserts filter `kinds:[39999]`, `#z` contains `book-shelves`, `authors:[user]`; honest empty `[]`; 401 without session. Aggregate ordering test (defaults in PRD order, then custom alphabetical).
- [x] AC-8 (own-shelves on /profile/me) — renders grouped shelves with real counts; honest empty state, no fabricated defaults.
- [x] AC-9 — documented manual staging step in the test plan. Acceptable (not a unit test).
- [x] No criterion silently dropped; no behavior beyond the story.

## ADR adherence
- [x] `packages/schemas/src/BookShelf.ts` reworked to the assertion model 1:1 with `BookTagAssertion`: kind 39999, `BOOK_SHELF_WORD_TYPE = "bookShelfAssertion"`, `DEFAULT_SHELVES`/`DEFAULT_SHELF_SLUGS`, `SHELF_ON=1`/`SHELF_OFF=-1`, `toShelfSlug`, 3-arg `buildBookShelfDTag(owner, bookSlug, shelfSlug)`, `to/fromShelfAssertionEvent`. Old list model, `ShelfVisibility`, `BookShelfPayload.books[]`, 2-arg d-tag all removed. No leftover references (grep clean except the index `export *` and one stale doc-comment, below).
- [x] `apps/api/src/shelves/{template,aggregate}.ts` + `routes/shelves.ts` mirror `apps/api/src/tags/*`. `index.ts` wires `buildShelvesRouter(userEventDeps)` next to `buildTagsRouter` — same wrapped `publish`, so ADR 0011 dual-publish applies.
- [x] No new dependencies. Reuses `@unbnd/schemas`, the existing custodial wrap, nip19, and the dual-publish dep wrapper.
- [x] Layering respected: web talks only to `/api/shelves/*`; server-only signing stays server-side.

## DList integrity
- [x] Event kind 39999; tags in ADR order `["d"],["z"],["a"],["t"],["polarity"],["p"]` + `["name"]` only on custom applies. Word type `bookShelfAssertion`. Payload `{ bookSlug, bookAtag, shelfSlug, shelfName?, polarity }`. Verified against schema + asserted in tests.
- [x] D-tag `shelf--<bookSlug>--<shelfSlug>--<owner8>` (3-arg identity). Test pins `shelf--ol-ol45804w--want-to-read--9bf2eed5`.
- [x] `z`-tag to `book-shelves` header resolved at runtime via `buildBookShelvesHeaderAddress(librarianPubkey)` (template) and `39998:${lib()}:book-shelves` (route). No hardcoded npub/hex anywhere in the shelf code (grep clean).
- [x] Aggregate: latest-wins per `(bookSlug, shelfSlug)`, drops `SHELF_OFF` survivors, groups by slug, default name from constant / custom from latest surviving apply, defaults-first-then-alpha ordering. Correct.
- [x] Default mutual exclusivity (AC-5) is web-side: `add()` detects a prior default and sequences retract-old then apply-new; aggregate confirms the book ends on exactly one default.

## UI integrity
- [x] `ShelfControl.css` / `ProfileMe.css` use brand tokens (`var(--…)`); the only bare hex are `#fff` for input bg / button text and `rgba(26,26,46,…)` borders — **identical to the authorized sibling `TagControl.css` pattern**, not a new literal class. Token-with-fallback (`var(--token, #hex)`) elsewhere.
- [x] No icon library; reuses the existing `GenrePill`. Inline only.
- [x] Copy passes no-slop rules. All strings reviewed: "Shelves", "Add to a shelf", "Choose a shelf", "New shelf…", "Reading state", "Your shelves", "Remove", "Add", the PRD constants "Want to Read"/"Reading"/"Read", "Sign in to add this book to a shelf.", "Saved to your shelves.", "Give the shelf a name.", "Could not update your shelves. Try again.", "You have not added any books to a shelf yet." No em dash, no exclamation CTA, no "designed to", no rhetorical contrast, no hedged opener, no emoji. The `…` is an ellipsis (allowed).
- [x] Honest empty states; real per-shelf counts (`s.count`), no placeholders. Trust tiers N/A (Lane 1, no trust surface).

## Disclosed test edits (verified not weakening coverage)
- **(a) `apps/api/test/routes/shelves.test.ts:163`** — the `query` mock param is named `_f: Record<string, unknown>` (unused-param TS convention). This file is **new** (Tester-authored), not a modified passing test; there is no prior assertion to weaken. The surrounding `it` still asserts the real filter shape (`kinds` contains 39999, `#z` contains `book-shelves`, `authors` equals the user pubkey) and `count === 2`. **Clean — pure typing, behavior intact.**
- **(b) `apps/web/test/fixtures.test.ts`** — migrated off the deleted `BookShelf` type to a locally-defined `ProfileShelfFixture` (a real typed shape with `bookSlugs`/`bookAddresses`/`parentHeader`, not `any`). All three invariants preserved verbatim: `parentHeader.kind === 39998`, `parentHeader.dTag === "book-shelves"`, `bookSlugs.length === bookAddresses.length`. **Clean — migrated, not gutted.** Matches the `tags`/profile fixture pattern.

## Implementer-flagged items (judged)
1. **Web-side retract-then-apply move sequencing** — acceptable. ADR explicitly chose "no dedicated move endpoint; the web layer sequences two `POST /api/shelves` calls." The control retracts the prior default first, then applies the new one; the AC-5 web test asserts both writes and order, and the aggregate test confirms the book lands on exactly one default. Matches "move = two assertions."
2. **`bookAtag` reconstructed from the parsed `kind:pubkey:dTag` address** — acceptable. `groupOwnShelves` rebuilds `bookAtag` from the parsed `bookAddress` of the surviving assertion; the source of truth is the event's own `a`/payload, faithfully round-tripped via `from/toShelfAssertionEvent`. No information invented.
3. **`ShelfControl` re-reading `mine()` after each write (`load()`)** — acceptable. Mirrors the established post-write refresh pattern; the read is the single-author `/mine` and authoritative for membership chips. Minor extra fetch, not a correctness or scope concern.

## Things tests can't catch
- [x] No secrets committed. No hardcoded librarian key (grep clean).
- [x] No `console.*`, no `TODO`/`FIXME`, no commented-out code, no emoji in the shelf code.
- [x] Error paths handled: template build errors map to 503 (`feature_unavailable`) / 400; publish failure → 502; reauth → 401; pubkey mismatch → 403; anonymous → 401 with no publish.
- [x] No race introduced: both `useEffect` reads guard with a `cancelled` flag; the post-write `load()` is fire-and-forget refresh (acceptable).
- [x] Security: sovereign path validates the signed event against the session pubkey and kind 39999; custodial never trusts client-supplied keys.

## House rules check
- [x] PRD §11.3 scope: no file hosting / payments / ebook sales / social feed / reading-progress / notifications. Shelf is a static membership set.
- [x] Public-only slice confirmed: no `private`/`visibility`/`nip-44`/`encrypt` token anywhere in the shelf code (grep clean). No follow-up-story surfaces (browse, dedicated shelf page, rename/delete, shelf-header event) snuck in.
- [x] POV-first respected: `/mine` is single-author (`authors:[user.pubkeyHex]`); no cross-user trust weighting. ADR documents that a future browse story inherits POV rules.
- [x] No new lint/typecheck/build tooling.

## Findings

### Blocking
None.

### Non-blocking
1. **`apps/web/src/components/ShelfControl.tsx:44` & `packages/schemas/src/BookShelf.ts:39`** — `toShelfSlug` is duplicated (the web control re-implements the schema's normalizer rather than importing it). The two are currently identical, so behavior is correct, but they could drift. Optional: import `toShelfSlug` from `@unbnd/schemas` in the control. Not blocking — the slug is also re-derived server-side, and the schema function is the wire authority.
2. **`apps/web/src/data/profile-fixtures.ts:22`** — doc-comment still says "UI augmentation of the wire-shape `@unbnd/schemas` BookShelf" after the type was renamed to `ProfileShelfFixture` and the wire model changed. Stale comment only; no code impact. Optional cleanup.

## Verdict
**PASS**
