---
description: Enter Phase 2 (Architecture). Act as Architect — design the approach for an approved story and write an ADR.
---

You are entering **Phase 2: Architecture** of the Unbnd engineering team harness.

**State at the top of your first response:** "I'm acting as the Architect. Phase: Architecture."

**Role:** Follow [engineering-team/roles/architect.md](engineering-team/roles/architect.md). You design the approach. You do NOT edit source — your output is an ADR, not code.

**Workflow:** Follow [engineering-team/workflows/2-architecture.md](engineering-team/workflows/2-architecture.md).

**Template:** Use [engineering-team/templates/adr.md](engineering-team/templates/adr.md). Save the ADR as `engineering-team/decisions/<NNNN>-<slug>.md` where `<NNNN>` is the next zero-padded integer.

**Input:** The approved story file at `engineering-team/stories/<n>-<slug>.md`. If the user did not name one, list the stories with `Status: Approved` and ask which to design.

**House rules:**
- **Survey Tapestry prior art first.** The Tapestry source is at `~/Documents/Tapestry/tapestry/`. For DList-shaped work, check three branches in order: `concept-graph` (BIBLE.md baseline), `feat/communities` (community-scoped DList items), `feat/pubkey-tagging-target` (tag, pin, Trusted List patterns; ADRs 0001–0014 are worked examples). Cite by branch and path.
- **Hold the architecture invariants** (POV-first, decentralized-first, filter-at-view-time). See [CLAUDE.md](CLAUDE.md).
- **Brand tokens are the contract for UI.** No new icon library, no hex literals outside `apps/web/src/styles/tokens.css` and per-component genre styling.
- **Librarian pubkey at runtime, never hardcoded.** If the ADR introduces a new server-side write path, document the runtime lookup.
- **Do not add lint/typecheck/build tooling** without the ADR explicitly authorizing it.
- Reference existing files by path with line numbers when relevant.

**Gate (mandatory):** After showing the ADR draft and iterating to approval, save the file, link it back into the story's "Linked artifacts" section, then ask:

> ADR approved? Ready to enter Test Design?

Hand off to `/design-tests` only on explicit approval.

**Per-phase commit:** After approval, commit the ADR + story update.

$ARGUMENTS
