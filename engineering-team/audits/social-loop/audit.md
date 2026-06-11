# Build Audit: Phase 3 — Close the Social Loop

**Book:** `engineering-team/audits/social-loop/book.md`
**Date:** 2026-06-11
**Branch / commit range:** `4e5d473..main` (intake → the #81/#82 merges + close; 111 commits, 263 files, +13,088/−394; 186 source files under `apps/` + `packages/`)
**Provenance:** PRD-backed (`product-team/prd/social-loop.md`, immutable)
**Confidence:** **high** — every story ran the gated five-phase cycle with per-phase commits; all 18 reviews PASS; the manifest was opened at intake, not reconstructed.

> As-built record. **Deployment caveat up front (verified against origin + live staging probes 2026-06-11): staging runs through #70** (origin/main tip = `f913219`; `/api/me/curator` live, the #72 unfurl card and #79 remove endpoint absent). **Block 1 + the hype-gap indicator (6 of 18 stories) are deployed; #71–#82 (the remaining 12, all of Block 3 included) are merged to local `main` only — 87 commits unpushed.** Those capabilities are not user-visible until the push + the ops steps in book.md run.

## 1. What shipped
All 18 stories (#65–#82), three blocks, in queue order:

**Block 1 — the curator loop, honest on a thin graph**
- **Taste Match on profiles** — observer-relative rating-agreement score with an honest "not enough overlap yet" floor (`TASTE_MATCH_MIN_OVERLAP`, default 5) — `done/65-taste-match-profiles.md`
- **Taste Match on book detail** — per-rater byline chips + Most-trusted / Best-taste-match sort, one batched read (no N+1) — `done/66-taste-match-book-detail.md`
- **Curator role by vouching** — new `curator-roles` DList concept; trusted-user vouches confer the role (`CURATOR_VOUCH_MIN_ASSERTERS` default 10, + seed list, + the Phase-2 emergent gate kept as OR-fallback) — `done/67-curator-role-vouching.md`
- **Vouch control + Curate surface** — VouchButton on profiles, vouch counts, Curate nav for curators — `done/68-vouch-control-curate-surface.md`
- **CI/deploy actions bumped off the deprecated Node-20 runtime** (commit `f913219`, **before the 2026-06-16 cutoff** — the date-bound risk is retired) — `done/69-ci-action-version-bump.md`

**Block 2 — make curation travel + complete the loop**
- **Hype-gap indicator** — hidden-gem / overhyped / consensus signal from raw-vs-trusted average divergence — `done/70-hype-gap-indicator.md`
- **Hidden Gems homepage shelf** — the hype-gap idea server-side over the cached trust shelves — `done/71-hidden-gems-shelf.md`
- **Link unfurls + oEmbed** — server-rendered per-book OG/Twitter/oEmbed card document for crawler UAs — `done/72-link-unfurls-oembed.md`
- **Value before account** — shared links land readable; account prompts are contextual, not walls — `done/73-value-before-account.md`
- **Followers count via NIP-85** — trust-anchored attestation read (never a kind-3 scan); honest "No followers yet" until the source publishes — `done/74-followers-count-nip85.md`
- **Genre expansion 8 → 16** — taxonomy + a recast pass deriving genres from preserved OL subjects (idempotent seeder run) — `done/75-genre-expansion.md`
- **Sovereignty upgrade** — password-gated one-time nsec reveal for custodial users (NIP-49 layer only; backup key never used; `keyExportedAt`), closing Phase 2's headline gap — `done/76-sovereignty-upgrade.md`

**Block 3 — automate and finish**
- **Automatic threshold promotion** — a maintenance-loop pass enqueues submissions crossing curator-count + quality-floor thresholds; **dormant until `AUTO_PROMOTE_CURATOR_COUNT` > 0 is set** — `done/77-automatic-threshold-promotion.md`
- **In-product accusatory reveal** — curators see gated accusatory tags (curator-only view; the public gate unchanged) and reveal/withdraw from the book page; the api enqueues, the key-holding worker mints — `done/78-in-product-accusatory-reveal.md`
- **Rating removal** — a self-signed retraction tombstone at the rating's own d-tag; all five rating read-folds retraction-aware; re-rate restores — `done/79-rating-removal.md`
- **Promotion demotion** — curator-gated; librarian-signed delisted-record replace; one promotions state machine with a structural no-auto-re-promote guarantee; live search-index delete — `done/80-promotion-demotion.md`
- **Contested-tag treatment** — a trusted-graph-net-disputed tag renders muted + struck "contested" — `done/81-contested-tag-treatment.md`
- **Code-debt cleanup** — one shared relay pager, dead seeder code removed, `shortNpub` deduped, submit-toggle copy corrected, demote-state list labels — `done/82-code-debt-cleanup.md`

## 2. Stories rolled up

| Story | Delivered | Status | Review |
|---|---|---|---|
| #65 taste-match-profiles | observer-relative Taste Match + honest floor | Done | PASS |
| #66 taste-match-book-detail | per-rater chips + taste sort, batched | Done | PASS |
| #67 curator-role-vouching | `curator-roles` concept + role resolution | Done | PASS |
| #68 vouch-control-curate-surface | vouch write UI + Curate nav | Done | PASS |
| #69 ci-action-version-bump | Node-20 cutoff retired (`f913219`) | Done | (chore; CI green) |
| #70 hype-gap-indicator | raw-vs-trusted divergence signal | Done | PASS |
| #71 hidden-gems-shelf | server-side hidden-gems shelf | Done | PASS (+#71b fast-follow flagged) |
| #72 link-unfurls-oembed | per-book OG/oEmbed cards | Done | PASS (cache deferred, accepted) |
| #73 value-before-account | contextual account prompts | Done | PASS |
| #74 followers-count-nip85 | NIP-85 followers read | Done | PASS |
| #75 genre-expansion | 16-genre taxonomy + recast | Done | PASS (ops run pending) |
| #76 sovereignty-upgrade | password-gated nsec export | Done | PASS |
| #77 automatic-threshold-promotion | auto-promote sweep (dormant) | Done | PASS |
| #78 in-product-accusatory-reveal | curator gated-view + reveal endpoint | Done | PASS |
| #79 rating-removal | retraction tombstone, 5 folds | Done | PASS |
| #80 promotion-demotion | delisting replace + state machine | Done | PASS |
| #81 contested-tag-treatment | contested read-state + Pill treatment | Done | PASS |
| #82 code-debt-cleanup | pager extraction + 4 debt items + labels | Done | PASS |

ADRs 0064–0079 (all Accepted) carry the per-story decisions.

## 3. As-built inventory
Derived from the book diff (`4e5d473..main`):

**User-facing (web):** TasteMatchChip (profile + book bylines), VouchButton + vouch counts + CuratorBadge + Curate nav, HypeGapIndicator, the Hidden Gems shelf, AccountPrompt (contextual), SovereigntyCard/TakeOwnershipFlow, the gated-tag reveal/withdraw rows in TagControl, the Remove-rating confirm flow in RatingControl, DemoteControl ("Remove from catalog"), contested Pill treatment, "Removal queued" list state, Followers cell, 16-genre chips, corrected submit-toggle copy.

**API routes added:** `GET /api/profile/:id/taste-match`, `GET /api/books/:slug/taste-matches`, `GET /api/me/curator`, `GET /api/profile/:id/vouch-status`, `POST /api/curator-roles`, the unfurl/oEmbed document route, `POST /auth/export-key`, `POST /api/books/:slug/tags/:tagSlug/reveal`, `POST /api/ratings/remove/template` + `POST /api/ratings/remove`, `POST /api/submissions/:slug/demote`. Extended payloads: `TagConsensus.{revealed,gated,contested}`, `PublicBook.source`, `PublicUser.keyExportedAt`, `RatingsSummary.yourRating` consumers, vouch/curator reads.

**Domain (DList, all kind-39999 under the librarian's concepts unless noted):** new `curator-roles` concept (header + `CuratorRoleAssertion`); the **rating retraction** (same `rating--<slug>--<rater8>` d-tag, `["retracted","true"]`, no score); the **record delisting** (same `<slug>` d-tag, `["delisted","true"]`, no record fields); genre-assertion recast events. **No kind-5 anywhere** (see deviation 2). Shared predicates: `isRatingRetraction`, `isDelistedRecord`.

**Data & contracts:** `users.key_exported_at` (migration 0003); `promotions.status` extended (`demote_pending/demoting/demoted/demote_failed`) — no DDL, a status-value extension; `reveals` gains the api-side `enqueueReveal` writer; `SearchProvider` gains required `delete(ids)` (meili delete-batch); `packages/relay` gains the shared `queryAllPages` pager; `packages/trust` gains `computeTasteMatch`, `followers()`, retraction-aware `dedupeRatings`.

**Config knobs added (all defaulted, additive):** `TASTE_MATCH_MIN_OVERLAP` (5), `CURATOR_VOUCH_MIN_ASSERTERS` (10), `CURATOR_SEED_PUBKEYS`, `AUTO_PROMOTE_CURATOR_COUNT` (3; **0 = off**), `AUTO_PROMOTE_MIN_AVG` (4.0), web HYPE_GAP_MARGIN (0.5) / MIN_TRUSTED (2), `PUBLIC_ORIGIN` (deploy-critical for unfurls).

## 4. Deviations from intent

| # | Specified (anchor) | Built | Type | Rationale (source) | Product impact | Carry-forward |
|---|---|---|---|---|---|---|
| 1 | §5.2/§5.7 reveal "surfaces via the existing gate; no read-gate change" | A **curator-only gated view** of unrevealed accusatory tags (public gate provably unchanged) | interpretation | A curator cannot decide to reveal a tag they cannot see; revealing blind is the wrong product (ADR 0076; flagged + approved at the gate) | Curators see substantiation before revealing; readers unaffected | — |
| 2 | Phase-2 addendum framed the two un-do flows (#28b/#30b) as **kind-5 deletions** | **Replace-at-the-same-address** tombstones (retraction / delisting); kind-5 rejected in both ADRs | intentional-change | Kind 39999 is parameterized-replaceable; replace is relay-enforced, read-robust, and symmetric with restore; kind-5's relay semantics were the stub's load-bearing unknown (ADR 0077/0078) | Same user capability; stronger guarantees (re-rate/re-promote = restore) | Domain-model note for product (§6): the removal idiom is replace, never delete |
| 3 | Queue line "the trusted graph net-disputes" (strict `>`) | Contested includes the **tie** (`>=`) | interpretation | A tied tag is not net-applied; rendering it settled overstates consensus (ADR 0079; pinned by a dedicated test) | Slightly more tags read "contested" | Product may ratify or flip (one line + one test) |
| 4 | §5.7 automatic promotion | Shipped **dormant**: count+floor thresholds, off until `AUTO_PROMOTE_CURATOR_COUNT` > 0 | constraint-discovered | Thresholds need calibration against the real founding-curator graph before automation acts (ADR 0075) | No auto-promotion until ops enables it | Calibrate + enable on staging |
| 5 | §10 success metrics (curator recruitment, founder seeding, vouch-grown graph, staging-verifiable behavior) | **Partially measurable**: staging runs through #70, so the Block-1 metrics (taste-match honesty; a vouch-grown curator) are verifiable NOW; the Block-2 gate metric (link unfurls) and everything Block-3 await the push of the 12 undeployed stories | constraint-discovered | Block 2/3 build completed ahead of the deploy/ops window | #71–#82 capabilities not user-visible yet | Push + run the ops sequence (book.md notes), then measure the rest of §10 |
| 6 | #82 "zero behavior change" cleanup | Two sanctioned label additions rode along ("Removal queued"; the corrected toggle copy) | intentional-change | Review-#80 carry-forward + the queue's own copy-fix AC (story 82) | Honest UI states | — |
| 7 | §5 (Block 2) genre target "14+" | 16 genres shipped | intentional-change | Round taxonomy from the subject-yield analysis (ADR 0073) | Exceeds target | Drop any `<-- EMPTY` genre after the recast run |
| 8 | — (process) | `promotions.requested_by` records the **latest** actor across promote→demote→re-promote | constraint-discovered | One row per slug is the state machine's source of truth; full actor history lives in the librarian-signed relay events (Review #80) | Audit trail is event-sourced, not row-sourced | — |

**Undocumented work:** none found — the diff walk matched story/ADR provenance for all 186 source files. (The only out-of-book commits in the range are the Phase-3 product artifacts merged at intake and the harness's own book.md updates.)

## 5. Quality state at close
- **Gates at close (re-run for this audit):** `pnpm -r typecheck` PASS (0 errors) · `pnpm -r test` PASS — **1,921 passed | 13 skipped (1,934), 0 failures** across 12 workspaces (skips = the env-gated Postgres/relay integration suites, incl. #80's real-Postgres state-machine arc, which run in CI/staging) · `pnpm --filter @unbnd/web build` PASS.
- **Known open issues (all non-blocking, review-logged):** the one-cron-tick demote windows (`DemoteControl` re-offer; `demote_failed` falls through to Promote); the promoter `failed`-retry gap (pre-existing); a single observed supertest transport flake in `shelves-enriched` (watch); the #71b min-trusted alignment fast-follow; NIP-85 followers dormant until Brainstorm publishes the datum.
- **Debt rolled up:** Phase-2's four logged debt items are **cleared** (#82). Remaining: the replaceable-write skeleton generalization (Phase-2, still deferred); 2 curatorStatus reads per profile (#68 note); the deferred unfurl cache (#72).

## 6. Carry-forward register
- [ ] **Deploy + ops sequence** (the gate on #71–#82 visibility): push `main` (87 commits, #71–#82 + close) → CI deploys staging → set `PUBLIC_ORIGIN` → run `seed:recast` (check yield; drop empty genres) → calibrate + set `AUTO_PROMOTE_CURATOR_COUNT` → confirm promoter cron → **operator: age-encrypt `LIBRARIAN_NSEC`** (pending) → verify §10 metrics.
- [ ] Promoter retry policy: `failed` + `demote_failed` rows need a retry/reap path (Reviews #77/#82).
- [ ] DemoteControl demote-status read (kills the one-tick re-offer window) + the `demote_failed` list label.
- [ ] #71b hidden-gems min-trusted alignment fast-follow.
- [ ] Unfurl cache (deferred #72), replaceable-write skeleton generalization (Phase 2), 2× curatorStatus reads (#68).
- [ ] Contested tie rule: product ratifies `>=` or flips to strict.
- [ ] PRD §11 knobs now need real values from the founding cohort (taste-match overlap; vouch N/W; emergent-gate coexistence — currently OR'd).
- [ ] Triage the three stale pre-Phase-3 stubs in `stories/` (`13-tags-in-search`, `16b-submission-promotion`, `6-staging-deploy`) — likely superseded; archive with supersession notes (the #28b/#30b pattern).
- [ ] Watch: `shelves-enriched` supertest flake; NIP-85 followers source.
