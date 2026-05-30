# Story 16b: Trust-gated submission promotion (+ shared role gate)

**Status:** DRAFT — logged, not scheduled
**Created:** 2026-05-29
**Type:** Feature

## Background

Story 16a publishes community submissions into a separate `book-submissions`
space. This story decides **which submissions surface in the canonical catalog**
— using GrapeRank trust (story 14) + a curator/role assertion gate. The same
trust+role mechanism is what the **accusatory-tag gate** (deferred from story 9)
needs, so 16b should unlock both.

## Sketch (to refine into ACs at build time)

- **Promotion rule:** a submission whose submitter clears a trust threshold from
  the house/librarian vantage (GrapeRank `rank` ≥ cutoff) surfaces in the main
  catalog (and/or search index); below-threshold submissions stay in the
  community-submissions area until a curator promotes them.
- **Curator/role assertions:** a role mechanism (an assertion on a pubkey
  granting curator/editor) that, combined with trust, gates promotion AND the
  visibility of **accusatory** tags (`ai-generated`, etc.). One gate, two uses.
- **Read paths:** the catalog read unions canonical (librarian) + promoted
  community submissions; a "community submissions" browse for the rest.
- **Mechanism choice:** promote by re-surfacing at read time (preferred — no
  re-signing, submitter keeps authorship) vs librarian re-publish.

## Open questions
- Trust cutoff for auto-promotion; curator-role assertion shape + who can grant it.
- Whether the search indexer includes promoted submissions.
- Conflict/merge when a submission duplicates a later-seeded canonical record.

## Depends on
Story 16a (submissions exist), story 14 (GrapeRank trust). Unlocks the
story-9-deferred accusatory-tag role gate.
