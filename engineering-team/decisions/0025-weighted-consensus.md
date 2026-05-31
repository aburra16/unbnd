# ADR 0025: Trust-weighted tag/genre consensus + community-vs-trusted labeling

**Status:** Proposed
**Date:** 2026-05-31
**Story:** `engineering-team/stories/done/25-weighted-consensus.md`

## Context

Ratings are trust-weighted (ADR 0014). The ratings route `GET /api/books/:slug/ratings`
resolves an observer (`?observer=<npub|hex>` else `config.houseObserverPubkey`),
fetches `TrustProvider.weights(observerHex, raterHexes)` once for all raters, and
`weightedRatings` (`apps/api/src/ratings/summary.ts`) computes a trust-weighted
mean over raters with weight > 0, returning `null` when no rater is trusted so the
caller honestly degrades to raw. The RatingsPanel renders the weighted view with a
House⇄Yours toggle (`useTrustView`) and falls back to raw labelled "Showing all
ratings…".

Classification (genre/style/signal) consensus has not caught up. `aggregateBookTags`
(`apps/api/src/tags/aggregate.ts`) counts every apply/dispute equally — a librarian's
genre call weighs the same as a throwaway account's. `GET /api/books/:slug/tags` has
no observer awareness; `userEventDeps` already carries `trust`, but the tags router
ignores it. This violates POV-first (CLAUDE.md §1: "which genre tag wins the
trust-weighted vote… computed from a specific point-of-view") and leaves the two
consensus surfaces inconsistent (ratings respect trust; tags do not) and the honesty
gap open: nothing tells the reader whether the classification they see is trusted or
raw.

**PRD anchor:** phase2-prd §2.5 (trust-weighted tag/genre consensus + the raw-fallback,
labelled "community consensus" / "trusted consensus" decision of record), §2.0 +
ADR 0017 (build/verify against the fixture provider). Invariants: CLAUDE.md §1 POV-first,
§3 filter-at-view-time.

**User-gate decisions honored (from the approved story):**
- The house-observer swap (`HOUSE_OBSERVER_PUBKEY` → production librarian) is a
  **separate ops/config step**, not this story. Operational dependency to note for
  whoever performs it: the librarian's kind-3 follow graph must reach Brainstorm/
  GrapeRank for the swap to yield meaningful scores, and dcosl rejects kind-3 (that
  graph lives on profile/nip85 relays). This feature is built and CI-verified entirely
  against the **fixture** `TrustProvider` (`TRUST_PROVIDER=fixture`).
- **One story**, no split.
- **Labels:** "trusted consensus" / "community consensus" (PRD §2.5 verbatim) as the
  starting vocabulary, applied to **both** the tag block and the RatingsPanel (AC-6).
- **Q4 — per-tag, hybrid render:** each tag's consensus is independently trusted or
  community (honest on mixed books); the section carries a label for the common case
  plus a subtle marker on community-only tags within an otherwise-trusted section
  (no badge on every chip).

This reads existing events and adds a weighted *view*. No new DList shape (story
"DList shapes touched"): kind-39999 tag assertions under `book-tag-assertions`, the
kind-39998 `book-tags` taxonomy + `book-tag-assertions` headers (unchanged role),
trust weights via the existing seam. No new dependency, no new tooling.

## Options considered

### (1) Weighted tag consensus aggregation — the per-tag weighting formula

The raw layer dedups by `(author, tagSlug)` keeping the latest, then counts
`applies`/`disputes` by polarity. We add a weighted layer per tag, mirroring
`weightedRatings` (weight asserters with weight > 0; raw polarity counts remain the
unweighted substrate).

#### Option A — signed trust-weighted net per tag (chosen)

For each tag, partition its deduped asserters into apply (polarity +1) and dispute
(−1). Look up `w = weights.get(asserterHex) ?? 0`. Compute:
- `trustedApplies = Σ wᵢ` over apply-asserters with `wᵢ > 0`
- `trustedDisputes = Σ wᵢ` over dispute-asserters with `wᵢ > 0`
- `trusted = (trustedApplies + trustedDisputes) > 0` (this tag had ≥1 positively-trusted
  asserter from this observer)
- A tag is **surfaced from the trusted vantage** when `trustedApplies > trustedDisputes`
  (trust-weighted net positive), mirroring the raw rule that a tag shows when applies
  outweigh disputes. When `trusted` is false (no trusted signal for this tag), the tag
  falls back to its raw `applies`/`disputes` and is surfaced by the existing raw rule.

This makes AC-2 hold by construction: an untrusted dispute contributes `w = 0` to
`trustedDisputes`, so any volume of untrusted disputes cannot flip a tag a trusted
asserter applied (and vice versa). The trusted view is decided purely by trusted weight.

Pros: directly mirrors `weightedRatings` (sum-of-weights numerator, weight-> 0 for
untrusted); the `trusted` flag is the exact analogue of `weighted !== null`; untrusted
volume provably cannot move the trusted view; the raw counts are preserved untouched
as the labelled-community substrate. Cons: a tag with trusted signal on **both** sides
near parity could tip on small weight deltas — acceptable (it is genuinely contested
from that vantage), and the raw counts are still shown.

> **Reconciliation note (Story 25 review, PASS).** As shipped, the weighting
> **annotates** each surfaced tag with its `trusted` flag (and the trust-weighted
> net) and the raw counts; it does **not** exclude or reorder tags. Which tags are
> surfaced at all stays governed by the existing raw rule (apply > dispute,
> accusatory hidden, unknown dropped) — "surfaced from the trusted vantage when
> `trustedApplies > trustedDisputes`" describes the trusted-net **signal carried by
> the flag**, not a separate tag-exclusion step. This flag-and-keep model is
> deliberate (honest: the raw substrate stays visible, the catalog never empties).
> A deferred enhancement (PRD Appendix C) adds a **"contested" visual treatment**
> for tags that trusted curators net-*dispute*, which today render as a plain
> trusted chip.

#### Option B — trusted apply-count vs raw apply-count (boolean-collapse weights)

Treat any `w > 0` asserter as a single trusted vote; `trustedApplies = #{apply-asserters
with w>0}`. Pros: simpler integer math. Cons: discards the weight magnitude that
`weightedRatings` deliberately uses — a top curator and a barely-trusted account would
count identically, which is *not* how the ratings path weights and would make the two
surfaces inconsistent in spirit even while consistent in vocabulary. Rejected: it does
not "mirror `weightedRatings`."

#### Option C — single trust-weighted score per tag, hide raw

Replace the raw counts with one weighted score. Cons: erases the raw substrate the
fallback (AC-4) and the honest empty state depend on; can't render "community
consensus" when there is no trusted signal. Rejected — violates the honesty invariant.

### (2) Tags route observer awareness + response shape

The route must resolve an observer like ratings, fetch weights once for all asserters,
apply per tag, degrade to raw on any trust failure, and return a shape the hybrid UI
can read.

#### Option A — additive per-tag `trusted` flag, top-level `observer` echo (chosen)

`TagConsensus` gains `readonly trusted: boolean`. The `BookTags` response gains an
optional `observer?: string` (npub) and an optional `weighted?: boolean` (did *any*
surfaced tag have trusted signal from this observer — the section-level state).
Existing `applies`/`disputes` are unchanged. The route resolves the observer
(reusing the same `?observer=` else `config.houseObserverPubkey` logic and the same
`npub|hex → hex` helper as ratings), collects the distinct asserter hexes across all
assertions, calls `deps.trust.weights(observerHex, asserterHexes)` once, and passes
the weight map into the aggregator. On no trust / any `weights` rejection, every tag's
`trusted` is `false` and `weighted` is `false` (raw community view) — never throws.

Pros: purely additive (`trusted` defaults conceptually to `false`/community, so any
unmigrated consumer keeps working); one weight fetch for the whole page (mirrors the
ratings route's single fetch); the web reads `trusted` per chip and `weighted` for the
section label with no second request. Cons: `TagConsensus` is shared by `BookHeader`,
`TagControl`, and `aggregateGenreBooks`-adjacent code — all must accept the new field
(typecheck will surface every site; the field is non-breaking at runtime).

#### Option B — parallel `weightedTags` block alongside raw (ratings-route mirror)

Mirror the ratings response literally: keep `genres/styles/signals` raw and add a
sibling `weighted: { genres, styles, signals } | null`. Pros: maximal structural
symmetry with `RatingsSummary.weighted`. Cons: the **hybrid per-tag** requirement (Q4)
needs *per-tag* trusted state interleaved within one list (some chips trusted, some
community in the same section); two parallel lists force the web to zip them back
together by slug to render a mixed section, which is more code and more error-prone
than carrying `trusted` on the tag itself. Rejected for the hybrid render; Option A's
per-tag flag is the better fit for "honest on mixed books."

### (3) Hybrid render + ratings-vocabulary alignment

#### Option A — section label + community-only chip marker, shared vocabulary (chosen)

Web `BookTags` consumers (`BookHeader` chip row, `TagControl` read view) render from
`trusted`/`weighted`:
- The classification section shows one label derived from the observer's overall state:
  **"trusted consensus"** when `weighted` is true (at least one surfaced tag has trusted
  signal), else **"community consensus"** (raw fallback / no trusted signal / trust off).
- Within an otherwise-trusted section, a tag whose own `trusted` is `false` carries a
  subtle marker/treatment (e.g. a muted dot or a lighter chip tone via existing tokens),
  NOT a per-chip badge. In a fully-community section no per-chip marker is needed (the
  section label already says community).
- The label + per-chip state recompute when the observer changes. The book-detail tag
  read is re-fetched with `?observer=<npub>` on the House⇄Yours toggle, mirroring how
  `RatingsPanel` re-requests `api.ratings.list(slug, npub)` for "Yours". The existing
  `useTrustView` hook (shared `house`/`yours` state) drives it.
- The empty state ("No genres or styles applied yet.") is unchanged (AC-4).
- **RatingsPanel vocabulary (AC-6):** the existing weighted/raw captions and labels move
  onto "trusted consensus" / "community consensus" wording. The weighted-rating
  *computation* is untouched; only the strings change. So the whole book page reads one
  consistent trusted-vs-community distinction.

Pros: one section label for the common case (cheap, legible) plus honesty on mixed
books; reuses `useTrustView`, `GenrePill`, and existing tokens; no new component, icon
library, or hex literal. Cons: the chip marker needs a token-only visual treatment that
reads as "less settled" without shouting — a design/UX detail to confirm against the
no-slop visual rule (no badge-on-every-chip, no emoji-as-icon).

#### Option B — per-chip badge on every chip

Reject (explicit Q4 gate decision): a badge on every chip is visual noise and the user
chose a section label + subtle marker on the exceptions only.

### (4) Fixture verification

Reuse ADR 0017's `FixtureTrustProvider` (`TRUST_PROVIDER=fixture` + `TRUST_FIXTURE`).
Tests give a known observer known weights over a known set of asserter hexes and assert
the weighted-vs-raw tag divergence (AC-1), that untrusted dispute volume does not flip a
trusted-applied tag (AC-2), and the trusted/community labelling (AC-3/AC-4). The ADR 0014
architecture guard (`apps/api/test/trust/architecture.test.ts`) must stay green — the
tags route consumes only the neutral `TrustProvider.weights` seam, introduces no
Brainstorm/NIP-85 specifics, so the guard passes unchanged. Same approach as the ratings
weighting tests; no Brainstorm call, no relay, no human.

## Decision

We chose **Option A in all four areas.**

1. **Weighted aggregation (1A):** add a weighted layer in `aggregate.ts` mirroring
   `weightedRatings` — per tag, sum the trust weights of apply-asserters and
   dispute-asserters separately; a tag is trusted-surfaced when `trustedApplies >
   trustedDisputes`; each `TagConsensus` carries `trusted: boolean` (≥1 positively
   trusted asserter from this observer). Untrusted asserters contribute weight 0, so
   untrusted volume cannot move the trusted view (AC-2). Raw `applies`/`disputes`
   remain the unweighted, labelled-community substrate.

2. **Route + shape (2A):** `GET /api/books/:slug/tags` gains observer awareness
   identical to the ratings route (`?observer=` else `config.houseObserverPubkey`,
   `npub|hex → hex`), fetches `trust.weights` once for all asserter hexes, applies per
   tag, degrades to raw (every `trusted: false`, `weighted: false`) on any failure,
   never throws. Response is additive: `TagConsensus.trusted: boolean`, plus top-level
   `observer?: string` (npub) and `weighted?: boolean` (the section state).

3. **Render + vocabulary (3A):** the book-detail classification section shows a
   section-level "trusted consensus" / "community consensus" label from `weighted`,
   with a subtle token-only marker on community-only chips inside a trusted section;
   the read re-fetches with `?observer=` on the House⇄Yours toggle via `useTrustView`;
   the RatingsPanel adopts the same "trusted consensus" / "community consensus"
   vocabulary (copy-only change, no recompute).

4. **Verification (4):** deterministic fixture tests for AC-1/AC-2/AC-3/AC-4; the
   ADR 0014 architecture guard stays green via the neutral seam.

Reasons: every choice mirrors the shipped, verified ratings path closely (the explicit
brief), keeps the raw counts as an honest substrate, makes "untrusted volume can't move
trusted signal" true by construction, and fits the hybrid per-tag render the user gated.

## Consequences

- The classification block becomes POV-first and consistent with ratings: two observers
  can see two different consensuses and labels for the same book, both correct.
- The honesty gap closes: trusted-weighted consensus is labelled "trusted consensus";
  raw fallback is labelled "community consensus" and never presented as trusted; the
  empty state is unchanged; no fabricated trust numbers.
- The tags route gains an outbound trust dependency on the same best-effort seam as
  ratings (failure → raw). No schema, no migration, no new dependency, no new tooling.
- Per-tag weighting near parity on a tag with trusted signal on both sides is genuinely
  contested from that vantage; the raw counts remain visible as substrate.
- **Affects existing fixtures?** No production data fixtures. The web type `TagConsensus`
  gains `trusted`; `apps/web/src/data/book-fixtures.ts` and any test fixtures
  constructing `TagConsensus`/`BookTags` must add `trusted` (typecheck will list every
  site). Test `TRUST_FIXTURE` specs are added by the Tester.
- **New dependency?** No.
- **PRD section change required?** No — this implements PRD §2.5 as written.
- **Out-of-scope / follow-ups (unchanged from the story):** the house-observer swap
  (ops/config), trust-weighted search re-ranking (§2.9), homepage trust shelves (§2.9),
  custodial personalization (§2.6), trust-gated promotion (§2.7), the accusatory-tag
  visibility gate + write picker (§2.8), and a quality-signal write picker. Accusatory
  tags stay dropped at read time exactly as today.

## Implementation notes

- **`apps/api/src/tags/aggregate.ts`** — add `WeightedTagConsensus` fields by extending
  `TagConsensus` with `readonly trusted: boolean`, and add
  `aggregateBookTagsWeighted(assertions, taxonomy, weights: Map<string, number>):
  BookTags & { weighted: boolean }` (or fold an optional `weights?` param into
  `aggregateBookTags`). Per tag, while folding the deduped latest-per-(author,tagSlug)
  assertions: accumulate raw `applies`/`disputes` (unchanged) AND `trustedApplies`/
  `trustedDisputes` as `Σ weights.get(author)` over positive-weight authors by polarity.
  Set `trusted = (trustedApplies + trustedDisputes) > 0`. Surfacing rule: a tag is shown
  when `trusted ? trustedApplies > trustedDisputes : applies > disputes` (preserve the
  existing accusatory + unknown-tag drops). `weighted = ` any surfaced tag has
  `trusted === true`. Keep the raw `aggregateBookTags` callable for the
  weights-absent/degraded path (or call the weighted fn with an empty map).
- **`apps/api/src/routes/tags.ts`** — in `GET /api/books/:slug/tags`: add the
  `toObserverHex` helper + `HEX64` (copy the ratings-route pattern; it is small and the
  architecture guard is unaffected — consider a tiny shared helper only if the Reviewer
  prefers it, otherwise duplicate per existing convention). Resolve `observerHex` =
  explicit `?observer=` param else `deps.config.houseObserverPubkey`. After parsing
  assertions, collect distinct asserter hexes; if `deps.trust && observerHex &&
  asserters.length > 0`, `try { const weights = await deps.trust.weights(observerHex,
  asserters); }` and aggregate weighted, `catch` → aggregate raw (all `trusted:false`,
  `weighted:false`). Return `{ genres, styles, signals, observer: npubEncode(observerHex),
  weighted }`. `deps.trust` is already on `userEventDeps` (index.ts:299); no wiring change.
- **`apps/web/src/lib/api.ts`** — `TagConsensus` gains `trusted: boolean`; `BookTags`
  gains `observer?: string` and `weighted?: boolean`. `api.tags.book(slug, observer?)`
  gains the optional observer param and appends `?observer=` like `api.ratings.list`.
- **`apps/web/src/routes/BookDetail.tsx`** — pass the active observer (from
  `useTrustView`'s `npub` when view==="yours") into `api.tags.book` and re-fetch on
  toggle, mirroring `RatingsPanel`.
- **`apps/web/src/components/BookHeader.tsx` + `TagControl.tsx`** — render the
  section-level "trusted consensus" / "community consensus" label from `weighted`, and a
  subtle token-only marker on chips with `trusted === false` inside a trusted section.
  Extend `GenrePill` (`apps/web/src/components/Pill.tsx`) with an optional `community?:
  boolean` styling variant using existing tokens (`apps/web/src/styles/tokens.css`) — no
  new hex literal, no icon library, amber-only accent, depth-without-shadow.
- **`apps/web/src/components/RatingsPanel.tsx`** — replace the weighted/raw captions and
  labels with "trusted consensus" / "community consensus" wording (AC-6). Copy reviewed
  against `memory/feedback_unbnd_copy_and_visual.md` (no em dashes, no rhetorical
  contrasts, no "designed to", etc.). No change to `weightedRatings`.
- **Tests (Tester's phase):** fixture-provider integration tests for the route +
  aggregator (`TRUST_PROVIDER=fixture`), asserting AC-1 (weighted ≠ raw), AC-2 (untrusted
  dispute volume does not flip a trusted-applied tag), AC-3/AC-4 (label state), AC-7
  (trust off → community). The ADR 0014 guard stays green.

## Out of scope

The house-observer swap (ops/config step). Trust-weighted search re-ranking, homepage
trust shelves, custodial personalization, trust-gated promotion, the accusatory-tag
visibility gate and accusatory/quality-signal write pickers. Caching of weighted tag
reads (re-derive on read per CLAUDE.md §3; revisit only with a measured perf budget).
Any change to the rating weighting math.
