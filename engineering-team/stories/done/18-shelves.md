# Story 18: Shelves — add/remove a book and view your own shelves (vertical slice)

**Status:** Done
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
  "Read"; custom named shelves; a reader's public shelves browsable.
- PRD §6.7 (Shelf Schema, kind 39999): shelves are DList items under a shelves
  concept header.

**This story is a usable vertical slice, not an API-only core.** A reader can add
a book to a shelf from the book-detail page, remove it again, and then see that
book on their own shelves at `/profile/me`. End-to-end, no follow-up story
required to make the slice usable.

**Data model = membership assertions (locked).** A shelf membership is **one
small event per (user, book, shelf)**, mirroring `BookTagAssertion`'s
apply/retract polarity rather than a single big list event or NIP-51. Adding a
book publishes an `apply` assertion; removing publishes a `retract` (the tag
apply/dispute pattern from Story 8 / ADR 0009), not a list rewrite. Reading a
user's shelves means querying their shelf assertions and grouping by shelf, the
same way a book's tags are aggregated. This **replaces** the current
single-big-list `BookShelf.ts` model.

**Prior art this story builds on:**
- `packages/schemas/src/BookTagAssertion.ts` — the apply/retract assertion shape
  this model mirrors (kind-39999, `a`-tag target, `z`-tag to a concept header,
  polarity tag, `p` author tag, deterministic identity d-tag).
- `packages/schemas/src/BookShelf.ts` — **to be reworked** from list-model to
  assertion-model (see Architect note below).
- `packages/schemas/src/concept-headers.ts` — `BOOK_SHELVES_HEADER_SLUG =
  "book-shelves"` and `buildBookShelvesHeaderAddress(librarianPubkey)`.
- The established per-user write path: `apps/api/src/routes/ratings.ts` +
  `apps/api/src/ratings/` and the three-tier signing in `RatingControl.tsx` —
  the shape the add/remove action mirrors.

Note: private (properly **encrypted**, NIP-44) shelves are a separate future
story. This slice ships **public-only** shelves. We will not ship a "private"
label that is not real privacy.

## User-facing description

As a **Reader** (sovereign or custodial), I want to add a book to one of my
shelves — a default reading state or a custom shelf I name — from the book's
page, remove it again if I change my mind, and see my shelves on my own profile,
so that my reading list is saved as my own portable nostr events and travels with
my identity.

## Acceptance criteria

Testable from the outside. Each criterion gets one test.

- [ ] **AC-1 (add publishes an apply assertion):** Given a signed-in user, when
  they add a book to "Want to Read" from the book-detail page, then one
  kind-39999 shelf-membership event is published with polarity `apply`, an `a`
  tag targeting the book address, a `z` tag to the `book-shelves` concept header,
  the shelf slug `want-to-read`, and the owner `p` tag. No shelves are
  pre-provisioned; a default shelf exists only once a book has been added to it.

- [ ] **AC-2 (remove publishes a retract assertion):** Given a book the user has
  on a shelf, when they remove it from the book-detail page, then a `retract`
  assertion for the same (user, book, shelf) identity is published (not a list
  rewrite), and the read path no longer reports that book on the shelf.

- [ ] **AC-3 (add is idempotent / latest apply wins):** Given a user who already
  has a book on a shelf, when they add the same book to the same shelf again,
  then the latest apply for that (user, book, shelf) identity wins and the book
  appears exactly once on the shelf (no duplicate membership).

- [ ] **AC-4 (custom shelf):** Given a signed-in user, when they add a book to a
  custom shelf they name, then an apply assertion is published carrying a slug
  derived from the name and the human display name, and the book appears on that
  named shelf when the user's shelves are read back.

- [ ] **AC-5 (default-shelf mutual exclusivity = move):** Given a book on the
  "Reading" default shelf, when the user adds it to "Read," then the book is
  moved — implemented as a retract from "Reading" plus an apply to "Read" — so it
  lives on exactly one of the three reading-state defaults ("Want to Read,"
  "Reading," "Read"). Custom shelves are free-form and impose no exclusivity (a
  book may be on a custom shelf and a default shelf at once).

- [ ] **AC-6 (three-tier signing, mirrors ratings):** Given a **sovereign**
  session, the add/remove action produces an unsigned template the client signs
  via NIP-07 and posts back; given a **custodial** session, the server signs the
  same template with the session's ephemeral-wrapped key (ADR 0006) and returns
  `reauth_required` when the live key is gone. Anonymous (Tier 3) callers get a
  401 and no event is published.

- [ ] **AC-7 (read own shelves, grouped, honest):** Given a user's published
  shelf assertions, when `/profile/me` shelves are read, then the API queries the
  user's kind-39999 shelf assertions and **groups them by shelf** (resolving
  apply/retract polarity so retracted books drop out), returning each shelf's
  name, slug, and contained books. A user with no shelf assertions returns an
  empty list — an honest empty state, no fabricated default shelves and no
  placeholder counts.

- [ ] **AC-8 (own-shelves view on /profile/me):** Given a signed-in user viewing
  their own profile (`/profile/me`), when the page loads, then their shelves
  render from the live grouped read (AC-7) using the existing component system,
  showing real per-shelf book counts; a book added via AC-1 appears here on the
  page's normal load.

- [ ] **AC-9 (verified live):** On staging, a sovereign user adds a book to "Want
  to Read" from book detail; the apply assertion lands on the relay (local +
  dual-publish per ADR 0011), and re-loading `/profile/me` shows the book on the
  shelf.

## DList shapes touched

- `kind:39998` — `book-shelves` concept header (the parent the shelf-membership
  assertions z-tag to; address via `buildBookShelvesHeaderAddress(librarianPubkey)`,
  slug `book-shelves`). The Librarian pubkey is resolved at runtime, never
  hardcoded (CLAUDE.md house rule).
- `kind:39999` — **shelf-membership assertion** (reworked `BookShelf.ts`). One
  small event per (user, book, shelf): an `a` tag targeting the book address, a
  `z` tag to the `book-shelves` header, the shelf slug, an apply/retract polarity
  (mirroring `BookTagAssertion`), and the owner `p` tag. Identity is
  (user, book, shelf) via a deterministic d-tag; re-publishing overwrites; latest
  polarity wins. This **replaces** the single-big-list `BookShelf` event.

The Architect picks the exact API route shapes, the slug-normalization function,
the polarity vocabulary, and how the AC-5 move is sequenced across the two
assertions.

## Out of scope

Deferred to a follow-up story (provisionally Story 19) and beyond:
- **Browsing other users' public shelves** and the social-discovery shelves
  surface (PRD §5.6).
- The **dedicated shelf page** `/shelves/:user/:shelf-slug` and the browse-by-link
  experience.
- A **custom-shelf management surface** (a place to create/organize custom shelves
  outside the add flow).
- **Rename and delete** of a custom shelf as first-class UI actions.
- **Private (encrypted, NIP-44) shelves** and any visibility toggle. This slice is
  public-only; real private shelves are their own future story with proper
  encryption, never a cosmetic "private" label.
- Sorting, pagination, or reordering within a shelf.
- Any trust-weighted or social signal on a shelf (likes, follower counts,
  "trending shelves"). Trust-dependent; not Lane 1.

Re-confirmed against PRD §11.3 "Out of Scope": shelves do **not** introduce a
social feed / activity stream, reading-progress tracking, or notifications. A
shelf is a static membership set, not a progress tracker or an activity event.

## Open questions

The four planning-gate decisions (vertical slice, public-only, membership-assertion
model, kept defaults/signing/copy rules) resolved the prior open questions. The
only remaining items are Architect-level — **not blocking the gate.**

1. **(For the Architect) Where the custom-shelf display name lives.** A custom
   shelf needs a human display name ("Beach Reads") distinct from its slug
   (`beach-reads`). The ADR must decide whether that name is **denormalized onto
   each membership assertion** or carried in a small per-(user, shelf) **"shelf
   header" event**. Default shelf names are fixed constants ("Want to Read,"
   "Reading," "Read") and are not stored per assertion. The PO does not decide
   this; the Architect resolves it in the ADR.

2. **(For the Architect) Exact event shape of the membership assertion.** Polarity
   vocabulary, d-tag identity composition (user, book, shelf), and how the
   grouped read resolves multiple assertions for the same identity (latest-wins).
   Mirror `BookTagAssertion` as the baseline.

## House-rule notes (for downstream phases)

- **No AI-slop copy.** Any shelf-related string (the "Add to shelf" control label,
  custom-shelf naming, empty-state text) is reviewed against
  `memory/feedback_unbnd_copy_and_visual.md`. Default shelf names are fixed by the
  PRD ("Want to Read," "Reading," "Read"). No em dashes, no "designed to," no
  exclamation CTAs, no emoji in body copy.
- **No fake data / honest empty states.** A user with no shelves shows nothing,
  not three placeholder shelves. Counts are real counts of real membership
  assertions, with retracts resolved out.
- **npub for display, hex internal.** The owner is carried as a hex `p` tag in the
  event; any UI attribution renders npub (mirror `ratings.ts` `npubEncode`).
- **No hand-rolled crypto.** Signing goes through the existing path only:
  Applesauce `ExtensionSigner` (sovereign NIP-07) / the custodial ephemeral wrap
  (ADR 0006) server-side; nostr-tools only for nip19. No bespoke event signing.
- **Librarian pubkey resolved at runtime** for the `book-shelves` header address;
  never a literal in committed code.
- **NO WIREFRAMES EXIST for this feature.** There is no handoff `#screen` for
  shelves. Both surfaces in this slice — the add/remove control on book detail and
  the shelves view on `/profile/me` — are **derived from the existing component
  system**: the BookCard/grid, brand tokens (`apps/web/src/styles/tokens.css`),
  the dark theme, and existing pill/menu patterns plus the `RatingControl`
  interaction shape. **This is an assumption.** The user may supply a wireframe
  before implementation to override the derived design; flag this at the
  Architecture gate.

## Linked artifacts
- ADR: `engineering-team/decisions/0018-shelves.md`
- Test plan: `engineering-team/stories/done/18-shelves.test-plan.md`
- Review: `engineering-team/reviews/18-shelves.md` (PASS)
- Builds on: `@unbnd/schemas` `BookTagAssertion.ts` (the apply/retract model to
  mirror), `BookShelf.ts` (reworked to assertion-model), `concept-headers.ts`
  (`book-shelves`); the ratings/tags write path (`apps/api/src/routes/ratings.ts`,
  ADR 0005/0006/0009/0011); follow-up Story 19 for public-shelf browse + the
  dedicated shelf page + custom-shelf management + rename/delete.
