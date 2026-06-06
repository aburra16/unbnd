# Book of Work: Phase 2 — Trust meaningful, curation visible

**Slug:** phase-2
**Status:** Closed
**Opened:** 2026-05-30 (PRD authored, commit `06efb6b`)
**Closed:** 2026-06-06

## Intent anchor

**PRD-backed.** The anchor is `engineering-team/phase2-prd.md` (v2.0, 2026-05-30) §§2.1–2.11, with success criteria in §4 and the end-of-phase backlog in Appendix C. Completion is *computed*: every story tracing to those sections is `Done`. The PRD itself is immutable and is never edited by this close — divergences are recorded in the addendum.

> Provenance note: this manifest was **reconstructed at close**. The book-of-work mechanics were ported into the engineering harness in PR #110 (`8668228`), *after* Phase 2 had already been built. The anchor (the Phase 2 PRD) and the full per-story record (stories, ADRs, reviews) predate the harness, so the reconstruction is high-confidence — it is a roll-up of existing artifacts, not an inference from git alone.

## Stories in this book

Phase 2 spans repo stories **17–64** (commit range `48957c7..c959949`). The PRD §5 plan numbered the work 17–39; the repo numbering diverged because several stories split into sub-PRs and an unplanned design-system hardening epic (Stories 38–51) was inserted mid-phase. Mapped to PRD sections:

**Foundations & trust seam (§2.0, §2.2.0)**
- #17 `fixture-trust-provider` — deterministic fixture TrustProvider + staging seed harness (the decoupling keystone)

**Engagement — Lane 1 (§2.3, §2.4, §2.10)**
- #18 `shelves` — add/remove books, own shelves on profile
- #19 `profile-polish` — enriched shelves + real activity counts + account-menu nav
- #20 `public-profiles` — real `/profile/:npub`, retire the Mira fixture, Substack link display
- #21 `honest-author-scoped-counts` — paginate past the 500-event relay cap
- #22 `substack-set` — first kind-0 write (Appendix C-1)
- #23 `follow-kind3` — follow/unfollow (kind-3) for both tiers
- #24 `clickable-profiles` — all raters link to their profile
- #29 `profile-ia-nostr-disclosure` — progressive disclosure of nostr internals (Appendix C-5)
- #31 `author-claiming` — open claim + "Author (claimed)" badge + "Books by this author"
- #32 `verified-author` — `author-verified` consensus gate + author-only metadata edits

**Trust activation — Lane 2, built against the fixture (§2.5–§2.8)**
- #25 `weighted-consensus` — trust-weighted tag/genre consensus + community-vs-trusted labeling
- #26 `custodial-personalization` — in-session NIP-98 trigger + personalized view parity
- #27 `custodial-kind0-bootstrap` — publish/repair custodial kind-0 with display name
- #27b `custodial-displayname-rename` — edit display name in Settings
- #28 `your-rating-surface-edit` — surface + in-place edit of your own rating
- #30 `trust-gated-promotion` — manual curator-gated promote (separate key-holding promoter worker)
- #33 `accusatory-tag-gate` — curator-gated write picker + auditable operator-only reveal

**Discovery — Lane 2 (§2.9)**
- #34 `trust-weighted-search` — trust-weighted re-rank blended in the API
- #35 `homepage-trust-shelves` — Trending / Community Favorites / genre shelves (scheduled cache)
- #36 `for-you-shelf` — personalized For-You shelf

**Design-system hardening epic (Epic 0001 / ADR 0038 — added beyond the PRD; classified into §2.11)**
- #38–#51 — `@unbnd/ui` scaffold · visual-regression harness · color/type/spacing/breakpoint-radii-elevation-z/motion tokens · Button/IconButton · Icon registry · Link/Pill · Avatar/Label/Field · layout/Container · theming substrate + dark skeleton · docs re-point

**Catalog quality & expansion (§2.2)**
- #52 `book-blurbs-openlibrary` · #53 `blurb-display` · #54 `dead-fixture-cleanup` · #55 `catalog-expansion` (~11.2k via OL search API + legitimacy gate) · #56 `catalog-prune` (read-time junk filter) · #57 `seeder-relay-resilience`

**Production librarian (§2.1) + house-observer swap (§2.5 completion)**
- #58 `production-librarian-identity` · #59 `shared-relay-package` (`@unbnd/relay`)

**Platform hardening — Block E (§2.11)**
- #60 `index-on-write` · #61 `image-tag-pinning` · #62 `maintenance-sweeper` · #63 `upsync-monitoring` · #64 `submit-autofill`

**Deferred to Phase 3 (in `stories/`, not `done/`):** #28b `unrate-removal`, #30b `promotion-demotion`.

## Provenance
- **Mode:** PRD-backed (anchor = `engineering-team/phase2-prd.md`; manifest reconstructed at close).
- **Confidence at close:** high — anchor + per-story stories/ADRs/reviews all exist and predate the harness; reconciled against `git diff 48957c7..c959949`.

## Close artifacts *(filled by `/close-book`)*
- Build audit: `engineering-team/audits/phase-2/audit.md`
- Product feedback: `engineering-team/audits/phase-2/prd-addendum.md`
