# Stories Queue: Unbnd — Close the Social Loop

**Slug:** `social-loop`
**Date:** 2026-06-06
**Source PRD:** `product-team/prd/social-loop.md` (+ `guides/social-loop-design-guide.md`, `guides/social-loop-style-guide.md`)

> 18 stories across 3 ordered blocks, in dependency order. Blocks are a suggested grouping and sequence, not folders. Unbnd's engineering tree is flat. The engineering Product Owner promotes each brief into `engineering-team/stories/<n>-<slug>.md` via `/plan-feature` (next available number scanning `stories/` + `stories/done/`), referencing the PRD. The queue order is the pickup order.
>
> Open-question parameters from PRD §11 are flagged inline. nsec-export is placed in Block 2 (Q4 recommendation).

---

## Block 1 — The curator loop, honest on a thin graph

*The first demoable block. Proves the riskiest assumption: that a founding curator who arrives as a favor converts to genuine use once they feel taste match and can vouch.*

## Story 1: Taste Match on curator profiles
**PRD section(s):** §5.1, §7 · **Persona(s):** Founding Curator, Trusting Reader · **Block:** The curator loop

**Description:** A signed-in viewer sees how closely their taste matches a person, on that person's profile.

**Acceptance criteria:**
- [ ] Visiting a profile while signed in shows a taste-match percentage and the number of books in common.
- [ ] The percentage reflects how often the viewer and that person agreed on books they both rated, from the viewer's viewpoint.
- [ ] Below the overlap threshold, the profile shows "Not enough overlap yet" rather than a percentage.
- [ ] A signed-out visitor sees no taste-match element.
- [ ] After the viewer rates more books they have in common, the value reflects the change.

**Dependencies:** none (computes over existing ratings).

**Notes for engineering:** The first demoable story. Taste match is a derived, observer-relative computation over existing ratings, not a new stored shape (see PRD §6). The overlap threshold is open question 1: ship a configurable small count (placeholder 5) and tune. Raw rating-agreement is acceptable for v1; the trust-weighted variant can follow. The product intent is "they read like I do."

## Story 2: Taste Match on book detail, and taste-sorted raters
**PRD section(s):** §5.2 · **Persona(s):** Trusting Reader · **Block:** The curator loop

**Description:** On a book page, a viewer sees each rater's taste-match and can order raters and reviews by best taste match.

**Acceptance criteria:**
- [ ] Each rater and reviewer byline shows that person's taste-match to the signed-in viewer.
- [ ] A signed-in viewer can switch the order between "Most trusted" and "Best taste match."
- [ ] The default order is most trusted.
- [ ] Bylines below the overlap threshold show no match chip, not a zero.
- [ ] A signed-out viewer sees neither byline matches nor the sort control.

**Dependencies:** Story 1 (the taste-match computation).

**Notes for engineering:** Reuse the Story 1 computation. Sorting is a display concern; the underlying ratings and trust order are unchanged.

## Story 3: Curator status by trusted-user vouching
**PRD section(s):** §5.1, §6, §7 · **Persona(s):** Founding Curator · **Block:** The curator loop

**Description:** A person becomes a curator when enough trusted users vouch for them.

**Acceptance criteria:**
- [ ] A trusted user can record a vouch that another person is a curator.
- [ ] A person becomes a curator when at least N trusted users above weight W have vouched, with self-vouches excluded.
- [ ] A "Curator" badge appears on the profile of anyone who meets the gate.
- [ ] Withdrawing or disputing a vouch lowers the count; dropping below the gate removes the badge.
- [ ] A person on the operator seed-curator allowlist shows as a curator regardless of vouch count.

**Dependencies:** none.

**Notes for engineering:** Clone the existing author-verified pattern (a pubkey-targeted, apply/dispute, count-gated assertion) into a new `curator-roles` concept. Do not invent a parallel mechanism. N and W are open question 2 (placeholder N=10, W=0.2 on the 0–1 scale); make them configurable. Open question 3: keep the Phase 2 emergent house-weight gate (`canPromote`) as a cold-start fallback alongside vouching (OR them) unless told otherwise.

## Story 4: Vouch control and the Curate surface
**PRD section(s):** §5.1, §5.7 · **Persona(s):** Founding Curator · **Block:** The curator loop

**Description:** Eligible viewers can vouch from a profile, and curators get a dedicated entry to their tools.

**Acceptance criteria:**
- [ ] An eligible trusted viewer sees a "Vouch as curator" action on a profile; an ineligible viewer sees no such control.
- [ ] After vouching, the control shows "Vouched" and offers to withdraw.
- [ ] A profile shows "N trusted people vouched" once at least one vouch exists.
- [ ] A curator sees a "Curate" entry in the navigation; non-curators do not.
- [ ] The Curate entry surfaces the existing submission and promotion tools.

**Dependencies:** Story 3 (the role mechanism).

**Notes for engineering:** Ineligible viewers get no control rather than a disabled tease. The Curate entry reuses existing curator tools; it is a navigation and gating change, not new tooling.

## Story 5: CI and deploy action version bump (date-bound)
**PRD section(s):** §8.1 · **Persona(s):** (platform) · **Block:** The curator loop

**Description:** Update CI and deploy workflows off the deprecated action runtime.

**Acceptance criteria:**
- [ ] CI and deploy workflows run on currently-supported action versions with no Node-20 deprecation warnings.
- [ ] All existing gates (typecheck, test, build, deploy) pass on the bumped versions.

**Dependencies:** none.

**Notes for engineering:** Date-bound: the Node-20 actions cutoff is 2026-06-16. Independent of every feature story; pick it up first in parallel. No product behavior change.

---

## Block 2 — Make curation travel and complete the loop

*Extends reach and completeness once the loop is proven. Brings the Trusting Reader in, and gives the Sovereignty-Curious user their choice.*

## Story 6: Hype-gap indicator on book detail
**PRD section(s):** §5.2, §7 · **Persona(s):** Trusting Reader, Founding Curator · **Block:** Make curation travel

**Description:** A book page shows where the viewer's trusted network diverges from the crowd.

**Acceptance criteria:**
- [ ] A hidden-gem signal shows when the viewer's trusted network rates the book above the crowd.
- [ ] An overhyped signal shows when the crowd rates it above the trusted network.
- [ ] Nothing shows when the two align.
- [ ] The signal reflects the active House/Yours viewpoint.
- [ ] The signal appears only when a handful of trusted raters exist; below that, nothing shows.
- [ ] The signal pairs color with a text label so it is legible without color.

**Dependencies:** none (derived over existing ratings and trust).

**Notes for engineering:** Derived, observer-relative, honest silence below threshold. No new stored shape (PRD §6).

## Story 7: Hidden Gems shelf on the homepage
**PRD section(s):** §5.3 · **Persona(s):** Trusting Reader · **Block:** Make curation travel

**Description:** The homepage surfaces books the viewer's trusted network loves that the crowd missed.

**Acceptance criteria:**
- [ ] The homepage shows a Hidden Gems shelf of books with the highest positive hype-gap from the active viewpoint.
- [ ] The shelf exists on both House and Yours and surfaces different books under each.
- [ ] When empty, the shelf shows an on-ramp explaining what will appear and to follow curators to start.
- [ ] The shelf refreshes on a schedule rather than per request.

**Dependencies:** Story 6 (the hype-gap computation).

**Notes for engineering:** The empty state is the cold-start on-ramp; treat it as first-class. Reuse the Phase 2 scheduled homepage-shelf caching approach.

## Story 8: Link unfurls and per-book metadata
**PRD section(s):** §5.5 · **Persona(s):** Founding Curator · **Block:** Make curation travel

**Description:** A shared book link renders as a rich card on other platforms.

**Acceptance criteria:**
- [ ] Pasting a book link into a platform that unfurls links renders a card with cover, title, author, raw community rating, and top tags.
- [ ] Each book URL exposes per-book metadata and an oEmbed endpoint for auto-discovery.
- [ ] The card uses the raw community rating, not an observer-weighted number.

**Dependencies:** none.

**Notes for engineering:** This is an architecture addition, not a one-endpoint job. The web app is a static SPA today, so per-book head tags are not per-route. Scope a server-rendered per-book head (or bot-aware serving) for `/book/:slug`. The raw rating is viewer-independent by design (resolves PRD open question, §5.5).

## Story 9: Value before account on shared links
**PRD section(s):** §5.5 · **Persona(s):** Trusting Reader · **Block:** Make curation travel

**Description:** A reader arriving with no account sees full value, and is asked to sign up only when they act.

**Acceptance criteria:**
- [ ] A signed-out visitor arriving on a book or profile page sees the full content and trust context.
- [ ] An account prompt appears only at a write action (rate, save, follow, vouch), not on read.
- [ ] The prompt explains what creating an account unlocks.

**Dependencies:** none (pairs naturally with Story 8).

**Notes for engineering:** This resolves the reader account-wall problem. The gate moves to the write, the read is fully open.

## Story 10: Followers count via NIP-85
**PRD section(s):** §5.1, §6 · **Persona(s):** Founding Curator · **Block:** Make curation travel

**Description:** Profiles show an accurate followers count.

**Acceptance criteria:**
- [ ] A profile shows an accurate followers count.
- [ ] The count is sourced from trusted follow assertions rather than an unbounded scan.
- [ ] A profile with no followers shows "No followers yet."

**Dependencies:** none.

**Notes for engineering:** Source via NIP-85 `kind:30382` (the Phase 2 ADR 0023 deferral), not a kind-3 scan.

## Story 11: Genre expansion to 14+
**PRD section(s):** §5.6 · **Persona(s):** all readers · **Block:** Make curation travel

**Description:** Browse offers 14 or more genres, with the catalog recast into them.

**Acceptance criteria:**
- [ ] The browse grid offers 14 or more genres.
- [ ] Each catalog book is assigned to the expanded genres derived from its preserved subjects, with no external re-fetch.
- [ ] Existing books are recast into the new taxonomy.
- [ ] Browsing a new genre returns its books.

**Dependencies:** none.

**Notes for engineering:** Genre is a revisable assertion over each book's preserved Open Library subjects; the recast re-derives with no re-fetch. The taxonomy is a curated product decision, not data-derived clustering (per scope), and the founding-curator genre survey should inform it before the recast. May be staged (taxonomy + recast, then browse-grid UI).

## Story 12: Sovereignty upgrade (take ownership of your key)
**PRD section(s):** §5.4, §7 · **Persona(s):** Sovereignty-Curious User · **Block:** Make curation travel

**Description:** A custodial user can take ownership of their key, as a deliberate choice.

**Acceptance criteria:**
- [ ] A custodial user can reach a "Take ownership" flow from Settings → Nostr identity.
- [ ] The flow explains the choice in plain language and requires one explicit confirmation.
- [ ] The key is revealed once, with a copy action and an acknowledgement required before dismissal.
- [ ] After completion the account continues to work normally and the flow reflects that ownership was taken.
- [ ] The flow is never forced and is always dismissible.

**Dependencies:** none.

**Notes for engineering:** Sensitive flow, calm gravity, no jargon (see the design and style guides). Uses the existing `--signal-sovereign` token. This is the custodial→sovereign transition described in PRD §7; the key leaves server custody only by this explicit action and the export is irreversible. Open question 4 placed it here; the PO may pull it to Block 1.

---

## Block 3 — Automate and finish

*Automates the Phase 2 manual mechanisms and closes UX gaps.*

## Story 13: Automatic threshold promotion
**PRD section(s):** §5.7 · **Persona(s):** Founding Curator · **Block:** Automate and finish

**Description:** Submissions that cross the trust threshold promote into the catalog automatically.

**Acceptance criteria:**
- [ ] A submission that crosses the trust threshold is promoted into the catalog without a manual action.
- [ ] Promoted books appear in browse, search, and shelves alongside seeded entries.
- [ ] The threshold is configurable.

**Dependencies:** builds on the existing manual promotion and promoter worker.

**Notes for engineering:** Automates the Phase 2 manual-with-signals promotion. Keep the manual promote available as the fallback.

## Story 14: In-product accusatory reveal
**PRD section(s):** §5.2, §5.7 · **Persona(s):** Founding Curator · **Block:** Automate and finish

**Description:** A curator can reveal a gated accusatory tag from within the product.

**Acceptance criteria:**
- [ ] A curator can reveal a gated accusatory tag from within the product, not only via an operator command.
- [ ] A revealed accusatory tag becomes visible at read time per the existing auditable gate.
- [ ] The reveal action is restricted to users above the curator threshold.

**Dependencies:** none (extends the existing reveal mechanism).

**Notes for engineering:** The existing reveal is an operator-only worker subcommand; this adds the trust-gated in-product affordance. Keep the audit trail.

## Story 15: Remove a rating
**PRD section(s):** §5.2 · **Persona(s):** Trusting Reader · **Block:** Automate and finish

**Description:** A user can remove their own rating.

**Acceptance criteria:**
- [ ] A user can remove their own rating from a book.
- [ ] After removal the book no longer shows that user's rating and the aggregates update.

**Dependencies:** none.

**Notes for engineering:** This is the deferred Phase 2 story #28b (a deletion flow).

## Story 16: Demote a promoted book
**PRD section(s):** §5.7 · **Persona(s):** Founding Curator · **Block:** Automate and finish

**Description:** A curator can undo a promotion.

**Acceptance criteria:**
- [ ] A curator can demote a previously promoted book.
- [ ] After demotion the book no longer appears in the promoted catalog surfaces.

**Dependencies:** Story 13 or the existing promotion path.

**Notes for engineering:** This is the deferred Phase 2 story #30b (a deletion/withdraw flow).

## Story 17: Contested-tag treatment
**PRD section(s):** §5.2 · **Persona(s):** Trusting Reader, Founding Curator · **Block:** Automate and finish

**Description:** A tag the trusted graph net-disputes reads differently from one it net-applies.

**Acceptance criteria:**
- [ ] A tag the trusted graph net-disputes renders visibly distinct (muted and struck "contested") from a normally-applied tag.
- [ ] The treatment is computed from the existing trusted apply and dispute counts.

**Dependencies:** none.

**Notes for engineering:** Completes the apply/dispute symmetry. Reuses the Story-25 `trustedApplies` / `trustedDisputes` already computed per tag. No new color.

## Story 18: Code-debt cleanup
**PRD section(s):** §8.1 · **Persona(s):** (platform) · **Block:** Automate and finish

**Description:** Clear the small Phase 2 debt items with no behavior change.

**Acceptance criteria:**
- [ ] Dead subjects-API seeder code is removed.
- [ ] Duplicated relay pagination is extracted into one shared place.
- [ ] The duplicated short-npub helper is deduped.
- [ ] The stale "I am the author" submit-toggle copy is corrected.

**Dependencies:** none.

**Notes for engineering:** Pure cleanup; verify zero behavior change. Separately, an operator ops task (not a code story): `age`-encrypt the librarian key on the droplet. Relay that to the operator; it cannot be done from the repo.

---

## Handoff

On approval, the engineering Product Owner reads this queue and promotes each brief into a flat `engineering-team/stories/<n>-<slug>.md` via `/plan-feature` (next number scanning `stories/` + `stories/done/`), referencing `product-team/prd/social-loop.md` and the guides. Optionally open `engineering-team/audits/social-loop/book.md` at intake, anchored to the PRD sections this queue realizes, so the book-close return edge can reconcile against it later. Build in queue order; Story 1 is the demoable proof of the loop, Story 5 is date-bound and parallelizable.
