# PRD Addendum: unbnd — Phase 2 (Trust meaningful, curation visible)

**Reconciles:** `engineering-team/phase2-prd.md` *(immutable — never edited)*
**Build audit:** `engineering-team/audits/phase-2/audit.md`
**Date:** 2026-06-06
**Authored by:** engineering (Reviewer at book scope)

> This addendum stands beside the Phase 2 PRD; it never edits it. It records where the built product diverged from the plan, why, and what the next product cycle should pick up. The product team reads this when scoping Phase 3, then issues a superseding PRD. Engineering does not write into `product-team/` — this is the read-across-the-boundary return edge.

## 1. Summary

Phase 2 set out to make trust **meaningful** and curation **visible** without coupling the build to real user activity, by building trust-consuming features against a deterministic fixture provider and lighting them up with real data later (PRD §1). It delivered all of that: shelves, real public profiles, custodial kind-0 writes, a follow graph, author claiming/verification, trust-weighted consensus/search/homepage shelves, manual trust-gated promotion, the accusatory-tag gate, and platform hardening — 48 stories, every one with an ADR and a PASS review, all gates green at close. The catalog grew to ~11.2k and the production librarian identity was stood up and made the active house observer on staging. The headline divergences: **a large design-system hardening epic shipped beyond the PRD** (14 stories, invisible to users, making the front end overhaul-ready), the **catalog seeder was re-architected** (OL search-API + a legitimacy gate + a read-time junk filter, instead of the planned subjects-API quality pass), and **genre breadth was deliberately held at 8 rather than the 14+ target** (lossless to defer, since genre is a revisable assertion over each book's preserved OL subjects).

## 2. Deviations from the PRD

### 2.1 Intentional changes

- **Catalog seeder re-architected (§2.2).** The plan was to keep the OL **subjects** API and add a data-quality pass. As built, the seeder switched to the OL **search** API plus a *legitimacy* gate (edition-count ≥ 3 + cover + English + plausible page/year + a junk denylist) and ISBN-13 dedup. The posture is legitimacy-gated, not popularity-gated, so obscure-but-real books survive. *(ADR 0054.)*
- **Junk handling moved to read time (§2.2).** Instead of deleting junk at the relay, junk is filtered at read time (`isJunkRecord` in the indexer + the API's `parseBook`), so it is invisible in-app without requiring relay deletion (which is only advisory across a decentralized relay set anyway). *(ADR 0055; the kind-5 hard-delete design is preserved in ADR 0054 as a deferred option.)*
- **Accusatory-tag reveal is operator-only v1 (§2.8).** Built exactly to the PRD decision of record (auditable gate, no emergent auto-reveal), with the reveal trigger as a worker subcommand rather than an in-product affordance.
- **Librarian identity built late, not in Block A (§2.1).** The PRD itself decoupled the build from the house-observer swap; Lane 1 + fixture-verified Lane 2 features shipped first, and the real librarian + swap landed at close. The swap is now live on staging.

### 2.2 Deferred (cut to a later phase)

- **Genres 8 → 14+ (§2.2/§4).** The one unmet success criterion. Deferred to **Phase 3** as a dedicated story — lossless, because genre is a revisable assertion over each book's preserved OL `subjects` array (a later pass re-derives/augments genres with no OL re-fetch and no book-record change).
- **Followers count via NIP-85 (§2.4).** Following-count shipped; a correct followers count belongs on NIP-85 `kind:30382`, not a kind-3 scan. → **Phase 3.**
- **The two un-do stories** — un-rate removal (#28b) and promotion demotion (#30b), both kind-5 deletions — are queued in `stories/` and not yet built. → **Phase 3.**
- **"Contested" tag treatment** (Appendix C-4) — the dispute side of trust-weighting isn't visually distinguished yet. → **Phase 3 (small).**
- **Appendix C carry-overs:** C-2 (per-book server-rendered `<head>` + oEmbed unfurls — an architecture addition, not a one-endpoint job), C-3 (provider→npub identity federation), C-6 (dedicated Settings "Nostr/Advanced" tab + relay management), C-7 (community-anointed curator roles). → **Phase 3.** *(C-1 Substack link and C-5 profile IA both shipped.)*

### 2.3 Added beyond the PRD

- **The `@unbnd/ui` design-system hardening epic (Epic 0001, 14 stories, ADRs 0038–0050).** Not in the Phase 2 PRD. Driven by the foundational quality bar: an audit found ~145 stray color literals, live token drift, zero type/space/motion tokens, no primitive or icon layer, and no CI guard — meaning a future redesign would have been a hundreds-of-call-site find/replace. The epic delivered a two-tier token system, primitives (Button/IconButton/Link/Pill/Avatar/Label/Field/Container), an icon registry, a theming substrate + inert dark skeleton, and 12 CI architecture guards. Every story ran zero-diff against the visual harness (the one exception, #45, was an approved button-normalization). **Recommendation: ratify this into the product model** — it is now a first-class platform asset with its own capstone guide (`packages/ui/REDESIGN.md`). A redesign is now a token/internals swap.
- **Three new profile-gated workers** (`apps/librarian`, `apps/promoter`, `apps/shelves`) and a shared `apps/.../packages/relay` client — necessary infrastructure for off-API key custody (promotion/librarian signing) and scheduled shelf computation. These are architecture, not user-facing product, but they shape what's operationally possible.

### 2.4 Constraints discovered

- **No nsec export exists (§2.4 / Appendix C-5).** An earlier PRD note implied the sovereignty-upgrade path (export nsec → NIP-07) already existed from Phase 1. It does not — Phase 1 only encrypts the custodial key at rest. **Custodial users cannot currently upgrade themselves to sovereign.** This is a real gap in the product's stated promise and a sensitive flow to design.
- **Personalization is in-session by construction (§2.6).** The ephemeral key wrap means a custodial user's key is only available during an active session, so the GrapeRank trigger fires inline at submit time, not asynchronously. A unified cross-tier gate is still notional.
- **Search latency is effectively sub-100ms but not cleanly instrumented (§4).** Realistic queries measure ~65–105ms server-side (including the trust re-rank) over a network-confounded remote client; the Meili index query at ~11.2k is comfortably sub-100ms. There is no isolated server-side number yet because the adapter discards Meili's `processingTimeMs`.
- **Trust is real but thin (§2.5).** With the librarian's seed graph just stood up, the trusted-consensus view is mostly raw-fallback "community consensus" by design until the curators' web-of-trust × real ratings grow. The features are correct; the signal is early.

## 3. Impact on the product model

- **Personas / journeys:** the custodial→sovereign upgrade journey is **not yet walkable** (no nsec export) — Phase 3's product model should either commit to building it or explicitly stage it. The "follower" social loop is half-built (you can follow; followers aren't counted).
- **Scope / roadmap:** genre breadth (8→14+) and the two un-do flows (#28b/#30b) carry forward as concrete Phase-3 stories. Phase 3's headline roadmap (PRD §6) is distribution/payments — **Lightning payments (V4V + fixed-price ebooks), Blossom file hosting, the editing-bounty marketplace** — which is a different *kind* of work (money + file custody) than Phase 2's trust/curation surfaces, and deserves fresh discovery rather than an incremental addendum.
- **Domain model:** new event shapes are now load-bearing — `BookClaim`, `AuthorVerifiedAssertion`, `AccusatoryReveal`, `BookAuthorOverlay` — and the shared `isJunkRecord` denylist governs what's visible. Trust is a provider-agnostic seam (`@unbnd/trust`) with house-vs-personalized vantages. The domain modeler should treat these as the established baseline.
- **Design rules:** the design system is now the source of truth (tokens + primitives + guards). Two honest boundaries to carry: a real dark mode still needs the JS-injected colors (`GENRE_PALETTE`/`SEMANTIC_COLORS`) brought under `[data-theme]`; the visual-regression harness only gates 6 signed-out screens (a fixture-coverage gap).

## 4. Recommended scope for the next phase

Engineering's read on what the carry-forward implies — **input, not decision.** The product team owns the actual re-scope via `/discover`.

- **Treat Phase 3 (distribution/payments) as a fresh discovery**, not an addendum to Phase 2. Lightning + Blossom + bounties introduce money and file custody — new personas (authors selling, readers paying), new trust questions (escrow, refunds), and new regulatory surface. Start at problem framing.
- **Bundle the cheap, high-value carry-forwards** into an early Phase-3 hardening slice so they don't rot: genre 8→14+, followers-via-NIP-85, the #28b/#30b un-do flows, the "contested" tag treatment, and the dead-code/CI-action cleanups.
- **Decide the custodial→sovereign upgrade explicitly** — it's a stated promise with no implementation; either commit to the nsec-export design or stage it visibly.
- **Plan for real-signal maturation:** the trust features are built and verified but thin until the librarian's curator graph grows; Phase 3 should include a way to seed/grow that graph (C-7 community-anointed curators is the natural vehicle).

## 5. Open questions for product

1. **Is Phase 3 the distribution/payments phase (PRD §6), or a "finish Phase 2's social/trust loop" phase first?** — options: (A) go straight to Lightning/Blossom/bounties with a small hardening slice bundled in; (B) a focused interim phase that closes the social loop (followers, upgrade path, genre breadth, curator roles) before money enters.
2. **Custodial→sovereign upgrade:** build the nsec-export flow now, or stage it? — options: (A) build it in Phase 3 (sensitive, earns its own design); (B) defer and document the limitation in-product.
3. **Curator graph growth:** ship C-7 community-anointed curator roles to grow trusted signal, or rely on the operator-seeded librarian follow list for now? — options: (A) C-7 role-assertion system; (B) keep the seed-list lever and revisit when the graph is denser.
4. **Design-system dark mode:** is a real dark mode a Phase-3 product goal (it needs the JS-injected color work), or does the inert skeleton stay parked? — options: (A) scope dark mode; (B) leave parked until a redesign.
5. **Genre taxonomy:** who owns the 8→14+ taxonomy and the recast pass — is the genre set a product decision (curated list) or a data-derived one (cluster the preserved OL subjects)? — options: (A) curated product taxonomy; (B) data-derived with product review.
