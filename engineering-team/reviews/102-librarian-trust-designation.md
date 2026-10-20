# Review: Story 102 — The librarian names its scorer (kind 10040)

**Reviewer:** Claude (acting as Reviewer)
**Date:** 2026-10-20

## Round 1 (corrected): FAIL

The first pass of this review was marked PASS on the librarian suite alone; the full workspace run was not green. `packages/trust/test/architecture.test.ts` (ADR 0014) failed: `apps/librarian/src/main.ts` fetched Brainstorm's `/setup` itself, putting a Brainstorm API detail outside `packages/trust/src/brainstorm.ts`. The verdict below replaces that pass.

### Fix
- `TrustProvider` gains `designation(observer)`. The Brainstorm adapter answers from one cached `/setup` read, now shared with its rank-key lookup (`#setup`), and drops it on `personalize` as before. The fixture provider answers from its spec (`designations`).
- The librarian's profile cycle takes `designationOf` and main builds it from `resolveTrustProvider`; no Brainstorm specifics left in the librarian.
- ADR 0090 §4 now says the designation goes through the provider, and why.
- Trust fakes in four test files gained the method.

## Round 2

### Quality gates (run by reviewer, not trusted)
- [x] `pnpm -r typecheck`, `lint`, `build`: every package clean.
- [x] `pnpm -r test`: every package green, the ADR 0014 guard included (trust 64, librarian 44, api 1004 + 13 skipped as on main, web 449, others unchanged).
- [x] New tests: the adapter's designation keeps well-formed string triples and drops four bad shapes; designation and weights share one `/setup` read; a failed `/setup` gives none; the fixture returns its canned tuples.
- [x] Live inputs checked: Brainstorm's `/setup/<librarian>` answers six tuples on `wss://scores.brainstorm.world` (scorer `4328261a…`); Mise's 10040 is the same shape; Brainstorm-UI `services/trustSource.ts` reads a 10040 from the owner's write relays and its profile relays, which the librarian's publish set and its kind 10002 cover.

### Spec adherence (ADR 0090)
- [x] Designation read through the trust provider at publish time, filtered to well-formed `[kind[:metric], 64-hex, wss://…]` entries.
- [x] Published after the kind 0 and 10002, to the same relays, never dcosl; empty content.
- [x] Nothing usable: the first two still go out, then the command fails loudly (tested).
- [x] `BRAINSTORM_API_URL` reaches the librarian's profile config through the shared default.

### Findings
#### Blocking
_None._
#### Non-blocking
1. The 10040 names six score types where Brainstorm's client writes two. Harmless and more complete; Brainstorm reads `30382:rank`.
2. Process: the first pass trusted a single package's run. Gates are the full workspace run, every time.

## Verdict
**PASS (round 2).** After merge and deploy, run `librarian-profile` and read the 10040 back.
