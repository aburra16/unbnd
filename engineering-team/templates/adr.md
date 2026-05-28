# ADR <NNNN>: <title>

**Status:** Proposed | Accepted | Superseded by ADR-<n>
**Date:** <DATE>
**Story:** `engineering-team/stories/<n>-<slug>.md`

## Context
What is the situation that requires a decision? Pull the relevant facts from the story, from the PRD section it derives from, and from the existing codebase. State constraints (PRD scope, brand tokens, no-slop copy rules, perf budget) explicitly.

If the change touches DList event shapes, name the kinds and existing concept handles you are extending or referencing (cite the Tapestry branch and file). The pattern goes:

- Protocol baseline: `concept-graph` branch in nous-clawds4/tapestry (BIBLE.md, firmware/).
- Community-scoped patterns: `feat/communities` branch.
- Tag, pin, and Trusted List patterns: `feat/pubkey-tagging-target` branch (ADRs 0001–0014).

## Options considered

### Option A — <name>
Sketch. Pros. Cons.

### Option B — <name>
Sketch. Pros. Cons.

### (Option C — <name>)
Optional third option.

## Decision
We chose **Option <X>** because <reason>.

## Consequences
- What this enables.
- What this constrains or makes harder.
- What new debt or follow-ups this creates.
- **Affects existing fixtures?** (yes/no — if yes, list the fixture files that need updating after implementation).
- **New dependency?** (yes/no — list the package and pin reasoning if yes).
- **PRD section change required?** (yes/no — if the decision invalidates a PRD claim, flag it for the user to update the PRD).

## Implementation notes
Specific files, function names, module boundaries. The Implementer reads this, so be concrete.

- File: `apps/web/src/...` — add function `doX(input)`.
- File: `apps/api/src/...` — extend with the new branch.
- DList: new kind 39999 item with d-tag `book-rating--<slug>--<pubkey-prefix>`; word-wrapper JSON shape `{ word: {...}, bookRating: {...} }`. Cross-references the existing concept header at kind 39998:`<librarian-pubkey>`:`book-ratings`.

## Out of scope
What this ADR does NOT decide. (E.g., "Caching strategy is deferred to a future ADR.")
