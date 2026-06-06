# Unbnd — Close the Social Loop — Product Requirements Document

**Slug:** `social-loop`
**Date:** 2026-06-06
**Status:** Draft
**Companion guides:** `guides/social-loop-style-guide.md`, `guides/social-loop-design-guide.md`

> Self-contained. A reader understands Phase 3 without opening the phase artifacts. This is the product track for Unbnd Phase 3. It is built on the Phase 2 platform (the DList event model, the GrapeRank trust seam, and the `@unbnd/ui` design system). Engineering realizes it through the gated story cycle, then the phase is book-closed.

## 1. Product Vision

Unbnd shipped a working trust layer in Phase 2, but it rests on a near-empty graph and an unfinished social loop, so the platform does not yet feel alive. Three gaps hold it back. The trust signal has very few people behind it, because the librarian's curator graph was only just stood up. Readers cannot see why a recommendation is theirs or which person it came from, so the trust layer stays invisible at the moment it should be most persuasive. And the platform's identity promise, that a reader can hold their own keys and carry their identity across nostr, has no working path today.

Phase 3 grows the curator graph, makes trusted opinion visible and personal, and turns sovereignty into a real choice. The opportunity is to convert the trust machinery Unbnd already owns into two things a reader cannot get anywhere else: a personal taste match to specific curators, and a view of where their trusted network diverges from the crowd. Both are computations that a platform without a person-to-person trust graph cannot perform.

## 2. Positioning & Competitive Context

- **Goodreads (Amazon)** runs collaborative filtering over a large catalog. Popularity is self-reinforcing, so new and obscure titles stay invisible, and the feed stays impersonal even after a user rates a hundred books, because it models the crowd rather than the specific people that user trusts. It has no portable identity and no person-to-person trust.
- **The StoryGraph** personalizes from a taste profile of book attributes (mood, pace, a preferences survey, free-text search). It matches a reader to books by their qualities, not to people by rating agreement. It has no social graph, no trust layer, and no portable identity.
- **Private curation** (newsletters, group chats, BookTok) carries high trust and no structure: real recommendations from trusted people, but no shared catalog, no portability, and no way to see agreement at scale or discover new trusted curators.

The structural gap across all three: none can compute what the specific people whose taste I respect think, versus the mainstream, because none holds a portable, person-to-person trust graph. Unbnd built exactly that machinery in Phase 2. Phase 3 makes it visible and populated.

## 3. User Personas

### 3.1 The Founding Curator (primary)
A working member of the writing world (author, editor, small-press person, serious book friend) who reads widely and holds taste worth trusting. They already curate informally, where that taste evaporates. They arrive as an early adopter because a friend asked, not because they went looking. **Goal:** their taste recognized and carried, so a recommendation becomes durable curation rather than a disposable post, while they discover what their peers read. **Core loop:** rate, tag, review → see their taste reflected and shaping consensus → discover what trusted peers value → vouch for other curators → the graph deepens → better discovery. **Friction:** unpaid data-entry that benefits only the platform; ratings that echo into an empty room; being treated as a beta tester; effort that cannot travel. **The decisive fact:** they arrive to do a favor and stay only if the app earns a place in their own reading life within a session or two.

### 3.2 The Trusting Reader (secondary)
A reader who follows specific people's taste, not algorithms. Arrives because a curator they respect shared a link or an invite. Worn down by generic recommendations. **Goal:** recommendations from specific people whose taste they trust, with the reason visible. **Core loop:** land on a curator's shelf or book → see a taste match and why it surfaced → rate a few books → get personalized hidden-gems and for-you → follow more curators → discovery gets more personal. **Friction:** an account wall before any value; recommendations that feel like everyone else's; trust numbers with no human behind them; signal that looks fabricated on a thin graph.

### 3.3 The Sovereignty-Curious User (secondary)
Usually a curator, sometimes a reader, who cares that their identity and data are portable, or is already in the broader nostr ecosystem. Signed up custodially because it was easy; the lock-in nags. **Goal:** the genuine option to hold their own keys and carry their identity across nostr, on their own timeline. **Core loop:** not daily; a one-time-ish upgrade decision triggered by investment, then ongoing peace of mind or cross-app use. **Friction:** a key-handling flow so scary they bail or so casual it feels unsafe; learning after investing that the promise was never real; being pushed to manage keys they never asked for. Sovereignty is offered as a choice, never forced.

## 4. User Journeys

### 4.1 Founding Curator (primary)
1. **The ask** (first encounter, maybe no account): a friend asks them to help. They should see a real catalog and existing curation, not an empty shell, and a plain frame for what curating gives them. Goodwill, mild skepticism.
2. **First curation session:** rate, tag, review a few books; their assertion visibly matters and shows on their profile. Willing, watching for payoff.
3. **The payoff moment:** they see a taste match to a peer and a hidden-gem signal. The favor turns into interest.
4. **Vouching:** they vouch for peers as curators; the vouch visibly counts and the circle appears. Ownership.
5. **Becoming a regular:** routine curation, portable credit accrues, shared links unfurl as rich cards. Invested; this is theirs too.

### 4.2 Trusting Reader (secondary)
1. **Arrival via a curator** (first visit, no account): a trusted person's link lands them on a rich, readable book or profile page. Curious, low commitment.
2. **Sensing the difference:** trusted-vs-community framing, real names behind ratings. "This is that person's actual taste."
3. **The hook:** they rate a few books. This is where an account is required, and the gate sits here, not earlier. Pleased if value is immediate, annoyed if walled too early.
4. **Personalization deepens:** for-you and hidden-gems sharpen; why-recommended names specific people. This is mine now.
5. **Light regular, or converts to curator.**

### 4.3 Sovereignty-Curious User (secondary)
1. **The nag:** after investing, or while using another nostr app, they ask "am I locked in?" An honest "no, here is how" is findable.
2. **Understanding the choice:** plain-language tradeoff, appropriate gravity, no jargon. Cautious.
3. **The export:** deliberate confirmation steps; they finish understanding they now hold the key. Empowered if handled with the right weight.
4. **Life after:** the identity works across nostr, nothing breaks in Unbnd. Trust deepens because leaving was made possible.

## 5. Feature Specification

### 5.1 Curator / public profile (`/profile/:npub`)
- **Purpose:** show who a person is as a reader, and let viewers act on that.
- **Content:** identity header, real activity counts, a **followers** count, shelves, and recent activity. A **Taste Match** chip showing the viewer's agreement with this person ("87% match · 24 books in common"). A **Curator** badge when the person meets the curator gate.
- **Behavior:** the taste-match chip is observer-relative and hidden when signed out. Below the overlap threshold it reads "Not enough overlap yet." Followers derive via NIP-85.
- **Actions (logged-in):** Follow / unfollow. **Vouch as curator** (eligible trusted viewers only; absent for the ineligible), which records a vouch and shows "N trusted people vouched."
- **Serves:** Founding Curator (journey 4.1 steps 3–4), Trusting Reader (4.2 step 4).

### 5.2 Book detail (`/book/:slug`)
- **Purpose:** everything a reader needs to judge a book through the lens of people they trust.
- **Content:** the existing detail, plus a **hype-gap** line near the rating (Hidden gem / Overhyped / nothing on consensus), **taste-match** chips on rater and reviewer bylines, and a **contested** treatment on any tag the trusted graph net-disputes.
- **Behavior:** the hype-gap and taste signals are observer-relative and follow the House/Yours toggle. The hype-gap renders only when a handful of trusted raters exist, otherwise nothing. Reviews and raters can be ordered by trust or by best taste match (signed-in only; trust is the default).
- **Actions (logged-in):** rate, tag, review, add to shelf (existing); for curators, the accusatory-tag write picker and, in Block 3, an in-product trust-gated reveal action; rating removal (un-rate).
- **Serves:** Trusting Reader (4.2 steps 2–4), Founding Curator (4.1 steps 2–3).

### 5.3 Homepage (`/`)
- **Purpose:** personal discovery surfaces.
- **Content:** the existing shelves, plus a **Hidden Gems** shelf of books with the highest positive hype-gap from the active viewpoint.
- **Behavior:** exists on both House and Yours; different gems surface under each. The empty state is the cold-start on-ramp: "As people you trust rate more books, the ones they love that the crowd missed show up here. Follow a few curators to start."
- **Serves:** Trusting Reader (4.2 step 4), Founding Curator (4.1 step 3).

### 5.4 Settings → Nostr identity (`/settings`)
- **Purpose:** let a custodial user take ownership of their key, as a choice.
- **Content:** a card marked with the sovereign color, "Take ownership of your account."
- **Behavior:** a deliberate four-step flow: explain the choice in plain language, a single explicit confirmation, a reveal-once of the key with a copy action and an acknowledgement, then a calm done state. Never forced, always dismissible. If a key was already exported, the card reflects that rather than offering it again.
- **Serves:** Sovereignty-Curious User (journey 4.3).

### 5.5 Shared-link landing and the unfurl card
- **Purpose:** turn a shared book link into a readable invitation and a rich card on other platforms.
- **Content:** the full book page (curator's take, trust context) readable with no account; a single prompt at the write action, "Create a free account to rate or save this." The unfurl card on other platforms shows cover, title, author, the **raw** community rating, and top tags.
- **Behavior:** value before account; the account gate sits at the write, not the read. The unfurl card uses the raw rating because it is viewer-independent.
- **Serves:** Trusting Reader (4.2 step 1), Founding Curator (4.1 step 5, their curation traveling).

### 5.6 Browse (`/browse`)
- **Purpose:** browse the catalog by genre.
- **Content:** the genre grid expanded from 8 to 14+ genres.
- **Behavior:** genre is a revisable assertion derived from each book's preserved Open Library subjects; the expansion recasts existing books with no re-fetch.
- **Serves:** all readers; the curator survey informs the taxonomy.

### 5.7 Curate surface and automation (Block 3)
- **Purpose:** give curators their tools and automate Phase 2's manual mechanisms.
- **Content:** a "Curate" nav entry, prominent for curators and absent for others, surfacing the existing submission and promotion tools.
- **Behavior:** **automatic** threshold-based promotion of submissions; an **in-product** trust-gated accusatory reveal; **demotion** (un-promote) of a promoted book.
- **Serves:** Founding Curator (4.1 step 4).

## 6. Data Model

Built on the Phase 2 DList event model. Phase 3 adds almost no new persistent shapes.

- **Curator Role Assertion** (new concept `curator-roles`): a trusted user's vouch that a person is a curator. The item clones the existing author-verified pattern: a signed assertion that targets a pubkey, with apply/dispute polarity, under a per-(asserter, subject) replaceable identity, read through a count-gate of trusted asserters.
- **Taste Match** (new, derived, not stored): how often two people agree on books they have both rated. Attributes: observer, other, match score (absent below the overlap threshold), co-rated count, whether trust-weighted. Computed at read time over existing ratings; optionally cached.
- **Hype-Gap Signal** (new, derived, not stored): for one book from one viewpoint, the gap between the raw community rating and the trust-weighted rating. Attributes: book, observer, raw average, trusted average (absent until a handful of trusted raters exist), state (hidden-gem / overhyped / consensus).
- **Extended existing entities:** Account gains a sovereignty transition (custodial → sovereign) and a derived curator role-state; Genre gains the 8→14+ taxonomy and a recast; Rating gains removal; Promoted Book gains demotion and automatic promotion; the Accusatory Reveal gains an in-product trigger; a Tag Assertion gains a contested read-state; the follow relationship gains a followers count via NIP-85.

## 7. Trust, viewpoint, and identity architecture

- **Viewpoint (House vs Yours).** Taste match is always pairwise from the viewer's side. The trust-weighted variant and which curators populate shift with the House/Yours toggle. The hype-gap differs by viewpoint, and the Hidden Gems shelf exists on both views, surfacing different gems under each.
- **Honesty invariant.** No trust-derived number renders unless a handful of trusted raters stand behind it. Otherwise the surface shows an honest empty or community-consensus state. This carries Phase 2's community-vs-trusted labeling forward.
- **Curator status.** A person is a curator when they are on the operator seed-curator allowlist, or enough trusted users have vouched (the count-gate). Net-dispute below the gate revokes it. Self-assertion is excluded.
- **Sovereignty.** The custodial→sovereign transition is the only place a custodial key leaves server custody, by explicit user action, and is irreversible once exported.
- **New vs existing concepts:** one genuinely new DList concept (`curator-roles`, cloning the author-verified shape); two new derived computations (taste match, hype-gap); everything else extends existing concepts.

## 8. Scope Boundaries

### 8.1 In Scope (must ship), by build block
- **Block 1 (first, demoable):** Taste Match Score; curator status by trusted-user vouching; honest thresholds and empty states across trust-derived surfaces; the date-bound CI/deploy action version bump.
- **Block 2:** Hidden Gems (indicator + shelf); oEmbed unfurls with server-rendered per-book metadata; value-before-account for shared links; followers count via NIP-85; genre expansion 8→14+; nsec-export / sovereignty upgrade.
- **Block 3:** automatic threshold promotion; in-product accusatory reveal; rating removal (#28b); promotion demotion (#30b); contested-tag treatment.
- **Ops & debt** folded across blocks: age-encrypt the librarian key, prune dead seeder code, extract a shared relay paginator, dedupe a helper, fix a stale copy string.

### 8.2 Stretch
- Surfacing the why-recommended attribution ("Because Elena, 87% match, rated this 5 stars") on personalized results. Natural extension of taste match if Block 2 lands with room.

### 8.3 Out of Scope (later phases)
- **Phase 4 (distribution & payments):** Lightning payments, Blossom file hosting, editing-bounty marketplace, identity federation, OAuth providers, co-author support, real dark mode.
- **Phase 5 (differentiation):** the wow backlog (Reading DNA, Curator Challenges, Live Consensus, Shelf-as-engine, Why-This-Rating, cross-curator disagreement).
- **Protocol-level (NosFabrica track):** contextual Web of Trust, identity-funneling middleware.

## 9. Phase Roadmap

- **Phase 3 (this PRD):** close the social loop. Block 1 the curator loop honest on a thin graph → Block 2 make curation travel and complete the loop → Block 3 automate and finish. Book-closed when all three ship.
- **Phase 4:** distribution and payments. Fresh discovery.
- **Phase 5:** differentiation, once the loop is dense and alive.

## 10. Success Metrics

- 15–20 founding curators recruited, 10+ active with at least a handful of ratings each, within the first month, countable from relay events.
- The founder's own seed activity reaches 50+ rated books, 100+ tags, 10+ reviews in the first month.
- At least one curator gains the role through vouching rather than the seed list. The graph demonstrably grew on its own.
- Taste match behaves honestly: any curator pair above the overlap threshold shows a percentage; below it shows "not enough overlap yet." Verifiable on staging.
- Block 2 gate: a shared book link unfurls as a rich card on the platforms curators actually post to.

## 11. Open Questions

1. **Taste-match overlap threshold.** The minimum number of books two people must have both rated before a match percentage shows rather than "not enough overlap yet." Options: a fixed small count (for example 5), or a confidence-based cutoff that scales with how strong the agreement is.
2. **Curator-role knobs.** How many trusted asserters (N), at what trust weight (W), confer the curator role. Seed placeholder N=10, W=0.2 on the 0–1 weight scale. Options: ship the placeholder and tune, or set values from the founding-curator cohort size.
3. **Emergent gate coexistence.** Whether the Phase 2 emergent house-weight gate (`canPromote`) stays as a cold-start fallback alongside vouching, or is retired in favor of vouching. Options: keep both (OR them), or make vouching the sole path once the graph can sustain it.
4. **nsec-export build placement.** It sits in Block 2 by the primary-persona logic. Options: keep it in Block 2, or pull it into Block 1 if the sovereignty promise is weighted as integrity-critical to ship alongside the loop.
