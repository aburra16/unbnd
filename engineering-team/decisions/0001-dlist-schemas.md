# ADR 0001: DList schemas for the core data model

**Status:** Proposed
**Date:** 2026-05-28
**Story:** `engineering-team/stories/1-dlist-schemas.md`

## Context

Story 1 commits the TypeScript shapes for PRD §6.2 through §6.7 (book record, genre, rating, genre tag, quality signal, shelf). Every downstream story (publish path, read path, validation, search, GrapeRank wiring, Open Library import) depends on these shapes being settled. This ADR locks the design.

### Tapestry prior-art survey

Three branches consulted in the order required by `engineering-team/roles/architect.md`:

**`concept-graph` (BIBLE.md)** establishes the protocol baseline. Kind 39998 is the addressable ListHeader; kind 39999 is the addressable ListItem; preferred practice is to use kind 39999 for everything new. Every replaceable event has a stable address `<kind>:<pubkey>:<d-tag>` stored as the canonical UUID. Z-tags point items at their parent concept header: `["z", "39998:<pubkey>:<d-tag>"]`. Data lives in a `["json", "..."]` tag in word-wrapper format (`{word: {...}, <typeKey>: {...}}`). The `content` field is reserved for human-readable text. Source: `git show origin/concept-graph:BIBLE.md` §§5, 8, 9.

**`feat/communities` (COMMUNITY_RECORDS_DLIST.md)** shows the modern pattern: in addition to the json tag, **named event tags carry the load-bearing fields** (`name`, `description`, `relay`, `seed`, `weighting_model`, `endorsement_threshold`). The header declares `required` / `allowed` tags with human-readable descriptions. D-tag is deterministic so any client can locate a user's index from the author pubkey alone. Replaceability gives composite-key semantics for free: `(author, d-tag)` is the natural identity, re-publishing overwrites. Source: `git show origin/feat/communities:COMMUNITY_RECORDS_DLIST.md`.

**`feat/pubkey-tagging-target` (ADR 0001 + ADR 0009)** sharpens the pattern further. Polarity, target pubkey, and applied-tag references all live on named event tags (`p`, `e`, `z`, `polarity`); the JSON acts as a schema-validated mirror. D-tag construction is deterministic from inputs (`profile-tag-<tagSlug>-<targetPubkey.slice(0,8)>-<authorPubkey.slice(0,8)>`). Identity is `(author, target, tag)`; polarity is a forward-compatible numeric on `[-1, +1]` even though v1 emits only `-1` / `1`. Revocation is NIP-09 kind-5 deletion. Source: `git show origin/feat/pubkey-tagging-target:engineering-team/decisions/0001-profile-tag-architecture.md` and `0009-pin-a-tag.md`.

**The pattern Unbnd inherits:** kind 39999 for every shape; deterministic d-tags that encode the composite identity; named event tags for relay-filterable fields; JSON tag carries a word-wrapper that mirrors the named tags as schema-validated copies; z-tag points to a shared concept header per shape.

### Existing Unbnd code paths the schemas must serve

- `apps/web/src/data/book-fixtures.ts` (the Orbital record), `apps/web/src/data/genre-fixtures.ts` (literary fiction with 10 books and 7 subgenres), and the shelves block of `apps/web/src/data/profile-fixtures.ts` (Mira Calloway's four shelves) carry the values today. They are loose-typed; AC-4 requires that they typecheck against the new schemas without value changes.
- `apps/web/src/components/BookCard.tsx`, `BookHeader.tsx`, `RatingsBlock.tsx`, `ReviewsList.tsx`, `ProfileShelves.tsx` etc. consume those fixtures and must keep rendering after the refit (AC-6).

### CLAUDE.md invariants — what this design must honor

- **POV-first.** No precomputed "the book's genre" or "the book's rating" stored as a global field. Ratings and tags are per-author events; aggregation happens at read time per observer.
- **Decentralized-first.** Any signed event from any pubkey is acceptable at write time. No author gate, no admin role.
- **Filter at view time.** Composite POV-derived answers (trust-weighted rating, primary genre under house POV) are not types this story ships.
- **Librarian pubkey at runtime.** No literal librarian npub or hex in committed source. Build helpers take `librarianPubkey: HexPubkey` as a parameter; the runtime lookup happens at the call site.
- **PRD scope discipline.** No publish path, no read path, no validators, no ETL — those are downstream stories.

### Project constraints

- pnpm workspace with `apps/web` and `apps/api`. A new top-level workspace package is acceptable; `packages/*` is already declared in `pnpm-workspace.yaml`.
- Typecheck gate is `pnpm -r typecheck`. No test runner is wired yet across the workspace; this ADR introduces Vitest as the workspace test runner.
- TypeScript 5.5, strict mode on. Target ES2022, module ESNext, JSX react-jsx.

## Options considered

### Option A — Two-layer types (domain + wire event) with real conversion functions in this story

Each shape ships:
1. A **domain type** that the UI and fixtures consume (the rendering shape).
2. A **wire-event type** modelling the unsigned nostr event (kind, tags, content, payload).
3. **Conversion functions** between them (`toBookRatingEvent(r, opts)`, `fromBookRatingEvent(e)`). Conversion is pure data transformation; no signing or relay I/O involved.

Cross-references between shapes flow through the shared `DListAddress<K>` type. Each shape also exports a deterministic d-tag builder (`buildBookRatingDTag(bookSlug, raterPubkey)`).

The schemas live in a new workspace package `packages/schemas/` so `apps/web` and `apps/api` import from `@unbnd/schemas` without crossing app boundaries.

**Pros**
- The domain ↔ wire bridge is testable today. The Tester can exercise it without spinning up strfry.
- Downstream stories (publish, read, validators) inherit a finished translation layer.
- The fixtures stay readable and short — they don't have to encode the full event shape.
- AC-7 (typed z-tag pointer) is satisfied by the wire event type carrying `parentHeader: DListAddress<39998>`.

**Cons**
- More code in story 1 than a strict "types only" reading of the AC list would require.
- Adds about 600 lines of conversion logic across the six shapes; each pair (`to*Event` / `from*Event`) is small but non-trivial.

### Option B — Types only, conversion deferred to the publish-path story

Each shape ships:
1. The domain type and the wire-event type as before.
2. **No conversion functions.** Function signatures may be declared as type-only `type ToBookRatingEvent = (...) => BookRatingEvent` to document the contract.

The conversion implementations land in story 2 or whichever story first publishes a real event.

**Pros**
- Smaller diff in story 1. Faster cycle.
- The publish-path story can refine the conversion contract once it has a real implementation use case.

**Cons**
- The bridge between domain and wire is undocumented in working code. A subsequent ADR would have to settle d-tag construction, named-tag layout, JSON serialization — all of which this ADR has the prior-art context to decide cleanly *right now*.
- Tester has less to test in this story; we lose the chance to pin the contract end-to-end while the design is fresh.
- Downstream stories carry hidden coupling: the publish-path story implicitly relitigates these decisions whether or not the ADR captures them.

### (Option C — single layer, wire-only types, UI reads from event tags)

Skip the domain type entirely. The fixtures become arrays of wire events; the UI components read fields via `event.tags.find(t => t[0] === 'title')[1]`.

Listed for completeness — rejected because it forces every UI component to learn the wire format, and the existing five screens would need extensive rewrites for no user-visible benefit. The two-layer model decouples cleanly without cost.

## Decision

We chose **Option A**: two-layer types with real (unsigned) conversion functions, in a new `@unbnd/schemas` workspace package.

The d-tag construction for each shape follows the Tapestry tag-pinning convention (deterministic from inputs, eight-char pubkey prefix where author identity is part of the composite key). The named event tag set per shape is drawn from PRD §6's word-wrapper field list, with each load-bearing field surfaced as a relay-filterable tag in addition to its mirror in the JSON payload.

The librarian pubkey is never a literal in schemas/; every build helper takes it as a parameter.

Vitest is added as a workspace dev dependency. The Tester adds a workspace-level `vitest.config.ts` and the per-package configs needed.

## Consequences

**Enables**
- Every downstream story (publish, read, validators, Meilisearch indexing, GrapeRank wiring, Open Library import) builds against a finished contract.
- The Tester can write unit tests for the conversion layer in this cycle without needing strfry, Neo4j, or Meilisearch.
- The fixtures stay clean — they describe books, not events.

**Constrains / makes harder**
- The wire-event tag set per shape is now committed. Adding a new relay-filterable field to a shape post-launch requires an ADR amendment (acceptable; this is what ADRs are for).
- D-tag construction conventions are locked. Changing them later means breaking event addresses, which means publishing replacement events under new d-tags — a real migration. Acceptable: the conventions follow Tapestry's worked patterns, so deviation pressure is low.

**Affects existing fixtures?** Yes. `apps/web/src/data/book-fixtures.ts`, `genre-fixtures.ts`, and the shelves block of `profile-fixtures.ts` are re-typed against the new domain types. No value changes; type annotations only.

**New dependency?** Yes:
- `vitest` (workspace dev dep) — authorized by this ADR as the workspace test runner.
- `@testing-library/react` (web dev dep) — authorized for component tests in the Tester phase, used minimally in this story.

**PRD section change required?** No. PRD §6 is consistent with this design.

## Implementation notes

### Package layout

```
packages/schemas/
├── package.json              "name": "@unbnd/schemas", private, type: "module"
├── tsconfig.json             extends workspace root; outDir dist, declaration true
├── src/
│   ├── index.ts              re-exports everything
│   ├── envelope.ts           DListAddress<K>, HexPubkey, EventId, WordEnvelope<T>,
│   │                         UnsignedDListEvent<K, T>, parseAddress, formatAddress,
│   │                         asHexPubkey, asEventId
│   ├── concept-headers.ts    BOOK_RECORDS_HEADER_SLUG = "books" et al.; build*HeaderAddress(librarianPubkey) helpers
│   ├── BookRecord.ts         BookRecord, BookRecordEvent, buildBookRecordDTag,
│   │                         toBookRecordEvent, fromBookRecordEvent
│   ├── BookGenre.ts
│   ├── BookRating.ts
│   ├── BookGenreTag.ts
│   ├── BookQualitySignal.ts
│   └── BookShelf.ts
└── test/                     vitest specs, one per shape + envelope
```

### Envelope (`envelope.ts`)

```ts
export type HexPubkey = string & { readonly __brand: "HexPubkey" };
export type EventId = string & { readonly __brand: "EventId" };

export function asHexPubkey(s: string): HexPubkey;   // validates 64-char hex; throws otherwise
export function asEventId(s: string): EventId;        // validates 64-char hex; throws otherwise

export type DListAddress<K extends number = number> = {
  readonly kind: K;
  readonly pubkey: HexPubkey;
  readonly dTag: string;
};

export function formatAddress<K extends number>(a: DListAddress<K>): string;
export function parseAddress(s: string): DListAddress;  // narrows kind via caller's expectation
export function parseAddressOfKind<K extends number>(s: string, kind: K): DListAddress<K>;

export type WordEnvelope<T extends string> = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", T, ...string[]];
  };
};

export type UnsignedDListEvent<
  K extends number,
  T extends string,
  P = unknown,
> = {
  readonly kind: K;
  readonly tags: ReadonlyArray<readonly [string, ...string[]]>;
  readonly content: string;
  readonly payload: WordEnvelope<T> & { readonly [Key in T]: P };
  readonly parentHeader: DListAddress<39998>;
};
```

`HexPubkey` and `EventId` are branded strings — at boundaries, callers cast via `asHexPubkey('...')` which validates format and throws on bad input. Internal code passes them around without re-validating.

`UnsignedDListEvent.tags` uses a `readonly [string, ...string[]]` tuple so the tag name is always the first element. `parentHeader` is denormalized onto the event type so the z-tag's structured form is available without re-parsing the tag.

**Envelope refinement during Test Design phase (2026-05-28):** the third type parameter `P = unknown` was added so each per-shape event type can refine the inner payload field's shape without losing the envelope's generic structure. Each shape file passes its payload's inner type as the third parameter (e.g., `BookRatingEvent = UnsignedDListEvent<39999, "bookRating", BookRatingPayload["bookRating"]>`). This keeps the envelope structurally shared while restoring strong typing at consumer call sites. The change is backward compatible — code that constructs `UnsignedDListEvent<K, T>` without the third parameter still typechecks against `unknown`.

### Concept headers (`concept-headers.ts`)

Six named slug constants and six matching `buildXHeaderAddress(librarianPubkey: HexPubkey)` helpers:

```ts
export const BOOK_RECORDS_HEADER_SLUG = "books";
export const BOOK_GENRES_HEADER_SLUG = "genres";
export const BOOK_RATINGS_HEADER_SLUG = "book-ratings";
export const BOOK_GENRE_TAGS_HEADER_SLUG = "book-genre-tags";
export const BOOK_QUALITY_SIGNALS_HEADER_SLUG = "book-quality-signals";
export const BOOK_SHELVES_HEADER_SLUG = "book-shelves";

export function buildBookRecordsHeaderAddress(librarianPubkey: HexPubkey): DListAddress<39998>;
// ... five more
```

The librarian pubkey is a parameter, never a constant in this file. The CLAUDE.md runtime-lookup rule is upheld: any caller that needs the address resolves the librarian pubkey from config first.

### Per-shape design

#### BookRecord (§6.2)

- **Parent header:** `39998:<librarian>:books`
- **D-tag:** `<bookSlug>` (just the slug; the librarian publishes the catalog seed, so the composite key reduces to slug)
- **D-tag builder:** `buildBookRecordDTag(slug: string): string` (identity, but explicit for symmetry with other shapes)
- **Domain type fields:** mirrors the PRD §6.2 field table. Optional fields are `?:`. `format` is the union `"reference" | "ebook" | "both"`. `source` is `"openlibrary" | "author" | "community"`.
- **Wire event named tags:**
  - `["d", dTag]` — the slug
  - `["z", formatAddress(parentHeader)]`
  - `["t", slug]` — relay-filterable book identity
  - `["title", title]`
  - `["author", authorName]`
  - `["p", authorPubkey]` — only when `authorPubkey` is set (claimed books)
  - `["isbn", isbn13]` — only when set
  - `["isbn10", isbn10]` — only when set
  - `["lang", language]`
  - `["year", String(publishYear)]` — only when set
  - `["cover", coverUrl]` — only when set
  - `["read-at", purchaseUrl]` — neutral verb avoiding the commerce framing
- **Word-wrapper payload key:** `bookSubmission`, matching PRD §6.2 verbatim
- **Content field:** the blurb, if present; empty string otherwise

#### BookGenre (§6.3)

- **Parent header:** `39998:<librarian>:genres`
- **D-tag:** `<genreSlug>`
- **Domain type:** `{ slug, name, description, parentGenreSlug? }`
- **Wire event named tags:**
  - `["d", slug]`, `["z", formatAddress(parentHeader)]`, `["t", slug]`, `["name", name]`
  - `["parent-genre", parentGenreSlug]` — only when set
- **Word-wrapper payload key:** `bookGenre`

#### BookRating (§6.4)

- **Parent header:** `39998:<librarian>:book-ratings`
- **D-tag:** `rating--<bookSlug>--<raterPubkey.slice(0,8)>`
- **D-tag builder:** `buildBookRatingDTag(bookSlug, raterPubkey)` — pubkey prefix encodes the composite identity (rater, book) and gives replaceable-overwrite semantics on re-rating
- **Domain type:** `{ bookSlug, bookAddress: DListAddress<39999>, score: 1 | 2 | 3 | 4 | 5, reviewText?, reviewDate }`. Score is a literal union; rejected `number` because the relay-filterable bucket math (`#score`) wants integers. `reviewDate` is ISO-8601 date (`YYYY-MM-DD`).
- **Wire event named tags:**
  - `["d", dTag]`, `["z", formatAddress(parentHeader)]`
  - `["t", bookSlug]` — relay-filterable: "all ratings for this book"
  - `["a", formatAddress(bookAddress)]` — typed reference to the book record event
  - `["score", String(score)]` — relay-filterable: "all 5-star ratings"
  - `["review-date", reviewDate]`
- **Word-wrapper payload key:** `bookRating`. The payload mirrors `bookSlug`, `bookAtag`, `score`, `reviewText`, `reviewDate` per PRD §6.4
- **Content field:** the review text if present; empty otherwise

#### BookGenreTag (§6.5)

- **Parent header:** `39998:<librarian>:book-genre-tags`
- **D-tag:** `genre-tag--<bookSlug>--<genreSlug>--<taggerPubkey.slice(0,8)>`
- **Domain type:** `{ bookSlug, bookAddress, genreSlug, genreAddress, taggerPubkey }`
- **Wire event named tags:**
  - `["d", dTag]`, `["z", formatAddress(parentHeader)]`
  - `["t", bookSlug]`, `["t", genreSlug]` — two `t` tags, both relay-filterable
  - `["a", formatAddress(bookAddress)]`, `["a", formatAddress(genreAddress)]` — two typed references
- **Word-wrapper payload key:** `bookGenreTag`
- **Content field:** empty string

#### BookQualitySignal (§6.6)

- **Parent header:** `39998:<librarian>:book-quality-signals`
- **D-tag:** `quality-signal--<bookSlug>--<signalSlug>--<taggerPubkey.slice(0,8)>`
- **Domain type:** `{ bookSlug, bookAddress, signalSlug, taggerPubkey }`. `signalSlug` is an open string at the schema layer; the application taxonomy ("ai-generated", "well-edited", "original-voice", "needs-copy-edit") is enforced by UI choice, not by the type system.
- **Wire event named tags:** mirror BookGenreTag with `signalSlug` in place of `genreSlug` and no `genreAddress` (signals are application-defined slugs, not addressable concept items in MVP)
- **Word-wrapper payload key:** `bookQualitySignal`

#### BookShelf (§6.7)

- **Parent header:** `39998:<librarian>:book-shelves`
- **D-tag:** `shelf--<userPubkey.slice(0,8)>--<shelfSlug>`
- **Domain type:** `{ slug, name, visibility: "public" | "private", bookSlugs: readonly string[], bookAddresses: readonly DListAddress<39999>[], userPubkey }`. Both `bookSlugs` (for UI rendering) and `bookAddresses` (for navigation back to the record) are carried; they are parallel arrays (same length, same order). The Implementer adds a runtime assertion to keep them in sync.
- **Wire event named tags:**
  - `["d", dTag]`, `["z", formatAddress(parentHeader)]`
  - `["t", shelfSlug]`, `["name", name]`, `["visibility", visibility]`
  - one `["a", formatAddress(addr)]` per book on the shelf
- **Word-wrapper payload key:** `bookShelf`

### Fixture refit

- `apps/web/src/data/book-fixtures.ts` — the `BookRecord` from `Book` is the existing rendering shape. Re-type it against the new `BookRecord` domain type. Add `parentHeader` field — pulled from `buildBookRecordsHeaderAddress(LIBRARIAN_PLACEHOLDER_PUBKEY)`. Constant lives in the fixture file as a `// fixture-only placeholder` and is a clearly synthetic hex string. Real librarian resolution stays a runtime concern.
- `apps/web/src/data/genre-fixtures.ts` — `Genre` and `GenreRecord` re-type against `BookGenre` (plus the genre-page-specific extensions like `topCurators`, which stay in the route-level type, not the schema).
- `apps/web/src/data/profile-fixtures.ts` — the `ProfileShelfFixture` block re-types against `BookShelf`. The fixture's `covers` are a rendering convenience; they map to `bookSlugs` + `bookAddresses` plus a `coverInk`-style augmentation that stays at the fixture layer, not the schema.

The fixture-only librarian placeholder is a single exported constant:

```ts
// apps/web/src/data/fixture-constants.ts
export const FIXTURE_LIBRARIAN_PUBKEY = asHexPubkey(
  "0".repeat(63) + "1"  // synthetic; deployments resolve at runtime
);
```

### Vitest introduction

Workspace-level:
- `pnpm add -wD vitest @vitest/coverage-v8`
- Root `vitest.config.ts` with `projects` pointing at `packages/*/vitest.config.ts`
- Each package adds a `test` script and its own `vitest.config.ts`
- `packages/schemas/test/` carries: `envelope.test.ts`, six shape `*.test.ts` files
- Tests cover: address parse/format round-trip; d-tag builder determinism per shape; conversion `to*Event` produces the expected tag set and json payload for a sample domain object; conversion `from*Event` reverses cleanly; type-level discriminator (`wordTypes` array literal) narrows correctly.

The web app does not need Vitest in this story (no component tests yet); the Tester ships only the schemas package tests.

### Order of operations for the Implementer

1. Create the `packages/schemas/` package skeleton (package.json, tsconfig, src/, test/).
2. Update `pnpm-workspace.yaml` if needed (it already includes `packages/*`).
3. Write `envelope.ts` and verify with a tiny smoke test.
4. Write `concept-headers.ts`.
5. Write the six shape files in order: `BookRecord`, `BookGenre`, `BookRating`, `BookGenreTag`, `BookQualitySignal`, `BookShelf`. Each ships its domain type, wire-event type, d-tag builder, and the two conversion functions.
6. Write `index.ts` to re-export everything.
7. Add `@unbnd/schemas` as a dependency in `apps/web/package.json`.
8. Refit the three fixture files.
9. Run `pnpm -r typecheck`. Fix any drift.
10. Hand off to the Tester for the Vitest setup and the unit tests.

## Deferred concerns — captured here so the next story finds them

**Npub display at the UI boundary.** `HexPubkey` is the internal type. Anywhere a pubkey is rendered to a human (Settings → Advanced, fallback display names, copy-to-clipboard flows), it must convert to npub (`npub1...`, bech32-encoded). The format/parse helpers — `formatNpub(pubkey: HexPubkey): string` and `parseNpub(npub: string): HexPubkey` — belong in `packages/schemas/src/envelope.ts` alongside `asHexPubkey`. They are not implemented in this story; the first user-facing pubkey display story adds them. Adding the dependency for bech32 encoding (`@scure/base` or `nostr-tools`) will be authorized in that story's ADR. See `memory/feedback_unbnd_copy_and_visual.md` "User-facing pubkey display" section.

**Unbnd is not a nostr app at the surface level.** Unbnd uses nostr as infrastructure, not as branding. The vocabulary that reaches end users is "ratings, reviews, curators, tags, shelves, trust" — not "events, kinds, relays, DLists, npubs." The word "nostr" is allowed in the sovereignty notes, the NIP-07 auth flow, the export-key path, and a future Settings → Advanced surface; nowhere else. See `memory/feedback_unbnd_copy_and_visual.md` "Bridging principle" section. This rule does not affect any code in story 1 (the schemas are internal types, not surfaced as labels), but it affects every subsequent story that adds copy referencing identity or trust.

## Out of scope

- Runtime validators (JSON Schema, Zod, custom). The branded types catch some classes of error at compile time; runtime validation at the strfry boundary is a separate ADR.
- Signing. The conversion functions produce `UnsignedDListEvent`s — no `pubkey`, no `id`, no `sig`, no `created_at` on the wire-event type.
- Strfry publish or subscribe paths.
- Neo4j ETL or Meilisearch indexing.
- Open Library import pipeline.
- Custodial auth crypto.
- Any change to UI behaviour beyond keeping the existing screens rendering identically against the new types.
- Trusted List publication for shelves or curated lists (Tapestry's TL pattern; deferred until we have a use case).
- Subgenre containment as an addressable relationship beyond the string `parent-genre` field on `BookGenre`. A graph-level subgenre tree is a future concern when search and browse need it.
