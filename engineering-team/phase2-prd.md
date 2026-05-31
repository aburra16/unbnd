# Unbnd — Phase 2 Engineering PRD

**Version:** 2.0
**Date:** 2026-05-30
**Status:** Draft
**Companion to:** `../unbnd-prd.md` (original PRD), `../unbnd-prd-addendum-phase1.md` (Phase 1 as-built), `phase1-deferred-and-tradeoffs.md` (Phase 1 deferred items)

This is the engineering track. It is the source of truth for what Phase 2 builds. It follows the 5-phase engineering cycle (PO → Architect → Tester → Implementer → Reviewer) and the per-story ADR + review + approval-gate process established in Phase 1.

---

## 1. Purpose

Phase 1 proved the architecture: DList events as the data layer, three-tier auth, tag-assertion classification, trust-weighted ratings via GrapeRank, and community submissions, all deployed and live on staging. The trust value proposition is correct but inert: the stand-in house observer does not trust the seeded librarian or any test rater, so trust-weighting returns near-zero signal; there are no curated shelves; profiles are stubs; reading lists have a schema but no surface.

Phase 2 makes trust **meaningful** and curation **visible**, and it does so without coupling the build to the arrival of real user activity. Two principles govern the whole phase:

1. **Engagement first, trust on top.** Features that need no trust data (catalog depth, shelves, profiles + activity, author claiming, platform hardening) ship first and in parallel. They are the surfaces that *generate* the signal that trust-weighting later consumes. Building trust gates before there is anything to weight re-creates the Phase 1 "correct but inert" problem.
2. **Build and verify trust features against deterministic data, light them up with real data.** Trust-consuming features are built and fully tested against a deterministic fixture trust provider (§2.2.0) plus a controlled staging seed harness. They activate when real signal arrives and degrade to labeled raw/empty states when it is thin. Nothing in the engineering critical path waits on real user volume.

---

## 2. Feature specifications

### 2.0 Sequencing and the trust/data decoupling

Phase 1's dependency-chain framing was over-serialized. The real graph is two parallel lanes that meet at the house-observer swap:

```
Lane 1 — trust-independent (build immediately, parallelizable)
  Librarian identity (adopt + secure) ─┐
  Catalog expansion + data-quality      ├─► Shelves ─► Profiles + activity ─► Author claiming
  Platform hardening                    │
                                        │
Lane 2 — trust (build against fixture provider, activate with real data)
  Fixture TrustProvider + seed harness ─► House-observer swap ─► Trust-weighted display + labeling
                                        ─► Promotion signals (manual) ─► Accusatory gate (manual)
                                        ─► Personalization ─► Trust-weighted search + homepage shelves
```

The only hard ordering rules:

- **House-observer swap precedes every trust-consuming feature.** (The original §2.1 chain put promotion before the observer swap; that was an ordering bug. Promotion signals read GrapeRank from the house PoV, which is meaningless until the observer is the librarian.)
- **The fixture TrustProvider precedes the trust-consuming features it verifies.** It is the keystone that removes the community dependency from the build.

Everything in Lane 1 is independent of Lane 2 and of community data.

#### The fixture TrustProvider + staging seed harness (ADR 0017)

The Phase 1 `TrustProvider` interface (`apps/api/src/trust/`) already isolates Brainstorm/NIP-85 behind an adapter guarded by a CI architecture test. Phase 2 adds:

- **A deterministic fixture provider** selected by config in dev/test. It returns known weights for a controlled set of keys and known `hasScores`/`personalize` results. Every trust-consuming feature (weighted display, promotion signals, accusatory gate, search re-ranking, personalization, shelves) is unit- and integration-tested against it. No Brainstorm call, no network, no human, fully deterministic in CI.
- **A controlled staging seed harness:** a small set of keys (operator-owned) that the librarian follows and that publish a known rating/tag set against a known book subset. This produces a real, reproducible House↔Yours divergence on staging on demand, for verification and demonstration, with no dependency on external user activity. The harness is engineering test infrastructure, documented in `ops/`, and is clearly separated from production data.

The production path is unchanged: the real Brainstorm provider + the librarian's seed follow list yields real scores once real ratings exist. The fixture provider and the Brainstorm provider implement the identical interface; switching is a config flip, and the architecture guard keeps backend specifics out of the consumers.

**Acceptance criteria (0017):**
- A fixture `TrustProvider` implementing the full interface, selectable by config, returning deterministic weights.
- The CI architecture guard still passes (no backend specifics leak outside adapters).
- A documented staging seed-harness procedure that produces a reproducible weighted-vs-raw divergence.
- At least one trust-consuming feature test runs green against the fixture provider in CI.

---

### 2.1 Production librarian identity (adopt + secure)

**The keystone for Lane 2.** Decision of record: the existing staging librarian key is **unmanaged, not compromised**, so we **adopt it as the production identity**. We do **not** generate a new key and we do **not** re-sign the catalog. This eliminates the address-migration that a new pubkey would force (addresses are `kind:pubkey:dtag`; a new pubkey changes every address and orphans every `#a` and z-tag cross-reference).

**What ships:**

- **Secret management.** The librarian nsec moves from a bare `.env` value to production-grade handling. Initial target: encrypted at rest on the droplet with a documented backup/rotation procedure; evaluate a KMS/Vault step if operational complexity is justified. An offline redundant copy is held by the operator out of band (not in the repo).
- **kind-0 profile** for the librarian (display name, logo avatar, role description), published to dcosl. Owner-managed content; engineering provides the publish mechanism and verifies it lands.
- **kind-3 seed follow list.** The librarian's contact list is published/updatable via an operator procedure. Its membership (a configurable set of seed curator pubkeys) is the seed of the house trust graph. Engineering owns the publish mechanism; membership is configured out of band.
- **Config.** The librarian pubkey is set as `HOUSE_OBSERVER_PUBKEY` (the actual swap of the *active* house observer is §2.2.4 / the house-observer-swap story, gated behind the fixture-verified trust display).

**Acceptance criteria:**
- Librarian nsec under production-grade secret management with a documented backup/rotation runbook; offline redundant copy confirmed held out of band.
- Librarian kind-0 profile published to dcosl and resolvable by nostr clients.
- A repeatable operator procedure to publish/update the librarian kind-3 follow list.
- No catalog re-signing performed; existing concept headers and records remain canonical under the adopted key.
- Librarian pubkey configured as `HOUSE_OBSERVER_PUBKEY`.

---

### 2.2 Catalog expansion (quality-first, ~10K aspirational)

**Current:** ~1,960 books across 8 genre buckets from the Open Library subjects API.

**Target:** as many *good* records as the expanded genre list yields, aiming around 10,000, with reliable metadata and cover coverage. A clean 6–7K beats a junky 10K for the "feels like a real bookstore" goal. The round number is a direction, not an acceptance gate.

**Approach:** keep the existing `apps/seeder` architecture (OL subjects → librarian-signed kind-39999 BookRecords → dcosl). Work is expanding the subject list, increasing depth, and a dedicated **data-quality pass**:

- **OL data quality.** Filter junk subjects, non-English entries where unintended, and works with no usable metadata. Treat the cover-image filter as yield-reducing and measure the real yield per category rather than assuming the target table.
- **Deduplication at scale.** ISBN + fuzzy title/author matching against the existing catalog. Phase 1 dedup ran at ~2K; verify it holds at the expanded size.

Genre direction (approximate, not a gate): expand existing 8 genres and add History, Science/Nature, Philosophy, Essays/Criticism, Poetry, Young Adult. See the original combined PRD for the indicative per-genre table.

**Librarian baseline assertions:** every seeded book gets a librarian genre tag assertion (as in Phase 1), so each book carries at least one trusted-source genre tag. These carry weight once the house observer is the librarian.

**Re-index:** run `apps/indexer` after seeding; confirm search latency at the expanded size (trivial for Meili, but verify).

**Acceptance criteria:**
- Catalog expanded across 14+ genre categories with measured per-category yields.
- A documented data-quality filter (junk/dup/cover/metadata) applied during seeding.
- Dedup verified at the expanded size.
- Every seeded book has a librarian genre assertion, signed by the adopted librarian key.
- Search returns across the expanded catalog with sub-100ms latency.

---

### 2.3 Shelves / reading lists (trust-independent — Lane 1)

**Current:** `BookShelf` schema exists in `@unbnd/schemas` (kind 39999); no UI or API.

**What ships:** three default shelves per user ("Want to Read," "Reading," "Read") plus user-created custom shelves with name + public/private visibility. Adding a book publishes a replaceable kind-39999 BookShelf event signed by the user's key, z-tagged to a `book-shelves` concept header. One event per shelf per user, updated on add/remove.

**UI:** "Add to shelf" dropdown on book detail; shelves section on profiles (cover thumbnails + counts); a dedicated shelf page (`/shelves/:user/:shelf-slug`); public shelves browsable by link, private visible only to owner.

**Acceptance criteria:**
- Create/rename/delete custom shelves; add/remove books from any shelf.
- Shelf data stored as portable nostr events.
- Shelves render on profiles with thumbnails; public shelves browsable via direct link.
- Private shelves hidden from non-owners (server-enforced for custodial, client-respected for sovereign reads).

---

### 2.4 Public profiles + real activity (trust-independent core — Lane 1)

**Current:** `/profile/me` shows the user's identity header + submissions; `/profile/:handle` renders a fixture (Mira Calloway).

**What ships:** public profiles at `/profile/:npub` (and `/profile/:handle` if set):

- Identity header (kind-0 picture for sovereign, initials for custodial; display name, handle, bio).
- Stats: books rated, reviews, tags applied, followers, following (derived from event inspection).
- Genre affinity: computed from the user's rating/tag history.
- Shelves: public shelves with thumbnails.
- Recent activity: chronological feed of ratings, reviews, tag assertions, shelf additions.
- **Follow button** (publishes/updates kind-3; see §2.6).
- **Trust-tier badge** is the *only* trust-dependent element here. It shows a human-readable tier derived from GrapeRank percentile from the house PoV, never a raw number, and only renders once trust is active (§2.2.4 / harness). Until then the profile shows everything else and omits the badge honestly.

**Retire the fixture:** remove the Mira Calloway profile; empty/new profiles show honest empty states.

**Acceptance criteria:**
- Public profiles browsable for any account; display real activity.
- Follower/following counts accurate from kind-3 inspection.
- Fixture profile and its route removed.
- Trust-tier badge computed from GrapeRank (or absent), never fabricated.

---

### 2.5 House-observer swap + trust-weighted tag/genre consensus

**Depends on:** §2.1 (librarian identity) + §2.2.0 (fixture provider, for build/test).

**What ships:** the *active* house observer switches to the production librarian. Tag/genre consensus moves from raw counts to trust-weighted aggregation, matching how ratings already work: genre chips and quality signals on book detail reflect trust-weighted assertion consensus, so a tag from a highly trusted curator outweighs many from untrusted accounts.

**Raw-fallback, labeled (decision of record):** keep the Phase 1 raw fallback so the catalog never looks empty, but **label it**. Show a subtle indicator distinguishing "community consensus" (raw fallback) from "trusted consensus" (weighted), so users know what they are seeing. This is honest and avoids the empty-catalog problem while the graph grows.

**Acceptance criteria:**
- Active house observer is the production librarian pubkey.
- Genre/style chips and quality signals on book detail reflect trust-weighted consensus when trusted signal exists.
- Raw fallback retained and clearly labeled (community vs trusted consensus).
- Verified against the fixture provider in CI and against the staging seed harness.

---

### 2.6 Custodial personalization (in-app follow graph)

**Current:** only sovereign (NIP-07) users can personalize; custodial users have no kind-3, so GrapeRank returns empty.

**What ships:** an in-app follow mechanism. When a custodial user follows a curator, the API publishes/updates a kind-3 event **signed by the custodial user's server-managed key** (consistent with the existing Tier-2 custodial signing model) to the local relay and dcosl. Follow/unfollow buttons live on profiles and review/rating bylines.

**Personalization trigger — decision of record:** use **the API signing a NIP-98 challenge with the custodial user's key** to trigger GrapeRank via Brainstorm. This is *not* a new sovereignty compromise; the custodial contract already has the server sign on the user's behalf. It also removes the external dependency on Brainstorm whitelisting an Unbnd key. Constraint: the ephemeral wrap means the key is only available during an active custodial session, so the trigger fires **in-session**.

Once a custodial user has enough follows for a non-trivial graph, the "Personalize" prompt appears (same UX as sovereign in Phase 1).

**Acceptance criteria:**
- Follow/unfollow publishes kind-3 signed by the custodial key, in-session.
- Custodial users with a sufficient follow graph can trigger personalization in-session via NIP-98 signed by their key.
- Personalized view and the House↔Yours toggle work identically for custodial and sovereign users.
- Verified against the fixture provider in CI.

---

### 2.7 Trust-gated submission promotion (manual, with signals)

**Decision of record:** Phase 2 ships a **manual promotion action with trust signals as decision support**, not automatic threshold promotion. At early-stage submission volume, auto-promotion optimizes for volume that does not exist and is gameable; manual-with-signals is simpler, safer, and testable. Automatic threshold promotion is deferred to Phase 3.

**What ships:** the `/submissions` space (Phase 1) gains, for users above a configurable trust threshold (the "curator gate," emergent from GrapeRank house-PoV influence, not a manually assigned role):

- A view of each submission's trust signals: count and identities of ratings/tag-assertions from curators above the threshold, trust-weighted average rating.
- A **promote action** that republishes the book record under the main `books` concept header (signed by the librarian), moving it into genre browse / search / shelves alongside seeded entries.
- Books below the bar remain in the submissions space.

**Acceptance criteria:**
- Submission trust signals (weighted rating, curator-rating count/identities) are computed and displayed.
- A manual promote action republishes a submission under the `books` header; the promoted book appears in catalog surfaces.
- The curator gate (trust threshold) is configurable.
- Verified against the fixture provider in CI.

---

### 2.8 Accusatory-tag visibility (manual gate)

**Decision of record:** accusatory tags (e.g. `ai-generated`) stay behind a **manual gate** in Phase 2, not an automatic trust-consensus reveal. Auto-revealing accusations from a consensus of a dozen people has almost no statistical basis and carries defamation/moderation exposure. Automated trust-weighted reveal is deferred to Phase 3.

**What ships:** the accusatory-tag **write picker** becomes available to users above the curator trust threshold (so trusted curators can assert them). Visibility on book detail remains gated by an explicit, auditable mechanism (manual review/librarian action) rather than emergent consensus. The defamation/liability consideration is documented in the story's ADR.

**Acceptance criteria:**
- Accusatory tags remain hidden by default at read time.
- The accusatory write picker is offered only to users above the trust threshold.
- An explicit, auditable gate controls visibility; emergent auto-reveal is not used.
- The liability rationale is captured in the ADR.

---

### 2.9 Trust-weighted search ranking + homepage trust shelves

**Depends on:** house-observer swap + real/harness signal.

**Search re-ranking:** after Meili returns by text relevance, the API blends in trust-weighted rating from the observer's PoV (configurable blend). Personalized users get their personal graph; house-PoV users get house trust. The blend lives in the API, not in the search adapter (keeps the provider seam clean).

**Homepage shelves:**
- **Trending:** highest trust-weighted rating activity in the last 7 days (weighted so spam/bot ratings do not inflate).
- **Community Favorites:** highest trust-weighted average across genres (min rating-count threshold).
- **Genre shelves:** top trust-weighted per genre.
- **For You** (personalized users): books highly rated by curators in the user's graph that they have not rated.

Shelves are cached and refreshed on a schedule, not per-request. Empty shelves show honest empty states.

**Acceptance criteria:**
- Search incorporates trust-weighted rating as a configurable ranking signal, blended in the API (not the search adapter).
- Homepage shows Trending, Community Favorites, and genre shelves from real/harness trust data, with honest empty states.
- Personalized users see "For You."
- Shelves refresh on a schedule; verified against the fixture provider in CI.

---

### 2.10 Author claiming + verification (trust-independent core — Lane 1)

**Current:** the submission form has an "I am the author" toggle (`source=author`, `authorPubkey`); no claim/verify/edit flow for catalog entries.

**What ships:** an author searches the catalog, clicks "Claim this book," and links it to their account (sets `authorPubkey`, shows an "Author" badge). Verification is trust-based: trusted curators validate/dispute via a new `author-verified` tag (sensitivity `normal`); if trusted consensus exceeds the threshold, the badge upgrades to "Verified Author." Automated verification (website/ISBN matching) is Phase 3. A claimed/verified author can edit blurb, cover URL, and purchase links, but not community tags, ratings, or others' reviews.

**Note:** the claim + badge + edit-access mechanics are trust-independent and ship in Lane 1; the *verified* upgrade is a thin trust-dependent layer that activates with the rest of Lane 2.

**Acceptance criteria:**
- Authors can claim catalog entries; "Author" badge appears.
- Trusted curators can validate claims via `author-verified` assertions; "Verified Author" upgrade gated by trust consensus.
- Verified authors can edit their book's metadata (blurb, cover, purchase links) and nothing else.
- Author profile shows a "Books by this author" section.

---

### 2.11 Platform hardening (trust-independent — Lane 1)

- **Index-on-write:** publishing a book/rating/tag via the API updates the search index immediately or via a near-real-time queue, instead of a batch `apps/indexer` re-run.
- **Orphaned component cleanup:** remove unused web components from the fixture→live swap (ActionBar, AuthorCard, GenreHeader, GenreControls, SubgenrePills, Pagination).
- **Seeder/indexer image freshness:** pin profile-job `docker pull` to `$UNBND_IMAGE_TAG`.
- **Ephemeral key-map expiry sweeper:** idle-expiry cleanup for custodial session key maps.
- **Up-sync cron verification:** confirm `unbnd-upsync` is installed and running on the droplet; add basic monitoring.
- **OL metadata autofill on submit:** pre-fill cover/page-count/year from OL on ISBN/title entry.
- **Cover preview in the submission form** before submit.

---

## 3. Explicitly deferred to Phase 3+

- **Automatic threshold-based submission promotion** (Phase 2 ships manual-with-signals).
- **Automated/emergent accusatory-tag reveal** (Phase 2 ships a manual gate).
- **Automated author verification** (website/ISBN matching).
- **Lightning payments, Blossom file hosting, editing-bounty marketplace** — distribution/payment phase.
- **Vespa migration** — seam + CI guard are in place; swap is one adapter + config when the upstream trust/search backend moves. Not worth doing independently.
- **NIP-65 outbox model** — current dual-publish to dcosl is sufficient.
- **Media storage** (custodial avatar upload, cover hosting) — custodial uses initials; covers are OL/author URLs.
- **Mobile native apps, OAuth providers, email notifications, multi-instance federation.**
- **strfry in CI** for gated relay integration tests — nice to have, not blocking.

---

## 4. Engineering success criteria (Phase 2)

| Criterion | Target |
|---|---|
| Catalog size | ~10K good records (quality over the round number) across 14+ genres |
| Search latency at scale | sub-100ms |
| Trust features verified deterministically | all trust-consuming features green in CI against the fixture provider |
| House↔Yours divergence demonstrable | reproducible on staging via the seed harness, no community dependency |
| Promotion mechanism | a submission promoted into the catalog via the manual-with-signals flow |
| Personalization end-to-end | works for both custodial and sovereign |
| Accusatory gate | write picker trust-gated; read visibility behind an auditable gate |
| Architecture guards | search + trust provider seams remain CI-enforced; no backend specifics leak |
| Tech debt | zero new shortcuts; every story lands with an ADR + review |

---

## 5. Story sequence (5-phase cycle, ADRs from 0017)

Lanes can run concurrently; the only hard gates are noted in §2.0.

**Block A — Foundations (Lane 1 + harness)**
- Story 17: Fixture `TrustProvider` + staging seed-harness procedure (ADR 0017) — the decoupling keystone.
- Story 18: Production librarian identity — secret management, kind-0 publish mechanism, kind-3 seed-follow procedure, `HOUSE_OBSERVER_PUBKEY` config. (No re-signing.)
- Story 19: Catalog expansion seeder — expanded genre list + OL data-quality filter.
- Story 20: Dedup-at-scale verification + re-index.

**Block B — Engagement (Lane 1, parallel with Block C)**
- Story 21: Shelves — concept header + schema wiring + CRUD API.
- Story 22: Shelves — "Add to shelf" UI, profile shelves, dedicated shelf page.
- Story 23: Public profiles — real activity aggregation + stats + genre affinity; retire the fixture.
- Story 24: Follow mechanism — kind-3 publish/update for custodial + sovereign; follow buttons.
- Story 25: Author claiming + badge + author edit access (trust-independent core).

**Block C — Trust activation (Lane 2, built against the fixture provider)**
- Story 26: House-observer swap + trust-weighted tag/genre consensus + community-vs-trusted labeling.
- Story 27: Custodial personalization — in-session NIP-98 trigger + personalized view parity.
- Story 28: Trust-gated submission promotion (manual, with signals) + curator-gate threshold.
- Story 29: Accusatory-tag visibility — trust-gated write picker + auditable read gate (with liability ADR).
- Story 30: Trust-tier badge on profiles + "Verified Author" upgrade.

**Block D — Discovery (Lane 2)**
- Story 31: Trust-weighted search re-ranking (blend in API).
- Story 32: Homepage trust shelves (Trending, Community Favorites, genre rows) + scheduled refresh.
- Story 33: "For You" personalized shelf.

**Block E — Hardening (Lane 1, anytime)**
- Story 34: Index-on-write.
- Story 35: OL metadata autofill + cover preview on submit.
- Story 36: Orphaned component removal.
- Story 37: Seeder/indexer image-tag pinning.
- Story 38: Ephemeral key-map expiry sweeper.
- Story 39: Up-sync cron verification + monitoring.

---

## 6. Phase 3 technical roadmap (no business framing)

- Lightning payments (V4V + fixed price for ebooks).
- Blossom file hosting for ebook distribution.
- Editing-bounty marketplace (sat-denominated).
- Vespa migration (when the upstream backend migrates; one-adapter swap).
- NIP-65 outbox model for per-user relay selection.
- Media storage (avatar upload, cover hosting).
- OAuth providers (Google, Apple) for broader Tier-2 adoption.
- Contextual Web of Trust — domain-specific GrapeRank weighting book-taste alignment alongside social trust.
- Email notifications (rating responses, new followers, shelf updates).
- Multi-instance federation — independent communities with their own curation standards, books flowing via relay sync.
- Automatic threshold promotion, automated/emergent accusatory reveal, automated author verification (the Phase 2 manual mechanisms' automated successors).

---

## Appendix A: ADR continuity
Phase 2 ADRs begin at **0017** and continue from Phase 1 (0001–0016). The 5-phase cycle, per-story ADR + review, and approval gates carry forward unchanged.

## Appendix B: Standing invariants (carried from Phase 1)
- **No fake trust numbers** — raw counts until real GrapeRank data; weighted figures clearly labeled; community-vs-trusted consensus distinguished.
- **No silent fabrication** — honest empty/fallback states over invented data.
- **npub for display, hex internal.**
- **No hand-rolled crypto** — Applesauce pattern / nostr-tools / `@noble/*`; `finalizeEvent`/`verifyEvent`; verify only freshly-parsed event bodies.
- **No AI-slop copy/visuals** (enforced in review).
- **Provider-agnostic seams** for search + trust, CI-guarded; backend specifics never leak outside their adapter.
- **No tech debt / no shortcuts** — every story lands with an ADR + a review; push back when something does not make sense.

## Appendix C: Backlog (end of Phase 2; lower priority)

Queued for late Phase 2 (or Phase 3 where noted). Each still runs through the gated story flow when picked up.

### C-1 — External writing link on public profiles
Optional profile field linking a reader's external publication (e.g. a Substack URL), rendered on their public profile under the bio. **Engineering note:** store it in the user's **kind-0 metadata** (portable — travels with the npub) rather than a proprietary DB column; kind-0 already carries a `website` field. Light validation only (well-formed URL); don't over-build domain verification. Folds into the public-profiles story.

### C-2 — Link unfurls for book pages (oEmbed + per-book meta)
`GET /oembed?url=…/book/:slug` returns a `rich` card (cover, title, author, rating, top tags), plus per-book `og:` tags and a `<link rel="alternate" … json+oembed>` for auto-discovery, so a book URL pasted into another platform renders a card instead of a bare link. **Architecture caveat (the real cost):** the web app is a static SPA behind Caddy, so per-book `<head>` tags are **not** per-route today — unfurlers/crawlers don't run JS, and the current `og:` tags are the generic site-wide ones in `index.html`. Making book URLs unfurl requires **server-rendered per-book `<head>`** (a small meta/oembed responder for `/book/:slug`, or bot-aware serving) — an architecture addition, not a one-endpoint job. Scope accordingly. The card's rating shows raw counts until trust data is live (no fabricated numbers).

### C-3 — Identity mapping: provider → npub federation [design note; implementation Phase 3]
Evolve the Phase-1 custodial bridge (email + NIP-07) into a many-to-one mapping: multiple application-layer identities funnel into one npub, with the sovereignty upgrade path (export nsec → NIP-07) always available. **Schema:** an `IdentityMapping` table (`npub`, `provider`, `provider_id`, `linked_at`, `is_primary`), many rows → one `KeyVault` (the encrypted nsec already built in Phase 1). **Conflict resolution:** *prevent* at signup (cross-check a provider's email against the mapping table → "sign in instead?") as the default; a kind-0 "moved to" redirect as an escape hatch (note: that redirect is a new, non-standard convention we'd be inventing). **Engineering caveats:** (a) **OAuth providers (Google/Apple/GitHub) fit the federation/login pattern; an external-publication link like Substack does NOT** — Substack has no third-party OAuth, so it is a *claimed profile link* (C-1), not a login provider; don't conflate the two. (b) A **shared key vault across apps** is a serious custodial-custody security design (research-grade, not near-term). This is a design note now; it earns an ADR when picked up in Phase 3.

### C-4 — "Contested" tag treatment (trust-weighted disputes)
Follow-up to Story 25 (trust-weighted tag/genre consensus). Today a tag that *trusted curators net-dispute* still renders as a plain "trusted consensus" chip — the weighting annotates each surfaced tag with its `trusted` flag + raw counts but doesn't visually distinguish a tag the trusted graph is pushing *down*. Add a **"contested" treatment**: when an observer's trusted curators net-dispute a tag (trust-weighted disputes ≥ applies) that is still raw-surfaced, mark it visibly (e.g. a muted/struck "contested" chip state) and/or drop it from the trusted view, so the dispute side of trust-weighting is legible. Honest today (raw counts are shown), but this completes the apply/dispute symmetry. Small story; reuses the Story-25 `trustedApplies`/`trustedDisputes` already computed per tag.
