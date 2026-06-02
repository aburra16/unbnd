# Story 31: Author claiming + "Author" badge + author edit access (trust-independent core)

**Status:** Draft
**Created:** 2026-06-01
**Type:** Feature

## Gate decisions (2026-06-01)

Resolved by the user; tightened into scope below (see ADR 0032).

1. **Author metadata EDITING (blurb / cover / purchase links) is gated behind verification
   and DEFERRED to Story 32 (Verified Author).** Story 31 builds NO edit surface and NO
   overlay-apply — only claim → "Author (claimed)" badge → "Books by this author." ADR 0032
   defines the seam where the edit overlay + verification gate plug in; this story builds
   none of it. **AC-3, AC-4, and AC-5 are DEFERRED to Story 32.**
2. **Open claiming.** Any signed-in user can claim; the badge says "claimed," never
   "verified" (copy makes "claimed ≠ verified" unmistakable). The canonical
   librarian-signed record is never mutated.
3. **Multiple claimants** are shown honestly — all of them ("claimed by …"), no silent
   winner.

**Active ACs after tightening:** AC-1 (claim event), AC-2 (badge + multi-claimant),
AC-6 ("Books by this author"), AC-7 (honest states / "claimed ≠ verified"), AC-8 (both
tiers, deterministic CI without the trust provider). AC-3/AC-4/AC-5 → Story 32.

## Background

PRD §2.10 ("Author claiming + verification") splits across two lanes. The
**trust-INDEPENDENT core** ships here in Lane 1: an author finds their book in the
catalog, clicks **"Claim this book,"** and the book links to their account (sets the
author pubkey, shows an **"Author" badge**); a claimed author gets an **edit surface**
for **blurb, cover URL, and purchase links** (and nothing else — not community tags,
not ratings, not others' reviews); and the author profile gains a **"Books by this
author"** section. The **"Verified Author"** upgrade (trusted-curator `author-verified`
consensus above a threshold) is the trust-DEPENDENT follow-on in Block C and is **out
of this story** — it is the next story (PRD §2.10, Block C: "Trust-tier badge on
profiles + 'Verified Author' upgrade"). This story is the deterministic, fixture-free
core that the verification layer later sits on top of.

**What exists today.**

- **The catalog model.** A catalog book is a kind-39999 **`BookRecord`**, z-tagged to
  the **librarian's `books` concept header** (`packages/schemas/src/concept-headers.ts`
  `buildBookRecordsHeaderAddress` / `BOOK_RECORDS_HEADER_SLUG = "books"`), d-tag = slug
  (`packages/schemas/src/BookRecord.ts` `buildBookRecordDTag`). The record is
  **librarian-signed** (the seeder signs with `LIBRARIAN_NSEC`; the API holds only
  `LIBRARIAN_PUBKEY`, no librarian secret — established in Story 30's Background and
  ADR 0031). The record already carries an **optional `authorPubkey`** field
  (`BookRecord.ts` lines 26, 101 — emitted as a `["p", <hex>]` tag) and an
  `authorName`. `GET /api/books/:slug` reads the record (`apps/api/src/routes/books.ts`,
  `toPublicBook`); the web `BookDetail` (`apps/web/src/routes/BookDetail.tsx`) renders it
  through `BookHeader` (`apps/web/src/components/BookHeader.tsx` — shows cover, "by
  `authorName`", blurb, and the purchase link via `book.purchaseUrl`). **There is no
  claim, no edit, and no author-badge surface for catalog entries today.**

- **The "I am the author" toggle exists only at submission.** `apps/web/src/routes/Submit.tsx`
  (line 283, `label="I am the author of this book"`) sets `source=author` /
  `authorPubkey` on a **new community submission** written through
  `apps/api/src/routes/submissions.ts`. That is a self-claim at *creation* time for a
  *submission*, into the `book-submissions` concept — **not** a claim against an existing
  **catalog** entry. This story is about claiming **catalog** books (the librarian-seeded
  `books` records), which a self-asserting author cannot author or edit directly.

- **The assertion model to mirror.** Ratings and tag-assertions are **author-signed**
  kind-39999 events that **`#a`-reference the book's canonical address**
  (`39999:<librarian>:<slug>`) and z-tag to their own concept header:
  `BookRating` (`packages/schemas/src/BookRating.ts` — `["a", <bookAtag>]`, `["p",
  <raterPubkey>]`, d-tag `rating--<slug>--<rater8>`, z → `book-ratings`) and
  `BookTagAssertion` (`packages/schemas/src/BookTagAssertion.ts` — `["a", <bookAtag>]`,
  `["p", <asserterPubkey>]`, d-tag `tagassert--<slug>--<tag>--<asserter8>`, z →
  `book-tag-assertions`). These are written through `apps/api/src/routes/ratings.ts`
  (and the tags route) with the **two-tier write path**: sovereign client-signs the
  template via NIP-07; custodial server-signs with the session's ephemeral-wrapped key
  (ADR 0006). A **claim** and an **author edit** are naturally the same shape: an
  author-signed kind-39999 event that `#a`-references the book address. The author
  **cannot** edit the librarian-signed canonical record directly, so any author-provided
  blurb/cover/links must be an **OVERLAY merged at read time** — the same pattern as the
  trust-weighting overlay (House⇄Yours, ADR 0014/0025), where raw catalog data and an
  author-signed layer are composed when the book is read, never by mutating the canonical
  record.

- **Identity resolution for the badge + "Books by this author."** Story 29 shipped
  npub→name resolution via `apps/web/src/hooks/useProfileMeta.ts` (`useProfileMeta` +
  `displayNameOf`), already consumed by the profile pages (`apps/web/src/routes/Profile.tsx`).
  The "Author" badge and the "Books by this author" section reuse this — npub → display
  name, honest short-npub fallback when there is no kind-0.

**The key safety question this story raises** (see "Flags for the gate"): claiming is
**OPEN** — anyone signed in can claim any book; the badge says "claimed," not "verified."
So how do we stop a false claimant from vandalizing the canonical catalog entry (changing
Dune's cover/blurb)? The PO lays out three options and recommends one; the **gate / Architect
decides**, and that decision sets how much of the edit actually *displays* in v1.

**PRD anchor:** phase2-prd **§2.10** ("Author claiming + verification — trust-independent
core, Lane 1") verbatim, specifically its first, third, and fourth acceptance bullets
(claim + "Author" badge; author can edit blurb/cover/purchase-links and **nothing else**;
author profile shows "Books by this author"). The §2.10 **second** bullet ("Verified
Author" via `author-verified` trusted consensus) is **deferred to the next story** (PRD §2.10
Block C). This is Phase-2 Lane-1 scope and touches **no** PRD §11.3 / §3-deferred "Out of
Scope" surface (no payments, Blossom/file hosting, ebook sales, bounty marketplace,
print-on-demand, social feed, reading progress, federation, email notifications, automated
website/ISBN verification).

## User-facing description

As an **Author** (PRD §3) who finds my own book in the Unbnd catalog, I want to claim it so
the book links to my account and shows an "Author" badge, and I want a place to provide my
own blurb, cover image, and purchase link, so that the catalog reflects how I represent my
own work without my touching the community's tags, ratings, or other readers' reviews.

As a **Reader** browsing a book, I want any author-provided blurb/cover/link to be clearly
attributed as coming from the author (not silently swapped in over the catalog's record),
and I want the "Author" badge to honestly say "claimed" rather than implying a verification
that has not happened, so that I can tell a self-claim from a vetted one.

As a **Reader** on an author's profile, I want a "Books by this author" section listing the
catalog books they have claimed, so that I can see an author's body of work in one place.

## Acceptance criteria

Testable from the outside. Each criterion is independently testable, and — because this is
the trust-INDEPENDENT core — **without the trust provider** (no Brainstorm, no fixture-trust
weights, no relay-trust dependency): a claim and an author edit are deterministic
author-signed events plus a read-time overlay. Copy in these ACs is illustrative and must
pass the no-slop rule (`memory/feedback_unbnd_copy_and_visual.md`); final strings are the
Implementer's within that constraint. No hand-rolled crypto: both tiers reuse the shipped
signing paths (NIP-07 for sovereign, server ephemeral-wrap for custodial; CLAUDE.md crypto
policy). The badge shows "claimed," never "verified" — no trust-tier string and no raw
GrapeRank number appears (CLAUDE.md).

- [ ] **AC-1 — A signed-in user can claim a catalog book; the claim is an author-signed
  event referencing the book address.** Given a signed-in user (sovereign or custodial) on
  a catalog book's detail page, when they invoke **"Claim this book,"** then a kind-39999
  **claim** event is published that `#a`-references the book's canonical address
  (`39999:<librarian>:<slug>`) and carries the claimant's pubkey, signed by the claimant
  (not the librarian) — mirroring the rating/tag-assertion `["a", <bookAtag>]` + `["p",
  <pubkey>]` shape. Claiming is **open**: the write is **not** gated on any trust score,
  role, or verification (CLAUDE.md invariant 2 — publishing is permissionless). A
  signed-out visitor has no claim affordance and a direct claim request from them is
  rejected server-side. Re-claiming the same book by the same user is idempotent (replaces
  under a stable per-(claimant, book) d-tag; no duplicate claim).

- [ ] **AC-2 — A claimed book shows an honest "Author" badge linking to the claimant's
  account.** Given a book that a user has claimed, when the book detail page is read, then
  it surfaces an **"Author" badge** (worded as a *claim*, e.g. "Claimed by the author" —
  never "Verified") that resolves the claimant's identity to npub + display name via the
  Story 29 path (`useProfileMeta` / `displayNameOf`, honest short-npub fallback when no
  kind-0) and links to that author's profile. Given a book with **no** claim, no Author
  badge renders. Given **multiple** distinct claimants on one book (the open-claim hazard),
  the read resolves to a deterministic, honest presentation (Open Question 2 — e.g. show
  all claims as "claimed by," never silently pick a winner), with no fabricated single
  "the author."

- [ ] **AC-3 — [DEFERRED to Story 32 (gate decision 1, 2026-06-01)] A claimant gets an edit
  surface for blurb, cover URL, and purchase links — and only those.** Not built in Story 31.
  Given a user who has claimed a book, when they open the author edit
  surface, then it exposes inputs for **exactly** three fields — **blurb**, **cover URL**,
  and **purchase link(s)** — pre-filled with the current effective values, and **nothing
  else**: no input for title, author name, ISBN, community tags/genres, ratings, or any
  other reader's review. A user who has **not** claimed the book (or is signed out) has no
  edit affordance, and a direct author-edit request from a non-claimant is rejected
  server-side. Cover URL and purchase link inputs are validated as well-formed `http(s)`
  URLs before publish (mirroring the Story 22 `httpUrl` light-validation), with an honest
  inline message on a bad value and no event published.

- [ ] **AC-4 — [DEFERRED to Story 32 (gate decision 1, 2026-06-01)] Author edits are
  author-signed OVERLAY events; the librarian-signed canonical record is never mutated.**
  Not built in Story 31. (The "canonical record never mutated" guarantee still holds in
  Story 31 because no edit/overlay exists at all.) Given a claimant saves an author edit,
  when it is
  published, then it is a **claimant-signed** kind-39999 event `#a`-referencing the book
  address (the overlay), and the librarian-signed canonical `BookRecord` under the `books`
  header is **left unchanged** (the API holds no librarian secret and must not gain one for
  this story). The overlay is **reversible** — clearing an overlaid field and re-saving
  removes the author's value for that field (republish/replace under the overlay's stable
  d-tag, no leftover empty value), reverting the read to the canonical value.

- [ ] **AC-5 — [DEFERRED to Story 32 (gate decision 1, 2026-06-01)] Read-time overlay merge
  follows the gate's edit-application decision; the canonical value is always recoverable.**
  Not built in Story 31. The gate chose: editing is gated behind verification, so the
  overlay/merge ships in Story 32. ADR 0032 defines the read-merge seam (the
  `{ book, claimants }` assembly in `GET /api/books/:slug`) where Story 32 attaches it; in
  Story 31 that seam is a pass-through (`effectiveBook === canonical`). Given a book has both
  a canonical record and an
  author overlay, when the book is read, then blurb/cover/purchase-links are composed at
  read time per the **edit-application policy chosen at the gate** (see "Flags for the
  gate" — the PO recommends option (a): the author overlay is **captured and stored now**
  but does **not displace** the canonical blurb/cover/links until the author is Verified in
  the next story; until then the canonical values render). Whatever policy is chosen, the
  merge is computed at **read time** (never by mutating the canonical record, CLAUDE.md
  invariant 3), and the canonical librarian value is always recoverable (the overlay is
  additive and reversible). If the gate instead chooses option (b) (apply-on-bare-claim),
  any displaced field renders with an explicit **"author-provided"** attribution.

- [ ] **AC-6 — The author profile gains a "Books by this author" section.** Given an author
  who has claimed one or more catalog books, when their profile (`/profile/:npub` and, for
  the signed-in user, `/profile/me`) is read, then it shows a **"Books by this author"**
  section listing those claimed catalog books (cover/title, linking to each book's detail
  page), sourced by reading the author's claim events and resolving each to its catalog
  book. Given an author with no claims, the section is absent (no empty-state placeholder
  masquerading as content). The list is the **path npub's** claims, never the viewer's
  session (matching the Story 20/29 profile-read rule).

- [ ] **AC-7 — Honest states; the "claimed ≠ verified" distinction is explicit.** Given the
  claim action, edit surface, and badge, when each is idle / in-flight / succeeds / fails,
  then the UI shows honest idle/saving/saved/error states with no fabricated success and no
  alarmist warnings (Story 22/28 pattern). The badge and any claim copy state the book is
  **claimed** (self-asserted), and must **not** imply verification, trust, or endorsement —
  the "Verified Author" upgrade is a later story. No trust-tier string or raw GrapeRank
  number appears anywhere in this story's surfaces (CLAUDE.md).

- [ ] **AC-8 — Both tiers, no new crypto; deterministic in CI without the trust provider.**
  Given a **sovereign** (NIP-07) user, when they claim or edit, then the event is signed in
  the browser via the existing NIP-07 path; given a **custodial** (email) user, the server
  signs with the session's ephemeral-wrapped key (ADR 0006), returning the existing
  `reauth_required` 401 when the session key is gone. Neither path introduces new crypto;
  both reuse the shipped claim/edit write (mirroring ratings/tags). The claim write, the
  Author badge resolution, the claimant-only edit authorization, the overlay merge per the
  gate policy, the reversibility, and "Books by this author" are all exercised green in CI
  **with no trust provider, no Brainstorm, no relay, and no human** (this is the
  trust-independent core; the only trust-gated behavior — the Verified upgrade and any
  apply-on-verify display flip — is the next story's, and AC-5 only *defines where it plugs
  in*).

## DList shapes touched

This reads the existing catalog record and adds an author-signed **claim** layer plus an
author-signed **metadata-overlay** layer, both `#a`-referencing the book address, mirroring
the rating/tag-assertion pattern. **The Architect names the exact shapes** (whether claim
and edit are one event type or two, the d-tag scheme, and which concept header(s) they
z-tag to — candidates: a new `book-claims` / `author-edits` header pair, or folding into an
existing one). The PO identifies the surfaces touched; it does not fix the schema.

- `kind:39999` — catalog **`BookRecord`** under the librarian's `books` header (read only;
  the canonical record being claimed and overlaid; **never mutated** by this story).
- `kind:39999` — author **claim** event (new; author-signed; `#a` → book address; `#p` →
  claimant). Establishes the link + the "Author" badge + feeds "Books by this author."
- `kind:39999` — author **metadata-overlay** event(s) (new; author-signed; `#a` → book
  address) carrying author-provided blurb / cover URL / purchase link(s). Reversible /
  replaceable under a stable per-(author, book) d-tag.
- `kind:39998` — concept header(s) the claim/overlay z-tag to (Architect names; new or
  existing), plus the `books` header (read; the canonical parent).
- `kind:0` — read only, for identity resolution (Story 29 `useProfileMeta`) on the badge
  and "Books by this author."

## Out of scope

State explicitly — do not build. Several are named so the Architect inherits the boundary.

- **The "Verified Author" upgrade** (PRD §2.10 second bullet) — trusted-curator
  `author-verified` consensus above a threshold that upgrades the badge from "claimed" to
  "Verified," and **any trust-gated flip of edit DISPLAY** (e.g. overlay starts displacing
  the canonical record on verification). This is the **next story** (Block C). This story may
  **define the plug-in point** (AC-5) but builds no verification gate, no `author-verified`
  tag, and no trust read.
- **Automated author verification** (website / ISBN / domain matching) — Phase 3 (PRD §3).
- **Editing anything but blurb / cover URL / purchase links.** No editing of title, author
  name, ISBN, page count, year, subjects, **community tags/genres**, **ratings**, or **any
  other reader's review**. The §2.10 "and nothing else" boundary is a hard constraint (AC-3).
- **Mutating the librarian-signed canonical `BookRecord`,** or giving the API a librarian
  signing secret. Author edits are author-signed overlays only (AC-4). (Contrast Story 30,
  which deliberately *did* introduce librarian-signed promotion via a separate worker — that
  is **not** in scope here.)
- **Claiming community submissions** (the `book-submissions` records, or the Submit-form "I
  am the author" toggle). This story is about **catalog** entries only. The existing
  submission self-claim is unchanged.
- **Cover/image hosting / upload.** Cover is a **URL** the author provides (matching the
  catalog's OL/author-URL model; PRD §3 defers media storage). No Blossom, no upload.
- **A general profile editor** beyond the "Books by this author" read section (Story 22
  governs profile *writes*; this story only *reads* claims onto the profile).
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 / §3-deferred "Out of Scope": this story touches none of
payments, file hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social
feed, reading progress, federation, or email notifications. It is an open author-signed claim
+ a reversible author-signed metadata overlay merged at read time + a profile read section.

## The key safety decision — false-claim / edit-application (FLAG FOR THE GATE)

**The crux of a trust-INDEPENDENT claim.** Claiming is OPEN — anyone signed in can claim any
book; the badge says "claimed," not "verified." So a false claimant could try to vandalize
the canonical catalog entry (change Dune's cover/blurb). The structural protection is already
firm: **the canonical librarian-signed record is never mutated** (AC-4) — the worst a false
claimant can do is publish their own overlay. The open decision is **how much of that overlay
actually DISPLAYS in v1**:

- **(a) Edits apply only on Verification (PO RECOMMENDATION — safe default).** The author
  overlay is **captured and stored now** (the edit surface ships, the events are written), but
  it does **not displace** the canonical blurb/cover/links until the author is **Verified** in
  the next story. Until then the canonical values render. **Pro:** a bare (unverified) claim
  can never alter what a reader sees on a canonical book — zero vandalism surface in v1; the
  edit capture is built and tested now, the *application* lights up cleanly with Verified
  Author next. **Con:** the author cannot see their edits take visible effect until the next
  story ships (mitigated by an honest "your edits will apply once your authorship is verified"
  state, and optionally showing the author their own pending overlay).
- **(b) Edits apply on bare claim, clearly ATTRIBUTED.** The overlay displaces the canonical
  field as soon as the book is claimed, but renders with an explicit **"author-provided"**
  attribution and never overwrites the librarian record (read-time, reversible). **Pro:**
  authors get immediate effect; honest attribution + reversibility cap the damage. **Con:** a
  false claimant *can* change what readers see on a canonical book (subject to dispute/reversal
  after the fact); higher abuse surface with open claims.
- **(c) Accept-risk for v1.** Edits apply with no attribution and no verification gate, on the
  theory that claims are cheap to dispute. **Least safe**; not recommended.

**PO recommendation: (a).** It keeps this story coherent and safe — claim + "Author" badge +
"Books by this author" + the edit-capture surface all ship now; the edit *application*
(display) is the natural first behavior the **next** (Verified Author) story turns on. The
user/Architect decides at the gate, and that decision sets the exact behavior of AC-5.

## How the claim + edit overlay is modeled (mirrors the assertion pattern)

Stated for the Architect to confirm/refine; the PO is not fixing the schema (DList shapes
above). The shape is the same author-signed-event-referencing-the-book-address pattern that
ratings and tag-assertions already use:

- A **claim** = a claimant-signed kind-39999 event with `["a", "39999:<librarian>:<slug>"]`
  (the canonical book address) + `["p", <claimantPubkey>]`, under a stable per-(claimant,
  book) d-tag so re-claim replaces (AC-1), z-tagged to a claim concept header. Reading all
  claim events for a book yields the badge (AC-2); reading all claim events authored by a
  pubkey yields "Books by this author" (AC-6) — exactly how ratings/tags are read by `#a`
  (per book) or by author.
- An **author edit** = a claimant-signed kind-39999 overlay event `#a`-referencing the book
  address, carrying the author-provided blurb/cover/purchase-links, replaceable/reversible
  under a stable per-(author, book) d-tag (AC-4).
- The **read-time overlay merge** composes `(canonical BookRecord) × (author overlay)` per
  the gate's edit-application policy (AC-5), the same architectural move as the House⇄Yours
  trust overlay (ADR 0014/0025) — raw + a signed layer combined at read time, the canonical
  record never mutated (CLAUDE.md invariant 3).
- **Both tiers** reuse the shipped two-tier write (sovereign NIP-07 client-sign; custodial
  server ephemeral-wrap, ADR 0006) exactly as ratings/tags do — no new crypto.

## Open questions

Resolve before approving the story.

1. **The edit-application policy (the gate decision above).** Which of (a)/(b)/(c)? This sets
   AC-5's exact behavior and how much "edit" displays in v1. PO recommends (a).
2. **Multiple claimants on one book (open-claim hazard).** Open claiming means two pubkeys can
   both claim "Dune." How does the badge read this (AC-2)? PO lean: show all as "claimed by"
   (honest, no silent winner); the Verified layer later disambiguates the *real* author.
   Architect confirms the read.
3. **One event type or two** (claim vs. edit), the exact d-tag scheme, and the concept
   header(s) they z-tag to (new `book-claims` / `author-edits`, or folded). Architect's call
   per the DList-shapes note.
4. **Cover/purchase-link validation depth.** Light `http(s)` well-formedness only (Story 22
   `httpUrl` parity), no domain/ownership check (that is the Phase-3 automated verification).
   Confirm. Purchase links: one URL or several? PO lean: mirror the catalog's single
   `purchaseUrl` for v1 unless the Architect sees a clean multi-link shape.
5. **"Books by this author" identity key.** Sourced from the author's **claim** events
   (resolve each `#a` to its catalog book), reusing the Story 29 read pattern. Confirm the
   read and the honest empty/absent behavior (AC-6: section absent, no placeholder).
6. **Where the claim/edit/badge surfaces live in the web app** (BookDetail / BookHeader for
   the badge + claim action; a dedicated author-edit surface vs. inline; the profile section).
   Architect picks the component boundaries; PO does not prescribe.

## Flags for the gate (PO — contentious; the user decides)

- **The edit-application safety decision (Open Question 1) is the load-bearing gate call.**
  PO recommends **(a) apply-on-Verify** (capture edits now, display them on verification next
  story) for zero v1 vandalism surface. The user must pick (a) / (b) / (c); the choice
  determines AC-5 and how visibly "edit" behaves in this story.
- **Open claiming with no verification in v1 means the "Author" badge says only "claimed."**
  PO recommendation: **acceptable** — it is the honest state for a trust-independent core, the
  canonical record is structurally protected (AC-4), and the Verified upgrade is the very next
  story. The user should confirm shipping a *claim-only* badge (no verification) is acceptable
  for v1, and that the copy makes "claimed ≠ verified" unmistakable (AC-7).
- **Multiple claimants (Open Question 2).** PO lean: show all claims honestly, no silent
  winner. User/Architect confirm.

## Linked artifacts
- PRD: `engineering-team/phase2-prd.md` **§2.10** (the charter — trust-independent core, Lane
  1; the "Verified Author" second bullet deferred to the next story / Block C), §2.0
  (fixture/CI sequencing), §3 (deferred automated verification + media storage).
- Schema / assertion prior art: `packages/schemas/src/BookRecord.ts` (the librarian-signed
  canonical record + existing `authorPubkey`), `packages/schemas/src/BookRating.ts` and
  `packages/schemas/src/BookTagAssertion.ts` (the author-signed `#a`-referencing assertion
  shape this mirrors), `packages/schemas/src/concept-headers.ts` (header addresses).
- ADRs to reference: `engineering-team/decisions/0005-sovereign-rating-publish.md` (the
  author-signed write/read-back + replaceable d-tag), `0006-custodial-server-signing.md`
  (custodial ephemeral-wrap signing, both tiers), `0009-...` (the tag-assertion model — the
  `#a`-referencing assertion), `0014-graperank-personalize.md` / `0025-weighted-consensus.md`
  (the read-time overlay/merge pattern the metadata overlay mirrors). The Architect picks the
  exact predecessor ADRs.
- Story 29 identity resolution: `engineering-team/stories/done/29-profile-ia-nostr-disclosure.md`
  and `apps/web/src/hooks/useProfileMeta.ts` (`useProfileMeta` / `displayNameOf`) — the
  badge + "Books by this author" name resolution.
- Related catalog/submission code: `apps/api/src/routes/books.ts`,
  `apps/web/src/routes/BookDetail.tsx`, `apps/web/src/components/BookHeader.tsx`,
  `apps/web/src/routes/Submit.tsx` (the existing submission-time "I am the author" toggle —
  distinct from catalog claiming), `apps/web/src/routes/Profile.tsx`.
- ADR for this story: `engineering-team/decisions/0032-author-claiming.md`
- Test plan: `engineering-team/stories/31-author-claiming.test-plan.md`
- Review: (filled in after Review phase)
