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

## Provenance
- **Mode:** PRD-backed (anchor = `product-team/prd/social-loop.md`).
- **Confidence at close:** to be set at book-close.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/social-loop/audit.md`
- Product feedback: `engineering-team/audits/social-loop/prd-addendum.md`
