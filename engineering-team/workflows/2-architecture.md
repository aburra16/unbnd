# Phase 2: Architecture

## Role
Architect. See `engineering-team/roles/architect.md`.

## Input
An approved user story.

## Output
An ADR at `engineering-team/decisions/<NNNN>-<slug>.md` (numbering: zero-padded sequential, e.g., `0007-add-stripe-webhook-handler.md`), using the `adr.md` template.

ADRs are **enabled** for this project.

## Steps

1. **Read the story.** Quote the acceptance criteria back.
2. **Orient via the PRD and handoff.** Identify the PRD section (e.g., §5.4 Book Detail, §6.2 Book Record Schema, §9 Trust and Curation) and the handoff section the story sits in. Quote the constraints they impose.
3. **Survey Tapestry prior art.** For anything DList-shaped, check the three relevant branches in order:
   - `concept-graph` for the canonical kind 39998/39999 patterns and the BIBLE.md spec.
   - `feat/communities` for community-scoped DList items (closest pattern for ratings, shelves).
   - `feat/pubkey-tagging-target` for tag, pin, and Trusted List patterns (closest pattern for genre tags, quality signals, "top curators in this genre"). See ADRs 0001–0014 on that branch.
   Reuse, don't reinvent.
4. **Read the relevant code.** Open the files. Understand the existing patterns in `apps/web/src/` and `apps/api/src/`.
5. **List options.** At least two — one chosen, one alternative. Naming the alternative forces you to articulate why the chosen path is better.
6. **Pick and justify.** Note tradeoffs. Note which house rules apply:
   - POV-first: trust-weighted answers are computed per observer, not stored as global truth (see CLAUDE.md).
   - Decentralized-first: anyone can publish; aggregation is opinionated per-POV.
   - Filter-at-view-time: compose POV columns at query time, don't precompute per-POV denormalizations.
   - Librarian pubkey is resolved at runtime, never hardcoded.
   - Brand tokens (handoff) are the source of truth for any UI change.
7. **Check for ADR conflicts.** Read existing ADRs in `engineering-team/decisions/`. If you're contradicting one, supersede it explicitly.
8. **Write the ADR** using the template.
9. **Show it.** Iterate to approval.
10. **Gate:** "ADR approved? Ready for Test Design?"
11. Hand off to `/design-tests`.

## Common pitfalls
- Re-litigating the story. If the story is wrong, kick back to PO; don't redesign the requirement under the guise of architecture.
- Single-option ADRs. Always name an alternative — that's where the value comes from.
- Vague ADRs. "Use the existing pattern" isn't enough — name the pattern, name the file, name the function.
- Inventing a new DList kind when an existing Tapestry pattern fits. Always crib first.
- Adding a new dependency without justifying why an existing one won't do.

## Per-phase commits
Yes. Commit the ADR before moving on.
