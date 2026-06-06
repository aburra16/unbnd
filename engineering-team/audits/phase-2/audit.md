# Build Audit: Phase 2 — Trust meaningful, curation visible

**Book:** `engineering-team/audits/phase-2/book.md`
**Date:** 2026-06-06
**Branch / commit range:** `48957c7..c959949` (Phase 1 closeout → Story 64). The subsequent `8668228` (#110, harness port) changed no product code and is outside this book.
**Provenance:** PRD-backed (anchor `engineering-team/phase2-prd.md`; manifest reconstructed at close)
**Confidence:** high

> The Build Audit is the as-built record — what the product *is* now, factual and source-linked. It does not propose changes; that is the addendum's job (`prd-addendum.md`).

## 1. What shipped

Phase 2 set out to make trust **meaningful** and curation **visible** without coupling the build to real user volume (PRD §1). It delivered:

- **A deterministic trust seam** — a fixture `TrustProvider` selectable by config + a documented staging seed harness, so every trust-consuming feature is CI-verified with no Brainstorm/network/human dependency — `stories/done/17-fixture-trust-provider.md`
- **Reading lists / shelves** — add/remove books, default + custom shelves, rendered on profiles — `stories/done/18-shelves.md`, `19-profile-polish.md`
- **Real public profiles** at `/profile/:npub` with real activity/stats; the Mira Calloway fixture removed — `stories/done/20-public-profiles.md`, `21-honest-author-scoped-counts.md`
- **Custodial kind-0 writes** — display name at signup, rename, Substack link; progressive disclosure of nostr internals — `stories/done/22-substack-set.md`, `27-custodial-kind0-bootstrap.md`, `27b-custodial-displayname-rename.md`, `29-profile-ia-nostr-disclosure.md`
- **Follow graph** — kind-3 follow/unfollow for both tiers; clickable rater profiles — `stories/done/23-follow-kind3.md`, `24-clickable-profiles.md`
- **Author claiming + verification** — open claim + "Author (claimed)" badge; trusted-consensus "Verified Author" upgrade; author-only metadata edits — `stories/done/31-author-claiming.md`, `32-verified-author.md`
- **Trust-weighted tag/genre consensus** with community-vs-trusted labeling — `stories/done/25-weighted-consensus.md`
- **Custodial personalization** — in-session NIP-98 trigger + House↔Yours parity with sovereign — `stories/done/26-custodial-personalization.md`, `28-your-rating-surface-edit.md`
- **Manual trust-gated promotion** — curator-gated promote action; a separate key-holding `apps/promoter` worker republishes under the `books` header — `stories/done/30-trust-gated-promotion.md`
- **Accusatory-tag gate** — curator-gated write picker; auditable operator-only reveal (no emergent auto-reveal) — `stories/done/33-accusatory-tag-gate.md`
- **Trust-weighted discovery** — search re-rank blended in the API; homepage Trending/Favorites/genre shelves (scheduled cache via `apps/shelves`); personalized For-You — `stories/done/34-trust-weighted-search.md`, `35-homepage-trust-shelves.md`, `36-for-you-shelf.md`
- **A two-tier design-system package** (`@unbnd/ui`) with tokens, primitives, an icon registry, a theming substrate + inert dark skeleton, and 12 CI architecture guards — `stories/done/38..51` (Epic 0001)
- **Catalog ~11.2k** via OL search-API + a legitimacy gate + read-time junk filter + blurbs — `stories/done/52,53,54,55,56,57`
- **Production librarian identity** (adopted, not re-keyed) + house-observer swap, with a shared `@unbnd/relay` — `stories/done/58-production-librarian-identity.md`, `59-shared-relay-package.md`
- **Block E platform hardening** — index-on-write, image-tag pinning, maintenance sweeper, up-sync monitoring, OL autofill on submit — `stories/done/60..64`

## 2. Stories rolled up

48 stories shipped (all `Done`, all reviewed PASS/APPROVED). PRD §5 planned 17–39; the repo ran 17–64 (story splits + the inserted design-system epic). Two stories deferred to Phase 3 remain in `stories/` (not `done/`): **#28b** unrate-removal, **#30b** promotion-demotion.

| Story | Delivered | ADR | Review |
|---|---|---|---|
| #17 fixture-trust-provider | deterministic fixture TrustProvider + seed harness | 0017 | `reviews/17-fixture-trust-provider.md` PASS |
| #18 shelves | add/remove + own shelves | 0018 | `reviews/18-shelves.md` PASS |
| #19 profile-polish | enriched shelves + activity counts + nav | 0019 | `reviews/19-profile-polish.md` PASS |
| #20 public-profiles | `/profile/:npub`, retire Mira, Substack display | 0020 | `reviews/20-public-profiles.md` PASS |
| #21 honest-author-scoped-counts | paginate past the 500-event cap | 0021 | `reviews/21-honest-author-scoped-counts.md` PASS |
| #22 substack-set | first kind-0 write (C-1) | 0022 | `reviews/22-substack-set.md` PASS |
| #23 follow-kind3 | follow/unfollow kind-3, both tiers | 0023 | `reviews/23-follow-kind3.md` PASS |
| #24 clickable-profiles | raters link to profiles | 0024 | `reviews/24-clickable-profiles.md` PASS |
| #25 weighted-consensus | trust-weighted tag/genre + labeling | 0025 | `reviews/25-weighted-consensus.md` PASS |
| #26 custodial-personalization | in-session NIP-98 trigger + parity | 0026 | `reviews/26-custodial-personalization.md` PASS |
| #27 custodial-kind0-bootstrap | kind-0 at signup + reconcile | 0027 | `reviews/27-custodial-kind0-bootstrap.md` PASS |
| #27b custodial-displayname-rename | edit display name | 0028 | `reviews/27b-custodial-displayname-rename.md` PASS |
| #28 your-rating-surface-edit | surface + edit own rating | 0029 | `reviews/28-your-rating-surface-edit.md` PASS |
| #29 profile-ia-nostr-disclosure | progressive disclosure (C-5) | 0030 | `reviews/29-profile-ia-nostr-disclosure.md` PASS |
| #30 trust-gated-promotion | manual promote + promoter worker | 0031 | `reviews/30-trust-gated-promotion.md` PASS |
| #31 author-claiming | open claim + badge + "Books by" | 0032 | `reviews/31-author-claiming.md` PASS |
| #32 verified-author | verified gate + author edits | 0033 | `reviews/32-verified-author.md` PASS |
| #33 accusatory-tag-gate | curator write picker + ops reveal | 0034 | `reviews/33-accusatory-tag-gate.md` PASS |
| #34 trust-weighted-search | API-blended re-rank | 0035 | `reviews/34-trust-weighted-search.md` PASS |
| #35 homepage-trust-shelves | Trending/Favorites/genre, cached | 0036 | `reviews/35-homepage-trust-shelves.md` PASS |
| #36 for-you-shelf | personalized shelf | 0037 | `reviews/36-for-you-shelf.md` PASS |
| #38–#51 design-system epic | `@unbnd/ui` tokens/primitives/guards | 0038–0050 | `reviews/38..51` PASS (47b = avatar/label/field) |
| #52 book-blurbs-openlibrary | populate blurbs | 0051 | `reviews/52-book-blurbs-openlibrary.md` PASS |
| #53 blurb-display | clamp + Read more + source | 0052 | `reviews/53-blurb-display.md` PASS |
| #54 dead-fixture-cleanup | remove dead fixtures + guard | 0053 | `reviews/54-dead-fixture-cleanup.md` PASS |
| #55 catalog-expansion | OL search-API + legitimacy gate (~11.2k) | 0054 | `reviews/55-catalog-expansion.md` PASS |
| #56 catalog-prune | read-time junk filter | 0055 | `reviews/56-catalog-prune.md` PASS |
| #57 seeder-relay-resilience | reconnect + bounded retry | 0056 | `reviews/57-seeder-relay-resilience.md` PASS |
| #58 production-librarian-identity | librarian worker + standup runbook | 0057 | `reviews/58-production-librarian-identity.md` PASS |
| #59 shared-relay-package | `@unbnd/relay` extraction | 0058 | `reviews/59-shared-relay-package.md` PASS |
| #60 index-on-write | live writes self-index | 0059 | `reviews/60-index-on-write.md` PASS |
| #61 image-tag-pinning | profile-worker SHA pin | 0060 | `reviews/61-image-tag-pinning.md` PASS |
| #62 maintenance-sweeper | ephemeral-key idle sweep | 0061 | `reviews/62-maintenance-sweeper.md` PASS |
| #63 upsync-monitoring | `/health/sync` backlog | 0062 | `reviews/63-upsync-monitoring.md` PASS |
| #64 submit-autofill | OL autofill + cover preview | 0063 | `reviews/64-submit-autofill.md` PASS |

## 3. As-built inventory

Derived from `git diff --stat 48957c7..c959949`: **688 files changed, +81,376 / −4,459**.

**New apps (profile-gated workers, all keyed off `docker-compose.prod.yml` profiles):**
- `apps/librarian` — librarian identity worker (`profile`/`follows` subcommands; holds `LIBRARIAN_NSEC` off the API).
- `apps/promoter` — trust-gated promotion queue consumer; librarian-signs the republished catalog record.
- `apps/shelves` — computes/caches the homepage trust-weighted shelves (`homepage_shelves` table).

**New packages (no-build, raw `src` export, `workspace:*`):**
- `packages/ui` — design system: two-tier tokens (color/type/space/radii/elevation/z/breakpoints/motion), primitives (Button/IconButton/Link/Pill/Avatar/Label/Field/Container), `Icon` registry, theming substrate + dark skeleton, 12 architecture guards in `packages/ui/test/`.
- `packages/trust` — provider-agnostic trust core (`TrustProvider` iface, `BrainstormProvider`, `FixtureTrustProvider`, weighted ratings/tags).
- `packages/relay` — shared nostr relay client (hardened `connectRelay` + `connectResilientRelay` + one-shot `query`); seeder + promoter migrated onto it.

**User-facing surface (`apps/web`):** routes `/`, `/book/:slug`, `/genre/:slug`, `/browse`, `/about`, `/search`, `/submissions`, `/submit`, `/profile/me`, `/profile/:npub`, `/settings`, `/auth/*`. Key new components: `AuthorBadge`, `AuthorEdit`/`BookAuthorOverlay`, `ClaimControl`, `FollowButton`, `ProfileShelves`, `ProfileActivity`, `RatingControl`/`RatingsPanel`, `ShelfControl`, `TagControl`, `Blurb`, `PoVBar`, `GenreAffinity`, `RatedByRow`, `CopyButton`.

**API surface (`apps/api`):** book read (`/api/books/:slug`, batch `/api/books`), search (`/api/search`), submissions (`/api/submissions[/mine|/template]`), shelves (`/api/shelves[/mine|/template]`, `/api/profile/:npub/shelves`), ratings (`/api/ratings[/template]`, `/api/books/:slug/ratings`), tags (`/api/tags`, `/api/books/:slug/tags`, `/api/genres/:slug/books`), trust (`/api/trust/{status,challenge,personalize}`), profile (`/api/profile/{:id,display-name,follow,stats,substack}`), author (`/api/claims[/template]`, `/api/author-verified[/template]`, `/api/author-edits[/template]`), For-You (`/api/foryou`), OL autofill (`/api/ol/lookup`), health (`/health`, `/health/sync`).

**Domain / contracts:** new `@unbnd/schemas` shapes — `BookClaim`, `AuthorVerifiedAssertion`, `AccusatoryReveal`, `BookAuthorOverlay`; shared `isJunkRecord` denylist relocated here. Event kinds unchanged (kind-0 profiles, kind-3 follows, kind-39998/39999 DList records/assertions, kind-5 deletes used only by deferred 28b/30b). `packages/search` gained `build-document.ts` + `reindex-book.ts` for index-on-write; the batch `apps/indexer` remains the backstop.

## 4. Deviations from intent

The heart of the audit. Harvested from ADR `Consequences`/`Out of scope`, story `Out of scope`/`Open questions`, review notes, and the running continuity log, then reconciled against the diff.

| # | Specified (anchor) | Built | Type | Rationale (source) | Product impact | Carry-forward |
|---|---|---|---|---|---|---|
| 1 | §5 story plan: 23 stories (17–39) | 48 stories (17–64) + 2 deferred | interpretation | Stories split into sub-PRs; an unplanned design-system epic was inserted (ADR 0038) | None to users; plan-vs-actual numbering only | — |
| 2 | §2.11 lists 7 hardening items; no design-system work | A 14-story `@unbnd/ui` design-system hardening epic (Epic 0001, ADRs 0038–0050) | added-beyond-scope | Foundational quality bar — make the FE overhaul-ready before a redesign; the audit found ~145 stray color literals + live token drift + zero type/space/motion tokens + no primitive/icon layer + no CI guard (ADR 0038) | Invisible to users (all stories ran zero-diff vs the visual harness except the one approved button-normalization, #45); a future redesign is now a token/internals swap | Ratify the design system into the product model; see addendum §2.3 |
| 3 | §2.2 "Catalog expanded across **14+ genre categories**" | 8 genres, ~11.2k records | deferred | Genre expansion deliberately deferred — lossless, since genre is a revisable assertion over each book's preserved OL `subjects` (continuity log; PR #110 note) | Catalog breadth narrower than planned; depth/quality target (~10K) met | Phase 3 story: genres 8→14+ (taxonomy + OL-subject mappings + browse grid + recast pass) |
| 4 | §2.2 "keep the existing seeder architecture (OL **subjects** API)" | Switched to OL **search API** (`search.json`) + a legitimacy gate (`edition_count≥3` + cover + English + page/year + junk denylist) + ISBN-13 dedup | intentional-change | The subjects API capped yield/quality; the search API with a legitimacy gate (not a popularity cutoff) keeps long-tail real books while filtering junk (ADR 0054) | Better catalog quality; "feels like a real bookstore" goal met | Dormant subjects-API code (`fetchSubjectWorks`/`mapWorkToBookRecord`) is now dead — prune (chip `task_300eee03`) |
| 5 | §2.2 "data-quality filter applied **during seeding**"; dedup at scale | Added a **read-time junk filter** (`isJunkRecord` at the indexer + API `parseBook`) on top of the seed-time gate | intentional-change / constraint-discovered | Re-scoped at the architecture gate from NIP-09 hard-delete → read-time filter: hard-delete needed an unverified strfry-NIP-09 path and is only advisory across a decentralized relay set; "junk invisible in-app" doesn't require relay deletion (ADR 0055) | Old-source junk is invisible in-app but still resident on the relay (a raw external REQ still returns it) | Protocol-level kind-5 removal preserved as a deferred option in ADR 0054 if ever wanted |
| 6 | §2.1 librarian identity is "the keystone for Lane 2," sequenced in Block A | Built late (Stories 58/59, 2026-06-05) and stood up on staging at close | intentional-change (sequencing) | Lane 1 engagement + Lane 2 fixture-verified features shipped first against the interim nosfabrica observer; the real librarian + swap came once the surfaces existed (PRD §2.0 explicitly decouples build from the swap) | None — the swap is now live on staging (`HOUSE_OBSERVER_PUBKEY=6aca05b8…`) | — |
| 7 | §2.1 "encrypted at rest on the droplet … backup/rotation procedure" | Runbook written (`docs/DEPLOY.md`); `age`-hardening of the on-droplet nsec is still a to-do; nsec also resident in operator iCloud Keychain (Primal) | deferred (ops) | Adopt-the-existing-key decision means no rotation (would orphan addresses); the operator stored it in Primal during standup (continuity log) | Production secret-hygiene gap (operational, not code) | Operator: `age`-encrypt the droplet copy; keep the nsec off further clients |
| 8 | §2.6 "unified gate across tiers"; personalization | Tier-branched personalize; Brainstorm trigger fires **inline** in the custodial submit handler, not async | constraint-discovered | The ephemeral key wrap means the custodial key is only available in-session, so the trigger must fire in-session (ADR 0026, PRD §2.6 acknowledged) | Works for both tiers; a unified cross-tier gate is still notional | Unify the gate; calibrate `PERSONALIZE_MIN_FOLLOWS` |
| 9 | §2.7/§2.8 promotion + accusatory reveal | Manual promote + **operator-only** accusatory reveal (a worker subcommand, no in-app affordance) | intentional-change | PRD decisions of record (manual-with-signals; auditable gate, no emergent auto-reveal) — built as specified, but the reveal trigger is ops-only v1 | Reveals require an operator action; no in-product reveal button | Phase 3: emergent/automated reveal + an in-product reveal affordance |
| 10 | §2.4 followers count "accurate from kind-3 inspection" | Following-count shipped; **followers**-count noted as belonging on NIP-85 `kind:30382` rather than scanning kind-3 | deferred | Counting followers by scanning all kind-3 is unbounded; the right source is NIP-85 (ADR 0023) | Following shown; followers count thin until NIP-85 integration | Phase 3: followers via NIP-85 |
| 11 | §2.4/Appendix C-5 implied nsec export "already exists from Phase 1" | No nsec-export surface exists; Story 29 scoped it out | constraint-discovered (PRD factual error) | Phase 1 only encrypts the custodial key at rest; there is no export UI (verified during Story 29; ADR 0030; C-5 correction note) | Custodial users cannot yet self-upgrade to sovereign | Phase 3: nsec-export/sovereignty-upgrade flow (sensitive — earns its own design) |
| 12 | §2.11 "Orphaned component cleanup (ActionBar, AuthorCard, …)" | Moot — already removed by the time it was reached (Story 37/54 closed the residue) | interpretation | The fixture→live swap had already removed them; Story 54 cleaned the last dead `apps/web/src/data` fixtures + closed a guard blind spot (continuity log) | None | — |
| 13 | §4 "Search latency at scale: sub-100ms" | Effectively met for realistic queries (~65–105ms server-side incl. trust rerank); not yet a clean isolated number | constraint-discovered | Measured from a remote client over the network (~85ms baseline confound); Meili index query is comfortably sub-100ms at ~11.2k; `processingTimeMs` is discarded by the adapter today (continuity log; ADR 0035) | Criterion effectively met; no definitive server-side instrument | Optional small story: expose Meili `processingTimeMs` on `/api/search` for a definitive number + monitoring |
| 14 | §2.5 "trusted consensus" labeling | Built (ADR 0025); but a tag the trusted graph net-**disputes** still renders as a plain chip | deferred | Apply/dispute symmetry incomplete — the dispute side isn't visually distinguished (Appendix C-4) | Honest (raw counts shown) but disputes aren't legible | Phase 3 / small: Appendix C-4 "contested" tag treatment (reuses Story-25 `trustedApplies/Disputes`) |

**Undocumented work:** none found. Every new app/package/large file traces to a story/ADR (`packages/ui`→Epic 0001; `packages/trust`→Story 25/34/36; `packages/relay`→Story 59; workers→Stories 30/35/58). The 3-way diff/story/ADR reconciliation showed no orphaned additions.

## 5. Quality state at close

- **Gates at close (run on `book-close/phase-2`, 2026-06-06):**
  - `pnpm -r typecheck` → **PASS** (exit 0).
  - `pnpm -r test` → **PASS** — 1,657 passing / 10 skipped across 12 of 13 workspace projects (api 872, web 323, schemas 145, seeder 121, librarian 40, promoter 32, indexer 26, shelves 26, trust 23, ui 20, relay 18, search 11). Skipped = the DB integration suite (needs a live Postgres). The "provider down"/"relay rejected" stderr lines are intentional fail-open assertions, not failures.
  - `pnpm --filter @unbnd/web build` → **PASS** (461 modules, built in 596ms).
- **CI guards:** the search + trust provider seams remain guarded; `packages/ui/test/` adds 12 architecture guards (no undefined token refs / no raw color-type-space-shape-breakpoint-motion literals / no raw `<button>`/`<svg>` / palette-sync / page-frame / theme-completeness). The Story-39 Playwright visual-regression harness gates 6 signed-out screens at `maxDiffPixelRatio:0`.
- **Known open issues / accepted trade-offs:**
  - Read-time junk filter leaves junk resident on the relay (deviation #5) — accepted.
  - Search latency lacks a clean isolated instrument (deviation #13) — effectively met.
  - CI robustness: the 6-image staging build matrix has flaked on a transient Docker buildx setup; CI/deploy actions warn Node-20 deprecation (forced to Node-24 by 2026-06-16) — bump action versions.
- **Debt logged by ADRs (rolled up):** dead subjects-API seeder code (chip `task_300eee03`); duplicate `shortNpub` helper; `queryAllPages` duplicated across indexer + shelves (a `packages/relay-paginator` extraction was deferred); stale "I am the author" submit-toggle copy; replaceable-write skeleton duplicated across kind-0/kind-3 (generalization deferred).

## 6. Carry-forward register

The consolidated list for the product team to consider when scoping Phase 3.

- [ ] Genre expansion 8 → 14+ (taxonomy + OL-subject mappings + browse grid + recast over preserved `subjects`) — §4 unmet "14+ genres" criterion / deviation #3.
- [ ] Ratify the `@unbnd/ui` design system into the product model (it shipped beyond the PRD) — deviation #2; capstone guide at `packages/ui/REDESIGN.md`.
- [ ] Real dark mode — the design-system dark skeleton is inert; JS-injected colors (`GENRE_PALETTE`/`SEMANTIC_COLORS`) aren't `[data-theme]`-themeable yet — design-system boundary.
- [ ] Followers count via NIP-85 `kind:30382` (deviation #10).
- [ ] nsec-export / sovereignty-upgrade flow for custodial users (deviation #11; Appendix C-6) — sensitive, earns its own design.
- [ ] Phase-3 automation successors: automatic threshold promotion, emergent/automated accusatory reveal + an in-product reveal affordance, automated author verification (deviations #9; PRD §3).
- [ ] "Contested" tag treatment — completes apply/dispute symmetry (deviation #14 / Appendix C-4).
- [ ] Unify the personalization gate across tiers; calibrate `PERSONALIZE_MIN_FOLLOWS` (deviation #8).
- [ ] Co-author support (ADR 0033 deferral; PRD §2.10).
- [ ] Resume the two deferred stories: #28b unrate-removal, #30b promotion-demotion (kind-5 deletions).
- [ ] Appendix C carry-overs not yet built: C-2 (per-book server-rendered `<head>` + oEmbed unfurls — an architecture addition), C-3 (provider→npub identity federation — Phase 3 design), C-6 (dedicated Settings "Nostr/Advanced" tab + relay management), C-7 (community-anointed curator roles via `roleScore`).
- [ ] Optional: expose Meili `processingTimeMs` on `/api/search` for a definitive latency number (deviation #13).
- [ ] Ops/secret hygiene: `age`-encrypt the on-droplet librarian nsec; keep it off further clients (deviation #7).
- [ ] Code debt: prune dead subjects-API seeder code (`task_300eee03`); extract `packages/relay-paginator`; dedupe `shortNpub`; fix stale submit-toggle copy; bump CI/deploy action versions before the Node-20 cutoff (2026-06-16).
