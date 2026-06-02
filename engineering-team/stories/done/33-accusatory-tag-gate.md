# Story 33: Accusatory-tag visibility — trust-gated write picker + auditable read gate

**Status:** Done
**Created:** 2026-06-02
**Type:** Feature

**Gate decisions (2026-06-01):** librarian-signed reveal event via worker; librarian-only reveal;
sensitivity-conditional write gate reusing CURATOR_THRESHOLD; tag-only attributed render. See
`engineering-team/decisions/0034-accusatory-tag-gate.md`.

**Amendment (2026-06-02):** the reveal/withdraw **trigger is ops-only** — an operator-run worker
subcommand / CLI on the droplet (mirroring the promoter cron), **not** a librarian-session API
endpoint and **not** an in-app reveal button. The librarian key never enters a browser; the worker
holds it and mints off the API. No `POST /api/tags/reveal` / `…/withdraw` route, no reveal UI. The
write gate, picker signal, `AccusatoryReveal` schema + `accusatory-reveals` header, the read-filter
+ batched reveal lookup, the honest render, the `reveals` table + the worker reveal job-kind are all
unchanged. See the Amendment block in `engineering-team/decisions/0034-accusatory-tag-gate.md`.

## Background

This is **PRD §2.8 "Accusatory-tag visibility (manual gate)"** — the decision of record
that accusatory tags (e.g. `ai-generated`) stay behind a **manual, explicit gate** in
Phase 2, **not** an automatic/emergent trust-consensus reveal. The PRD's rationale, verbatim:
"Auto-revealing accusations from a consensus of a dozen people has almost no statistical
basis and carries defamation/moderation exposure. Automated trust-weighted reveal is
deferred to Phase 3." Two things ship: (1) the accusatory-tag **write picker** becomes
available to users **above the curator trust threshold**, so trusted curators can assert
them; (2) **visibility on book detail stays gated by an explicit, auditable mechanism**
(manual review / librarian action) rather than emergent consensus. The defamation/liability
consideration is documented in this story's ADR.

The classification model that frames this already exists (Story 8 / **ADR 0009**,
`engineering-team/decisions/0009-classification-tag-assertions.md`; the write control is
ADR 0010). `BookTag` carries a **sensitivity** — `packages/schemas/src/BookTag.ts:10`
defines `type TagSensitivity = "normal" | "accusatory"` and the tag carries it on the wire
(`["sensitivity", tag.sensitivity]`). The accusatory tags are **defined** in the librarian
taxonomy — `apps/seeder/src/taxonomy.ts:30-31` declares `ai-generated` and
`possibly-ai-generated` as `type: "signal"`, `sensitivity: "accusatory"` (asserted by
`apps/seeder/test/taxonomy.test.ts:17-18`).

**Current state — confirmed in code (the honest defaults this story preserves):**

- **Hidden at read time.** `apps/api/src/tags/aggregate.ts:172` drops accusatory tags from
  the book's classification consensus: `if (!el || el.sensitivity === "accusatory") continue;
  // hide unknown + accusatory`. The tags route documents this: `apps/api/src/routes/tags.ts`
  header comment "Reads are honest raw consensus with accusatory tags hidden," and line 76
  "A book's classification consensus (accusatory hidden)." So an accusatory assertion can be
  published today, but it **never surfaces** on `GET /api/books/:slug/tags`.
- **Absent from the write picker.** `apps/web/src/components/TagControl.tsx:58-65` filters the
  taxonomy to `(t.type === "genre" || t.type === "style") && t.sensitivity !== "accusatory"` —
  the comment (lines 1-5) states accusatory tags "are never offered here."
- **No server-side gate on the tag write today.** `POST /api/tags`
  (`apps/api/src/routes/tags.ts:163`) accepts any signed-in user's assertion for any tag slug;
  the **only** barrier keeping accusatory tags out of the catalog is the UI picker exclusion
  above. There is no sensitivity check and no curator gate on the write path. **This story must
  ADD the server-side gate** — UI exclusion is not server enforcement, and the §2.8 acceptance
  ("offered only to users above the trust threshold") must be enforced server-side, mirroring
  Story 30's below-gate rejection.

**The curator gate to reuse (Story 30 / ADR 0031,
`engineering-team/decisions/0031-trust-gated-promotion.md`).** `apps/api/src/routes/submissions.ts`
already server-enforces an **emergent** curator gate: the session user's own trust weight from
the **house observer's** vantage (`deps.trust.weights(houseObserverHex, [callerHex])`, lines
283-291) compared against `deps.config.curatorThreshold ?? 0.5`. Below the gate → **403
`below_gate`** (lines 304-309), anon → 401, fail-closed on any trust degrade (the gate CLOSES
— lines 279-291). The accusatory write reuses **this exact gate** to decide who may assert an
accusatory tag, for both **sovereign** (NIP-07 client-sign) and **custodial** (server
ephemeral-wrap, ADR 0006) tiers, exactly as the existing `POST /api/tags` two-tier write works
(`apps/api/src/routes/tags.ts:163-216`).

**The trust seam + fixture (ADR 0014 / ADR 0017).** `apps/api/src/trust/{types,index}.ts`
exposes `weights(observerHex, targetHexes)` (empty map on backend failure, never throws). The
**fixture provider** (`apps/api/src/trust/fixture.ts`, `TRUST_PROVIDER=fixture` +
`TRUST_FIXTURE`) gives a known observer known weights over a known key set, so the write gate
is CI-testable on both sides of the threshold with no Brainstorm, no relay, no human —
exactly as Story 25 and Story 30 are verified.

**The auditable visibility gate — the load-bearing decision (flagged for the Architect).**
The §2.8 read half is the contentious part: an accusatory tag stays HIDDEN on book detail
until an **explicit, auditable, attributable** action reveals it for that (book, tag) — **NOT**
emergent consensus. The PO does not decide the mechanism; it states the requirement (explicit
+ auditable + attributable, never emergent) and lays out the options in Open Questions / Flags.
The most directly auditable, lowest-defamation-exposure shape mirrors Story 30's promotion: a
**librarian-attributable signed "accusatory-reveal" event** per (book, tag), minted via an
explicit action through the off-internet-facing signer path (the `apps/promoter` worker pattern
ADR 0031 established to hold the librarian key off the API). The Architect picks; see Flags.

**Architecture invariants (CLAUDE.md).** POV-first (§1): the write gate is the SESSION user's
own weight from the house observer's vantage. Decentralized-first (§2): accusatory assertions
are still published permissionlessly like any event; the gate is enforced at write
authorization and the reveal is an explicit signed action, not an administered allowlist of
people. Filter-at-view-time (§3): the reveal is applied at **read time** in the tag aggregate;
the canonical assertions are never mutated. Trust shows as honest counts / the gate decision,
never a raw GrapeRank number.

This is Phase-2 / §2.8 scope and touches **no** PRD §11.3 / §3-deferred "Out of Scope"
surface: no payments, no Blossom/file hosting, no ebook sales, no bounty marketplace, no
print-on-demand, no social feed, no reading progress, no federation, no email notifications,
and explicitly **no automated AI-detection** and **no automatic/emergent accusatory reveal**
(both Phase 3, PRD §3).

## User-facing description

As a **Curator** whose trust weight from the house vantage clears the curator threshold, I
want the tag picker to offer the accusatory signals (`ai-generated`, `possibly-ai-generated`)
so that I can assert them on a book when I have grounds to, the same way I assert a genre or
style — and I understand that asserting an accusatory tag does not, on its own, make it visible
to readers.

As a **Reader** on a book's detail page, I want accusatory tags to stay hidden unless they have
been deliberately, accountably surfaced by a review/librarian action — never auto-revealed by a
raw count of who clicked a button — so that an accusation I see is one someone explicitly stood
behind, not an emergent pile-on.

As a **non-curator or signed-out user**, I want to be unable to assert accusatory tags at all,
so that the accusatory write path is reserved for the people the network trusts.

## Acceptance criteria

Testable from the outside, each independently verifiable **against the fixture
`TrustProvider`** (`TRUST_PROVIDER=fixture` + a deterministic `TRUST_FIXTURE` giving the house
observer known weights over a known set of curator keys), with no Brainstorm call, no relay,
and no human — mirroring how Story 25 and Story 30 trust tests are structured, and pinning the
curator threshold to a fixture value to assert behavior on both sides of it. Any copy in these
ACs is illustrative and must pass the no-slop rule (`memory/feedback_unbnd_copy_and_visual.md`);
final strings are the Architect/Implementer's within that constraint. No hand-rolled crypto
(`memory/feedback_unbnd_crypto_policy.md` / CLAUDE.md): both tiers reuse the shipped signing
paths (NIP-07 sovereign, server ephemeral-wrap custodial, ADR 0006), and any reveal-signing
mechanism reuses the audited signer stack. No raw GrapeRank number appears on any surface.

- [ ] **AC-1 — The accusatory write picker is offered only to users above the curator
  threshold.** Given a signed-in user whose own trust weight from the **house observer's**
  vantage is **at or above `CURATOR_THRESHOLD`** (the Story 30 / ADR 0031 emergent gate,
  computed via `trust.weights(houseObserverHex, [sessionUserHex])`), when they open the tag
  control on a book, then the picker offers the accusatory signal tags (`ai-generated`,
  `possibly-ai-generated`) in addition to the existing genre/style options. Given a signed-in
  user **below** the threshold (or absent from the observer's weight map) or a signed-out user,
  when they open the tag control, then the picker offers **no** accusatory tags (the genre/style
  behavior is unchanged from today).

- [ ] **AC-2 — The accusatory write is curator-gated server-side, not merely UI-hidden, for
  both tiers.** Given a request to assert (or dispute) an **accusatory**-sensitivity tag, when
  the API handles it, then it is accepted **only** if the session user's house-PoV weight is at
  or above `CURATOR_THRESHOLD`; a below-gate user is **rejected server-side** (a `403 below_gate`
  mirroring `apps/api/src/routes/submissions.ts`), and a signed-out user gets `401`, even if the
  request is crafted directly against the API bypassing the UI. A **non-accusatory** (genre /
  style / normal-sensitivity) tag write is **unaffected** — it still succeeds for any signed-in
  user exactly as today. This holds identically for **sovereign** (client-signed event) and
  **custodial** (server ephemeral-wrap) writes, reusing the existing `POST /api/tags` two-tier
  paths.

- [ ] **AC-3 — Accusatory tags remain hidden by default at read time (the honest default is
  preserved).** Given a book with one or more accusatory-sensitivity assertions but **no** active
  reveal for them, when `GET /api/books/:slug/tags` is read (from any observer's vantage,
  House or Yours), then **no** accusatory tag appears in the classification consensus — the
  existing `aggregateBookTags` / `aggregateBookTagsWeighted` behavior
  (`apps/api/src/tags/aggregate.ts:172`, "hide unknown + accusatory") is unchanged for the
  unrevealed case. There is **no** emergent threshold, count, or trust-consensus that, on its
  own, flips an accusatory tag to visible.

- [ ] **AC-4 — An explicit, auditable, attributable gate — and only that gate — reveals an
  accusatory tag on book detail.** Given an accusatory tag on a book, when the **explicit reveal
  action** is taken for that (book, tag) — the mechanism the Architect selects from Open
  Question 1, which MUST be explicit, auditable (a durable record of what was revealed, when,
  and by whom), and attributable to a librarian/reviewer identity — then, and only then, that
  accusatory tag appears in `GET /api/books/:slug/tags` for that book. Absent that reveal, the
  tag stays hidden (AC-3). The reveal is **not** triggered by any count of curator assertions,
  any trust-weighted consensus, or any other emergent signal; emergent auto-reveal is explicitly
  not built (PRD §2.8 / §3).

- [ ] **AC-5 — A revealed accusatory tag renders honestly and attributed.** Given an accusatory
  tag has been revealed (AC-4), when the book detail classification block renders it, then it is
  visually and textually distinguishable from ordinary genre/style chips as an accusatory signal
  (copy reviewed against the no-slop rule), and the page makes plain that it was **surfaced by an
  explicit review action** rather than by community consensus — never presenting it as
  trusted/community "consensus." The Architect/UX decides whether the underlying curator
  assertions behind it are shown or only the revealed tag itself (Open Question 3); the AC is
  that the presentation is honest about *why* it is visible and does not fabricate a consensus
  number.

- [ ] **AC-6 — The reveal is reversible and the canonical assertions are never mutated.** Given a
  revealed accusatory tag, when the reveal is withdrawn (un-revealed) via the same explicit,
  auditable, attributable mechanism, then the tag returns to hidden at read time (AC-3), and the
  withdrawal is itself recorded auditably (who/when). The underlying curator `BookTag` assertions
  are **never** rewritten or deleted by reveal/un-reveal — visibility is composed at read time
  (filter-at-view-time, CLAUDE.md §3); revealing or hiding only changes whether the read path
  surfaces them.

- [ ] **AC-7 — Honest degrade: no fabricated reveal, gate closes on trust failure.** Given trust
  is unavailable (no observer configured, the provider errors, or the observer has no scores),
  when the accusatory write gate is evaluated, then it **closes** (no user is treated as above
  the gate from an absent/failed vantage — the picker offers no accusatory tags and the write is
  rejected), exactly as the Story 30 promotion gate degrades; the `weights` seam never throws
  (empty map on backend failure per the `TrustProvider` contract). Independently, an accusatory
  tag is **never** revealed at read time by a trust degrade or any default — reveal requires the
  explicit action of AC-4 and nothing else.

- [ ] **AC-8 — Built and verified against the fixture provider in CI.** Given
  `TRUST_PROVIDER=fixture` with a deterministic `TRUST_FIXTURE` giving the house observer known
  weights over a known set of curator keys, when the test suite runs in CI, then the
  above-threshold picker offer (AC-1), the server-side write gate for both tiers with the
  non-accusatory write unaffected (AC-2), the hidden-by-default read (AC-3), the explicit reveal
  flipping a single (book, tag) to visible (AC-4), the honest attributed rendering (AC-5), the
  reversible reveal with canonical assertions intact (AC-6), and the honest degrade (AC-7) are
  all exercised green with no Brainstorm call, no relay, and no human. No Brainstorm/NIP-85
  specifics leak outside `apps/api/src/trust/brainstorm.ts`; the ADR 0014 architecture guard test
  (`apps/api/test/trust/architecture.test.ts`) stays green.

## DList shapes touched

This reuses the existing `BookTag` assertion for the accusatory **write**, adds the curator
gate to that write path, and adds an **explicit reveal** layer for the **read** visibility. **The
Architect names the exact reveal shape** (see Open Question 1) — whether the reveal is a
librarian-signed kind-39999 "accusatory-reveal" event per (book, tag) z-tagged to a new/reserved
concept header, a server-side review-queue record, or a config/allowlist gate, and the d-tag /
targeting scheme. The PO identifies the surfaces; it does not fix the schema.

- `kind:39999` — **`BookTag` accusatory assertion** under the `book-tag-assertions` concept
  (write, now curator-gated; `packages/schemas/src/BookTag.ts`, sensitivity `accusatory`). The
  existing genre/style/normal assertion path is unchanged.
- `kind:39999` / server-side record — **accusatory-reveal** per (book, tag) (new; the explicit,
  auditable, attributable gate of AC-4 — exact shape is Open Question 1). If a signed event, it
  is **librarian/reviewer-attributable** and minted via an explicit action through the
  off-internet-facing signer path (the `apps/promoter` worker pattern, ADR 0031).
- `kind:39998` — `book-tag-assertions` concept header (read), the librarian taxonomy header
  (read; supplies the accusatory tag definitions), and any new header the reveal z-tags to
  (Architect names it).
- Trust weights consumed via the existing `TrustProvider` seam (`apps/api/src/trust/`); the
  fixture provider supplies deterministic weights in CI.

## Out of scope

State explicitly — do not build:

- **ANY automatic / emergent trust-consensus reveal of accusatory tags.** Phase 3 (PRD §2.8
  decision of record + PRD §3). No count threshold, no trust-weighted consensus, no background
  job that reveals an accusatory tag on its own. The §2.8 "explicit, auditable mechanism rather
  than emergent consensus" boundary is the hard constraint (AC-4).
- **Automated AI-detection** (classifiers that decide whether a book is AI-generated). Out
  entirely — accusatory tags are human curator assertions, gated and revealed by humans.
- **Applying accusatory tags to anything but books.** No accusatory tags on authors, reviews,
  submissions, or any other entity.
- **The general curator-role system** (the domain-specific `curator` tag-assertion targeting a
  pubkey, `trust.roleScore(pubkey, role)` — PRD C-7, Phase 3). This story reuses the **Story 30
  emergent house-PoV gate** (`CURATOR_THRESHOLD`) as-is; it builds no role-tag mechanism, no
  grant flow, no domain-scoped role.
- **The house-observer swap** (`HOUSE_OBSERVER_PUBKEY` → the production librarian). The interim
  house vantage stays; the feature is built and verified against the fixture provider regardless
  (ADR 0017 / PRD §2.0).
- **A quality-signal write picker for `normal` signals,** or any change to genre/style writing —
  this story adds only the accusatory tags to the picker for above-gate curators; it does not
  open `normal`-sensitivity signal writes (still deferred, per TagControl today) and does not
  change the existing genre/style write behavior.
- **New lint/typecheck/build tooling** (CLAUDE.md house rule; requires an ADR).

Re-confirmed against PRD §11.3 / §3-deferred "Out of Scope": this story touches none of
payments, file hosting/Blossom, ebook sales, bounty marketplace, print-on-demand, social feed,
reading progress, federation, or email notifications. It is a curator-gated accusatory write
plus an explicit, auditable, reversible read-time reveal — both built and CI-verified against
the fixture provider.

## Open questions

Resolve before approving the story (PO recommendations in Flags below).

1. **The auditable visibility-gate mechanism (load-bearing — for the Architect/gate).** What is
   the explicit, auditable, attributable gate that reveals an accusatory tag (AC-4)? Three options:
   - **(a) A librarian-attributable signed "accusatory-reveal" event per (book, tag).** A reveal
     is a kind-39999 event (or kind-5-style withdrawal) minted via an explicit human action and
     **signed by a librarian/reviewer identity**, z-tagged to a reveal header, `#a` → book +
     `#t` → tag slug. The read path surfaces an accusatory tag iff an active reveal event exists
     for that (book, tag). **PO recommendation** — most auditable + attributable + lowest
     defamation exposure: every reveal is a durable, signed, timestamped, attributable record on
     the wire, reversible by withdrawal, and it reuses the **off-internet-facing signer pattern**
     ADR 0031 established (`apps/promoter`) so the API never holds a reveal-signing secret on the
     public path. It is the same auditable-mint shape promotion already uses.
   - **(b) A librarian/admin review queue + a reveal action.** Accusatory assertions land in a
     server-side review queue; a reviewer explicitly reveals/dismisses, recorded in a durable
     audit log. Auditable and attributable, but the audit record is server-side state rather than
     a signed event (less portable, more like an admin panel — weaker against the
     decentralized-first invariant).
   - **(c) A config/allowlist gate.** A static (book, tag) allowlist in config controls
     visibility. Simplest, but the **least** auditable/attributable (no per-reveal actor/timestamp
     record, no reversible trail) and the least defensible if a reveal is ever challenged.
     **Not recommended.**

2. **Who may perform the reveal (AC-4)?** Is the reveal a **librarian-only** action (the operator,
   matching how promotion is effectively librarian-gated today), or available to any above-gate
   curator? PO lean: **librarian-only** for v1 — the reveal is the accountable, defamation-bearing
   step and should sit with the operator identity, distinct from "a curator may *assert*" (the
   write gate, AC-1/AC-2). The Architect/gate confirms; this also determines whether the reveal
   reuses the `apps/promoter` librarian signer or a curator-gated API write.

3. **What does a revealed accusatory tag show (AC-5)?** Just the revealed tag (e.g. an
   "AI generated" chip marked as a reviewed/surfaced signal), or also the underlying curator
   assertions (who asserted, how many)? PO lean: **show the tag, attributed to the review action,
   and not a consensus count** — surfacing a curator headcount risks re-introducing the "a dozen
   people said so" framing §2.8 explicitly rejects. UX/Architect confirms.

4. **Does the accusatory write carry apply/dispute polarity (like normal tag assertions),** and if
   so, does dispute play any role pre-reveal? PO lean: keep the existing apply/dispute schema for
   schema consistency, but the **reveal — not any polarity tally — is the only thing that controls
   visibility** (AC-3/AC-4). Confirm.

5. **Threshold reuse.** The write gate reuses `CURATOR_THRESHOLD` (the same env Story 30 uses) —
   confirm this is the same single threshold "who may assert," not a new accusatory-specific env.
   PO lean: **reuse `CURATOR_THRESHOLD`** (§2.8 says "above the curator trust threshold," i.e. the
   existing one). Architect confirms.

## Flags for the gate (PO — contentious; the user decides)

- **The visibility-gate mechanism (Open Question 1) — the key decision.** PO recommends **option
  (a): a librarian-attributable signed "accusatory-reveal" event per (book, tag), minted via the
  off-internet-facing signer (ADR 0031 `apps/promoter` pattern)**, reversible by withdrawal. It is
  the most **auditable** (durable, signed, timestamped, attributable, reversible record per
  reveal), the **lowest defamation exposure** (every visible accusation traces to an explicit
  human action by an accountable identity, never to an emergent count), and it **reuses the
  promotion mint pattern** rather than introducing a new admin surface or putting a signing secret
  on the public API. Option (b) (review queue) is acceptable but server-side-state-bound and more
  admin-panel-shaped; option (c) (config allowlist) is **not recommended** (least auditable). The
  user picks; the choice sets AC-4/AC-6 and the DList shape.

- **Who reveals (Open Question 2).** PO recommends **librarian-only** reveal for v1 (the
  accountable step sits with the operator), distinct from the curator *assert* gate. The
  alternative — any above-gate curator may reveal — lowers the accountability bar on the
  defamation-bearing action. The user decides.

- **Defamation / moderation rationale for the ADR (engineering-framed).** Per §2.8 the ADR must
  document **why** accusatory visibility is a manual, auditable gate and not emergent consensus.
  The PO's framing for the ADR (a moderation-design / product-risk consideration, not a
  business/legal opinion): An accusatory tag like `ai-generated` is a **factual claim about a
  specific named work and, by implication, its author**. Unlike a genre or rating (subjective,
  low-harm if wrong), a wrong accusatory tag is a **reputational harm to a real person**.
  Auto-revealing such a claim on a raw or trust-weighted count of curator assertions (a) has
  **almost no statistical basis** — a dozen accounts agreeing is not evidence a book is
  AI-generated — and (b) makes the **platform the publisher** of an unverified accusation
  surfaced by an automatic rule no human stood behind. The design mitigations: (1) **gate the
  write** to trusted curators (raises assertion quality, AC-1/AC-2); (2) **never auto-reveal** —
  visibility requires an **explicit, attributable human action** so every surfaced accusation
  traces to an accountable identity who chose to stand behind it (AC-4); (3) make the reveal
  **reversible and auditable** so a contested reveal can be withdrawn and the trail inspected
  (AC-6); (4) **honest presentation** — a revealed tag is shown as a reviewed/surfaced signal,
  not as "community consensus" (AC-5). Automated/emergent reveal is deferred to Phase 3 precisely
  because it would require a statistically defensible, lower-exposure detection-or-consensus
  model this phase does not build. **The user confirms this framing for the ADR; it stays
  moderation-design, not legal advice.**

- **Adding a server-side gate to the tag write (current-state finding).** Today `POST /api/tags`
  has **no** gate and no sensitivity check — the only thing keeping accusatory tags out is the UI
  picker exclusion (`TagControl.tsx`). This story **adds** server-side enforcement (AC-2). PO
  recommendation: **acceptable and necessary** — UI exclusion is not security, and §2.8's
  "offered only to users above the threshold" must be server-enforced like the Story 30 gate. The
  user should note this is a new server-side check on the tag write path (sensitivity-conditional:
  it only gates accusatory writes; normal writes are unaffected).

- **Thin-graph reality.** On today's graph (interim house observer, no real curator weights over
  our seeded keys), **no real user clears the curator gate**, so in practice **no user can assert
  an accusatory tag** until the graph fills in — and with librarian-only reveal (recommended), no
  accusatory tag is visible until the operator reveals one. PO recommendation: **acceptable for
  v1** — it is the honest, safe, lowest-exposure state (no accusatory writes, nothing revealed),
  and the fixture provider proves the whole flow for when real signal arrives, exactly as Story
  30 promotion is effectively librarian-only today. The user confirms.

## Linked artifacts
- PRD: `engineering-team/phase2-prd.md` **§2.8** (the charter — manual gate, trust-gated write
  picker, explicit auditable visibility, ADR-documented liability rationale), §2.0 (fixture/CI
  sequencing), §3 (deferred automated/emergent reveal + automated AI-detection).
- Classification model: `engineering-team/decisions/0009-classification-tag-assertions.md`
  (the `BookTag` apply/dispute assertion + sensitivity model), ADR 0010 (the `TagControl` write
  surface) — `packages/schemas/src/BookTag.ts`, `apps/api/src/tags/aggregate.ts` (accusatory
  hidden at read), `apps/api/src/routes/tags.ts` (the two-tier write),
  `apps/web/src/components/TagControl.tsx` (picker excludes accusatory),
  `apps/seeder/src/taxonomy.ts` (accusatory tag definitions).
- Curator gate: `engineering-team/decisions/0031-trust-gated-promotion.md` (the emergent
  house-PoV `CURATOR_THRESHOLD` gate reused for the accusatory write; the off-internet-facing
  `apps/promoter` librarian-signer pattern recommended for the reveal) — `apps/api/src/routes/submissions.ts`.
- Trust ADRs: `engineering-team/decisions/0014-graperank-personalize.md` (the `TrustProvider`
  `weights`/`hasScores` seam + observer resolution),
  `engineering-team/decisions/0017-fixture-trust-provider.md` (the fixture provider this is
  verified against), `engineering-team/decisions/0025-weighted-consensus.md` (the weighted tag
  aggregate the accusatory write feeds, and the read path it is hidden from) —
  `apps/api/src/trust/{types,index,fixture,brainstorm}.ts`.
- Two-tier write / crypto: `engineering-team/decisions/0006-custodial-server-signing.md`
  (custodial ephemeral-wrap, both tiers), `memory/feedback_unbnd_crypto_policy.md` (no
  hand-rolled crypto), `memory/feedback_unbnd_copy_and_visual.md` (no-slop copy/visual rule).
- ADR for this story: `engineering-team/decisions/0034-accusatory-tag-gate.md` (filled in after
  Architecture phase; must document the defamation/moderation rationale per §2.8).
- Test plan: `engineering-team/stories/done/33-accusatory-tag-gate.test-plan.md`
- Review: (filled in after Review phase)
