# Discovery Brief: Unbnd — Close the Social Loop

**Slug:** `social-loop`
**Date:** 2026-06-06
**Strategist phase:** Discovery (Phase 1)

## Problem statement

Unbnd shipped a working trust layer in Phase 2, but it rests on a near-empty graph and an unfinished social loop, so the platform does not yet feel alive. Three gaps hold it back. The trust signal has very few people behind it, because the librarian's curator graph was only just stood up. Readers cannot see why a recommendation is theirs or which person it came from, so the trust layer stays invisible at the moment it should be most persuasive. And the platform's core identity promise, that a reader can hold their own keys and carry their identity across the nostr ecosystem, has no working path today. Phase 3 grows the curator graph, makes trusted opinion visible and personal, and turns sovereignty into a real choice.

## User landscape

- **Founding curators (primary).** Readers with strong, specific taste who would seed ratings, tags, and reviews. Today they curate on Goodreads or StoryGraph, or privately in newsletters and group chats, and get no portable credit. Their taste does not travel with them, and they cannot vouch for each other in a way that compounds. The pain: effort poured into a platform they do not own, and recommendations that flatten their judgment into a crowd average.
- **Readers seeking discovery.** They rely on Goodreads, StoryGraph, or algorithmic feeds. The pain: recommendations reward popularity and never feel like they came from a specific person whose taste they trust. Books they would love stay buried because they are not already popular.
- **Custodial users considering sovereignty.** They signed up with email and hold no keys today. The pain: the promise that they can leave with their identity is stated but not deliverable, so they are locked in by default, which contradicts the reason the product exists.

## Competitive landscape

- **Goodreads (Amazon).** Collaborative filtering over a large catalog. The structural failure: popularity is self-reinforcing, so new and obscure titles stay invisible, and the feed stays impersonal even after a user rates a hundred books, because it models the crowd rather than the specific people that user trusts. No portable identity, no person-to-person trust. (Grounded: [Book Riot](https://bookriot.com/algorithms-are-bad-at-recommending-books/), [MakeUseOf via Yahoo](https://www.yahoo.com/tech/goodreads-bad-suggesting-books-heres-153015169.html).)
- **The StoryGraph.** Real personalization, built from a taste profile of book attributes (mood, pace, a preferences survey, free-text search). The structural limit: it matches a reader to books by their qualities, not to people by rating agreement. It has no social graph, no trust layer, and no portable identity. It can say "this book is dark and fast-paced like ones you liked." It cannot say "the curators whose taste matches yours rate this far above the crowd." (Grounded: [StoryGraph reading preferences](https://app.thestorygraph.com/reading_preferences), [Wikipedia](https://en.wikipedia.org/wiki/The_StoryGraph).)
- **Private curation (newsletters, group chats, BookTok).** High trust, no structure. Recommendations come from people the reader actually trusts, but there is no shared catalog, no portability, no way to see agreement at scale, and no way to discover new trusted curators.

The structural gap across all three: none can compute what the specific people whose taste I respect think, versus the mainstream, because none holds a portable, person-to-person trust graph. Unbnd built exactly that machinery in Phase 2.

## Opportunity

Unbnd already owns the rare asset: a portable, person-to-person trust graph with weighted consensus. Phase 2 proved the machinery works. It simply has no people on it yet and no visible payoff. The opportunity is to convert that machinery into two things a reader cannot get anywhere else. First, a personal taste match to specific curators, so following someone means "they read like I do," not only "the community respects them." Second, a view of where the reader's trusted network diverges from the crowd, surfacing books their network loves that the mainstream has missed. Both are computations that a platform without a trust graph cannot perform.

Why now: the trust layer, the provider seams, and the librarian identity went live at Phase 2 close. The missing ingredients are curator density and a visible payoff, which are product problems, not architecture problems. Why this team: they built the trust layer and have direct access to a founding-curator network to seed it.

## Constraints

- **Budget:** self-funded. Not a binding constraint on Phase 3 scope.
- **Timeline:** phased, no fixed external deadline. A community-bootstrapping track (recruiting founding curators, seeding the founder's own rating and tagging activity) runs in parallel with the build.
- **Team:** solo founder plus the AI-assisted five-phase engineering harness (PO, Architect, Tester, Implementer, Reviewer), gated per story.
- **Technical:** built on Unbnd's nostr, DList, and GrapeRank trust stack. The house observer is the live librarian, but the curator web of trust is near-empty. The no-fake-data invariant binds every trust-derived display: a number shows only once a handful of trusted curators or trusted users stand behind it, and falls back to an honest empty or community-consensus state otherwise. Provider seams and index-on-write are already in place.
- **Regulatory:** none in scope. The features that carry regulatory surface (payments, file custody) are deferred to a later phase.

## Open questions

1. How many co-rated books must two users share before a taste-match percentage is honest enough to display, versus showing "not enough overlap yet"? (scope, experience)
2. Do taste match and the hidden-gem signal change when a user switches the House/Yours perspective toggle, and does the hidden-gems shelf exist on both views? (experience, domain)
3. For a shareable book card, does the displayed rating use the raw community number (the same for everyone, better for links) or the observer-weighted number (more useful, but varies per viewer)? (scope)
4. What level of friction and confirmation does the sovereignty-upgrade flow need, to respect the gravity of handing someone their own keys while staying approachable? (experience)
5. For curator status by vouching: how many trusted asserters, at what trust weight, confer the role, and does an emergent trust-threshold path coexist with the vouching path? (domain)
6. How does taste-match-driven discovery relate to the existing Phase 2 For-You shelf? Is it a new surface or a re-ranking of that one? (scope)
