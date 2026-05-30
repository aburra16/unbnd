# ADR 0015: Submission de-duplication (search-first)

**Status:** Accepted
**Date:** 2026-05-29
**Story:** `engineering-team/stories/15-submission-dedup.md`

## Context

Prevent duplicate submissions by checking the live catalog before the form. The pattern proven by Goodreads / Open Library / Discogs is **search-first, gated form**. `/api/search` (story 12) is the search source.

## Decision

- **`DuplicateCheck`** (rewrite the fixture component): a live, debounced search (≈200ms, ≥2 chars) against `api.search`, rendering matches as a **persistent inline list** (each links to `/book/:slug`). Not the ephemeral nav dropdown — the user must be able to review matches.
- **ISBN exact match:** add `isbn13` to the search hit shape (it's already indexed). When the query is a normalised 10/13-digit ISBN and a hit's `isbn13` matches exactly → a firm "already on Unbnd" banner (link straight to it). Title matches stay advisory (editions/translations).
- **Proceed / all-clear:** after a real query, surface a CTA — primary "Add this book" when there are **no** matches, quieter "Add it anyway" when there are. Both call `onProceed({ title })`.
- **Gating:** `Submit` hides the form until `onProceed`. The revealed form is **prefilled** with the searched title; a "back to search" link returns to step 1.
- **Graceful degrade:** if search errors, don't block — allow proceeding (the dedup is advisory, not a hard gate, except the explicit ISBN-exact banner).

## Consequences

- Submit becomes a two-step search-first flow reusing `/api/search`; no new endpoint. `SearchHit` gains `isbn13?` (neutral type + Meili adapter mapping + web type) — guard unaffected (no Meili specifics leak).
- The actual submission **write-path** stays a stub (story 16).

## Out of scope
Submission write/sign/publish (story 16); OL metadata autofill; cover preview; author claim.

## Implementation notes
1. `@unbnd/search` `SearchHit` += `isbn13?`; `MeiliProvider.toHit` maps it; web `SearchHit` type += `isbn13?`.
2. Rewrite `DuplicateCheck` (live search, inline matches, ISBN banner, `onProceed`).
3. `Submit`: gate the form behind `onProceed`; prefill title; back-to-search.
4. Tests: DuplicateCheck (query→matches, no-match CTA, add-anyway, ISBN banner), Submit gating + prefill.
