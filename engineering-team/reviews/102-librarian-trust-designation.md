# Review: Story 102 — The librarian names its scorer (kind 10040)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-20

## Quality gates (run by reviewer, not trusted)
- [x] typecheck 0 · full workspace green (librarian 44) · no web or content change.
- [x] Live inputs checked: Brainstorm's `/setup/<librarian>` answers six tuples on `wss://scores.brainstorm.world` (scorer `4328261a…`); Mise's 10040 is the same shape (Brainstorm's client wrote `rank` and `followers`); Brainstorm-UI `services/trustSource.ts` reads a 10040 from the owner's write relays and its profile relays, which the librarian's publish set and its kind 10002 cover.

## Spec adherence (ADR 0090)
- [x] Designation read from `/setup` at publish time, filtered to well-formed `[kind[:metric], 64-hex, wss://…]` entries (tested, including four malformed shapes).
- [x] Published after the kind 0 and 10002, to the same relays, never dcosl; empty content.
- [x] Nothing usable from `/setup`: the first two still go out, then the command fails loudly (tested).
- [x] `BRAINSTORM_API_URL` reaches the librarian's profile config through the shared default.

## Findings
### Blocking
_None._
### Non-blocking
1. The 10040 names six score types where Brainstorm's client writes two. Harmless and more complete; Brainstorm reads `30382:rank`.

## Verdict
**PASS.** After merge and deploy, run `librarian-profile` and read the 10040 back.
