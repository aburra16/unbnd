# Story 30: Trust-gated submission promotion (manual, with signals)

**Status:** Draft
**Created:** 2026-06-01
**Type:** Feature

## Background

Community submissions ship today (Stories 16a / 16b-i, ADR 0016). A submission is
a **user-signed** kind-39999 book record z-tagged to the librarian's
`book-submissions` concept header, kept deliberately separate from the
librarian-seeded canonical catalog. `apps/api/src/routes/submissions.ts` writes
them (sovereign → NIP-07 client-sign; custodial → server ephemeral-wrap),
`GET /api/submissions` lists them publicly, `GET /api/submissions/mine` lists the
signed-in user's own, and the web `/submissions` route browses them. They never
appear in genre browse, search, or shelves. The seeded catalog, by contrast, is
**librarian-signed** kind-39999 book records z-tagged to the librarian's `books`
concept header (`apps/seeder/src/index.ts`, `buildBookRecordsHeaderAddress`,
`mapWorkToBookRecord`, signed with `LIBRARIAN_NSEC` via `finalizeEvent`). The
distinguishing facts are: (a) **author** of the record (librarian vs. submitter),
(b) **parent header** it z-points to (`books` vs. `book-submissions`), and
(c) the `source` tag on the record (`openlibrary`/`author`/`community`, per
`packages/schemas/src/BookRecord.ts`).

This story decides **which submissions become first-class catalog entries** and
how. It picks up the work deferred in **Story 16b** ("Trust-gated submission
promotion + shared role gate", `engineering-team/stories/16b-submission-promotion.md`,
status DRAFT — logged, not scheduled) and the `16b-ii` promotion step explicitly
deferred in `submissions.ts` (the inline note: "promotion into the catalog is
16b-ii"). Story 16b was logged before its prerequisites existed. Those
prerequisites have since shipped:

- **The fixture `TrustProvider`** (Story 17 / ADR 0017) gives deterministic
  weights for a known observer over a known key set, so a trust gate is
  CI-testable with no Brainstorm, no relay, and no humans.
- **Trust weighting + GrapeRank personalization** (ADR 0014) and **weighted
  consensus** (Story 25 / ADR 0025) shipped the `weights(observerHex, targetHexes)`
  / `hasScores(observerHex)` seam and the House⇄Yours observer-resolution pattern
  (`apps/api/src/routes/ratings.ts`: explicit `?observer=` else
  `config.houseObserverPubkey`).
- **Custodial personalization** (Story 23 / ADR 0026) lets a custodial user become
  a scored observer through the same seam.

Story 16b's original sketch assumed an **automatic trust-cutoff** promotion and a
**manually-assigned curator/role assertion**. The PRD §2.7 decision of record
supersedes both: Phase 2 ships **manual promotion with trust signals as decision
support**, and the "curator gate" is **emergent** from a user's GrapeRank house-PoV
influence above a configurable threshold — **not** a role someone administers (this
also satisfies CLAUDE.md invariant 2: the trusted set emerges from a PoV's
GrapeRank, never from an administered list). Automatic threshold promotion is
deferred to Phase 3 (PRD §3, and PRD §2.7 verbatim).

**The load-bearing architectural unknown — flagged for the Architect.** PRD §2.7
requires that promote = republish the book record **signed by the librarian**
under the `books` concept header. The API does **not** hold the librarian secret
today. `apps/api/src/config.ts` exposes only `LIBRARIAN_PUBKEY` (a 64-hex public
key, validated as such); there is no `LIBRARIAN_NSEC` / private-key / signer path
anywhere in `apps/api/src`. The only `finalizeEvent` use in the API
(`apps/api/src/index.ts:133-146`, `custodialSign`) signs **the session user's own**
event with that session's ephemeral-wrapped key (ADR 0006) — never a librarian
key. The librarian secret (`LIBRARIAN_NSEC`) lives **only in the seeder**
(`apps/seeder/src/index.ts:55-61`, decoded and used with `finalizeEvent`). So
"republish signed by the librarian" has no runtime mechanism in the API as built.
The PO states the requirement (a promoted book must end up as a librarian-signed
catalog record under the `books` header so it is indistinguishable from a seeded
entry). The **Architect resolves the mechanism** and its security posture (Open
Question 1 / Flags for the gate).

**PRD anchor:** phase2-prd **§2.7 "Trust-gated submission promotion (manual, with
signals)"** — the decision of record (manual-with-signals, not auto-threshold), the
emergent curator gate, the promote-by-librarian-republish requirement, and its four
acceptance criteria are reproduced into the ACs below. Build/test isolation is
**§2.0 / ADR 0017** (every trust-consuming feature is built and verified against the
fixture provider). Architecture invariants: CLAUDE.md §1 POV-first (the curator gate
is the SESSION user's own weight from the house observer's vantage), §2
decentralized-first (the gate is emergent, not administered; submissions are still
published permissionlessly by anyone), §3 filter-at-view-time. This is Phase-2 scope;
it touches no PRD §11.3 "Out of Scope" surface (no payments, Blossom/file hosting,
ebook sales, bounty marketplace, print-on-demand, social feed, reading progress,
federation, email notifications).

## User-facing description

As a **Curator** whose GrapeRank influence from the house vantage clears the
configured trust threshold, I want to see, on each community submission, the trust
signals that help me judge it — how many curators above the bar have rated or
tagged it, who they are, and the trust-weighted average rating — and I want a
**Promote** action that moves a submission I judge catalog-worthy into the main
catalog so it shows up in genre browse, search, and shelves alongside seeded books,
so that the catalog grows by curator judgment rather than raw submission volume.

As a **Reader** browsing `/submissions`, I want submissions that haven't been
promoted to stay in the submissions space rather than masquerading as catalog
entries, and I want any trust signals I'm shown to be honest — real counts from real
curators, or nothing — so that I can tell community submissions from the curated
catalog and trust what the page tells me.

## Acceptance criteria

Testable from the outside. Each criterion is independently testable **against the
fixture `TrustProvider`** (`TRUST_PROVIDER=fixture` + a deterministic
`TRUST_FIXTURE`), with no Brainstorm call, no relay, and no human — mirroring how the
Story 25 trust tests are structured (a known observer with known weights over a known
set of curator keys). The "curator threshold" is a configurable value; tests pin it
to a fixture value and assert behavior on both sides of it. Any copy in these ACs is
illustrative and must pass the no-slop rule
(`memory/feedback_unbnd_copy_and_visual.md`); final strings are the
Architect/Implementer's within that constraint. Trust shows as percentile tier
strings or honest counts/identities, never raw GrapeRank numbers (CLAUDE.md). No
hand-rolled crypto (CLAUDE.md crypto policy); the librarian-signing mechanism is the
Architect's to specify (Open Question 1) but must reuse the audited stack.

- [ ] **AC-1 — The curator gate is emergent from the session user's house-PoV trust
  weight, above a configurable threshold.** Given a signed-in user, when the API
  resolves whether that user is "above the curator gate," then it is computed as the
  user's own trust weight from the **house observer's** vantage
  (`TrustProvider.weights(houseObserverHex, [sessionUserHex])`, the same `weights`
  seam Story 25 uses) compared against a **configurable threshold**, and is **not**
  read from any manually-assigned role/flag/list. A user whose house-PoV weight is at
  or above the threshold is a curator for this feature; a user below it (or absent
  from the observer's weight map) is not. Observer resolution mirrors the ratings
  path (explicit vantage else `config.houseObserverPubkey`).

- [ ] **AC-2 — Per-submission trust signals are computed and displayed (the §2.7
  list).** Given a community submission and a set of rating/tag-assertion events on
  it, when its trust signals are read from the house observer's vantage, then the
  submission surfaces: (a) the **count** of ratings/tag-assertions whose author is a
  curator above the threshold, (b) the **identities** of those above-threshold
  curators (resolved to npub + display name via the Story 29 / profile resolution),
  and (c) the **trust-weighted average rating** computed via the existing weighted
  view (`weightedRatings`, ADR 0025) — not a raw average. These signals render on the
  submission as decision support.

- [ ] **AC-3 — A manual, curator-only Promote action republishes the submission as a
  librarian-signed catalog book record under the `books` header.** Given a user above
  the curator gate viewing a submission, when they invoke **Promote**, then the
  submission's book record is republished as a kind-39999 record **z-tagged to the
  librarian's `books` concept header** and **signed by the librarian** (mirroring the
  seeder's catalog shape: same header address, same `BookRecord` schema, `source`
  reflecting its community origin per the Architect's call), so the promoted book is a
  first-class catalog entry. The action is offered **only** to users above the gate; a
  below-gate or signed-out user has no Promote affordance and a direct promote request
  from them is rejected server-side (not merely hidden in the UI).

- [ ] **AC-4 — A promoted book appears in catalog surfaces; below-bar submissions stay
  in `/submissions`.** Given a submission has been promoted, when the catalog is read,
  then the promoted book appears in **genre browse, search, and shelves** alongside
  seeded entries (it is a librarian-signed record under the `books` header, so the
  existing catalog read paths pick it up with no special-casing). Given a submission
  has **not** been promoted, when `/submissions` is read, then it still appears there,
  and it does **not** appear in genre browse / search / shelves.

- [ ] **AC-5 — The curator threshold is configurable.** Given the curator-gate
  threshold is set via configuration (env), when it is changed, then the set of users
  who clear the gate (AC-1), the set of curators counted in the signals (AC-2), and
  who may Promote (AC-3) all shift accordingly, with no code change. The default value
  is the one the PO recommends (Flags for the gate) unless the user overrides it at the
  gate.

- [ ] **AC-6 — Honest degrade: no fabricated signals.** Given trust is unavailable (no
  observer configured, the provider errors, or the observer has no scores), when a
  submission's signals are read, then the page shows **no** curator counts/identities
  and **no** trust-weighted average rather than a fabricated or raw-presented-as-trusted
  number (it may fall back to an honest "no trusted signal yet" state, never a fake
  curator count), and the curator gate **closes** (no user is treated as above the gate
  from an absent/failed vantage), exactly as the ratings/tags paths degrade to raw
  today. The provider seam never throws (`weights` resolves to an empty map on
  backend failure per the `TrustProvider` contract).

- [ ] **AC-7 — Idempotent / safe double-promote.** Given a submission has already been
  promoted, when Promote is invoked again (by the same or another curator), then the
  catalog ends with **one** canonical book record for that book (no duplicate catalog
  entry), and the second invocation is a safe no-op or an honest "already in the
  catalog" response — not a second record, not an error that looks like failure. (The
  exact identity key for "same book" — the existing collision-safe submission slug /
  ISBN-13 from Story 16a — and the replace-vs-skip mechanism are the Architect's to
  specify; the AC is that double-promote cannot produce a duplicate.)

- [ ] **AC-8 — Built and verified against the fixture provider in CI.** Given
  `TRUST_PROVIDER=fixture` with a deterministic `TRUST_FIXTURE` giving the house
  observer known weights over a known set of curator keys, when the test suite runs in
  CI, then the curator gate (AC-1), the per-submission signals (AC-2), the curator-only
  promote authorization (AC-3), the promoted-vs-stays-in-submissions split (AC-4), the
  configurable threshold (AC-5), the honest degrade (AC-6), and idempotency (AC-7) are
  all exercised green with no Brainstorm call, no relay, and no human. No
  Brainstorm/NIP-85 specifics leak outside `apps/api/src/trust/brainstorm.ts`; the ADR
  0014 architecture guard test stays green.

## DList shapes touched

No **new** shapes. This reads existing events, adds a trust *view* over submissions,
and republishes an existing record shape under a different (existing) header.

- `kind:39999` — community **submission** book record under the `book-submissions`
  concept (read; the thing being judged and promoted).
- `kind:39999` — catalog **book record** under the librarian's `books` concept header
  (written on promote, librarian-signed, mirroring the seeder's
  `mapWorkToBookRecord` / `BookRecord` shape; this is what makes the book first-class).
- `kind:39999` — book **rating** events (read; the trust-weighted average and the
  curator-rating count in AC-2 are computed over these via the existing weighted view).
- `kind:39999` — book **tag-assertion** events (read; the above-threshold
  tag-assertion count/identities in AC-2 are computed over these).
- `kind:39998` — `books` and `book-submissions` concept headers (read; the parent
  pointers that distinguish catalog from submission — the promote target vs. source).
- Trust weights consumed via the existing `TrustProvider` seam (`apps/api/src/trust/`);
  the fixture provider supplies deterministic weights in CI.

## Out of scope

State explicitly — do not build. Several of these are named so the Architect inherits
the boundary:

- **AUTOMATIC threshold-based promotion.** Deferred to Phase 3 (PRD §2.7 decision of
  record and PRD §3). This story ships a **manual** curator action only; trust signals
  are decision support, never an auto-promote trigger. No background job that promotes
  on its own.
- **The accusatory-tag write picker and read-visibility gate** (PRD §2.8 — separate
  story). Accusatory tags stay hidden at read time exactly as today; this story adds no
  accusatory write affordance and no accusatory reveal, even though §2.8 reuses the same
  curator-gate threshold.
- **The trust-tier BADGE / "Verified Author"** surface (PRD §2.10 — separate story).
  This story does not add a curator badge, an author badge, or author claiming/verification.
- **DEMOTION / un-promote** (removing a promoted book from the catalog). Flagged as a
  candidate follow-up (Flags for the gate); not built here.
- **The house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → the production librarian).
  Deferred and explicitly fine per the user: nosfabrica
  (`DEFAULT_HOUSE_OBSERVER` in `apps/api/src/config.ts`) stays the interim house
  vantage. The feature is built and verified against the fixture provider regardless of
  the swap (ADR 0017 / PRD §2.0).
- **Any new trust-weighting math.** This reuses the shipped `weights` /
  `weightedRatings`; it introduces no new scoring, ranking, or threshold *computation*
  beyond the single configurable curator cutoff that AC-1/AC-5 describe.
- **Trust-weighted search re-ranking and homepage trust shelves** (PRD §2.9 — separate
  stories). A promoted book simply becomes eligible for those surfaces as any catalog
  book is; this story does not change ranking or shelf logic.
- **A manually-assigned curator/editor role mechanism** (the original Story 16b
  "role assertion" sketch). Superseded by the emergent gate; no role events, no
  grant-a-role flow.
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 "Out of Scope": this story touches none of payments,
file hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed,
reading progress, federation, or email notifications. It is a trust-view over existing
submissions plus a manual republish that reuses the existing catalog record shape.

## Open questions

Resolve before approving the story.

1. **Librarian-signing-at-runtime mechanism (load-bearing — for the Architect).**
   PRD §2.7 requires promote = republish **signed by the librarian** under the `books`
   header. PO finding: the API holds **no** librarian secret today — `config.ts` exposes
   only `LIBRARIAN_PUBKEY`; the sole `finalizeEvent` in the API
   (`apps/api/src/index.ts:133-146`) signs the *session user's* event via the ephemeral
   wrap (ADR 0006); the librarian `nsec` lives only in the seeder
   (`apps/seeder/src/index.ts:55-61`). So there is no runtime path to mint a
   librarian-signed catalog record. The Architect must resolve **how** promotion
   produces a librarian-signed record and its **security posture**: e.g. (a) the API
   gains a server-side librarian signer (a new secret in the deployment secrets store,
   resolved at runtime per the CLAUDE.md "never hardcode the librarian pubkey" rule,
   using `PrivateKeySigner` per the crypto policy) with the curator gate + the human
   Promote action as the access control; or (b) promotion enqueues a job the
   seeder-class signer fulfills; or (c) another mechanism. The PO does **not** prescribe
   the mechanism; it states the requirement and flags the security tradeoff for the gate.

2. **What `source` does a promoted record carry, and is the submitter's authorship
   preserved anywhere?** The seeder writes `source: "openlibrary"` (or `author`); a
   submission's record carries its community origin. On promote, the catalog record is
   librarian-signed (so the submitter is no longer the event author). Should the
   promoted record set `source: "community"` (and/or retain the original submitter via a
   tag) so provenance is honest, or mirror the seeder exactly? Architect's call; PO's
   lean is to preserve honest provenance (`source: "community"` + submitter reference)
   without breaking the catalog read paths.

3. **Identity display for signals (AC-2).** Reuse the Story 29 / profile resolution
   (npub → display name) to show curator identities. Confirm the resolution path and the
   honest fallback when a curator has no kind-0 (show npub-derived short form, never a
   fabricated name).

4. **Idempotency key (AC-7).** Is "same book" keyed on the Story 16a collision-safe
   submission slug (ISBN-13 → normalized `title--author--suffix`), and does promote
   **replace** under that slug's catalog d-tag (the librarian's `books` record d-tag is
   the slug, per `buildBookRecordDTag`) so a re-promote is a no-op replace? Architect
   confirms the exact key and replace-vs-skip.

## Flags for the gate (PO — contentious; the user decides)

- **Librarian-signing security posture (Open Question 1).** If the Architect's answer is
  "the API holds a librarian signing key at runtime," that is a meaningful change to the
  server's trust surface: a server-side secret that can mint canonical catalog entries.
  The control is the **curator gate + the human Promote action** (no automatic minting).
  The user should explicitly accept this posture (or direct the alternative — e.g. a
  seeder-fulfilled job) at the gate. **PO recommendation:** acceptable for v1 given the
  emergent curator gate and the manual action are the controls, but the user must
  knowingly accept the API holding a librarian signer; resolve in the ADR with the
  runtime-secret-resolution rule (CLAUDE.md) honored.

- **Curator threshold default + thin-graph reality.** On today's graph (interim house
  observer = nosfabrica, no real curator weights over our seeded keys), **no real user
  clears the gate**, so promotion is effectively **librarian-only at first**.
  **PO recommendation:** that is **acceptable for v1** — it is the honest, safe state
  (manual-with-signals degrades gracefully to "the operator/librarian promotes until the
  graph fills in"), and the fixture provider proves the gate works for when real signal
  arrives. Recommend the default threshold be set **conservative but non-zero** (a
  positive house-PoV weight, exact value the Architect pins as a config default), with
  the value living in env per AC-5. The user should confirm: is "librarian-only
  promotion until the graph fills" acceptable for v1, and what default?

- **Reversibility (demote).** PO recommends **deferring demotion** to a follow-up
  (candidate Story 30b), mirroring how Story 28's removal was carved to 28b — promoting
  is the v1 scope; un-promoting needs a kind-5 deletion/tombstone on a librarian-signed
  record and is heavier. The user confirms defer-vs-include.

- **Which signals + how identities are shown (AC-2).** PO adopts the exact §2.7 list
  (count + identities of above-threshold curator ratings/tag-assertions + trust-weighted
  average rating). The user confirms this is the full set and that identities show as
  npub + resolved display name (Story 29), with no raw GrapeRank numbers.

## Linked artifacts
- PRD: `engineering-team/phase2-prd.md` **§2.7** (the charter), §2.0 (fixture-verified
  sequencing), §2.8 / §2.10 (the out-of-scope sibling stories).
- Predecessor stories: `engineering-team/stories/16b-submission-promotion.md` (the
  deferred 16b this picks up), `engineering-team/stories/done/16a-submission-write.md`
  (the submission write-path), `engineering-team/decisions/0016-submission-write.md`,
  `engineering-team/decisions/0015-submission-dedup.md`.
- Trust ADRs: `engineering-team/decisions/0017-fixture-trust-provider.md` (the fixture
  provider this is verified against), `0014-graperank-personalize.md` (the
  `TrustProvider` `weights`/`hasScores` seam + observer resolution),
  `0025-weighted-consensus.md` (the weighted view reused for the trust-weighted average),
  `0026-custodial-personalization.md` (custodial observers).
- ADR for this story: (filled in after Architecture phase)
- Test plan: (filled in after Test Design phase)
- Review: (filled in after Review phase)
