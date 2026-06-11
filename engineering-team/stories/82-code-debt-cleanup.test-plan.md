# Test Plan: Story 82 — Code-debt cleanup

**Story:** `engineering-team/stories/82-code-debt-cleanup.md` (Architect decision folded in)
**Date:** 2026-06-09

## Coverage map

| Item | Proof | Level |
|---|---|---|
| §2 ONE shared pager | `packages/relay/test/paginate.test.ts` (4 new: cursor walk + short-page stop, boundary id-dedup + plateau, maxPages/`capped` honesty, budget throw) pins the shared core; the api's existing `test/nostr/query-paged.test.ts` MUST pass unmodified (its ADR-0021 semantics ride the shared loop); indexer `relay.test.ts` + shelves `compute.test.ts` unmodified | unit + regression |
| §1 dead seeder code | deletion; the seeder suite (132) passes unmodified — `search.test.ts` already pins the replacement pager | regression |
| §3 shortNpub dedupe | deletion + import swap; the web suite (AccountMenu render paths) passes unmodified | regression |
| §4 toggle copy | 1 new test in `submit-author-toggle-copy.test.tsx` (provenance wording + book-page routing + the stale phrases gone); the Story-31 verified-ban tests pass UNMODIFIED | component |
| §5 demote-state labels | `community-submissions-demote-states.test.tsx` (3 new: demote_pending/demoting → "Removal queued", no Promote; demoted → Promote) | component |

## Verification
Confirmed red 2026-06-09: relay paginate `(4 | 4 failed)`; web `(7 | 4 failed)` (the 3 passing are the Story-31 pins that must stay green). Typecheck clean.

## How to run
```
pnpm --filter @unbnd/relay exec vitest run test/paginate.test.ts
pnpm --filter @unbnd/web exec vitest run test/routes/community-submissions-demote-states.test.tsx test/routes/submit-author-toggle-copy.test.tsx
pnpm -r typecheck && pnpm -r test
```
