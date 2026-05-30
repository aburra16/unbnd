# Story 21: Honest author-scoped counts — paginate past the relay's 500-event cap

**Status:** Draft
**Created:** 2026-05-30
**Type:** Bug

## Background
Story 20 shipped public profiles with "honest counts" as its founding rule: a count is either the true value or it is omitted, never fabricated. Verifying Story 20 live surfaced a case where the count is neither true nor omitted — it is **silently capped**.

Every author-scoped read in the API issues a **single** strfry `REQ` and stops at EOSE. strfry caps any one filter at `maxFilterLimit` (default **500**). So any author with more than 500 matching events of a kind gets counted as if they had exactly 500. The number looks real, renders without error, and is wrong.

**Live proof:** the Unbnd Librarian's public profile reports `tagsApplied: 500`. Its true count is ~1,960 — one baseline genre assertion per seeded book. The page shows a fabricated-looking round number that is silently truncated. This violates the honest-counts rule that motivated Story 20 in the first place, and it violates the project's no-fake-numbers discipline generally.

**Who is affected:** any author with more than 500 events of a single kind. Normal Readers are well under 500 and are unaffected. It bites **power-curators** and, most visibly, the **Librarian** (whose public profile is a marquee surface — "judge a curator on real activity," Story 20 AC-4). The bug grows worse as the catalog and active curators grow.

**Root cause:** `apps/api/src/nostr/query.ts` (`queryRelayUrl` / `queryEvents`) is a one-shot REQ→EOSE read. The four Story-19/20 read paths feed it author-scoped filters and then count/group the result, so the count can never exceed 500.

**Prior art for the fix already exists in this repo.** `apps/indexer/src/relay.ts` solves this exact cap with `queryAllPages`: an `until`-cursor paginator that walks backwards by `created_at`, dedups by event id, and stops on a short page or a no-new-events plateau. The indexer already reads the full catalog this way (`apps/indexer/src/index.ts` L46). The fix is to give the API's author-scoped reads the same paginating behavior so they fetch ALL of an author's matching events before counting or grouping.

This is a correctness bug fix, not a feature. It does not expand PRD scope (no §11.3 surfaces touched). It restores the behavior Stories 19 and 20 already promised. PRD anchor: the honest-counts requirement underlying **phase2-prd §2.4 "Public profiles + real activity"** (Story 20 AC-4) and the §11.1 "Activity counts" reads from Story 19.

## User-facing description
As a visitor judging a curator (Story 20 AC-4), I want a profile's "Books rated", "Reviews", and "Tags applied" to show the curator's **true** activity totals rather than a number silently capped at 500, so that I can trust what the profile tells me and an active curator is not made to look less active than they are.

As the profile owner (including the Librarian), I want my own `/profile/me` stats and `/profile/me`-and-public shelves to reflect everything I have actually done, so that the app does not undercount me once I cross 500 events of any kind.

## Acceptance criteria
Testable from the outside. Each criterion gets at least one test.

- [ ] **AC-1 — Over-cap author yields the TRUE count, not 500.** Given an author with more than 500 matching events of a kind (e.g. ~1,960 tag-apply assertions), when their author-scoped count is read, then the returned count is the true total (e.g. ~1,960), not 500. Covers `tagsApplied`, `booksRated`, and `reviews`.
- [ ] **AC-2 — Under-cap author is unchanged.** Given an author with 500 or fewer matching events, when their counts are read, then the result is identical to the pre-fix single-REQ behavior (same numbers, same omit-on-failure semantics). No regression for the common Reader case.
- [ ] **AC-3 — Pagination dedups by event id.** Given an author whose events straddle a page boundary (the `until` cursor overlaps at a `created_at` second), when the reads paginate, then each event is counted exactly once (dedup by id), so the boundary second is never double-counted and the count is exact.
- [ ] **AC-4 — Shelves reads paginate too.** Given an author with more than 500 shelf-membership assertions, when `/api/shelves/mine` or `/api/profile/:npub/shelves` is read, then `groupOwnShelves` receives ALL of that author's shelf events (so the per-shelf book lists and counts are complete, not truncated at 500). The catalog-enrichment batch read (the `#d` slugs read) is a separate concern — see Open Q3.
- [ ] **AC-5 — All four surfaces fixed at the source.** Given the fix, when `/api/profile/me/stats`, `/api/profile/:npub/stats`, `/api/shelves/mine`, and `/api/profile/:npub/shelves` are exercised against an over-cap author, then every one returns un-truncated results. (The fix lives in the shared read the route helpers call, so fixing the source fixes all four; this AC asserts the end-to-end outcome on each route.)
- [ ] **AC-6 — Honest under a safety guard (if a guard is adopted).** Given the max-pages guard resolved in Open Q2, when an author's event count would exceed the guard, then the surface returns an **honest** signal (an exact count up to the guard ceiling, or an explicit "N+" / capped flag the web layer can render honestly), and **never** a wrong exact number presented as exact. If Open Q2 resolves to "no guard," this AC is dropped and AC-1 (full pagination, exact count at all realistic volumes) stands alone. (Decision deferred to the Architect — see Open Q2.)
- [ ] **AC-7 — Pagination cost is amortized by the existing cache.** Given the public reads' 60s TTL cache (Story 20, ADR 0020 Decision 4) is in place, when a public profile is hit repeatedly within the TTL, then the multi-page read runs at most once per TTL window per target (the paginating read sits behind the cache, the cache is not bypassed). No new caching layer is introduced by this story.

## Affected reads (the bug is in the shared author-scoped read, not the helpers)
The count/group helpers are already correct — they just never receive more than 500 events. The fix is upstream of them, in the read each route calls.

- `countOwnRatings` (`apps/api/src/ratings/summary.ts`) → `booksRated`, `reviews`. Fed by `statsFor` in `apps/api/src/routes/profile-stats.ts`.
- `countOwnAppliedTags` (`apps/api/src/tags/aggregate.ts`) → `tagsApplied`. Fed by `statsFor` in `apps/api/src/routes/profile-stats.ts`.
- `groupOwnShelves` (`apps/api/src/shelves/aggregate.ts`) → shelves. Fed by `enrichedShelvesFor` in `apps/api/src/routes/shelves.ts`.

Routes that surface them: `/api/profile/me/stats`, `/api/profile/:npub/stats`, `/api/shelves/mine`, `/api/profile/:npub/shelves`.

The shared read both route files call today is `queryEvents` (`apps/api/src/nostr/query.ts`), the single-REQ read that caps at 500.

## DList shapes touched
No new DList shape. This is a read-path correctness fix on existing kinds, author-scoped to the read's target pubkey.

- `kind:39999` — book ratings under `39998:<librarian>:book-ratings` (counts; read by `authors:[target]`).
- `kind:39999` — book-tag assertions under `39998:<librarian>:book-tag-assertions` (counts; read by `authors:[target]`).
- `kind:39999` — book-shelf membership under `39998:<librarian>:book-shelves` (shelves; read by `authors:[target]`).

## PO recommendations (non-binding — Architect decides the mechanism)

**1. Where the paginator lives — recommend extending `apps/api/src/nostr/query.ts`.** Add a `queryAllPages`-style author-scoped read to the API's own `query.ts`, mirroring the indexer's `apps/indexer/src/relay.ts` (`until`-cursor, page size = the cap, dedup by id, stop on short page or no-new-events plateau). Reasons: it sits next to `queryEvents`, it keeps the API's relay logic in one module, and the four route helpers already depend on a single injected `query` function — pointing that `query` at the paginating read fixes all four without touching the helpers or the route signatures. The indexer's `queryAllPages` takes an injected `fetchPage` for testability; mirror that so the API version is unit-testable with a fake pager. A shared `packages/*` paginator extracted from the indexer is a cleaner long-term move but is more than this bug needs; PO leans "mirror the proven pattern in the API now," Architect's call on extract-vs-mirror. **Do not hand-roll new relay logic beyond mirroring the indexer's paginator** (house rule).

**2. The 500 page size should track the relay cap, not be a new magic number.** The indexer uses `pageSize = 500` to match `maxFilterLimit`. Reuse the same value/source so the two stay in lockstep.

## Open questions
Resolve (or explicitly hand to the Architect) before approving.

- **Q1 (extract vs. mirror):** put the paginator in `apps/api/src/nostr/query.ts` (mirror the indexer), or extract a shared paginator into `packages/*` consumed by both indexer and API? PO leans **mirror in the API now** (smallest correct fix, no new package surface); flag the duplication so a later refactor story can extract if a third consumer appears. Architect decides.
- **Q2 (max-pages safety guard + honest "N+"):** full pagination is honest and cheap at realistic volumes (Librarian ~1,960 ≈ 4 pages of 500). Should there be a max-pages ceiling for a pathological author (e.g. a spammer with 100k events) so one profile view cannot fan out unboundedly? PO's position: **a guard is prudent, but if it ever caps it MUST be honest** — surface an explicit "N+" / capped indicator, never a wrong exact number dressed as exact (that would re-introduce the very bug this story fixes, just at a higher ceiling). If the Architect judges a guard unnecessary at MVP volume, drop AC-6 and rely on full pagination (AC-1). **Architect makes the call and records it in the ADR.** This is the one real design decision in the story.
- **Q3 (the shelves catalog-enrichment `#d` read):** `enrichedShelvesFor` does a second read — a batch catalog lookup keyed by `#d: distinctSlugs` (not author-scoped). A user with >500 distinct shelved books would also exceed the cap on that read. PO's read: this is the **same class of bug** (a single REQ capped at 500) and fixing it is in the spirit of "fix the root, not the one symptom," **but** it is a `#d`-batched read, not an `authors`-scoped one, so the same paginator may not apply unchanged (no natural `created_at` author-walk; it is a fixed id set that may itself exceed 500 filter values). PO recommends the Architect decide whether to (a) fold it into this story by chunking the `#d` batch, or (b) split it to a tight follow-up. Flagged so it is a conscious decision, not an oversight. The shelf-**membership** read (AC-4) is unambiguously in scope.
- **Q4 (timeout headroom):** the API's single-REQ read uses a 5s timeout (`QUERY_TIMEOUT_MS`); the indexer's paginator uses 20s per page. A multi-page author-scoped read is several sequential REQs. Confirm the per-page timeout and any overall budget so a legitimate ~4-page read does not get truncated by a timeout (which would silently undercount again). Architect sets the values.

## Out of scope
Stated explicitly so it does not creep:
- **New caching, rate-limiting, or background pre-aggregation.** The fix rides the existing 60s TTL cache (Story 20). No new infra.
- **Changing the count *definitions*** (books-rated / reviews / tags-applied semantics are fixed by Stories 19/20 and reused verbatim). This story changes only how many events the count sees, not what it counts.
- **Trust-weighting / POV.** These are single-author reads; POV-first does not apply (per Stories 19/20). Unchanged here.
- **Indexer changes.** The indexer already paginates correctly; this story does not touch it (it may be *read* as the pattern to mirror).
- **New lint/typecheck/build tooling** (house rule; ADR-only).
- **The `#d` catalog-enrichment read**, pending Open Q3's resolution (may be folded in or split).
- PRD §11.3 Phase-2+ items generally.

## Linked artifacts
- ADR: `engineering-team/decisions/0021-honest-author-scoped-counts.md`
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
