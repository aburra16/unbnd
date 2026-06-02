# Story 32: Verified Author upgrade + gated author metadata editing (trust-dependent — Block C)

**Status:** Draft
**Created:** 2026-06-01
**Type:** Feature

## Background

This is **Lane 2 / Block C** of PRD §2.10 — the trust-DEPENDENT half that sits on top of
Story 31's trust-independent claim core. Story 31 (ADR 0032, gate decisions 2026-06-01)
shipped open claiming: any signed-in user can claim a catalog book, the book shows an
**"Author (claimed)"** badge listing every claimant honestly, and the author profile gains
"Books by this author." Story 31 deliberately deferred two things to this story: the
**verification upgrade** and **author metadata editing** (the gate decided editing is gated
**behind** verification, so it could not ship until verification existed).

This story builds that trust-dependent layer:

1. **The `author-verified` assertion** — a curator-gated write by which trusted curators
   validate (or dispute) a claim, sensitivity `normal` (PRD §2.10).
2. **The verification consensus** — when trusted-weighted consensus over those assertions
   exceeds a threshold, a claim becomes **Verified**, with honest degrade (no trust → no
   verification, never a fabricated badge).
3. **The "Verified Author" badge upgrade** — the `AuthorBadge` gains a verified state,
   honestly distinguishing "claimed" from "Verified Author."
4. **The author edit overlay** — a verified author publishes an author-signed `author-edits`
   event carrying **blurb, cover URL, and purchase links** (and only those), reusing the
   reserved header and the read-merge seam Story 31 defined.
5. **The read-merge** — the overlay is applied at read time (`effectiveBook`) **only when
   that author is Verified for that book**; the canonical librarian-signed record is never
   mutated.

**PRD anchor (verbatim, §2.10):** "Verification is trust-based: trusted curators
validate/dispute via a new `author-verified` tag (sensitivity `normal`); if trusted
consensus exceeds the threshold, the badge upgrades to 'Verified Author.' Automated
verification (website/ISBN matching) is Phase 3. A claimed/verified author can edit blurb,
cover URL, and purchase links, but not community tags, ratings, or others' reviews." Its
acceptance bullets reproduced here: "Trusted curators can validate claims via
`author-verified` assertions; 'Verified Author' upgrade gated by trust consensus" and
"Verified authors can edit their book's metadata (blurb, cover, purchase links) and nothing
else."

**What Story 31 already built (the foundation — cited):**

- **The `BookClaim` event** (ADR 0032 §1; `packages/schemas/src/BookClaim.ts`) — a
  claimant-signed kind-39999 event, `["a", "39999:<librarian>:<slug>"]` + `["p",
  <claimantHex>]` + `["t", <slug>]`, z-tagged to the **`book-claims`** header
  (`BOOK_CLAIMS_HEADER_SLUG = "book-claims"`, `concept-headers.ts`), d-tag
  `claim--<slug>--<claimant8>` (per-claimant replaceable). This is the (author, book) pair
  the `author-verified` assertion targets.
- **The reserved `author-edits` header + the overlay event design** (ADR 0032 §3, "the
  Story-32 plug-in point"). ADR 0032 reserved `BOOK_AUTHOR_EDITS_HEADER_SLUG =
  "author-edits"` (comment-only, not added) and designed `BookAuthorOverlay`: a
  claimant-signed kind-39999 event, `["a", <bookAtag>]` + `["p", <authorHex>]`, carrying
  blurb/cover/purchase-links, under a per-(author, book) replaceable/reversible d-tag
  `authoredit--<slug>--<author8>`. **This story builds that schema, header, and the write
  path** — exactly what ADR 0032 §"Out of scope" / "Follow-ups" hands to Story 32.
- **The read-merge seam** (ADR 0032 §3). `GET /api/books/:slug`
  (`apps/api/src/routes/books.ts`) already assembles `{ book, claimants }` in a parallel
  read. ADR 0032 names this assembly point as the place Story 32 adds (a) the overlay
  events read and (b) the trust read of which claimant is Verified, then computes
  `effectiveBook = (canonical BookRecord) × (author overlay applied only when that author is
  Verified)`. Today the seam is a pass-through: `effectiveBook === canonical`.
- **The `AuthorBadge`** (`apps/web/src/components/AuthorBadge.tsx`) — renders "Claimed by
  {name}" for each claimant via the Story 29 identity path (`useProfileMeta` /
  `displayNameOf`), and **never** says "verified" yet. This story extends it with a verified
  state.
- **The book surfaces** — `apps/web/src/routes/BookDetail.tsx` (threads `claimants` from
  `api.books.get`), `apps/web/src/components/BookHeader.tsx` (renders `<AuthorBadge>` beside
  the `by {authorName}` line). The claim/edit surfaces extend these.

**The trust machinery to reuse (no new scoring math):**

- **Weighted consensus** (Story 25 / ADR 0025). `apps/api/src/tags/aggregate.ts` exposes
  `aggregateBookTagsWeighted` (and the ratings path `weightedRatings`) — the apply/dispute
  trust-weighting pattern: weight each asserter by `TrustProvider.weights(observerHex,
  asserterHexes)`, sum the weights of above-zero asserters as the trusted consensus, raw
  counts remain the unweighted basis. The `author-verified` consensus is computed with the
  **same** weighting move, over `author-verified` assertions instead of tag assertions.
- **The curator gate** (Story 30 / ADR 0031). `apps/api/src/routes/submissions.ts`
  server-enforces an emergent curator gate: the session user's own trust weight from the
  house observer's vantage (`TrustProvider.weights(houseObserverHex, [sessionUserHex])`)
  compared against `config.curatorThreshold` (env `CURATOR_THRESHOLD`, validated in (0,1],
  default `0.5`). Below the gate → server-side rejection (not merely UI-hidden). The
  `author-verified` write is the **same** curator-gated write: only a session user above
  `CURATOR_THRESHOLD` from the house vantage may assert or dispute.
- **The trust seam** (ADR 0014). `apps/api/src/trust/{types,index}.ts` —
  `weights(observerHex, targetHexes)` resolves to an empty map on backend failure (never
  throws); observer = `config.houseObserverPubkey` (the House vantage). The **fixture
  provider** (`apps/api/src/trust/fixture.ts`, ADR 0017, selected by `TRUST_PROVIDER=fixture`
  + a deterministic `TRUST_FIXTURE`) gives a known observer known weights over a known set
  of curator keys, so the verification gate, the consensus, and the edit-application flip are
  all CI-testable with no Brainstorm, no relay, and no human — exactly as Story 25 and Story
  30 are.

**Both tiers.** The `author-verified` assertion (curator-signed) and the `author-edits`
overlay (author-signed) must both work for **sovereign** (NIP-07 client-sign) and
**custodial** (server ephemeral-wrap, ADR 0006) users, reusing the shipped two-tier write
paths exactly as ratings/tags/claims do. No new crypto (CLAUDE.md crypto policy).

**Architecture invariants (CLAUDE.md).** POV-first (§1): verification is computed from the
house observer's vantage, the same way trusted tag/rating consensus is. Decentralized-first
(§2): the `author-verified` *assertion* is published permissionlessly like any event; the
**curator gate is enforced at read/write authorization**, not by an administered role list,
and emerges from GrapeRank weight (the gate is the same emergent gate Story 30 uses, not the
domain-specific `curator` role tag — that is C-7, Phase 3, OUT). Filter-at-view-time (§3):
the verification verdict and the edit overlay are composed at **read time** in
`effectiveBook`, never written back onto the canonical record. Trust shows as the verified
badge / honest counts, never a raw GrapeRank number.

This is Phase-2 / Block-C scope and touches **no** PRD §11.3 / §3-deferred "Out of Scope"
surface: no payments, no Blossom/cover hosting/upload, no ebook sales, no bounty
marketplace, no print-on-demand, no social feed, no reading progress, no federation, no
email notifications, and explicitly **no automated website/ISBN/domain verification** (Phase
3).

## User-facing description

As a **Curator** whose trust weight from the house vantage clears the curator threshold, I
want to validate (or dispute) an author's claim on a book by asserting **author-verified**,
so that genuine authorship can be confirmed by the people the network trusts, and a false
claim does not gain edit access.

As an **Author** who has claimed my book and whose authorship has been verified by trusted
curators, I want my badge to upgrade from "claimed" to **Verified Author** and to be able to
edit my book's **blurb, cover image, and purchase links** (and nothing else — not the
community's tags, not ratings, not other readers' reviews), so that the catalog reflects how
I represent my own work, with the canonical librarian record left intact.

As a **Reader** on a book's detail page, I want the badge to honestly distinguish a
self-claim ("claimed") from a trust-verified author ("Verified Author"), and I want any
author-edited blurb/cover/link to appear only once that author is verified, so that an
unverified claimant can never change what I see on a canonical catalog book.

## Acceptance criteria

Testable from the outside, each independently verifiable **against the fixture
`TrustProvider`** (`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE` giving the
house observer known weights over a known set of curator keys), with no Brainstorm call, no
relay, and no human — mirroring how Story 25 and Story 30 trust tests are structured, and
pinning the verification threshold to a fixture value to assert behavior on both sides of it.
Copy in these ACs is illustrative and must pass the no-slop rule
(`memory/feedback_unbnd_copy_and_visual.md`); final strings are the Architect/Implementer's
within that constraint. No hand-rolled crypto: both tiers reuse the shipped signing paths
(NIP-07 sovereign, server ephemeral-wrap custodial; ADR 0006 / CLAUDE.md crypto policy). No
raw GrapeRank number appears on any surface; the badge shows "Verified Author" or "claimed,"
never a trust-tier string or score (CLAUDE.md).

- [ ] **AC-1 — A curator above the threshold can assert (or dispute) `author-verified`
  against an (author, book) claim; the write is curator-gated server-side.** Given a
  signed-in user (sovereign or custodial) whose own trust weight from the **house observer's**
  vantage is **at or above `CURATOR_THRESHOLD`** (the Story 30 / ADR 0031 emergent gate,
  computed via `TrustProvider.weights(houseObserverHex, [sessionUserHex])`), when they assert
  **author-verified** on a specific claim — targeting the (author pubkey, book) pair — then a
  kind-39999 `author-verified` assertion is published, signed by the curator, referencing the
  book address and the claimant being verified, with an apply/dispute polarity. A user
  **below** the threshold, absent from the observer's weight map, or signed out has **no**
  assert affordance, and a direct assert/dispute request from them is **rejected server-side**
  (not merely hidden), mirroring the Story 30 below-gate rejection. Re-asserting by the same
  curator on the same (author, book) is idempotent (replaces under a stable per-(curator,
  author, book) key; no duplicate).

- [ ] **AC-2 — Verification is the trust-weighted consensus of `author-verified` assertions,
  exceeding a threshold.** Given a claim with a set of `author-verified` apply/dispute
  assertions from a mix of curators with fixture weights, when the claim's verification is
  read **from the house observer's vantage**, then it is computed by trust-weighting those
  assertions with the **same** `TrustProvider.weights` / `aggregateBookTagsWeighted`-style
  move Story 25 uses (a trusted curator's assertion outweighs an untrusted one; raw counts
  remain the unweighted basis), and the claimant is **Verified** when that trusted-weighted
  consensus **exceeds a configurable verification threshold** and not otherwise. Untrusted
  volume cannot push a claim over the bar (a claim asserted by many zero-weight accounts is
  not verified). The threshold is configurable (env), pinned to a fixture value in tests, and
  behavior is asserted on both sides of it.

- [ ] **AC-3 — The author's own `author-verified` assertion does not count toward their own
  verification (no self-verification).** Given a claimant who also asserts `author-verified`
  on their own claim, when that claim's verification consensus is computed, then the
  claimant's own assertion is **excluded** from the consensus, so an author cannot verify
  themselves regardless of their own trust weight. (Whether the author may even publish such
  an assertion is the Architect's call; the AC is that it does not contribute to the
  verdict.)

- [ ] **AC-4 — The "Author" badge upgrades from "claimed" to "Verified Author" when (and only
  when) the claim is Verified; "claimed" and "Verified Author" are honestly distinguished.**
  Given a book whose claimant is Verified per AC-2, when the book detail page is read, then
  the `AuthorBadge` renders a **Verified Author** state for that claimant (visually distinct
  from the unverified "Claimed by" state), resolving identity via the Story 29 path
  (`useProfileMeta` / `displayNameOf`, short-npub fallback) and linking to the author's
  profile. Given a claimant who is **not** Verified, the badge stays in the honest "claimed"
  state (never "verified"). The two states are unmistakably different in copy and treatment,
  and no trust-tier string or raw GrapeRank number appears.

- [ ] **AC-5 — A Verified author can publish an author-edits overlay carrying only blurb,
  cover URL, and purchase links — and nothing else.** Given a user who is **Verified** for a
  book (their claim cleared AC-2), when they open the author edit surface, then it exposes
  inputs for **exactly** three things — **blurb**, **cover URL**, and **purchase link(s)** —
  pre-filled with the current effective values, and **nothing else**: no input for title,
  author name, ISBN, page count, year, community tags/genres, ratings, or any other reader's
  review. Saving publishes a **claimant-signed** kind-39999 `author-edits` overlay event
  (`#a` → book address, the reserved `author-edits` header from ADR 0032), under a
  per-(author, book) replaceable/reversible d-tag. A user who is **not** Verified for the book
  (a bare claimant, a non-claimant, or signed out) has **no** edit affordance, and a direct
  author-edit request from them is **rejected server-side**. Cover URL and purchase link
  inputs are validated as well-formed `http(s)` URLs before publish (Story 22 `httpUrl`
  parity), with an honest inline message and no event published on a bad value.

- [ ] **AC-6 — The read-merge applies the author overlay only when that author is Verified;
  the canonical librarian record is never mutated, and the canonical value is always
  recoverable.** Given a book with a canonical `BookRecord`, a claim, and an `author-edits`
  overlay, when `GET /api/books/:slug` assembles `effectiveBook`, then blurb/cover/purchase-
  links are composed at **read time** as `canonical × overlay` **only if that author is
  Verified** (AC-2); for a bare (unverified) claim the overlay is **not** applied and the
  canonical values render. The librarian-signed canonical `BookRecord` under the `books`
  header is **never** mutated (the API holds no librarian secret and must not gain one). The
  overlay is **reversible**: clearing an overlaid field and re-saving removes the author's
  value for that field (replace under the overlay's stable d-tag), reverting the read to the
  canonical value. When an overlaid field is applied, it renders with an explicit
  **author-provided** attribution so a reader can tell the author's blurb/cover/link from the
  catalog's.

- [ ] **AC-7 — Multiple verified claimants on one book resolve deterministically and
  honestly.** Given a book with **two or more** claimants who each clear verification, when
  `effectiveBook` is assembled, then the overlay-application is resolved by a **single
  deterministic rule** (Open Question 3 / Flags — PO recommends: apply **no** overlay on
  conflict and surface all verified authors honestly, so a contested book never silently
  takes one author's edits), and the badge shows all verified authors without fabricating a
  single winner. The chosen rule is documented and tested with a two-verified-claimant
  fixture.

- [ ] **AC-8 — Honest degrade: no fabricated verification.** Given trust is unavailable (no
  observer configured, the provider errors, or the observer has no scores), when a claim's
  verification is read, then **no** claimant is treated as Verified (the badge stays
  "claimed"), **no** author overlay is applied (canonical renders), and the curator gate
  **closes** (no user is treated as above the gate from an absent/failed vantage) — never a
  fabricated "Verified" badge and never an applied overlay from an unverifiable claim. The
  `weights` seam never throws (empty map on backend failure, per the `TrustProvider`
  contract), exactly as the ratings/tags/promotion paths degrade today.

- [ ] **AC-9 — Both tiers; built and verified against the fixture provider in CI.** Given a
  **sovereign** (NIP-07) user, when they assert `author-verified` (as a curator) or save an
  author edit (as a verified author), the event is client-signed via the existing NIP-07
  path; given a **custodial** (email) user, the server signs with the session's
  ephemeral-wrapped key (ADR 0006), returning the existing `reauth_required` 401 when the
  session key is gone. Neither path introduces new crypto. Given `TRUST_PROVIDER=fixture`
  with a deterministic `TRUST_FIXTURE`, when the test suite runs in CI, then the curator-gated
  assertion (AC-1), the weighted verification consensus + threshold (AC-2), the
  self-verification exclusion (AC-3), the badge upgrade (AC-4), the gated edit + field
  whitelist (AC-5), the verified-only read-merge + reversibility + canonical-never-mutated
  (AC-6), the multi-verified resolution (AC-7), and the honest degrade (AC-8) are all
  exercised green with no Brainstorm call, no relay, and no human. No Brainstorm/NIP-85
  specifics leak outside `apps/api/src/trust/brainstorm.ts`; the ADR 0014 architecture guard
  test stays green.

## DList shapes touched

This adds the `author-verified` assertion layer and the `author-edits` overlay layer (both
`#a`-referencing the book address, mirroring the rating/tag-assertion/claim pattern), plus a
trust *view* (the verification consensus) and the read-merge. **The Architect names the exact
shapes** — the `author-verified` event's tag layout (how it targets the (author, book) pair
and carries apply/dispute polarity), its d-tag scheme, the `author-edits` overlay's exact
fields, and the header(s) they z-tag to (the reserved `author-edits` header from ADR 0032,
and whether `author-verified` gets its own header or folds into an existing one). The PO
identifies the surfaces; it does not fix the schema.

- `kind:39999` — catalog **`BookRecord`** under the librarian's `books` header (read only;
  the canonical record being verified-author-edited; **never mutated**).
- `kind:39999` — **`BookClaim`** under the `book-claims` header (read; the (author, book)
  pair the `author-verified` assertion targets and the overlay author must own — Story 31).
- `kind:39999` — **`author-verified`** assertion (new; curator-signed; `#a` → book address;
  targets the claimant; apply/dispute polarity). The trust-weighted consensus over these is
  the verification.
- `kind:39999` — **`author-edits` overlay** (new; author-signed; `#a` → book address)
  carrying blurb / cover URL / purchase link(s); reversible/replaceable under a stable
  per-(author, book) d-tag (the reserved design from ADR 0032 §3).
- `kind:39998` — concept header(s) the `author-verified` assertion and the `author-edits`
  overlay z-tag to (the reserved `author-edits` header; Architect names the verified-assertion
  header), plus the `books` and `book-claims` headers (read).
- `kind:0` — read only, for identity resolution (Story 29 `useProfileMeta`) on the badge.
- Trust weights consumed via the existing `TrustProvider` seam (`apps/api/src/trust/`); the
  fixture provider supplies deterministic weights in CI.

## Out of scope

State explicitly — do not build:

- **Automated author verification** (website / ISBN / domain matching) — Phase 3 (PRD §3,
  §2.10). Verification in this story is **only** the trusted-curator `author-verified`
  consensus.
- **Editing anything but blurb / cover URL / purchase links.** No editing of title, author
  name, ISBN, page count, year, **community tags/genres**, **ratings**, or **any other
  reader's review**. The §2.10 "and nothing else" boundary is a hard constraint (AC-5).
- **Mutating the librarian-signed canonical `BookRecord`,** or giving the API a librarian
  signing secret. Author edits are author-signed overlays composed at read time (AC-6). The
  `BookRecord.authorPubkey` seeded value is not touched.
- **Cover / image hosting or upload.** Cover is a **URL** the author provides; no Blossom, no
  upload (PRD §3 defers media storage).
- **The general curator-role system** (the domain-specific `curator` tag-assertion targeting a
  pubkey, `trust.roleScore(pubkey, role)` — PRD C-7, Phase 3). This story reuses the **Story
  30 emergent house-PoV gate** (`CURATOR_THRESHOLD`) as-is; it does not build a role-tag
  mechanism, a "grant curator" flow, or a domain-scoped role.
- **The house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → the production librarian). The interim
  house vantage (nosfabrica) stays; the feature is built and verified against the fixture
  provider regardless (ADR 0017 / PRD §2.0).
- **Re-opening the Story 31 claim core** — the `BookClaim` event, the open-claim badge, and
  "Books by this author" are unchanged. This story only **extends** the badge with a verified
  state and adds the verification + edit layers.
- **Disputing/removing a published author edit by a third party,** or un-verifying via a
  kind-5 deletion. Dispute here is the `author-verified` **dispute polarity** lowering the
  consensus (AC-2, Open Question 5); tombstoning events is out.
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 / §3-deferred "Out of Scope": this story touches none of
payments, file hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social
feed, reading progress, federation, or email notifications. It is a curator-gated
trust-weighted verification assertion + a reversible author-signed metadata overlay applied
at read time only on verification + a badge upgrade.

## Open questions

Resolve before approving the story (PO recommendations in Flags below).

1. **The verification consensus model.** Weighted-sum (Story-25 style: sum of above-threshold
   curator weights ≥ a bar) vs. a count-gate (≥ N curators each above weight W, the C-7
   style). This sets AC-2's exact computation. PO recommends weighted-sum (reuses
   `aggregateBookTagsWeighted` directly, consistent with how tag/rating consensus already
   works). Architect confirms.

2. **What `author-verified` targets and who asserts it.** PO position: it targets the
   **(author, book) pair** (i.e. a specific `BookClaim`, identified by the claimant pubkey +
   book address), and only a session user **above `CURATOR_THRESHOLD`** from the house
   vantage may assert/dispute (the Story 30 gate). Architect confirms the exact targeting tag
   layout (does it reference the claim's address, or carry `#a` book + `#p` claimant?) and the
   d-tag scheme.

3. **Multiple verified claimants on one book — conflict resolution (AC-7).** If two claimants
   both clear verification, whose edit overlay applies? PO recommends **none-on-conflict**
   (apply no overlay, show all verified authors honestly), with **first-verified** and
   **most-recent** as the alternatives. Architect/gate picks the rule.

4. **Self-verification (AC-3).** PO position: exclude the author's own `author-verified`
   assertion from their consensus. Confirm — and whether the author may publish one at all
   (PO lean: harmless to publish, must not count).

5. **Dispute polarity (AC-2).** Does a curator's `author-verified` **dispute** lower the
   consensus (apply/dispute polarity exactly like tag assertions, ADR 0009/0025)? PO lean:
   **yes** — symmetric apply/dispute, so trusted curators can contest a false claim, mirroring
   the existing tag-assertion model. Confirm.

6. **Edit-surface placement.** Does the verified-author edit surface live **inline on
   BookDetail** (revealed when the viewer is the verified author) or a **dedicated edit
   view**? PO lean: inline on BookDetail (the edit affordance is contextual to the book and
   only the verified author sees it), but this is an Architect/UX call.

7. **Verification threshold default + config key.** A new threshold distinct from
   `CURATOR_THRESHOLD` (the gate to *assert*) vs. reusing it (the bar the *consensus* must
   clear). PO position: a **separate** configurable verification threshold (env), since "who
   may assert" and "how much trusted weight makes a claim Verified" are different questions.
   Architect pins the default and the env name; tests pin a fixture value (AC-2).

## Flags for the gate (PO — contentious; the user decides)

- **The verification consensus model (Open Question 1).** PO recommends **weighted-sum**
  (sum of above-threshold curator weights ≥ a configurable bar), reusing
  `aggregateBookTagsWeighted` / the Story-25 weighting directly, because the rest of the app's
  consensus (tags, ratings) already works this way and it keeps one trust-weighting idiom. The
  **count-gate** alternative (≥ N distinct curators each above weight W) is more legible
  ("three trusted curators confirmed this author") and is the shape C-7 will generalize, but
  it introduces a second consensus idiom. The user picks; the choice sets AC-2.

- **Multi-verified conflict (Open Question 3 / AC-7).** PO recommends **none-on-conflict**:
  if two claimants both verify, apply **no** overlay and show both as Verified Authors, so a
  contested book never silently shows one author's edits. **first-verified** (the earliest
  verified claim's overlay wins) and **most-recent** are the alternatives; both fabricate a
  single winner the data may not support. The user decides the rule.

- **Self-verification (Open Question 4 / AC-3).** PO recommends **excluding** the author's own
  assertion from their consensus. Low-contention but load-bearing for honesty; confirm.

- **Dispute polarity (Open Question 5).** PO recommends **symmetric apply/dispute** (a trusted
  curator's dispute lowers the consensus), consistent with the tag-assertion model. Confirm,
  or restrict to apply-only for v1.

- **Edit-application is now ON (the Story 31 deferral resolves here).** Story 31's gate
  decision was "editing is gated behind verification, deferred to Story 32." This story turns
  it on: a verified author's overlay **does** displace the canonical blurb/cover/links at read
  time (with author-provided attribution, AC-6), but **only** on verification — so an
  unverified claim still has **zero** vandalism surface (AC-6/AC-8). The user should confirm
  that a Verified author editing the displayed blurb/cover/link (attributed, reversible,
  canonical intact) is the intended v1 behavior.

- **Thin-graph reality.** On today's graph (interim house observer = nosfabrica, no real
  curator weights over our seeded keys), **no real user clears the curator gate**, so in
  practice **no claim verifies** until the graph fills in — exactly as promotion is
  effectively librarian-only today (Story 30). PO recommendation: **acceptable for v1** — it
  is the honest, safe state (no verification, no overlay applied, badge stays "claimed"), and
  the fixture provider proves the whole flow works for when real signal arrives. The user
  confirms "no verified authors until the graph fills" is acceptable for v1.

## Linked artifacts
- PRD: `engineering-team/phase2-prd.md` **§2.10** (the charter — the `author-verified`
  trusted-curator consensus, the "Verified Author" upgrade, the verified-author edit access to
  blurb/cover/purchase-links and nothing else), §2.0 (fixture/CI sequencing), §3 (deferred
  automated verification + media storage).
- Foundation story + ADR (the seam this builds on): `engineering-team/stories/done/31-author-claiming.md`
  and `engineering-team/decisions/0032-author-claiming.md` (the `BookClaim` event, the reserved
  `author-edits` header, the `{ book, claimants }` read-merge seam in `GET /api/books/:slug`,
  the `AuthorBadge`, the designed-not-built `BookAuthorOverlay`).
- Trust ADRs: `engineering-team/decisions/0014-graperank-personalize.md` (the `TrustProvider`
  `weights` / `hasScores` seam + observer resolution), `0025-weighted-consensus.md` (the
  weighted apply/dispute consensus reused for the verification consensus),
  `0017-fixture-trust-provider.md` (the fixture provider this is verified against).
- Curator-gate ADR: `engineering-team/decisions/0031-trust-gated-promotion.md` (the emergent
  house-PoV `CURATOR_THRESHOLD` gate reused for who may assert `author-verified`).
- Two-tier write / crypto: `engineering-team/decisions/0006-custodial-server-signing.md`
  (custodial ephemeral-wrap, both tiers), `0005-sovereign-rating-publish.md` (author-signed
  write + replaceable d-tag + read-back), `0009-...` (the `#a`-referencing apply/dispute
  assertion model the `author-verified` tag mirrors).
- Identity resolution: `apps/web/src/hooks/useProfileMeta.ts` (`useProfileMeta` /
  `displayNameOf`) — the badge name resolution.
- Related code: `apps/api/src/routes/books.ts` (the read-merge seam), `apps/api/src/tags/aggregate.ts`
  (`aggregateBookTagsWeighted` / `weightedRatings`), `apps/api/src/routes/submissions.ts` (the
  curator gate), `apps/api/src/trust/{types,fixture,index}.ts` (the trust seam),
  `apps/web/src/components/AuthorBadge.tsx`, `apps/web/src/components/BookHeader.tsx`,
  `apps/web/src/routes/BookDetail.tsx`.
- ADR for this story: `engineering-team/decisions/0033-verified-author.md` (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
