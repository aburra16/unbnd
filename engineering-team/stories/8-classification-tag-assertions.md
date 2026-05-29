# Story 8: Book classification via tag assertions (Tapestry-aligned)

**Status:** Approved
**Created:** 2026-05-29
**Type:** Feature

## Background

We disambiguated three layers of book classification:
- **Layer 0 — intrinsic metadata** on the book record (kind 39999): Open Library `subjects`, ISBN, year. Single-author (the importing librarian), descriptive, not curated.
- **Layer 1 — applied tag assertions** (this story): a signed event applies a tag *value* (a genre, a quality signal) to a book *target*, with **polarity** (apply/dispute). Any author — librarian, reader, curator — asserts. This is the Tapestry tagging model (`feat/pubkey-tagging-target` ADR 0001 "profile-tag-architecture"), adapted to target a book instead of a pubkey.
- **Layer 2 — the weighted view**: GrapeRank/WoT aggregation over Layer-1 assertions (the "trust-weighted genre/quality" the PRD promises). Deferred to the personalization cycle; until then we show honest raw consensus.

This supersedes the bespoke cycle-1 schemas `BookGenreTag` and `BookQualitySignal` with **one unified tag-assertion model** (matching Tapestry), so genre, quality signals, and any future classification share one weightable mechanism and one set of WoT tooling.

**Open mechanism, curated surfacing.** Two concerns are kept separate: what can be *written* (open — any signed assertion can exist; we don't censor the protocol) vs what gets *surfaced/weighted* (curated, read-time). On top of the open assertion mechanism sits a **tag taxonomy** — a librarian-published registry of recognized tag *elements* (Tapestry's richer `tag` concept: `name`, `type` genre/style/signal, and a **sensitivity** class). The taxonomy governs the consumer UI and surfacing. **Sensitive/accusatory tags** (e.g. `ai-generated`) are defined in the taxonomy but **only surface once asserted by a sufficiently trusted + role-qualified author** — which prevents toxic tag attacks on authors. That gate is Layer-2 (GrapeRank + role assertions on pubkeys, the recursive WoT), so it is deferred; until it exists, sensitive tags are **not surfaced at all**.

This is the foundation for genre/style browse and quality badges off real, community-curated data (rather than fixtures or static fields).

## User-facing description

As a signed-in user (PRD §3.1/§3.2 — reader or curator) — and as the house librarian — I want to apply a classification to a book (a genre like "literary fiction", a quality signal like "AI generated" or "well edited"), or dispute one I disagree with, so that the community's judgments — not a single static field — drive how books are classified, with my assertion weighted by my reputation once trust scoring is on.

End users see: genre tags and quality-signal badges on a book that reflect community consensus; the ability to apply/dispute from the book page; genre browse populated by these assertions. (Trust-weighting of that consensus arrives with GrapeRank.)

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: A classification assertion is a kind-39999 event that applies a tag *value* to a book *target* by its **stable address** (`["a", "39999:<librarian>:<bookSlug>"]`), z-tagged to a single assertion concept, with `["polarity","1"]` (apply) or `"-1"` (dispute), default `1` when absent. Identity = `(author, target, tag)` via a deterministic d-tag; re-publishing overwrites; NIP-09 kind-5 revokes.
- [ ] AC-2: The tag value + target + polarity are relay-filterable event-tags (not buried in JSON), so the WoT query is one filtered subscription (`kinds:[39999], #z:[<concept>], #a:[<book>]`, optionally `authors:[…]`). The JSON payload mirrors them (schema-validated, no exclusive truths).
- [ ] AC-3: Genre and quality signals are two tag *vocabularies* over the **same** assertion mechanism (a tag-type discriminator distinguishes them); no separate event kind or bespoke schema per classification.
- [ ] AC-4: Any signed-in user can apply/dispute an assertion through the existing write path — sovereign client-signs (5a), custodial server-signs (5b). The author is the user's own pubkey; no impersonation.
- [ ] AC-5: The librarian seeds a **baseline genre assertion** per book from its Open Library subject(s) — as one author among many, not a privileged truth. A book in multiple subjects gets multiple genre assertions.
- [ ] AC-6: A read endpoint aggregates assertions for a book (and for a genre, for browse) into an **honest raw consensus** — counts of applies/disputes per tag value — with **no trust-weighted number and no GrapeRank score** (that is Layer 2, deferred). npub-attributed, hex never exposed.
- [ ] AC-7: The cycle-1 `BookGenreTag` / `BookQualitySignal` schemas are **replaced** by the unified assertion schema in `@unbnd/schemas` (builders + parsers + tests), and nothing references the retired shapes.
- [ ] AC-8: A **tag taxonomy** of recognized tag elements is published by the librarian — a starter preset for **genre** and **style** — each element carrying `name`, `type` (genre/style/signal), and a `sensitivity` class (e.g. `normal` vs `accusatory`). Assertions referencing a recognized element are first-class; the consumer UI applies/disputes **from the taxonomy** (no free-form entry exposed yet, though the protocol still permits it).
- [ ] AC-9: **Sensitive (accusatory) tags are not surfaced** in the read API / UI. An assertion of a sensitive tag may be stored, but it does not appear in book classifications or browse until the Layer-2 trust+role gate exists. Non-sensitive genre/style consensus surfaces normally (raw counts).

## DList shapes touched

- `kind:39999` — the unified **book tag-assertion** item (**new**, replaces BookGenreTag + BookQualitySignal). Target via `#a` (book address), tag value + polarity on event-tags, z-tag to the assertion concept.
- `kind:39998` — the **assertion concept** header (the registry the assertions belong to); possibly a **tag-vocabulary** concept for genres + one for quality signals. (Architect resolves the exact concept layout against the Tapestry model.)

## Out of scope

- **Layer 2 — GrapeRank/WoT weighting** of the consensus — personalization cycle. This story shows raw counts honestly.
- **Trust + role-gated surfacing of sensitive tags** (the `ai-generated` gate: requires high asserter trust + a curator/editor/expert role assertion on their pubkey) — Layer 2. This story defines sensitivity and *hides* sensitive tags; it does not build the gate.
- **Free-form tag entry in the consumer UI** — near-term the UI picks from the taxonomy; curator-coined free-form tags are later.
- **Role assertions on pubkeys** (curator/editor/expert) — the recursive WoT that powers the sensitive-tag gate; later.
- Catalog read-path UI swap for non-genre surfaces (book detail header, homepage shelves) — coordinates with the read-paths story; this story covers the classification data + its read API + the apply/dispute control + genre browse off assertions.
- Search indexing — later story.
- Author-claim / submission.

## Open questions

For the ADR / operator.

1. **Concept layout.** One assertion concept + a tag-type discriminator for genre vs quality-signal, vs separate concepts per vocabulary. How tag *values* are registered (free-form slugs vs a curated tag-element registry like Tapestry's kind-39999 tag elements).
2. **Target reference.** `#a` (stable address — recommended for replaceable book records) vs `#e` (event id, unstable on republish). Confirm `#a`.
3. **Librarian genre seeding.** Confirm the librarian seeds baseline genre assertions from OL subjects; how OL subjects map to our genre vocabulary; multi-subject handling.
4. **Browse semantics before GrapeRank.** Raw apply-minus-dispute counts; ordering; how an empty/contested genre reads. Honest labeling (no fake trust number).
5. **Reuse of 5a/5b write path.** Assertions are user writes like ratings — confirm they route through the same template→sign→publish (sovereign) / server-sign (custodial) core, generalized beyond ratings.
6. **Migration.** Retiring `BookGenreTag`/`BookQualitySignal` — are there any seeded events in those shapes to migrate? (No: the seed only published book records + headers; no genre/quality events exist yet.)

## Linked artifacts

- ADR: `engineering-team/decisions/0009-classification-tag-assertions.md`
- Test plan: `engineering-team/stories/8-classification-tag-assertions.test-plan.md`
- Review: (filled in after Review phase)
