# ADR 0009: Book classification via tag assertions (Tapestry-aligned)

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/8-classification-tag-assertions.md`

## Context

Story 8 unifies book classification (genre, style, quality signals) onto **one** Tapestry-style tag-assertion mechanism, replacing the bespoke cycle-1 `BookGenreTag`/`BookQualitySignal` (which nothing else references — confirmed by grep, only the schemas index exports them). Three layers: intrinsic metadata (Layer 0, on the book record), applied assertions (Layer 1, this ADR), and the GrapeRank-weighted view (Layer 2, deferred). Two concerns stay separate: **open writes** (any signed assertion can exist) vs **curated surfacing** (a taxonomy + sensitivity govern what the UI shows). The prior art is `feat/pubkey-tagging-target` ADR 0001 "profile-tag-architecture": a kind-39999 assertion carrying target + applied-tag + polarity as relay-filterable event-tags, identity `(author, target, tag)`, replaceable, NIP-09-revocable, with a separate tag-element registry.

## Decision

Adopt the Tapestry assertion model, adapted to target **books** (replaceable events ⇒ target by **stable address**, not event id), with a librarian-published **tag taxonomy** and a **sensitivity** dimension.

### Concepts (kind 39998 headers, librarian-published)
- `book-tags` — the **taxonomy** registry (all recognized tag *elements* z-tag here).
- `book-tag-assertions` — the **assertion** concept (all assertions z-tag here).

### Tag element — the taxonomy (kind 39999, `@unbnd/schemas` `BookTag`)
A recognized tag the UI offers. d-tag `tag--<type>--<slug>` (deterministic). Event-tags: `["z","39998:<lib>:book-tags"]`, `["t",slug]`, `["t",type]`, `["sensitivity",class]`. JSON mirror `{ word:{…,wordTypes:["word","bookTag"]}, bookTag:{ slug, type, name, sensitivity } }`.
- `type` ∈ `genre | style | signal`.
- `sensitivity` ∈ `normal | accusatory`. Starter preset: genres (matching the 8 UI genres) + a small style set; signals defined (`ai-generated`, `possibly-ai-generated`, `well-edited`, `needs-copy-edit`) and flagged `accusatory` where appropriate.

### Assertion (kind 39999, `@unbnd/schemas` `BookTagAssertion` — replaces BookGenreTag + BookQualitySignal)
Applies a tag to a book, with polarity. d-tag `tagassert--<bookSlug>--<tagSlug>--<author8>` (identity `(author, book, tag)`; replaceable ⇒ overwrite to change; NIP-09 kind-5 to revoke). Event-tags:
- `["a","39999:<lib>:<bookSlug>"]` — **target book** (stable address; filter via `#a`).
- `["t",tagSlug]`, `["t",tagType]` — the applied tag (filter via `#t`).
- `["polarity","1"]` (apply) | `"-1"` (dispute); absent ⇒ `1`.
- `["z","39998:<lib>:book-tag-assertions"]`.
- JSON mirror; no exclusive truths in JSON.

Queries are single filtered subscriptions, no JSON parse:
- a book's classifications: `kinds:[39999], #z:[book-tag-assertions], #a:[<bookAddr>]`
- books in a genre (browse): `kinds:[39999], #z:[book-tag-assertions], #t:[<genreSlug>]`
- WoT-scoped later: add `authors:[<wot pubkeys>]`.

### Sensitivity gate (Layer-2-aware, but enforced now by hiding)
The read aggregator joins assertion `tagSlug` → the taxonomy element to get `sensitivity`. **Accusatory** tags are **dropped from the read API/UI** until the Layer-2 trust+role gate exists (asserter GrapeRank ≥ threshold AND a curator/editor/expert role assertion on their pubkey — the recursive WoT, deferred). Normal genre/style tags surface as raw apply-minus-dispute consensus, npub-attributed, **no trust number**.

### Write path — generalize 5a/5b beyond ratings
Extract the rating-specific route into a generic "publish a user-authored DList event" core: build template → sovereign client-signs (5a) / custodial server-signs via the session wrap (5b) → validate (`verifyEvent`, kind 39999, `pubkey===session`) → publish. `POST /api/tags` (apply/dispute) routes through it. Ratings keep working on the same core.

### Read API (apps/api)
- `GET /api/books/:slug/tags` → `{ genres:[{slug,name,applies,disputes}], styles:[…] }`, accusatory excluded.
- `GET /api/genres/:slug/books` → books with a net-positive genre consensus (for browse).
- `GET /api/tags` → the taxonomy (for the apply/dispute picker).

### Seeding (apps/seeder)
Publish the starter taxonomy (genre + style + signal elements) once, then **baseline genre assertions**: for each seeded book, a librarian-signed assertion per OL-subject bucket it came from (track all buckets, not just the first). The librarian is one author among many.

### Web
- Book detail: genre/style chips from `GET /api/books/:slug/tags`; an apply/dispute control that picks from `GET /api/tags` (no free-form entry) and writes via the generic path (sovereign sign / custodial server-sign).
- Genre browse: real books from `GET /api/genres/:slug/books`.

## Options considered

- **A — unified assertion + element registry + sensitivity (chosen).** Matches Tapestry, one mechanism for all classifications, relay-filterable, composes with WoT + the sensitive-tag gate.
- **B — keep bespoke per-classification schemas (cycle-1).** Simpler shapes but no polarity, diverges from Tapestry, doesn't compose with WoT tooling or sensitivity. Rejected.
- **C — genre as a static field on the book record (Layer 0).** Simplest, but not curated/weightable — the shortcut the PRD's community-curation model rejects. Rejected (kept only as the OL *hint* that seeds the librarian's assertion).

Target-by-`#a` vs `#e`: **`#a`** — book records are replaceable, so the event id changes on republish; the address is stable.

## Consequences

- **Enables** community genre/style classification + browse off real assertions; a single mechanism for quality signals and future tags; the sensitive-tag safety model by construction.
- **Replaces** `BookGenreTag`/`BookQualitySignal` (removed from `@unbnd/schemas` + index + tests).
- **Constrains:** consensus is raw counts until GrapeRank (Layer 2); sensitive tags are hidden until the role gate; the UI picks from the taxonomy (no free-form entry yet).
- **New dependency?** No. **PRD change?** No (implements §community curation). **Fixtures?** The web genre/quality fixtures get replaced by live reads as the surfaces are wired.
- **Migration:** none — no genre/quality events were ever published (the seed only emitted book records + the now-deleted headers).

## Out of scope

GrapeRank weighting + the sensitive-tag trust/role gate + role assertions on pubkeys (Layer 2); free-form tag entry in the UI; search; author-claim. Non-classification read-path surfaces (book-detail header, homepage shelves) coordinate with the read-paths story.

## Implementation notes

- `@unbnd/schemas`: add `BookTag` + `BookTagAssertion` (builders/parsers/d-tags/tests); remove `BookGenreTag`/`BookQualitySignal` + index exports + tests.
- `apps/api`: generic `publishUserEvent` core (refactor from ratings); `routes/tags.ts` (read + apply/dispute); aggregation with sensitivity filtering.
- `apps/seeder`: publish taxonomy + baseline genre assertions (track all OL buckets per book).
- `apps/web`: tag chips + apply/dispute control + genre browse off the API.
- Reuse `toWireTemplate`/`finalizeEvent`/`publishEvent`/`queryEvents`; never hand-roll signing.
