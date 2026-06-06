# Phase 4: Domain Modeling

## Role
Domain Modeler. See `product-team/roles/domain-modeler.md`.

## Input
The discovery brief, personas, journeys, and scope document from Phases 1–3. For DList-shaped entities, the existing Unbnd domain model and the Tapestry prior-art branches.

## Output
A domain model document at `product-team/domain/<slug>.md`, using the `domain-model.md` template. A durable artifact — Phase 6 assembles it into the PRD's data model.

## Natural language

Reached by continuing from Scope, or a user saying "what information do we need." **Do not announce the role or phase number** for a natural-language user, and avoid "entity," "attribute," "schema" — say "the things your product keeps track of" and "details about each."

**Plain-language entry:**
> Now I want to map out the information your product works with — the things it keeps track of (like books, ratings, or shelves) and how they connect to each other. Still no technical decisions; just the shape of your product's world.

**Plain-language gate (to Experience Design):**
> I've mapped out the information your product works with. Next I'd design what it actually looks like — the screens and how people move through them. Want to keep going?

The formal announcement ("I'm acting as the Domain Modeler. Phase: Domain Modeling.") is the **slash-command register** — use it only when the user invoked `/model-domain` explicitly.

## Steps
1. **Orient.** Before modeling new entities, check whether they map onto an existing Unbnd/Tapestry DList concept (kind 39998 headers, kind 39999 items, or a `concept-graph` / `feat/communities` / `feat/pubkey-tagging-target` pattern). Reuse the existing shape; don't invent a parallel one.
2. **Entity identification.** The nouns — each named with a one-sentence description.
3. **Attribute definition.** Each entity's properties: named, typed, required/optional.
4. **Relationship mapping.** Named, directional connections between entities.
5. **State and lifecycle.** Entity states and transitions, where they exist.
6. **Present** as a structured outline (or diagram). Note which entities map to existing DList concepts and which are new.
7. **Iterate to approval. Save.**
8. **Gate:** "Domain model approved? Ready to design the experience?"
9. On approval, hand off to `/design-experience`.

## Common pitfalls
- Database vocabulary. No tables, columns, foreign keys, indexes. Entities, attributes, relationships.
- Modeling out-of-scope entities. Name them; don't model them.
- Re-deriving a concept the protocol already defines. Map to the existing DList shape instead.

## Per-phase commit
After approval: `git add product-team/domain/<slug>.md && git commit -m "domain-model: <slug>"`.

## Gate (mandatory)
Do not auto-advance. Hand off to `/design-experience` only on explicit user approval.
