# Story 82: Code-debt cleanup

**Status:** Planning
**Created:** 2026-06-09
**Type:** Cleanup (zero behavior change, except the two flagged label additions)

## Background
The Phase-2 audit rolled up small debt items (audit §"Debt logged by ADRs"); the social-loop queue carries them as Block 3's closer, and the Block-3 reviews added two carry-forwards. Each item, located:

1. **Dead subjects-API seeder code.** `apps/seeder/src/fetch.ts` `fetchSubjectWorks` — the paginated Open Library *subjects* API fetch superseded by the search-API collect (`search.ts`, whose own test says it "replaces fetchSubjectWorks"). No callers remain; only `SEEDER_USER_AGENT` is still imported from the module (by `search.ts` + `description.ts`).
2. **Duplicated relay pagination.** `queryAllPages` exists three times: `apps/indexer/src/relay.ts` and `apps/shelves/src/relay.ts` are **byte-identical simple walks** (until-cursor, id-dedup, short-page/plateau stop); `apps/api/src/nostr/query.ts` is a **superset** (maxPages bound + `capped` flag + wall-clock budget throw, ADR 0021). The audit deferred a `packages/relay-paginator` extraction; `packages/relay` already exists and depends on `@unbnd/schemas`.
3. **Duplicated short-npub helper.** `apps/web/src/lib/view-model.ts` `shortNpub` is canonical; `apps/web/src/components/AccountMenu.tsx` carries a byte-identical private copy.
4. **Stale "I am the author" submit-toggle copy.** The description reads "Marks this submission as a self-claim of authorship… it is not a vetted credential." It is stale twice over: the toggle does **not** create a claim (it records author provenance on the record: `authorPubkey` + `source:"author"`); and the claims/verification pipeline now exists — the honest description states what the toggle does and routes authorship claims to the book page. The Story-31 invariant stands: the submit form must never say "verified" (its test keeps passing).

**Carry-forwards (Review #80, logged in the book):**
5. `PromoteCell` (CommunitySubmissions) shows the Promote button for `demote_pending`/`demoting` rows; pressing it no-ops while the UI optimistically lies. Map the in-flight demote states to a quiet "Removal queued" label. (A `demoted` row stays re-promotable — already correct.)
6. *(deferred, logged)* The book page's `DemoteControl` re-offers the action until the worker tick — needs a demote-status read; stays deferred with the flake watch.

**Ops task (not code, relayed to the operator):** `age`-encrypt the librarian key on the droplet. Recorded in the book's Deploy/ops notes; cannot be done from the repo.

## Acceptance criteria
- [ ] `fetchSubjectWorks` is removed; the seeder builds and its suite passes unchanged (`SEEDER_USER_AGENT` keeps its importers).
- [ ] ONE shared pager lives in `packages/relay`; the api, indexer, and shelves consume it; **zero behavior change** (the api keeps its bound/`capped`/budget semantics and its existing `query-paged` suite passes unmodified; indexer/shelves keep their exact unbounded walk).
- [ ] `AccountMenu` imports the canonical `shortNpub`; the private copy is gone; rendering is unchanged.
- [ ] The submit-toggle description honestly states the provenance behavior and routes claiming to the book page; the form still never says "verified" (the Story-31 test passes unmodified).
- [ ] `PromoteCell` renders "Removal queued" (no Promote button) for `demote_pending`/`demoting`; `demoted` still falls through to Promote.
- [ ] Full repo green; no other behavior change.

## Out of scope
The deferred `DemoteControl` status read; the replaceable-write skeleton generalization (Phase-2 debt, still deferred); CI action versions (handled separately); the ops key-encryption task itself.

## Decision (Architect, folded in — no separate ADR; the queue mandated the shape)
- **§2 extraction:** the api's superset becomes `packages/relay/src/paginate.ts` `queryAllPages(fetchPage, opts) → { events, capped }` with injectable `pageSize`/`maxPages`/`totalBudgetMs`/`now` and **no defaults baked in beyond the loop semantics** (each caller passes its own: the api its ADR-0021 constants; indexer/shelves `maxPages: Infinity, totalBudgetMs: Infinity` and unwrap `.events`) — so every call site's behavior is reproduced exactly. The api re-exports for its existing import sites.
- **§4 copy:** label unchanged; description → "Records you as this book's author on the submission. To claim authorship where readers see it, use the claim action on the book page once it is listed." (ban-list-clean, no "verified").
- **§5:** `PromoteCell` gains one branch: `demote_pending`/`demoting` → `<span class="cs-item-state">Removal queued</span>`.

## Linked artifacts
- Test plan: _pending (Tester)_
- Review: _pending (Reviewer)_
