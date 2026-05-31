# Story 25: Trust-weighted tag/genre consensus + community-vs-trusted labeling

**Status:** Done
**Created:** 2026-05-31
**Type:** Feature

## Background
Ratings are already trust-weighted (Phase 1 / ADR 0014). A book's detail page can show its rating average computed from a specific observer's web of trust (`weightedRatings` in `apps/api/src/ratings/summary.ts`), with a House⇄Yours toggle (PoVBar, RatingsPanel) and an honest raw fallback when no trusted signal exists. This shipped and is verified live — an observer can see "N trusted of M total" ratings.

Tag, genre, style, and quality-signal consensus has **not** caught up. The classification consensus on a book page is still **raw**: `aggregateBookTags` (`apps/api/src/tags/aggregate.ts`) counts every apply/dispute assertion equally, regardless of whether the asserter is trusted from the observer's vantage. A librarian's baseline genre assertion counts the same as one from an untrusted or throwaway account. This violates the POV-first invariant (CLAUDE.md §1: "which genre tag wins the trust-weighted vote… computed from a specific point-of-view") and leaves the two consensus surfaces inconsistent — ratings respect trust, tags do not.

It also leaves the **honesty gap** the PRD calls out. A real user just observed "1 trusted of 2 ratings." Nothing on the page tells them *which kind of consensus* they are looking at. The PRD §2.5 "raw-fallback, labeled" decision of record requires that when trusted signal exists we show the trusted-weighted consensus and **label it "trusted consensus"**, and when it does not we fall back to raw and **label it "community consensus"** — never presenting raw as trusted, never fabricating a trusted number.

This is the **lead Block C (trust) story** and the first trust-consuming feature after the fixture provider (Story 17 / ADR 0017). Per the §2.0 sequencing rule, it is **built and verified against the fixture `TrustProvider`** (`apps/api/src/trust/fixture.ts`, selected by `TRUST_PROVIDER=fixture` + `TRUST_FIXTURE`), which yields deterministic weights so the weighted-vs-raw divergence on tags is testable in CI with no relays and no humans. Production signal lights up through the same code paths via the house-observer swap (see Open Questions / Out of Scope).

**PRD anchor:** phase2-prd **§2.5 "House-observer swap + trust-weighted tag/genre consensus"** (the trust-weighted consensus + raw-fallback-labeled decision of record), with the build/test isolation from **§2.0** and **§2.0 / ADR 0017** (the fixture provider). Architecture invariants: CLAUDE.md §1 POV-first, §3 filter-at-view-time. This is within MVP/Phase-2 scope; it touches no PRD §11.3 "Out of Scope" surface.

## User-facing description
As a Reader on a book's detail page, I want the book's genres, styles, and quality signals to reflect what curators I (or the house) trust have asserted — not a raw popularity count any account can stuff — and I want the page to tell me plainly whether what I'm seeing is **trusted consensus** or **community consensus**, so that I can judge a book's classification the same honest, trust-aware way I already judge its rating.

As a Curator whose assertions carry trust weight from the house vantage, I want my genre/style/signal calls to outweigh those of untrusted accounts on the book page, so that careful classification is rewarded the same way a careful rating already is.

## Acceptance criteria
Testable from the outside, verifiable against the fixture provider (no Brainstorm, no relay, no humans). The fixture spec used in tests gives a known observer known weights over a known set of asserter keys, exactly as the ratings tests do.

- [ ] **AC-1 — Trust-weighted tag/genre consensus exists in the aggregate.** Given a book with tag/genre/style/signal assertions from a mix of trusted and untrusted asserters, and an observer with fixture weights over those asserters, when the book's classification consensus is read from that observer's vantage, then each surfaced tag carries a **trust-weighted** consensus (a trusted asserter's apply/dispute outweighs an untrusted one) computed from the SAME `TrustProvider.weights(observerHex, asserterHexes)` the ratings path uses. The weighting mirrors the `weightedRatings` pattern (weight asserters with weight > 0; raw `apply`/`dispute` polarity counts remain the unweighted basis).

- [ ] **AC-2 — Untrusted assertions do not move the trusted view.** Given a tag asserted "apply" by one trusted asserter and disputed by many untrusted asserters (and vice versa), when the consensus is read from the trusted observer's vantage, then the trusted-weighted result reflects the trusted asserter's call and is not flipped or diluted by the untrusted volume. (The exact ordering/threshold for "which tag wins" or "is shown" is the Architect's to specify; the AC is that untrusted volume cannot override trusted signal in the trusted view.)

- [ ] **AC-3 — Trusted consensus is labeled "trusted consensus."** Given a book where at least one surfaced tag has trusted signal from the active observer's vantage, when the classification block renders, then it shows the trusted-weighted consensus with a clear, subtle indicator reading **"trusted consensus"** (copy reviewed against the no-slop rule; final string is the Architect/Implementer's within that constraint).

- [ ] **AC-4 — Raw fallback is retained and labeled "community consensus."** Given a book (or an individual tag) with assertions but **no** trusted signal from the active observer's vantage, when the classification block renders, then it falls back to the existing RAW apply/dispute consensus (the catalog never looks empty) and labels it **"community consensus"** — and never presents that raw fallback as "trusted." Given a book with no assertions at all, the existing honest empty state ("No genres or styles applied yet.") is unchanged.

- [ ] **AC-5 — The consensus follows the observer / House⇄Yours toggle.** Given the active observer changes (the default house observer vs. an explicit `?observer=<npub|hex>` / the user's "Yours" perspective once they have scores), when the book's classification consensus is read, then the weighted result and its trusted/community label are computed from that observer's vantage — two observers can see two different consensuses and labels for the same book, and both are correct (POV-first). The tag consensus read accepts an observer the same way the ratings read does (explicit param else the house observer).

- [ ] **AC-6 — Ratings labeling is made consistent with tags.** Given the ratings panel already distinguishes weighted vs. raw, when this story ships, then the ratings weighted/raw display uses the **same "trusted consensus" / "community consensus" vocabulary** as the tag block, so a user sees one consistent trusted-vs-community distinction across the whole book page (no contradictory or differently-worded labels for the same concept). (This adjusts existing copy/labels in `RatingsPanel`; it does not change how the weighted rating number is computed.)

- [ ] **AC-7 — Honest with no trust configured / trust failure.** Given trust is unavailable (no observer configured, or the provider errors), when the classification consensus is read, then it degrades to the raw "community consensus" view (never throws, never fabricates a trusted number), exactly as the ratings path degrades to raw today.

- [ ] **AC-8 — Built and verified against the fixture provider in CI.** Given `TRUST_PROVIDER=fixture` with a deterministic `TRUST_FIXTURE` spec, when the test suite runs in CI, then the weighted-vs-raw tag/genre divergence (AC-1, AC-2) and the trusted-vs-community labeling (AC-3, AC-4) are exercised green with no Brainstorm call, no relay, and no human. No Brainstorm/NIP-85 specifics leak outside `apps/api/src/trust/brainstorm.ts` — the existing ADR 0014 architecture guard test (`apps/api/test/trust/architecture.test.ts`) stays green.

## DList shapes touched
No new shapes. This reads existing events and adds a weighted *view* over them.

- `kind:39999` — book **tag assertion** records under the `book-tag-assertions` concept (read; the trusted-weighted aggregation is computed over these, keyed by asserter pubkey for weighting).
- `kind:39999` — book **rating** events under the book record address (read; AC-6 reuses the existing weighted view, no change to its computation).
- `kind:39998` — `book-tags` (taxonomy) and `book-tag-assertions` concept headers (read; unchanged role — provide the taxonomy and the parent pointer).
- Trust weights consumed via the existing `TrustProvider` seam (`apps/api/src/trust/`); the fixture provider supplies deterministic weights in CI.

## Out of scope
State explicitly. These are later Block C/D stories or separate ops steps; do not pull them in:

- **The actual house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → the production librarian). Per §2.0 this is a config/ops step that *precedes* trust-consuming features going live, but the FEATURE in this story is built and verified entirely against the fixture provider regardless of the swap. Recommendation: keep the swap as a **separate config/ops step** (see Open Questions), so this story is not blocked on the operational dependency below. Operational dependency to note for whoever performs the swap: the librarian's kind-3 follow graph must be visible to Brainstorm/GrapeRank for the real swap to produce meaningful scores; dcosl rejects kind-3, so that graph lives on the profile / nip85 relays.
- **Trust-weighted SEARCH re-ranking** (phase2-prd §2.9) — a later story.
- **Homepage trust shelves** (Trending / Community Favorites / For You — §2.9) — a later story.
- **Custodial personalization / the follow-graph personalization trigger** (§2.6) — a separate story, now unblocked by Story 23; this story does not add custodial trust.
- **Trust-gated submission promotion** (§2.7) — a later story.
- **Accusatory-tag visibility gate and the accusatory write picker** (§2.8) — out; accusatory tags stay hidden at read time exactly as today (`aggregateBookTags` drops `accusatory`), and no new write picker is added here.
- **Quality-signal WRITE picker** — out (today's `TagControl` offers genre + style writes only). This story may surface trust-weighted *display* of existing quality-**signal** assertions (consistent with the §2.5 "quality signals on book detail reflect trust-weighted consensus" language), but adds no new write affordance.
- No new lint/typecheck/build tooling (CLAUDE.md house rule; that needs an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": this story touches none of payments, file hosting, ebook sales, bounty marketplace, print-on-demand, social feed, reading progress, federation, or email — it is a read-time trust view over existing classification data.

## Open questions
Resolve before approving the story.

1. **House-observer swap — this story or separate?** Recommendation: **separate config/ops step**, tracked under §2.1 / §2.5's operational acceptance criteria, NOT this story. Reason: the feature is fully buildable and CI-verifiable against the fixture provider (§2.0's whole point), and the real swap carries an operational dependency (librarian kind-3 graph visibility to Brainstorm; dcosl rejects kind-3) that should not gate merging a CI-green feature. Does the user agree, or do they want the `HOUSE_OBSERVER_PUBKEY` flip folded into this story's acceptance?

2. **Split?** Recommendation: **keep as one story.** It is one coherent change (weighted tag aggregation + the labeling that makes it honest) and the labeling (AC-3/AC-4/AC-6) is meaningless without the weighted aggregation (AC-1/AC-2). The AC list is larger than the ~5-item guideline, but most criteria are facets of one behavior (compute weighted, label it, fall back honestly). If the user prefers a split, the natural seam is **25a** = weighted tag/genre aggregation API + fixture tests (AC-1, AC-2, AC-5, AC-7, AC-8), **25b** = the UI labeling and ratings-consistency pass (AC-3, AC-4, AC-6). Does the user want it split?

3. **"Trusted consensus" vs "community consensus" wording.** Are those the exact user-facing strings the user wants, or a starting point for the Implementer to finalize under the no-slop rule? (The PRD §2.5 uses "community consensus" and "trusted consensus" verbatim, so this story adopts them as the labels.)

4. **Per-tag vs per-page labeling granularity.** When some tags on a book have trusted signal and others only have community/raw signal, should the label apply **per tag** (each chip carries its own trusted/community state) or **per classification block** (one banner for the section)? Recommendation: per-tag where the design supports it, with a section-level fallback if the chip UI can't carry it — but this is a design call the Architect/UX should confirm. The AC is written to allow either.

## Linked artifacts
- ADR: `engineering-team/decisions/0025-weighted-consensus.md`
- Test plan: `engineering-team/stories/done/25-weighted-consensus.test-plan.md`
- Review: `engineering-team/reviews/25-weighted-consensus.md` (PASS)
