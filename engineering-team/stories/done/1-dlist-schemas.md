# Story 1: DList schemas for the core data model

**Status:** Done
**Created:** 2026-05-28
**Type:** Feature

## Background

Every Unbnd feature beyond static fixtures depends on a settled DList event shape. Ratings need a shape strfry can store, Neo4j can ingest, Meilisearch can index, and GrapeRank can score against. The same is true for genre tags, quality signals, shelves, book records, and genre definitions.

PRD §6 sketches these shapes in JSON with example values and a short field table. PRD §6 has not been turned into committed types. Until it is, every downstream story will either re-infer the shape from the loose-typed fixtures we shipped with the UI, or rebuild the type system from scratch each time — both of which guarantee drift.

This story is where we commit. The PRD draft becomes a TypeScript contract that subsequent stories build on. Runtime validation, publish paths, and the Open Library import are deliberately out of scope for this story (they are follow-ups that depend on this one landing).

The Architect will choose how to organize the types (file layout, envelope strategy, cross-reference representation) by surveying Tapestry prior art: `concept-graph` for the canonical DList kind 39998/39999 patterns, `feat/communities` for community-scoped item shapes, `feat/pubkey-tagging-target` for tag + pin shapes that are closest to genre tags and quality signals.

## User-facing description

As an engineer working on Unbnd, I want the DList event shapes for PRD §6.2 through §6.7 locked into TypeScript, so that every subsequent story — read paths, write paths, validation, indexing, search — builds against a shared, type-safe contract instead of inferring shape from ad-hoc fixture data.

End users (readers, curators, authors) will not see any new behaviour from this story. They will see the same screens render against tighter types underneath.

## Acceptance criteria

Testable from the outside.

- [ ] AC-1: TypeScript interfaces or types exist for each of the six PRD §6 shapes: book record (§6.2), genre (§6.3), rating (§6.4), genre tag (§6.5), quality signal (§6.6), shelf (§6.7). Each carries the fields named in the PRD for that section.
- [ ] AC-2: The DList event envelope (word-wrapper JSON, content tags, d-tag address as `kind:pubkey:d-tag`) is captured in a single reusable type or types, shared by all six shapes. No shape duplicates the envelope structure.
- [ ] AC-3: Cross-references between shapes are typed. A rating carries a typed reference to its book record. A genre tag carries typed references to its book and its genre. A shelf carries a typed list of book references. The reference type is the same in every case.
- [ ] AC-4: The three fixture files (`apps/web/src/data/book-fixtures.ts`, `apps/web/src/data/genre-fixtures.ts`, and the shelves block of `apps/web/src/data/profile-fixtures.ts`) import the new types and the existing fixture values pass typecheck against them. No fixture *values* change as part of this story — only the type annotations.
- [ ] AC-5: `pnpm -r typecheck` is clean after the refit.
- [ ] AC-6: Each of the five shipped screens renders without runtime errors against the refit fixtures: `/` (Home), `/book/orbital` (BookDetail), `/genre/literary-fiction` (GenreBrowse), `/submit` (Submit), `/profile/mira-calloway` (Profile). Verified by dev server screenshot match against the pre-refit baseline.
- [ ] AC-7: The schemas explicitly carry the parent concept header reference (z-tag pointer) at the type level, so that future read code can navigate from an item back to its concept header without re-inferring the relationship.

## DList shapes touched

- `kind 39998` concept headers for: `books`, `genres`, `book-ratings`, `book-genre-tags`, `book-quality-signals`, `book-shelves`.
- `kind 39999` items for: `bookSubmission`, `bookGenre`, `bookRating`, `bookGenreTag`, `bookQualitySignal`, `bookShelf`.

The Architect picks the exact handle pattern, the d-tag construction, and whether the per-shape word type discriminant (`bookSubmission`, `bookRating`, etc.) is part of the schema type or kept at the envelope.

## Out of scope

Anything in this list will be picked up by a follow-up story when its time comes:

- Runtime validators (JSON Schema, Zod, custom). No `validate(event)` function ships from this story.
- Publish path: signing the events, publishing to strfry, server-side or client-side. No code that produces a real DList event ships.
- Subscription / read path: pulling these events from strfry, decoding them, exposing them to the UI. No code that consumes a real DList event ships.
- ETL into Neo4j. No graph wiring.
- Meilisearch indexing. No search wiring.
- Open Library import pipeline. No catalog seed code.
- Custodial auth crypto (Argon2id, encrypted nostr keys, JWT). Separate story.
- Any new UI functionality (rating, tagging, shelf actions, AI-flag). Those buttons stay as placeholders until publish-path stories land.
- PRD §6.1 sketches a kind 39998 "DList Header" shape — if the Architect finds the PRD's header sketch incomplete and proposes amendments, those amendments need a re-scope conversation with the user before the ADR lands.

The §11.3 PRD "Out of Scope" list is undisturbed by this story. No Phase 2+ behaviour is implied or enabled.

## Open questions

These are decisions the Architect will resolve in the ADR. Listed here so the Architect knows the PO is aware of them:

- Whether to model `kind:pubkey:d-tag` addresses as branded string types, as a structured `{ kind, pubkey, dTag }` object, or as both with an explicit conversion. Tradeoff: round-trip ergonomics versus type safety at call sites.
- Whether the d-tag construction pattern (e.g., `rating--<book-slug>--<rater-pubkey-prefix>`) is captured at the type level via template literal types, or left as a runtime concern. Tradeoff: compile-time enforcement of the convention versus type complexity.
- Whether to add fields to the PRD's `word-wrapper` envelope beyond what §6.1 sketches, or stay strictly within it. If the Architect proposes additions, flag them; PRD amendment is a user decision.
- Whether the per-shape word type discriminant (`bookSubmission`, `bookRating`, etc.) lives in the envelope's `wordTypes` array (as PRD §6 examples show) or also surfaces as a TypeScript discriminator. Tradeoff: matching the PRD verbatim versus enabling exhaustive switch checks.
- Whether the librarian pubkey is referenced as a literal type, a config-injected string, or a runtime lookup. The CLAUDE.md house rule is runtime lookup; this story is type-only so the question is whether the type system encodes that rule. The Architect should call out how the runtime rule is upheld even though no runtime code is shipping yet.

## Linked artifacts

- ADR: `engineering-team/decisions/0001-dlist-schemas.md`
- Test plan: `engineering-team/stories/done/1-dlist-schemas.test-plan.md`
- Review: `engineering-team/reviews/1-dlist-schemas.md`
