# Scope: Unbnd — Close the Social Loop

**Slug:** `social-loop`
**Date:** 2026-06-06
**Manager phase:** Scope & Prioritization (Phase 3)

> **Grain.** This document scopes **all of Unbnd Phase 3** (the "close the social loop" book of work). The product flow runs once for the whole phase. The "build blocks" below are the dependency-ordered sequence in which Phase 3 ships, not sub-phases and not separate product cycles. Story decomposition (Phase 7) turns this into one story queue grouped into the same ordered blocks; engineering builds every block through the gated story cycle, then the phase is book-closed (as Phase 2 was). The genuine deferrals are **Phase 4 (distribution & payments)** and **Phase 5 (differentiation)**.

## Features extracted
Every feature implied by the journeys and the discovery seed, listed flat.

- Taste Match Score (profile percentage + review sorting by match)
- Hidden Gems hype-gap indicator on book detail (hidden gem / overhyped / consensus)
- Hidden Gems homepage shelf
- Curator status by trusted-user vouching (count-gate of trusted asserters)
- Honest threshold and empty states for every trust-derived number
- oEmbed unfurls + per-book server-rendered `<head>`
- Value-before-account for readers arriving on a shared link
- nsec export / sovereignty-upgrade flow
- Followers count via NIP-85
- Genre expansion 8→14+ (taxonomy, OL-subject mappings, browse grid, recast pass)
- Automated threshold-based submission promotion
- In-product accusatory-tag reveal affordance
- Unrate / rating removal (#28b)
- Promotion demotion / un-promote (#30b)
- Contested-tag treatment
- Ops & debt: age-encrypt librarian nsec, prune dead subjects-API seeder code, extract `relay-paginator`, dedupe `shortNpub`, fix stale submit-toggle copy, bump CI/deploy action versions

## Build blocks within Phase 3 (the in-scope set)

The primary persona is the Founding Curator. Their core value: my taste is recognized and carried, I discover peers who read like me, and I can vouch to grow the circle. The blocks are ordered so the riskiest assumption is proven first and so the build survives a thin graph (the cold-start void is the phase's central risk). **All three blocks are in scope for Phase 3.**

### Block 1 — the curator loop, honest on a thin graph (first; must be demoable end-to-end)
- [ ] **Taste Match Score.** The personal payoff that converts a favor into genuine use (curator journey step 3). The one wow feature in the first block, because it most directly proves "they read like I do."
- [ ] **Curator status by trusted-user vouching.** The growth mechanism and the direct answer to cold-start; without it the graph cannot expand past the operator-seeded follow list (curator journey step 4).
- [ ] **Honest thresholds and empty states** across taste match and every trust-derived number. A number shows only once a handful of trusted raters stand behind it, otherwise "not enough overlap yet." A hard requirement, not polish, because a thin graph is the default in Block 1.
- [ ] **CI/deploy action version bump.** Sequenced first only because it is date-bound (Node-20 actions cutoff 2026-06-16).

### Block 2 — make curation travel + complete the social loop
- [ ] **Hidden Gems** (hype-gap indicator + homepage shelf). Needs the rating density Block 1 produces.
- [ ] **oEmbed unfurls + server-rendered per-book `<head>`.** The reach mechanic that brings Trusting Readers in. Architecture-heavy (per-route head, not one endpoint).
- [ ] **Value-before-account on shared links.** Coupled to oEmbed; resolves the reader's account-wall problem.
- [ ] **Followers count via NIP-85.** Makes curator reputation legible.
- [ ] **Genre expansion 8→14+.** After the founding curators are surveyed on genres (bootstrapping track feeds it).
- [ ] **nsec export / sovereignty upgrade.** Serves the secondary Sovereignty-Curious persona and the promise-integrity gap. (See the surfaced decision below: can move to Block 1 if integrity is weighted over loop-proof.)

### Block 3 — automate + finish
- [ ] **Automated threshold-based promotion.** Automates Phase 2's manual mechanism; depends on graph density.
- [ ] **In-product accusatory-tag reveal affordance.** Same dependency.
- [ ] **Unrate (#28b), demotion (#30b), contested-tag treatment.** UX completeness; cheap, ride along.

**Ops & debt** (age-encrypt nsec, prune dead seeder code, `relay-paginator`, `shortNpub`, submit-toggle copy) fold across blocks as hardening with no user-facing dependency.

## Out of scope (deferred, each with a home)

- Lightning payments, Blossom file hosting, editing-bounty marketplace → **Phase 4 (distribution & payments)**.
- Identity federation (provider→npub), OAuth providers, co-author support, real dark mode → **Phase 4**.
- The differentiating "wow" backlog (Because-You-Trusted attribution, Reading DNA, Curator Challenges, Live Consensus, Shelf-as-engine, Why-This-Rating, cross-curator disagreement) → **Phase 5 (differentiation)**.
- Contextual Web of Trust, Identity-Funneling middleware → **protocol-level, NosFabrica track** (not Unbnd-specific).

## Phase roadmap

- **Phase 3 (this book), built in order:** Block 1 the curator loop honest on a thin graph → Block 2 make curation travel and complete the loop → Block 3 automate and finish. Book-closed when all three are done.
- **Phase 4:** distribution and payments. The money and file-custody phase. Fresh discovery.
- **Phase 5:** differentiation. The wow backlog, once the loop is dense and alive.

## Success metrics
Concrete and observable without instrumentation that does not yet exist.

- 15–20 founding curators recruited, with 10+ active (each with at least a handful of ratings) within the first month, countable from relay events.
- Founder's own seed activity reaches 50+ rated books, 100+ tags, 10+ reviews in the first month.
- At least one curator gains the role through vouching rather than the seed list. The graph demonstrably grew on its own (inspectable from curator-role assertions).
- Taste match behaves honestly: any curator pair above the co-rating threshold shows a percentage; below it shows "not enough overlap yet." Verifiable by inspection on staging.
- Block 2 gate: a shared book link unfurls as a rich card on the platforms curators actually post to.

## Tradeoffs
What we gain by sequencing what we sequence.

- **By building the curator loop (Block 1) before reach and sovereignty, we gain a fast, cheap proof of the riskiest assumption:** that founding curators who arrive as a favor convert to genuine users once they feel taste match and can vouch. That assumption is the whole phase. Everything else is reach and completeness layered on a loop that either works or does not.
- **By making honest empty states a Block 1 requirement rather than later polish, we accept that the app looks quiet early,** and gain the thing that keeps it from looking broken or fake while the graph fills. Liveliness comes from curators arriving, not fabricated signal.
- **By placing oEmbed unfurls in Block 2, we delay reader acquisition,** and gain the right to prove the curator loop before spending architecture effort on a per-route server-rendered head.

## Surfaced decision
- **nsec export placement.** It sits in Block 2 by the primary-persona logic, because it serves a secondary persona and not the curator's core loop. If the sovereignty promise is integrity-critical enough to ship alongside the loop, it moves to Block 1. Product owner's call.
