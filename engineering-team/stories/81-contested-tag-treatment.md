# Story 81: Contested-tag treatment

**Status:** Planning
**Created:** 2026-06-09
**Type:** Feature (read/presentation layer)

## Background
A book's tags are surfaced from the assertion consensus by `aggregateBookTagsWeighted` (`apps/api/src/tags/aggregate.ts`): dedup per (author, tag) latest-wins, raw `applies`/`disputes` counts, plus trust-weighted `trustedApplies`/`trustedDisputes` sums from the active observer's vantage (ADR 0025). **Every known, non-gated tag with assertions is surfaced** — including a tag the trusted graph net-disputes. Today such a tag renders exactly like a normally-applied chip (`Pill variant="genre"` in `BookHeader` and `TagControl`), which overstates consensus: a tag that trusted curators are actively disputing looks identical to one they endorse.

The product queue (`product-team/stories-queue.md`): *"A tag the trusted graph net-disputes renders visibly distinct (muted and struck 'contested') from a normally-applied tag."* The wireframe (`social-loop-wireframes.html`) pins the treatment: transparent background, muted ink, line-through, dashed border, a small "contested" label. The design guide is explicit: *contested is a treatment, not a new color* (tokens only, no new hex).

This is a **read/presentation story**: no new event shape, no write path, no new threshold config. The signal already exists in the aggregate's trusted sums; the story carries it to the chip.

**Hard constraints:** no new colors (token treatments only); no change to which tags surface (presentation only — the gated/revealed accusatory machinery from #78 is untouched); the raw/no-trust degraded view stays exactly as it is (the product line scopes contested to the **trusted graph's** judgment).

## User-facing description
As a reader, when the trusted graph disputes a tag on a book more than it backs it, I want that tag to look visibly unsettled — muted and struck through, labelled "contested" — so I can tell a community fight from a community consensus at a glance.

## Acceptance criteria
Testable from the outside.

- [ ] A surfaced tag whose **trusted** dispute weight outweighs (or ties) its trusted apply weight carries a `contested` marker on the tags read; the web renders it muted + struck with a "contested" label, visibly distinct from a normally-applied chip, in both tag surfaces (the book-header chips and the classification section).
- [ ] A tag the trusted graph **net-applies** (trusted applies > trusted disputes) is never marked contested and renders exactly as today.
- [ ] The **raw / no-trust view never marks contested** (an empty weights map, no trust provider, or a tag with no positively-trusted asserter): the degraded path is byte-identical to today. Untrusted dispute volume cannot make a tag contested (the existing untrusted-can't-flip invariant).
- [ ] The treatment is **tokens only** (no new hex; muted ink + line-through + dashed border per the wireframe) and does not collide with the existing treatments (`community`, `revealed`, `gated`): an accusatory tag's revealed/gated rendering is unchanged.
- [ ] Which tags surface is **unchanged** (no tag appears or disappears because of this story); raw `applies`/`disputes` counts on the wire are unchanged; the change is an additive optional flag.

## DList shapes touched
None on the wire (no new event, no tag change). `TagConsensus` (api + web mirror) gains an additive optional `contested?: boolean`, computed at read time from the existing trusted sums.

## Out of scope
- Any change to surfacing/filtering (a contested tag still surfaces; hiding it is a different product decision).
- Raw-count-based contested marking (the no-trust view), new thresholds/config, search-index treatment of contested tags (the indexer's raw net-positive rule is untouched).
- Accusatory reveal/gated machinery (#78), tag writes, the picker.

## Open questions
For the Architect:
1. **The contested predicate, exactly.** "The trusted graph net-disputes" reads strictly as `trustedDisputes > trustedApplies`; decide whether a **tie** (equal trusted weight both ways) is contested too. A tied tag is not net-applied — rendering it as a settled chip overstates consensus — so the PO leans `trusted && trustedDisputes >= trustedApplies`, but the Architect pins it (and the tie case gets a test either way).
2. **Where the flag is computed** (the aggregate's consensus build, alongside `trusted`) and how the `Pill` treatment composes with `community` (a contested tag in a trusted section should read contested, not community).

## Linked artifacts
- Product: `product-team/stories-queue.md` (Block 3), wireframes + design guide.
- ADR: `engineering-team/decisions/0079-contested-tag-treatment.md` (Accepted)
- Test plan: _pending (Tester)_
- Review: _pending (Reviewer)_
