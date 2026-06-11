# ADR 0079: Contested-tag treatment — an additive read-time flag + a Pill treatment

**Status:** Accepted
**Date:** 2026-06-09
**Story:** `engineering-team/stories/81-contested-tag-treatment.md`

## Context
`aggregateBookTagsWeighted` (ADR 0025) already computes per-tag `trustedApplies`/`trustedDisputes` (trust-weight sums over positively-trusted asserters from the active observer's vantage) and surfaces every known, non-gated tag — including ones the trusted graph net-disputes, which today render as normal chips. The chips are `Pill variant="genre"` (`pill pill-genre`, with the `pill-community` sub-treatment); chip surfaces are `BookHeader` and `TagControl`, and **chips are genres + styles only** — accusatory tags are signals, rendered through the separate revealed/gated paths (#78/ADR 0034). The wireframe pins the contested look (transparent fill, muted ink, line-through, dashed border, a small "contested" label); the design guide mandates treatment-not-color.

## Decision

### 1. The predicate (resolves OQ-1): `contested = !accusatory && trusted && trustedDisputes >= trustedApplies`
Computed in the aggregate's consensus build, beside `trusted`. Reading the product line ("the trusted graph net-disputes") strictly gives `>`; the **tie is included** because a tied tag is not net-applied and rendering it as a settled chip overstates consensus — the tie is the most contested state there is. Consequences of the shape:
- **Raw/no-trust view never contested** (AC-3): an empty weights map or no positively-trusted asserter ⇒ `trusted` false ⇒ never contested; untrusted dispute volume contributes weight 0 and cannot trigger it (the existing untrusted-can't-flip invariant carries over).
- **Accusatory tags are excluded by construction** (`!accusatory`), so `contested` can never collide with `revealed`/`gated` — and chips never render accusatory tags anyway.
- Additive wire shape: `TagConsensus` gains `contested?: true` (set only when true, like `revealed`/`gated`); raw `applies`/`disputes` and surfacing are untouched (AC-5).

### 2. The Pill treatment (resolves OQ-2)
`Pill variant="genre"` (and the `GenrePill` re-export) gains `contested?: boolean`:
- Class composition: `pill pill-genre pill-contested`; **contested takes precedence over `community`** (a contested tag in a trusted section reads contested, not merely community — it carries strictly more information).
- The chip renders the small `contested` label (the wireframe's `tag-label`) and **suppresses the applies count** (a struck label next to an endorsement count would contradict itself; the wireframe shows no count).
- CSS (tokens only, mapped from the wireframe): transparent background, `var(--u-muted)` ink, `line-through`, `1px dashed var(--u-border)`; the label un-strikes itself (`text-decoration: none`, small, muted).

### 3. The seams
- `apps/api/src/tags/aggregate.ts`: set `contested` in the consensus object. `TagConsensus` type (api + the web mirror in `apps/web/src/lib/api.ts`) gains `contested?: boolean`.
- `BookHeader` + `TagControl` chips pass `contested={t.contested === true}` through to `GenrePill`.
- Nothing else: no route changes (the flag rides the existing payload), no write path, no config, no search/indexer change (its raw net-positive rule is a different, deliberate gate).

## Consequences
- **Enables:** a community fight is visibly distinct from a community consensus at a glance, on both tag surfaces, from the trusted vantage only.
- **Degraded path byte-identical:** CI/fixture/no-trust deployments never set the flag.
- **Affects existing fixtures?** Additive optional field; existing `toEqual` assertions on tag consensus objects are unaffected (the flag is omitted unless true — same pattern as `revealed`/`gated`).
- **New dependency?** No. **PRD change?** No — implements the queue's Block-3 line + PRD §"Tag Assertion gains a contested read-state".

## Implementation notes
- Aggregate: `...(contested ? { contested: true } : {})` in the consensus spread, `contested = !isAccusatory && trusted && c.trustedDisputes >= c.trustedApplies`.
- `packages/ui` `Pill.tsx`: `contested?` on the genre variant props; class precedence contested > community; render the label span, skip the count when contested. `Pill.css`: `.pill-contested` + `.pill-contested-label`.
- Web: `TagConsensus.contested?`; the two chip call sites.

## Out of scope
Surfacing changes; raw-count contested; thresholds/config; accusatory machinery; search.
