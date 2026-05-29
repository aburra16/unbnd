# Review: Story 9 — Web goes live

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-05-29
**Delivery:** PR #15 (squash to main), staged in three commits — book-read API, web read-path swap, classification UI. CI-green on merge; verified live on staging.

## Quality gates

- [x] `pnpm -r typecheck` — pass (4/4 packages).
- [x] `pnpm -r test` — pass: api 190 (+10 skipped), web 25 (new TagControl tests + smoke rewritten against the mocked API).
- [x] `pnpm --filter @unbnd/web build` and `@unbnd/api build` — pass.
- [x] CI green on the merge commit; staging auto-deploy green.
- [x] Full droplet re-seed run; taxonomy + genre assertions now catalog-wide.

## AC status

- [x] **Book-read API** — `routes/books.ts`: `GET /api/books/:slug` (404/503), `GET /api/books?slugs=` (batch, request order), `GET /api/books?limit=N` (recent). `PublicBook` mapping (no hex, no trust). Wired reusing the shared `query` dep. Tests mock the relay.
- [x] **Live read paths** — BookDetail / GenreBrowse / Home off live data with loading / error / empty / not-found states. Verified live: 8 genres returned 1 → 300 books after re-seed; book detail renders title/author/cover + genre/style chips (raw apply counts) + ratings; reviews come from rating `reviewText`.
- [x] **No fabrication** — dropped the fixture distribution, fake reviewers/trust tiers, claimed-author card, fabricated trending/community shelves, and fake book counts. Homepage is one "Recently added" shelf + live taxonomy genre grid. Empty genres read honestly.
- [x] **Classification UI** — `TagControl`: tier-gated apply/dispute over genre/style taxonomy; accusatory tags never offered; quality-signal write deferred. Sovereign signs via `window.nostr`, custodial server-signs, signed-out → prompt. Component tests cover gating, accusatory exclusion, and both write tiers.
- [x] **Live write round-trip (sovereign)** — challenge → verify → session → template → sign → submit → readback confirmed on staging (applied style shows `applies: 1`). Custodial write shares the same server path (unit-covered).

## Crypto / safety

- Audited-stack signing only (`finalizeEvent` / `verifyEvent` via the existing routes); no hand-rolled crypto added.
- Accusatory tags hidden at read time AND never offered in the write picker (defense at both ends). Layer-2 trust+role gate remains deferred, as designed.
- npub for display (short byline), hex internal. No fake trust numbers — raw counts only.

## Carryovers / follow-ups (tracked in build-status memory)

- **Write up-sync / dual-publish** — user-applied tags/ratings publish to the LOCAL relay; the sync cron only pulls down from dcosl, so community writes don't propagate up yet. Fine for staging; needed before prod.
- **Orphaned components** (ActionBar, AuthorCard, GenreHeader, GenreControls, SubgenrePills, Pagination) left unused by the swap — cleanup chip spawned.
- **Seeder image freshness** — `seeder` under `profiles:[seed]` is not pulled by the deploy; `docker pull …unbnd-seeder:latest` before any re-seed (consider pinning the run to `$UNBND_IMAGE_TAG`).
- Deferred per ADR 0010: GrapeRank trust-weighting + trust shelves + sensitive-tag gate, search, author claim, quality-signal write UI.

## Verdict

**PASS** — the catalog is live and browsable, both rating tiers work, and readers can classify books with the tag UI, all on real data verified end-to-end on staging. Staging meets the "feature-complete" target (sans search/GrapeRank, explicitly deferred). Story marked Done.
