# PRD Addendum: social-loop — Phase 3, Close the Social Loop

**Reconciles:** `product-team/prd/social-loop.md` *(immutable — never edited)*
**Build audit:** `engineering-team/audits/social-loop/audit.md`
**Date:** 2026-06-11
**Authored by:** engineering (Reviewer at book scope)

## 1. Summary
Phase 3 set out to make the curator loop *complete, honest, and reversible*: taste-legible curation (Taste Match, hype gap, Hidden Gems), a graph that grows itself (vouching, auto-promotion), curation that travels (unfurls, value-before-account), real sovereignty (nsec export), and every social action undoable (un-rate, demote, reveal/withdraw, contested). **All 18 stories shipped through the gated cycle with PASS reviews; the PRD's in-scope §8.1 is fully realized, with zero scope cut.** The two headline divergences are mechanical, not product-shaped: the un-do flows use replace-at-the-same-address tombstones rather than the kind-5 deletions the Phase-2 addendum anticipated (stronger guarantees, same capability), and automatic promotion ships dormant behind a calibration knob. The headline *operational* fact (verified against origin + staging probes): **staging runs through #70** — Block 1 and the hype-gap indicator are live and the Block-1 §10 metrics are measurable now, but the remaining 12 stories (#71–#82: unfurls, sovereignty, all of Block 3) sit on local `main` only, 87 commits unpushed.

## 2. Deviations from the PRD

### 2.1 Intentional changes
- **The removal idiom is replace, never delete** (audit §4 #2). Un-rate and demotion are same-address tombstones (a retraction event; a librarian delisting record) — relay-enforced, reversible by re-publishing, no dependence on relay deletion semantics. Capability identical to the PRD's intent; the domain model gains a stronger invariant: *re-doing is the restore*.
- **Contested includes the tie** (audit §4 #3): equal trusted weight both ways renders "contested" rather than settled. One-line flip if product prefers the strict reading.
- **16 genres, not "14+"** — exceeds target; any genre with zero recast yield gets dropped after the ops run.
- **Two honesty labels rode the cleanup story** ("Removal queued"; the corrected author-toggle copy) — sanctioned by review carry-forward and the queue's own AC.

### 2.2 Deferred (cut to a later phase)
Nothing from the PRD's in-scope list was cut. Small engineering follow-ups (not PRD scope) carry to the next book: the promoter retry policy, the demote-status read on the book page, the #71b min-trusted alignment, the unfurl cache. Each is registered in audit §6 with a home.

### 2.3 Added beyond the PRD
- **The curator-only gated view of unrevealed accusatory tags** (audit §4 #1): the PRD's in-product reveal is unusable if curators cannot see what is gated; the public read gate is provably unchanged. **Recommend ratifying** into the product model (§5.2): "curators see gated concerns with substantiation; readers never do."
- **Shared infrastructure** that outlived its stories: the one relay pager, `SearchProvider.delete`, the retraction/delisting predicates. Engineering plumbing; no product-model change needed.

### 2.4 Constraints discovered
- **Automation needs calibration before it acts** (audit §4 #4): auto-promotion ships off (`AUTO_PROMOTE_CURATOR_COUNT=0`-able, conservative default 3) because the right thresholds depend on the real founding-curator graph, which does not exist until recruitment happens. The PRD's §5.7 assumption ("the loop runs itself") is *built* but gated on cohort reality.
- **Two §10 metrics are dormant on external sources:** the followers count waits on Brainstorm publishing the NIP-85 datum; everything staging-verifiable waits on the deploy.
- **The audit trail is event-sourced:** the promotions row records the latest actor; history lives in the signed relay events (audit §4 #8). Consistent with the protocol's append-only model; worth stating in §6 so nobody expects row-level history.

## 3. Impact on the product model
- **Personas / journeys:** none changed. The Founding Curator journey (4.1) is now fully buildable end to end, including the undo arcs.
- **Scope / roadmap:** Phase 3 closes the social/trust loop as scoped. The Phase-2 addendum's standing question — **Phase 4 = distribution/payments (Lightning V4V + fixed-price ebooks, Blossom hosting, editing bounties, PRD §6)** — is now squarely next, with no carried social-loop debt big enough to delay it.
- **Domain model (§6):** add the two tombstone shapes (rating retraction; record delisting) and the `curator-roles` concept; note the replace-never-delete invariant and the promotions state machine (`pending→promoting→done→demote_pending→demoting→demoted`, manual-only revival).
- **Design rules:** the "treatment, not a color" rule held through contested + hype-gap + sovereignty; no rule changes needed. The no-"verified"-on-submit invariant (Story 31) survived the copy fix.

## 4. Recommended scope for the next phase
*Input, not decision:*
1. **A short ops/launch slice before Phase 4 features:** push + deploy the 12 undeployed stories, `seed:recast`, `PUBLIC_ORIGIN`, auto-promote calibration, the librarian-key encryption, then measure the rest of §10. Two-thirds of the book is invisible until this happens; it is days, not weeks.
2. **A small "loop hygiene" story** bundling the promoter/demote retry-and-label items (audit §6, three related findings — one story's worth).
3. **Set the §11 knobs from the founding cohort** (taste-match overlap; vouch N/W; emergent-gate retirement or keep) once 10+ curators are active — these are env vars, not builds.
4. Then **Phase 4 discovery** on distribution/payments, fresh (the Phase-2 addendum already argued it needs its own discovery, not an increment).

## 5. Open questions for product
1. **Ratify the curator gated-view** (§2.3) into §5.2, or constrain it? Options: ratify as-is / require a second curator to co-sign reveals.
2. **Contested tie rule:** keep `>=` (tie = contested) or flip to strict `>`? One line + one test either way.
3. **Auto-promote thresholds:** what curator count + average floor should staging start with, and what graduates it to "on" in production? Options: enable on staging at 3/4.0 and observe / keep manual until ≥15 active curators.
4. **Emergent-gate coexistence (PRD §11.3):** vouching is live; does the Phase-2 emergent house-weight gate stay OR'd as the cold-start fallback, or retire once the vouched-curator count crosses a bar?
5. **Phase 4 confirmation:** distribution/payments per PRD §6, or does the founding-curator recruitment (an operations effort, §10) warrant a deliberate pause on feature work first?
