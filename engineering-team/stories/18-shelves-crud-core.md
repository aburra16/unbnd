# Story 18: Shelves — concept header, schema wiring, and CRUD/publish API

**Status:** Draft
**Created:** 2026-05-30
**Type:** Feature

## Background

Readers need somewhere to put a book once they have found it. Today the catalog,
ratings, and tags all read and write, but there is no way to say "I want to read
this" or "I finished this." Shelves are that surface: personal organization that
doubles as a discovery path when made public.

This is **Lane 1 / trust-independent** work (phase2-prd §2.0, §2.3). It ships
without any GrapeRank, community, or trust data. A shelf is a fact the owner
asserts about their own reading; it carries no trust-weighted aggregation and
must show honest empty states, never fabricated counts.

Motivating spec:
- PRD §5.6 (Shelves / Reading Lists): default shelves "Want to Read," "Reading,"
  "Read"; custom named shelves with public/private visibility; a curator's
  public shelves browsable by anyone.
- PRD §6.7 (Shelf Schema, kind 39999): shelves are DList items under a shelves
  concept header.
- phase2-prd §2.3: "Adding a book publishes a replaceable kind-39999 BookShelf
  event signed by the user's key, z-tagged to a `book-shelves` concept header.
  One event per shelf per user, updated on add/remove."

**Prior art already in the tree** (this story wires it up, it does not invent it):
- `packages/schemas/src/BookShelf.ts` — `BookShelf` domain type, `BookShelfEvent`,
  `toBookShelfEvent` / `fromBookShelfEvent`, `buildBookShelfDTag`
  (`shelf--<pubkey-prefix>--<shelf-slug>`), `ShelfVisibility = "public" | "private"`.
- `packages/schemas/src/concept-headers.ts` — `BOOK_SHELVES_HEADER_SLUG =
  "book-shelves"` and `buildBookShelvesHeaderAddress(librarianPubkey)`.
- The established per-user write path: `apps/api/src/routes/ratings.ts` +
  `apps/api/src/ratings/` (template / validate / summary) and the Add-rating UI
  in `apps/web/src/components/RatingControl.tsx` — the shape this story mirrors.

**Scope decision (see split recommendation in Open Questions):** this is the
**first slice** — the data model, the API, and the minimal write trigger on book
detail. The richer browse/profile UI is a follow-up story (provisionally Story
19, matching the Block B "Story 21 CRUD / Story 22 UI" split in phase2-prd §pl).

## User-facing description

As a **Reader** (sovereign or custodial), I want to add a book to a shelf — one
of my three default shelves or a custom shelf I name — and have that choice saved
as my own portable nostr event, so that my reading list travels with my identity
and my public shelves can later be browsed by others.

## Acceptance criteria

Testable from the outside. Each criterion gets at least one test.

- [ ] AC-1 (default shelves on first write): Given a signed-in user with no shelf
  events, when they add a book to "Want to Read," then a single replaceable
  kind-39999 BookShelf event is published, z-tagged to the `book-shelves` concept
  header, with the default shelf slug `want-to-read`, name "Want to Read,"
  `visibility: "public"`, and the book present in the shelf's book list. The two
  other default shelves are **not** pre-provisioned; a default shelf event exists
  only once the user has added a book to it.

- [ ] AC-2 (add is idempotent / replaceable): Given a user who already has a book
  on a shelf, when they add the same book to the same shelf again, then the shelf
  event is re-published with the same d-tag and the book appears exactly once (no
  duplicate entries, no second event).

- [ ] AC-3 (remove): Given a book on a shelf, when the user removes it, then the
  shelf event is re-published without that book; removing the last book leaves an
  empty shelf event (not an error, not a deleted concept) and the read path
  reports the shelf as empty.

- [ ] AC-4 (custom shelf create with visibility): Given a signed-in user, when
  they create a custom shelf with a name and a `public`/`private` visibility, then
  a kind-39999 BookShelf event is published with a slug derived from the name, the
  chosen visibility tag, and (if a book was named in the same action) that book in
  its list. Two custom shelves with names that normalize to the same slug for the
  same user are treated as the same shelf (replaceable d-tag), not silently
  duplicated.

- [ ] AC-5 (default-shelf mutual exclusivity): Given a book on the "Reading"
  default shelf, when the user adds it to the "Read" default shelf, then the book
  is moved (removed from "Reading," added to "Read") rather than living on both;
  the three reading-state defaults ("Want to Read," "Reading," "Read") are
  mutually exclusive. Custom shelves are free-form and impose no exclusivity
  (a book may be on a custom shelf and a default shelf simultaneously).

- [ ] AC-6 (three-tier signing, mirrors ratings): Given a **sovereign** session,
  the add/remove/create action produces an unsigned template the client signs via
  NIP-07 and posts back; given a **custodial** session, the server signs the same
  template with the session's ephemeral-wrapped key (ADR 0006) and returns
  `reauth_required` when the live key is gone. Anonymous (Tier 3) callers get a
  401 and no event is published.

- [ ] AC-7 (private visibility honored on read): Given a private shelf, when a
  request that is not the owner reads it, then the API does not return the shelf's
  contents (server-enforced for custodial reads; public shelves and the owner's
  own private shelves return normally). A request reading a non-owner's profile
  returns only that user's public shelves.

- [ ] AC-8 (honest, owner-correct read-back): Given a user's published shelves,
  when the read endpoint is queried for that user, then it returns each shelf's
  name, slug, visibility, and the contained book slugs/addresses by parsing the
  user's own kind-39999 shelf events (via `fromBookShelfEvent`); a user with no
  shelf events returns an empty list (no fabricated default shelves, no
  placeholder counts).

- [ ] AC-9 (verified live): On staging, a sovereign user adds a book to "Want to
  Read" from book detail; the event lands on the relay (local + dual-publish per
  ADR 0011), and re-reading the user's shelves returns the book.

## DList shapes touched

- `kind:39998` — `book-shelves` concept header (the parent the shelf items
  z-tag to; address via `buildBookShelvesHeaderAddress(librarianPubkey)`, slug
  `book-shelves`). The Librarian pubkey is resolved at runtime, never hardcoded
  (CLAUDE.md house rule).
- `kind:39999` — `bookShelf` item (`BookShelf.ts`). One replaceable event per
  (user, shelf-slug), d-tag `shelf--<userPubkeyPrefix>--<shelf-slug>`, carrying
  `name`, `visibility`, the owner `p` tag, and one `a` tag per book.

The Architect picks the exact API route shape, the slug-normalization function,
and how the mutual-exclusivity move (AC-5) is sequenced across the two affected
shelf events.

## Out of scope

Deferred to the UI follow-up story (and beyond):
- The shelves **section on the user profile** with cover thumbnails + counts
  (PRD §5.6 social discovery; phase2-prd §2.4 "Shelves: public shelves with
  thumbnails"). The `ProfileShelves`/`Shelf` components today render fixtures
  only; rewiring them to live data is the follow-up.
- The **dedicated shelf page** `/shelves/:user/:shelf-slug` and the browse-by-link
  experience.
- **Rename and delete** of a custom shelf as first-class UI actions (the API may
  expose them; the surfaced controls belong with the UI story). phase2-prd §2.3
  lists rename/delete in the full feature; this slice covers create + add/remove.
- Sorting, pagination, or reordering within a shelf.
- Any trust-weighted or social signal on a shelf (likes, follower counts,
  "trending shelves"). Trust-dependent; not Lane 1.

Re-confirmed against PRD §11.3 "Out of Scope": shelves do **not** introduce a
social feed / activity stream, reading-progress tracking, or notifications. A
shelf is a static membership list, not a progress tracker or an activity event.

## Open questions

These need the user's answer before the Architect phase.

1. **Split confirmation (PO recommendation: split).** Shelves as one story would
   exceed the ~5-criteria guidance and span schema + API + three UI surfaces.
   I recommend this story be the **CRUD/publish + minimal book-detail write
   trigger** slice, with a follow-up story for the profile shelves section, the
   dedicated `/shelves/:user/:shelf-slug` page, and rename/delete UI. This matches
   phase2-prd's own Block B split (Story 21 CRUD, Story 22 UI). **Confirm the
   split, or ask for a single combined story.**

2. **Default-shelf semantics (PO call, encoded as AC-1 + AC-5; confirm or
   override):** the three defaults are **implicit** — created on first add, not
   pre-provisioned — so a brand-new user shows zero shelves honestly rather than
   three empty ones. And the three reading-state defaults are **mutually
   exclusive** (a book is "Want to Read" or "Reading" or "Read," not several),
   mirroring Goodreads' shelf semantics; custom shelves stay free-form. If you
   want pre-provisioned empty defaults, or want the defaults to be non-exclusive,
   say so and AC-1/AC-5 change.

3. **Default custom-shelf visibility.** New custom shelves default to... public or
   private? PRD §5.6 frames public shelves as the discovery path; I have left the
   creation action requiring an explicit visibility choice (AC-4) rather than
   guessing a default. Confirm whether you want a default, and which.

4. **Private-shelf enforcement for sovereign reads.** phase2-prd §2.3 says private
   shelves are "server-enforced for custodial, client-respected for sovereign
   reads." Because sovereign shelf events are public on the relay, a `visibility:
   "private"` tag is an honest request, not cryptographic privacy. AC-7 enforces
   it at our API; confirm you are comfortable documenting that a private shelf is
   not encrypted and is technically readable by anyone scanning the raw relay.

## House-rule notes (for downstream phases)

- **No AI-slop copy.** Any shelf-related string (shelf names in defaults, the
  "Add to shelf" control label, empty-state text) is reviewed against
  `memory/feedback_unbnd_copy_and_visual.md`. Default shelf names are fixed by the
  PRD ("Want to Read," "Reading," "Read"). No em dashes, no "designed to," no
  exclamation CTAs, no emoji in body copy.
- **No fake data / honest empty states.** A user with no shelves shows nothing,
  not three placeholder shelves. Counts are real counts of real book entries.
- **npub for display, hex internal.** The owner is carried as a hex `p` tag in the
  event; any UI attribution renders npub (mirror `ratings.ts` `npubEncode`).
- **No hand-rolled crypto.** Signing goes through the existing path only:
  Applesauce `ExtensionSigner` (sovereign NIP-07) / the custodial ephemeral wrap
  (ADR 0006) server-side; nostr-tools only for nip19. No bespoke event signing.
- **Librarian pubkey resolved at runtime** for the `book-shelves` header address;
  never a literal in committed code.
- **NO WIREFRAMES EXIST for this feature.** There is no handoff `#screen` for
  shelves. The minimal "Add to shelf" control in this slice, and all UI in the
  follow-up story, are **derived from the existing component system**: the
  BookCard/grid, brand tokens (`apps/web/src/styles/tokens.css`), the dark theme,
  and existing pill/menu patterns (e.g. the genre/visibility pills, the
  `RatingControl` interaction shape). **This is an assumption.** The user may
  supply a wireframe before implementation to override the derived design; flag
  this at the Architecture gate.

## Linked artifacts
- ADR: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
- Builds on: `@unbnd/schemas` `BookShelf.ts` + `concept-headers.ts`
  (`book-shelves`); the ratings/tags write path (`apps/api/src/routes/ratings.ts`,
  ADR 0005/0006/0011); follow-up UI story for profile + dedicated shelf page.
