# Discovery Brief: The Reader's Guide

**Slug:** reader-guide
**Date:** 2026-06-11
**Strategist phase:** Discovery (Phase 1)
**Grain:** an epic (one block of stories), not a product phase. The flow runs at epic depth: existing personas are reused, and phases that don't earn their keep at this size are folded together.
**Return edge read:** `engineering-team/audits/social-loop/{audit.md, prd-addendum.md}` (Phase 3 closed, live on staging) and `engineering-team/audits/phase-2/` — together these enumerate every shipped user-facing feature, source-linked to stories.

## Problem statement
Unbnd now ships a feature set with no mainstream analog: a point-of-view toggle between a house view and your own, taste match percentages, a hype-gap signal, hidden gems, curator vouching, contested tags, librarian-reviewed content flags, account sovereignty with a key you can take with you. Every one of these is explained nowhere. The app's own copy is deliberately calm and minimal, which is right in the moment of use but teaches nothing about the system behind it. A book lover arriving from Goodreads meets "Unbnd house view" and "2 trusted people vouched" with zero context, and the founding-curator recruitment now underway makes this acute: today every recruit needs a personal walkthrough from the founder, and goodwill dies in confusion before the payoff moment arrives. The product needs a comprehensive, plainly written guide that explains every user-facing feature and walks through using it, presented cleanly inside the site itself.

## User landscape
Reusing the Phase 3 personas (`personas/social-loop-*`), seen through the lens of learning the product:

- **The poached Goodreads reader (primary audience for the guide).** Copes by pattern-matching to Goodreads: stars, shelves, and reviews carry them through their first session. The trust layer is where the matching breaks; an unexplained percentage or a "house view" label reads as noise at best and as a fabricated number at worst. They hate jargon, anything that smells of crypto, and feeling stupid. They will not read a protocol explainer, ever, and should never need to know the word nostr.
- **The founding curator (the current ops priority).** Arrives as a favor to a friend. Today the founder is the documentation: live walkthroughs, one at a time. The guide is the on-ramp that lets a recruit self-serve the "what is this and why does my rating matter" conversation, which is exactly the conversation the recruitment effort needs to scale.
- **The sovereignty-curious user.** The one segment with some nostr context, who still needs the custodial-to-sovereign choice explained in plain words before trusting a screen that reveals a secret key. The guide is where "take ownership of your account" gets its calm, complete explanation.
- **The founder/operator.** Currently answers every "what does this mean" question by hand. Needs the guide to be the durable answer, and needs a way for future features to land with their guide entry instead of reopening the gap.

## Competitive landscape
- **Goodreads' help center.** A searchable ticket-deflection system. It works because Goodreads has no novel concepts to teach: stars and shelves are folk knowledge. Structurally it cannot be the model here, because Unbnd's problem is concept-teaching (what a trust-weighted view *is*), not support deflection (how to reset a password).
- **Nostr client documentation at large.** Written by insiders, in protocol vocabulary, for readers presumed to want to learn the protocol. Structurally fails our reader, who has no such desire and must never be required to acquire one. Any sentence that needs the words relay, event, or key signing to land has failed.
- **AI-generated help content as a genre.** Increasingly recognizable by its tics, and increasingly distrusted for them. For a product whose entire pitch is human taste you can trust, machine-sounding documentation is self-defeating in a structural way: the medium would contradict the message. This is why the language process is part of the epic itself, with a written tic taxonomy and a mandatory edit pass against it, in the same spirit as the existing ban list (`feedback_unbnd_copy_and_visual` lineage, `guides/social-loop-style-guide.md`) but comprehensive: no em dashes, minimal triadic structures, no rhetorical contrast ("not x; it's y"), no declarative negative lists ("not x, not y, not z"), no anaphora, no purple prose. Drafted, then rigorously edited against the taxonomy as a distinct step.

## Opportunity
The feature set is, for the first time, both stable and fully enumerated. Phase 3 closed with a high-confidence audit; the 82 shipped stories under `engineering-team/stories/done/` plus the two phase audits are a complete, source-linked inventory of every user-facing capability. Documentation written now is written against a frozen, checkable ground truth rather than a moving target, and the comb-through is mechanical: walk the story set, extract what a user can see and do, explain it. Why now: the founding-curator recruitment is the active operational priority, and the guide is its single highest-leverage support artifact. Why this team: the house already runs a ban-list editing culture; this epic formalizes it into a full taxonomy and applies it at documentation scale.

## Constraints
- **Budget:** founder time for review gates; no external writers.
- **Timeline:** useful the moment recruitment ramps; an epic, not a quarter.
- **Team:** the established product-to-engineering harness; documentation text is a deliverable edited against the taxonomy, not ad-hoc copy.
- **Technical:** presented inside the existing site (the About area or wherever the experience phase decides); content must be maintainable by the same gated story process as code. No protocol vocabulary anywhere in the reader-facing text. The product team decides placement and structure; engineering decides implementation.
- **Regulatory:** none.

## Open questions
1. **Placement and shape.** A tab on About, a dedicated Guide/Help section, or a "start here" narrative plus a per-feature reference? Does it deserve its own nav presence for first-visit discoverability, or does that overweight it?
2. **Two reading modes.** A new reader needs a getting-started path ("your first ten minutes"); a confused reader needs a direct answer ("what does this percentage mean?"). One artifact set serving both, or two structures?
3. **Contextual entry points.** Should surfaces with novel concepts (the POV toggle, taste match chips, vouch counts) link into their guide entry from the spot where confusion happens? This multiplies touchpoints across the app and needs a scope decision: standalone guide first, contextual links as a later block?
4. **The taxonomy's standing.** Is the LLM-tic taxonomy a guide-only editing tool, or does it supersede/absorb the existing style guide ban list for all future product copy?
5. **Staying current.** What keeps the guide true as features ship? A definition-of-done addition ("a user-facing story updates its guide entry"), a periodic audit, or both?
6. **Voice.** How personal is the guide? A named "from the founder" warmth versus a neutral product voice. (The taxonomy governs either; this is a tone choice.)
