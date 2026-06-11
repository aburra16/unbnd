# Book of Work: Phase 3 — Close the Social Loop

**Slug:** social-loop
**Status:** Open
**Opened:** 2026-06-06
**Closed:** —

## Intent anchor

**PRD-backed.** The anchor is `product-team/prd/social-loop.md` (Phase 3, "Close the Social Loop"), produced by the product team and handed off via `product-team/stories-queue.md`. Companion guides: `product-team/guides/social-loop-design-guide.md`, `product-team/guides/social-loop-style-guide.md`. Completion is *computed*: every story tracing to the PRD sections below is `Done`.

PRD sections this book realizes: §5.1–§5.7 (feature spec), §6 (data model), §7 (trust/viewpoint/identity architecture), §8.1 (in-scope), §10 (success metrics).

## Stories in this book

From `product-team/stories-queue.md`, 18 stories in 3 ordered blocks. Each is promoted into the flat namespace via `/plan-feature` in queue order, starting at the next available number (**#65**). Numbers below are the intended promotion order; the actual `<n>` is assigned at promotion.

**Block 1 — the curator loop, honest on a thin graph**
- #65 `taste-match-profiles` — Taste Match on curator profiles *(first / demoable)*
- #66 `taste-match-book-detail` — Taste Match on book detail + taste-sorted raters (needs #65)
- #67 `curator-role-vouching` — curator status by trusted-user vouching
- #68 `vouch-control-curate-surface` — vouch control + Curate surface (needs #67)
- #69 `ci-action-version-bump` — CI/deploy action version bump *(date-bound: Node-20 cutoff 2026-06-16; parallelizable)*

**Block 2 — make curation travel + complete the loop**
- #70 `hype-gap-indicator` — hype-gap indicator on book detail
- #71 `hidden-gems-shelf` — Hidden Gems homepage shelf (needs #70)
- #72 `link-unfurls` — link unfurls + per-book metadata *(architecture: server-rendered per-book head)*
- #73 `value-before-account` — value before account on shared links
- #74 `followers-nip85` — followers count via NIP-85
- #75 `genre-expansion` — genre expansion to 14+
- #76 `sovereignty-upgrade` — sovereignty upgrade (nsec export)

**Block 3 — automate and finish**
- #77 `auto-threshold-promotion` — automatic threshold promotion
- #78 `in-product-accusatory-reveal` — in-product accusatory reveal
- #79 `rating-removal` — remove a rating (carries Phase 2 #28b)
- #80 `promotion-demotion` — demote a promoted book (carries Phase 2 #30b; needs #77/promotion)
- #81 `contested-tag-treatment` — contested-tag treatment
- #82 `code-debt-cleanup` — code-debt cleanup *(+ operator ops task: age-encrypt the librarian key)*

## Deploy / ops notes *(carry into the deploy step)*
- **#72 link unfurls — `PUBLIC_ORIGIN` (api):** the droplet `.env` must set `PUBLIC_ORIGIN=https://staging.unbnd.ink` (default is `http://localhost:5181`). The unfurl cards' `og:url`/`og:image` and the oEmbed same-origin validation derive from it; if left at the localhost default, cards carry localhost URLs and oEmbed rejects real links. Already referenced by `docker-compose.prod.yml` (api service). Post-deploy smoke: `curl -A "facebookexternalhit/1.1" https://staging.unbnd.ink/book/<slug>` returns the card document; a browser UA returns `index.html`. (Review #72, finding 2.)
- **#74 followers count — Brainstorm follower datum (source availability):** the followers count reads the `followers` value off the trust provider's per-target attestation (the same read as trust weights). Until the Brainstorm backend actually publishes that value for the house vantage's targets, `followers()` returns empty and every profile shows "No followers yet." — correct by construction, no code change needed to light it up. Verify once the source is live: a profile with known followers shows a "Followers" cell. (Review #74, finding 2.)
- **#75 genre expansion — run `seed:recast` (one-time, like a migration):** the 16-genre taxonomy + the recast are code, but the catalog only *shows* the new genres after running `pnpm --filter @unbnd/seeder seed:recast` against the target relay (with `LIBRARIAN_NSEC` + `STRFRY_URL` set). It pages the existing ~11.2k book records (no OL fetch), derives genres from preserved subjects, and publishes librarian assertions (idempotent — safe to re-run). **Check the per-genre yield report**: `booksSeen` should ≈ the known catalog size (confirms paging didn't stall, Review #75 finding 2), and any genre printed `<-- EMPTY` should be dropped from `STARTER_TAXONOMY` before launch (AC-6). (Review #75, finding 4.)
- **#77 automatic promotion — `AUTO_PROMOTE_CURATOR_COUNT` (api), dormant until set > 0:** the auto-promote maintenance sweep ships disabled-by-default-conservative (count 3) but truly **off when 0**. Once the threshold is calibrated on staging, set `AUTO_PROMOTE_CURATOR_COUNT` (and optionally `AUTO_PROMOTE_MIN_AVG`, default 4.0) on the api; the promoter cron must be running to fulfill enqueued rows. Verify: a submission with ≥N trusted curators rating it ≥4.0 appears in the catalog within a maintenance tick.

## Carry-forward (follow-ups discovered in Block 3)
- **Promoter `failed`-retry gap (pre-existing, surfaced in Review #77 finding 1):** `apps/promoter/src/queue.ts` `claimPending` only claims `status = 'pending'`, so a `failed` promotion is never retried (manual re-enqueue hits UNIQUE → `already`; auto-promote skips any-status). A transiently-failed promotion stays stuck until its row is cleared. Fix in a separate story: a promoter retry policy (reset stale `failed` → `pending` with an attempt cap) or an ops cleanup. Not introduced by #77.
- **Suite flake watch (Review #79 finding 3):** `apps/api/test/routes/shelves-enriched.test.ts` failed once under full-suite load with a supertest transport error ("Parse Error: Expected HTTP/"), green on every isolated and re-run. If it recurs, fold a fix into #82.
- **#82 candidates from Review #80 (transient demote-window UX):** (a) `PromoteCell` in `CommunitySubmissions` shows the Promote button for `demote_pending`/`demoting` rows (pressing it answers `already` while the UI optimistically says "Promotion queued") — map the `demote_*` states to a quiet "Removal queued" label; (b) the book page's `DemoteControl` re-offers "Remove from catalog" after a reload until the worker tick (no demote-status read; re-demoting answers `already` harmlessly). Both one-cron-tick windows, curator-only, no integrity impact.
- **Note (Review #80):** the demote arc reuses `promotions.requested_by`, so the row records the LATEST actor (promoter, then demoter, then re-promoter); the full history lives in the librarian-signed events + `updated_at`.

## Provenance
- **Mode:** PRD-backed (anchor = `product-team/prd/social-loop.md`).
- **Confidence at close:** to be set at book-close.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/social-loop/audit.md`
- Product feedback: `engineering-team/audits/social-loop/prd-addendum.md`
