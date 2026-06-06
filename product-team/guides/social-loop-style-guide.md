# Style Guide: Unbnd — Close the Social Loop

**Slug:** `social-loop`
**Date:** 2026-06-06

> Governs all user-facing text in the Phase 3 product. Binding during engineering review. Built from `product-team/guardrails/language.md` (which restates `memory/feedback_unbnd_copy_and_visual.md`) plus this product's voice.

## Voice

Unbnd sounds like a well-read friend who respects your judgment. Plain, specific, and quietly literary without being flowery. It states what is true and shows its work. It never hypes, never flatters, and never pretends to know more than the data supports. When the subject is weighty (someone taking ownership of their own key), it slows down and speaks plainly, with care rather than alarm.

## Language rules

- No AI-generated filler ("I'd be happy to help," "Great question," "Let's dive in," "It's worth noting").
- No em dashes as a default connective. Use a period or restructure.
- No marketing superlatives without evidence ("revolutionary," "seamless," "game-changing").
- No jargon without definition. "Key" and "nostr" get a plain-language gloss the first time a custodial user meets them.
- Active voice over passive. Short sentences over compound.
- Specific over vague: "3 curators you trust rated this 5 stars," not "highly rated by the community."
- Trust is shown as percentile tier strings ("Top 2% curator") or plain percentages with visible provenance, never a raw GrapeRank number.
- Always name the viewpoint when a number is observer-relative ("from your viewpoint"), so House and Yours are never confused.

## UI copy patterns

- **Button labels:** verb + noun. "Vouch as curator," "Take ownership," "Add to shelf." Never "Submit."
- **Taste match:** state the agreement and its basis. "87% match · 24 books in common." Below threshold: "Not enough overlap yet · rate more books you've both read." Never a number without the overlap behind it.
- **Hype-gap:** name the comparison in human terms. "Hidden gem · your network rates this above the crowd." "Overhyped · people you trust are cooler on this than the crowd." Say nothing on consensus.
- **Empty states:** describe what will appear and how to start. "As people you trust rate more books, the ones they love that the crowd missed show up here. Follow a few curators to start."
- **Error messages:** what went wrong and what to do. "Couldn't record your vouch. Try again." "Couldn't copy. Select and copy it manually." Never "Something went wrong."
- **Confirmation messages:** confirm the action, not the click. "You vouched for Elena as a curator," not "Submitted successfully."
- **Sovereignty copy:** plain and grave, never scary, never casual. "Once you have it, keeping it safe is up to you." "Save this somewhere safe. We'll show it once." Announce the key's sensitivity to screen readers.

## Forbidden phrases

Base list lives in `product-team/guardrails/language.md` and `memory/feedback_unbnd_copy_and_visual.md`. Extended for this product:

- Raw trust scores in copy ("GrapeRank 0.82," "rank 94"). Use tier strings or percentages with provenance.
- "The algorithm recommends" or "our AI suggests." Recommendations come from named people whose taste the reader trusts; attribute them.
- "Trending" or "everyone's reading" as a trust signal. Crowd popularity is the thing Unbnd distinguishes itself from, not a selling point.
- Alarmist or breezy key language ("Danger!", "Warning!", or conversely "Easy! Just one click!"). The sovereignty flow is calm and deliberate.
- "Community loves this" presented as if it were trusted consensus. Keep community and trusted clearly labeled and distinct.
