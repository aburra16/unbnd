# ADR 0018: Shelves as membership assertions, with a denormalized shelf name

**Status:** Proposed
**Date:** 2026-05-30
**Story:** `engineering-team/stories/done/18-shelves.md`

## Context

Story 18 adds a usable vertical slice of shelves: a signed-in reader adds a book
to a shelf from the book-detail page, removes it, and sees their own shelves on
`/profile/me`. The data model is **locked by the story**: a shelf membership is
one small kind-39999 event per (user, book, shelf), mirroring `BookTagAssertion`'s
apply/retract polarity — not a single big list event, not NIP-51. This replaces
the current single-big-list `packages/schemas/src/BookShelf.ts`.

The story explicitly leaves **two decisions to the Architect** (story Open
Questions 1 & 2), plus the route shapes, the slug-normalization function, the
polarity vocabulary, and the AC-5 move sequencing.

Constraints pulled from the story, PRD, and CLAUDE.md:

- **PRD §5.6** — default shelves "Want to Read," "Reading," "Read" (fixed
  constants); custom named shelves; public browsability (browse is out of scope
  here, but the data must support it later).
- **PRD §6.7 / story "DList shapes touched"** — shelves are kind-39999 items
  z-tagged to a `book-shelves` concept header (kind-39998), addressed via
  `buildBookShelvesHeaderAddress(librarianPubkey)`, slug `book-shelves`.
- **Lane 1 / trust-independent** — no GrapeRank, no aggregation across users, no
  fabricated counts. A shelf is a fact the owner asserts about their own reading.
  This sidesteps the POV-first invariant: we only ever read **one author's own**
  assertions (`authors: [user.pubkeyHex]`), so there is no cross-user trust
  weighting to compute. State it explicitly so a later "browse others' shelves"
  story (Story 19) knows it inherits the POV-first rules the moment it reads more
  than one author.
- **Public-only.** No visibility field, no NIP-44, no "private" label.
- House rules: Librarian pubkey resolved at runtime (never a literal); npub for
  display / hex internal; no hand-rolled crypto (three-tier signing reuse); no
  new icon library or hex literal outside `tokens.css`; copy reviewed against
  `memory/feedback_unbnd_copy_and_visual.md`; honest empty states.

### Prior art being mirrored (cited by file)

- **Assertion shape:** `packages/schemas/src/BookTagAssertion.ts` — kind-39999,
  deterministic d-tag `tagassert--<bookSlug>--<tagSlug>--<asserter8>`, `z`-tag to
  the concept header, `a`-tag to the book address, `polarity` tag (`1`/`-1`),
  `p` author tag, `["json", payload]` word-wrapper. `to*Event`/`from*Event` round
  trip. This is the baseline for the new shelf assertion.
- **Latest-wins resolution:** `apps/api/src/tags/aggregate.ts` —
  `aggregateBookTags` dedups by `(author, tagSlug)` keeping the highest
  `created_at`, then counts polarity. The shelf read uses the identical
  pattern, keyed on `(book, shelf)` for a single author.
- **Write path / three-tier signing:** `apps/api/src/routes/tags.ts` +
  `apps/api/src/tags/template.ts` — sovereign posts `{event}` validated by
  `validateSignedEvent`; custodial posts the intent and the server signs via
  `deps.custodialSign(sessionIdHex, template)` (ADR 0006), returning
  `reauth_required` when the live key is gone; anonymous → 401. Dual-publish to
  dcosl is automatic because shelves reuse the same wrapped `publish` dep (ADR
  0011 wraps the dep used by the community-write routers).
- **Read-own pattern:** `apps/api/src/routes/submissions.ts` `GET
  /api/submissions/mine` — `deps.query({ kinds, "#z": [concept], authors:
  [user.pubkeyHex] })`. The own-shelves read mirrors this exactly.
- **Web control:** `apps/web/src/components/RatingControl.tsx` /
  `TagControl.tsx` — tier branch (`session.user.email === null` ⇒ sovereign,
  NIP-07 `signEvent`; else custodial), `idle/submitting/done/error` state,
  signed-out sign-in prompt, `<select>`/button form, no icon library.
- **Profile surface:** `apps/web/src/routes/ProfileMe.tsx` — honest empty state
  with a real read; counts are real (`0` is shown literally today, no
  placeholders).

The story also notes **NO WIREFRAMES EXIST** for shelves. Both surfaces are
*derived* from the existing component system. This is flagged as an assumption
the user may override with a wireframe before implementation.

## Options considered

### Decision 1 — the membership-assertion event shape

#### Option A — Mirror `BookTagAssertion` exactly, `shelf` slug replaces `tag` slug (chosen)

A kind-39999 event z-tagged to the `book-shelves` header. Identity d-tag
`shelf--<bookSlug>--<shelfSlug>--<owner8>` (composite (user, book, shelf), so a
book can sit on several shelves and each is its own replaceable event).
Polarity reuses the existing `Polarity = 1 | -1` type: **`1` = on the shelf
(apply), `-1` = removed (retract)**. Tags: `["d", dtag]`, `["z", header]`,
`["a", bookAddr]`, `["t", shelfSlug]`, `["polarity", "1"|"-1"]`, `["p", owner]`,
and — for custom shelves — `["name", displayName]`. Word-wrapper JSON carries
`{ bookSlug, bookAtag, shelfSlug, shelfName, polarity }`.

- **Pros:** Identical to the locked baseline; `aggregate.ts`'s latest-wins
  dedup ports almost verbatim; relay filters (`#z`, `#a`, `authors`, `#t`) all
  work unchanged; the Implementer has a working template to copy. Re-adding the
  same book is a fresh `apply` over the same d-tag → replaceable event overwrites
  → latest-wins → AC-3 idempotency falls out for free.
- **Cons:** Polarity `1/-1` reads slightly less literally than `apply/retract`
  string terms for a membership concept. Mitigated by naming the schema constants
  `SHELF_ON = 1` / `SHELF_OFF = -1` and exposing string-named builder args.

#### Option B — New boolean `["present","true"|"false"]` tag instead of polarity

Same event otherwise, but a bespoke membership boolean rather than the shared
`Polarity` type.

- **Pros:** Reads literally for membership.
- **Cons:** Diverges from the locked baseline for no real gain; introduces a
  second "this thing is/ isn't true" encoding alongside polarity; the aggregate
  helper can't be shared. Rejected — the story says *mirror* `BookTagAssertion`.

### Decision 2 — where a custom shelf's display name lives

#### Option A — Denormalize the name onto every membership assertion (chosen)

The display name ("Beach Reads") rides on each membership event as a `["name",
…]` tag + `shelfName` in the payload. The read groups by `shelfSlug` and takes
the name from the latest (highest `created_at`) **apply** in the group. Default
shelves carry no name on the wire — their names are fixed constants resolved at
render time from the slug.

- **Pros:** One event shape, one write path, zero coordination. AC-4 ("apply
  carries a slug derived from the name and the human display name") is satisfied
  by a single event. No second kind/route to build. Matches how
  `BookTagAssertion` already denormalizes `bookSlug`/`tagSlug` onto each event.
- **Cons:** **Empty-shelf edge:** with assertions only, retracting the last book
  would leave the shelf with no surviving `apply`, so its name vanishes and the
  shelf disappears. **This is the correct behavior for this slice** and is
  consistent with honest empty states: in Story 18 there is no UI to create a
  named-but-empty shelf — a custom shelf is *named at the moment a book is added
  to it* (AC-4). A shelf with no books is not represented and not shown; it is
  not an orphan, it simply ceases to exist once empty. Persisting a named empty
  shelf requires the deferred custom-shelf management surface (Story 19), which
  is exactly where Option B becomes worthwhile. The slug is the stable identity;
  if the user re-adds a book under the same name, the same slug regenerates and
  the shelf reappears with its history intact. Minor: the name could differ
  across a shelf's assertions if the user typed it inconsistently — we resolve
  ties deterministically (latest apply wins) and slug-normalize so they group.

#### Option B — A small per-(user, shelf) "shelf header" event

A second kind-39999 event, d-tag `shelfdef--<owner8>--<shelfSlug>`, holding just
`{ slug, name }`; membership assertions reference it by slug.

- **Pros:** A named shelf survives going empty (the header persists); rename is a
  single event; the canonical place for future per-shelf metadata
  (description, cover, ordering).
- **Cons:** Two event kinds, two write paths, an ordering/consistency question
  (membership can arrive before its header), and a read that must join two
  queries — all to support a *named-empty* shelf and *rename*, both of which are
  explicitly **out of scope** for this slice. Premature. Rejected for Story 18;
  recommended as the foundation for Story 19's management surface.

## Decision

**Decision 1 → Option A.** The shelf-membership event mirrors `BookTagAssertion`
1:1: kind-39999, z-tag to `book-shelves`, `a`-tag to the book, shared `Polarity`
(`1` = on shelf / `-1` = removed), `t`-tag = shelf slug, `p`-tag = owner. Per
(user, book, shelf) identity via a deterministic d-tag; replaceable, latest-wins.

**Decision 2 → Option A.** The custom shelf's display name is **denormalized onto
each membership assertion** (a `["name", …]` tag + `shelfName` payload field),
resolved on read from the latest surviving apply in the group. Default-shelf
names are fixed constants and are never written to the wire. A custom shelf
exists only while it has at least one book on it; an emptied shelf is simply not
represented — which is correct for this public, assertion-only, no-management
slice. Named-empty persistence and rename are explicitly deferred to Story 19,
which is where Option B's shelf-header event should be introduced.

Both choices favor the simplest design consistent with the locked baseline and
the in-scope ACs, and avoid building infrastructure (a second event kind) whose
only consumers are out-of-scope features.

## Consequences

- **Enables:** the full vertical slice (AC-1…AC-9) on one event shape and one
  write path; AC-3 idempotency and AC-5 move fall out of replaceable-event
  latest-wins; the data already supports a future "browse others' shelves" read
  (just drop the `authors:` filter and add POV rules).
- **Constrains:** no named-empty custom shelf and no rename until Story 19; the
  display name can drift across a shelf's events if typed inconsistently
  (resolved latest-wins + slug grouping).
- **Follow-ups / debt:** Story 19 should add the `shelfdef` header event (Option
  B) to persist names independently and support rename/delete + browse.
- **Affects existing fixtures?** Possibly. `BookShelf.ts` is being reworked, so
  any unit fixture exercising the old list-model `toBookShelfEvent` /
  `fromBookShelfEvent` / `BookShelfPayload.books[]` must be updated. The
  Implementer should grep `packages/schemas` test fixtures and any
  `bookShelf`-shaped fixture under `apps/web/src` after the rework. No
  book/genre/rating fixtures change.
- **New dependency?** No. Reuses `@unbnd/schemas`, Applesauce/NIP-07 (sovereign),
  the ADR 0006 custodial wrap, nostr-tools nip19 for npub display, and the ADR
  0011 dual-publish dep wrapper.
- **PRD section change required?** No. Consistent with PRD §5.6 and §6.7. (PRD
  §6.7 describes shelves as DList items under the shelves concept; the
  assertion-per-membership refinement is within that and was ratified by the
  story's locked decision.)

## Implementation notes

Concrete targets. The Implementer writes the code; this is the shape.

### `packages/schemas/src/BookShelf.ts` (reworked — replaces the list model)

Replace the single-list `BookShelf`/`BookShelfPayload`/`toBookShelfEvent`
entirely with the assertion model. Keep `BOOK_SHELF_KIND = 39999`. Remove
`ShelfVisibility` and the `visibility` field (public-only). Add:

- **Default-shelf constants** (fixed names, PRD §5.6):
  ```
  export const DEFAULT_SHELVES = [
    { slug: "want-to-read", name: "Want to Read" },
    { slug: "reading",      name: "Reading" },
    { slug: "read",         name: "Read" },
  ] as const;
  export const DEFAULT_SHELF_SLUGS = ["want-to-read", "reading", "read"] as const;
  export type DefaultShelfSlug = (typeof DEFAULT_SHELF_SLUGS)[number];
  ```
- **Polarity reuse:** import `Polarity` from `./envelope`-adjacent `BookTagAssertion`
  (or re-export). Add readable aliases `export const SHELF_ON: Polarity = 1;`
  `export const SHELF_OFF: Polarity = -1;`.
- **Slug normalization:** `export function toShelfSlug(name: string): string` —
  lowercase, trim, collapse non-alphanumerics to single hyphens, strip leading/
  trailing hyphens. Must be deterministic so the same display name regenerates
  the same slug (so re-adding to "Beach Reads" hits the same shelf). Reject empty
  result. (Default slugs are passed through unchanged; a custom name that
  normalizes to a reserved default slug should be disambiguated — see API notes.)
- **Domain type:**
  ```
  export type BookShelfAssertion = {
    bookSlug: string;
    bookAddress: DListAddress<39999>;
    shelfSlug: string;
    shelfName?: string;        // omitted for default shelves
    polarity: Polarity;        // SHELF_ON | SHELF_OFF
    ownerPubkey: HexPubkey;
    parentHeader: DListAddress<39998>;
  };
  ```
- **D-tag builder** (identity = user, book, shelf):
  ```
  export function buildBookShelfDTag(owner: HexPubkey, bookSlug: string, shelfSlug: string): string
  // `shelf--${bookSlug}--${shelfSlug}--${pubkeyPrefix(owner)}`
  ```
  (Note: this **replaces** the old `buildBookShelfDTag(owner, shelfSlug)`
  signature — the old one keyed (user, shelf); the new one keys (user, book,
  shelf). Grep callers.)
- **Builders** `toShelfAssertionEvent(a): BookShelfAssertionEvent` and
  `fromShelfAssertionEvent(event): BookShelfAssertion`, mirroring
  `toBookTagAssertionEvent` / `fromBookTagAssertionEvent`. Tags in order:
  `["d", dtag]`, `["z", header]`, `["a", bookAtag]`, `["t", shelfSlug]`,
  `["polarity", String(polarity)]`, `["p", owner]`, and — only when
  `shelfName` is set — `["name", shelfName]`. Payload:
  ```
  { word: { slug: dtag, name: `shelf: ${bookSlug} → ${shelfSlug}`, title: …,
            wordTypes: ["word", "bookShelfAssertion"] },
    bookShelfAssertion: { bookSlug, bookAtag, shelfSlug, shelfName?, polarity } }
  ```
  Rename `BOOK_SHELF_WORD_TYPE` to `"bookShelfAssertion"`. Update
  `packages/schemas/src/index.ts` (already `export *`s `BookShelf`).

### `apps/api/src/shelves/` (new — mirror `apps/api/src/tags/`)

- **`template.ts`** — `buildShelfTemplate(config, input, createdAt)` mirroring
  `apps/api/src/tags/template.ts`. Input `{ ownerPubkey, bookSlug, shelfSlug,
  shelfName?, polarity }`. Validate polarity ∈ {1,-1}; validate `shelfSlug`
  non-empty; require `config.librarianPubkey` (else `feature_unavailable`/503).
  Build `BookShelfAssertion` with `bookAddress = {39999, librarian, bookSlug}`
  and `parentHeader = buildBookShelvesHeaderAddress(librarian)`; return
  `toWireTemplate(toShelfAssertionEvent(a), createdAt)`. Define a `ShelfError`
  class with codes `feature_unavailable | invalid_polarity | invalid_shelf`.
- **`aggregate.ts`** — `groupOwnShelves(events): Shelf[]` mirroring
  `aggregateBookTags`'s latest-wins. Dedup by `(bookSlug, shelfSlug)` keeping
  highest `created_at`; drop entries whose surviving polarity is `SHELF_OFF`;
  group the survivors by `shelfSlug`; per shelf resolve the display name (default
  slug → constant from `DEFAULT_SHELVES`; custom → `shelfName` from the latest
  surviving apply in the group). Return
  `{ slug, name, books: [{ bookSlug, bookAtag }], count }[]`. Empty input →
  `[]` (honest empty state). Sort: the three defaults first in PRD order, then
  custom shelves alphabetically by name.

### `apps/api/src/routes/shelves.ts` (new — mirror `routes/tags.ts`)

DI deps identical to `TagsDeps` (`config`, `sessionUser`, `publish`, `query`,
`custodialSign?`). Wire into the app where `buildTagsRouter` is wired, passing
the **same wrapped `publish`** so ADR 0011 dual-publish applies. Routes:

- `POST /api/shelves/template` — auth-gate (401 `no_session`); body `{ bookSlug,
  shelfSlug, shelfName?, polarity }`; return `{ template }` from
  `buildShelfTemplate`. (Sovereign client signs this.)
- `POST /api/shelves` — the add/remove write. Tier branch exactly like
  `routes/tags.ts`:
  - **custodial:** build template server-side, `custodialSign` → 401
    `reauth_required` if null → `publish` → 502 on failure → `{ ok: true }`.
  - **sovereign:** `validateSignedEvent(event, user.pubkeyHex, 39999)` → 403
    `pubkey_mismatch` / 400 → `publish` → 502 → `{ ok: true }`.
  - **anonymous:** 401, no publish.
  One `polarity` field drives both add (`1`) and remove (`-1`).
- `POST /api/shelves/move` — **AC-5 mutual exclusivity**, sequenced as
  **retract-old + apply-new across two assertions** (the story mandates a move =
  retract + apply, never a list rewrite). Body `{ bookSlug, fromShelfSlug,
  toShelfSlug }` where both are **default** slugs. Server builds two templates
  and, for the active tier, signs+publishes the retract (`fromShelfSlug`,
  polarity `-1`) **then** the apply (`toShelfSlug`, polarity `1`). Ordering:
  retract first so a mid-failure leaves the book *off* both rather than on both
  (safer for the "exactly one default" invariant); the route returns 502 if
  either publish fails and reports which step. For **sovereign** sessions the
  client must sign two templates — so this endpoint returns the two templates
  for the client to sign and re-POST, OR the web layer simply calls `POST
  /api/shelves` twice (retract then apply) using the existing single-write
  endpoint. **Chosen: no dedicated move endpoint.** The web layer sequences two
  `POST /api/shelves` calls (retract old default, then apply new default); the
  *mutual-exclusivity-is-only-among-the-three-defaults* rule lives in the web
  control + is documented here. This keeps the API to one write verb and matches
  "move = two assertions." (Custom shelves never trigger a move — they impose no
  exclusivity, AC-5.)
- `GET /api/shelves/mine` — auth-gate; mirror `submissions/mine`:
  `deps.query({ kinds:[39999], "#z":[shelvesConcept], authors:[user.pubkeyHex] })`
  then `groupOwnShelves(events)`; return `{ shelves }`. Empty → `{ shelves: [] }`.
  `shelvesConcept()` = `39998:${lib()}:book-shelves` resolved at runtime;
  `feature_unavailable`/503 when no librarian pubkey.

Note: there is intentionally **no public `GET /api/shelves/:user`** here — browse
is Story 19. The `/mine` read is single-author, so POV-first does not apply.

### `apps/web` — client + surfaces

- **`apps/web/src/lib/api.ts`** — add a `shelves` block mirroring `tags`:
  `mine()` → `GET /api/shelves/mine`; `template(input)` → `POST
  /api/shelves/template`; `submit(event)` and `submitCustodial(input)` → `POST
  /api/shelves`. Add result types `Shelf`, `ShelfBook`.
- **`apps/web/src/components/ShelfControl.tsx`** (new) — derived from
  `RatingControl`/`TagControl`. Props `{ bookSlug }`. States:
  - **signed-out:** sign-in prompt (`<Link to="/auth">Sign in</Link> to add this
    book to a shelf.`), mirroring the `rate-gate`/`tagc-gate` copy.
  - **signed-in, loaded:** a `<select>` of the three default shelves + any of the
    user's existing custom shelves (read from `api.shelves.mine()` filtered to
    this book to show current membership), plus a "New shelf…" option revealing a
    text input for a custom name. An "Add" button (and, when the book is already
    on a shelf, a "Remove" button) — same `idle/submitting/done/error` machine
    and tier branch (`isSovereign = session.user.email === null`) as
    `TagControl`. Adding to a *default* shelf when the book is on another default
    sequences remove-old + add-new (AC-5). No icon library; reuse the existing
    `Pill`/`GenrePill` for showing current shelf chips.
  - **empty/error:** honest text, no fabricated state.
  Copy reviewed against `memory/feedback_unbnd_copy_and_visual.md` (no em dashes,
  no "designed to," no exclamation CTAs, no emoji). Default shelf labels are the
  PRD constants.
- **`apps/web/src/routes/BookDetail.tsx`** — render `<ShelfControl
  bookSlug={slug} />` alongside `RatingControl`/`TagControl` (same wiring point).
- **`apps/web/src/routes/ProfileMe.tsx`** — add a "Your shelves" section reading
  `api.shelves.mine()` in the existing `useEffect` pattern (next to the
  submissions read). Render each shelf as a heading (name) + real count + the
  contained books using the existing BookCard/grid components. Empty → honest
  empty state ("You have not added any books to a shelf yet.") mirroring
  `me-empty`. Real per-shelf counts only; no placeholders. Optionally update the
  `ProfileStats` "Books rated"-style row to include a real "On shelves" count
  from the same read (keep `0` literal if none — never fabricate).

### Styling / tokens

New `ShelfControl.css` and any profile-shelf styles use only existing brand
tokens from `apps/web/src/styles/tokens.css` (the same vars `RatingControl.css`/
`TagControl.css` use). No new hex literals outside `tokens.css`; no new icon
library — reuse the existing `Pill` components and the inline SVG approach if any
glyph is needed.

## Out of scope

This ADR does **not** decide: browsing other users' public shelves or the
social-discovery surface; the dedicated `/shelves/:user/:shelf-slug` page; a
custom-shelf management surface; rename/delete of custom shelves; private
(NIP-44) shelves or any visibility toggle; sorting/pagination/reordering within a
shelf; the `shelfdef` shelf-header event (recommended for Story 19); any
trust-weighted/social signal on a shelf. All deferred to Story 19+.
