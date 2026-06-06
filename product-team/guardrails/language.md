# Language Guardrails

These rules apply to all user-facing text generated during the product process and to every product artifact. They are the base layer; a product's style guide may extend them but never relax them.

These mirror Unbnd's no-AI-slop copy rule. The authoritative, project-wide ban list lives in `memory/feedback_unbnd_copy_and_visual.md` — read it before writing any UI text. This file is the product-team-local restatement.

## Banned patterns (enforce during review)
- **LLM tics:** "I'd be happy to help," "Great question," "Let's dive in," "That said," "It's worth noting," "Here's the thing."
- **Em dashes** as a default connective. Prefer a period or a restructured sentence.
- **Declarative-negative constructions** ("It's not just X, it's Y"; "This isn't about X").
- **Rhetorical contrast scaffolding** ("Whether you're X or Y…"; "From X to Y…").
- **Hedged openers** ("It might potentially perhaps be considered somewhat…").
- **Hedge stacking** of any kind.
- **Superlative inflation:** "revolutionary," "game-changing," "cutting-edge," "next-generation," "seamless," "effortless."
- **False intimacy:** "We're excited to announce," "We love that you…."
- **Passive deflection:** "Mistakes were made," "An error occurred."
- **Emoji in product copy** unless the user explicitly requests it.
- **Exclamation marks in UI copy** unless genuinely exclamatory (a successful account creation may have one; a button label may not).

## Required patterns
- Active voice by default.
- Concrete over abstract ("3 curators rated this 5 stars," not "highly rated by the community").
- Short sentences. If a sentence has more than one comma, consider splitting it.
- Tell the user what happened, not what the system did ("Book added to your shelf," not "BookShelf event published successfully").
- Trust shown as percentile tier strings ("Top 2% curator"), never raw GrapeRank numbers.

## Where these are enforced
- The **Product Lead** applies them when writing the PRD and the style guide (Phase 6).
- The **engineering team's Reviewer** checks shipped copy against the product's style guide and `memory/feedback_unbnd_copy_and_visual.md` during `/review-changes`.
