# Story 13: Surface tags in search (+ tag browse)

**Status:** DRAFT — logged for prioritization (not yet scheduled)
**Created:** 2026-05-29
**Type:** Feature

## Background

Search currently returns books only. The operator wants matching **tags**
(genre + community style/signal tags) surfaced too: in the search dropdown,
matching tags appear in a differentiated section **above** the books list
(chip layout), and selecting a tag leads to the books carrying it.

This is a discovery enhancement layered on story 12's search.

## User-facing description

As a reader, when I type a query, I want to see matching **tags** (e.g.
"Mystery", "Experimental") as chips at the top of the results, distinct from
the book list, so I can jump to everything carrying that tag — not just books
whose title/author match my text.

## Acceptance criteria (draft)

- [ ] AC-1: `/api/search` (or a sibling) returns a `tags` section — taxonomy tags (genre/style/signal, **non-accusatory**) whose name matches the query — alongside book hits.
- [ ] AC-2: The search dropdown renders matching tags as **chips in a differentiated section above** the book list; the `/search` page does the same.
- [ ] AC-3: Selecting a tag navigates to a tag-browse view of the books carrying it (net-positive consensus), reusing the existing assertion aggregation.
- [ ] AC-4: Genre tags already have `/genre/:slug`; non-genre tags get a generic `/tag/:slug` browse (book grid + honest empty state).
- [ ] AC-5: Accusatory tags never surface (mirrors read-time hiding). No fabricated counts; provider-agnostic (no Meili leak — guard still holds).

## Lift assessment

**Medium.** Pieces:
- **Tag match source** — the curated taxonomy is ~15 elements today, so a substring/fuzzy filter over `/api/tags` is cheap and needs no new index. (If we later want typo-tolerant tag search at scale, index tags through the provider — keeps it neutral.)
- **Generic tag browse** — `/api/genres/:slug/books` already filters assertions by `#t=slug` for ANY slug, so the endpoint largely exists; mostly a `/tag/:slug` web route (a generalized GenreBrowse) + the tag name.
- **Dropdown/results UI** — a differentiated tags section above books (moderate).
- **"Community-created" free-form tags** (slugs outside the curated taxonomy) — the meatier part: collecting distinct applied slugs from assertions, and it brushes up against the deferred **Layer-2 trust/role gate** (which non-curated tags to trust/show). Recommend scoping v1 to the **curated taxonomy** (genre/style/signal) and deferring arbitrary free-form tag surfacing until GrapeRank/trust gating exists.

## Recommendation / sequencing

Good feature, not urgent. Value grows as the taxonomy + community tagging grow
(only ~15 curated tags today). Suggest sequencing **after GrapeRank
trust-weighting** (the core "weighted by people you trust" pillar, which also
gives us the trust signal to gate/rank free-form community tags). Revisit then.

## Out of scope
Free-form (non-taxonomy) tag surfacing at scale; trust-gated tag visibility;
tag search ranking by popularity — all tied to GrapeRank.
