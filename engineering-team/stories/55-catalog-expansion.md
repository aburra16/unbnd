# Story 55: Catalog expansion to ~10K with a legitimacy gate and enrichment

**Status:** In progress
**Created:** 2026-06-04
**Type:** Feature / Data

## Background

The catalog is the one unmet Phase-2 engineering success criterion. PRD §4 sets the target at "~10K good records (quality over the round number)" and PRD §2.2 records the current state as ~1,960 books across 8 genre buckets pulled from the Open Library **subjects API**. The catalog sits at roughly 2K today. The goal is to grow it toward ~10,000 while keeping the records clean, so the catalog reads like a real bookstore rather than a junk pile.

The product posture for this expansion is **legitimacy-gated, not popularity-gated**. We remove junk (vanity records, study guides, pamphlets, box sets) without imposing a readership floor, because long-tail and obscure-but-real books are Unbnd's discovery differentiator. A clean catalog that still carries the obscure-but-real book is worth more than a larger catalog that has been trimmed to only the popular ones.

Two facts from the survey ground this work:

- **The subjects API is the wrong source at depth.** `apps/seeder/src/fetch.ts` reads `https://openlibrary.org/subjects/{subject}.json`. That endpoint returns title, author, cover id, first-publish year, and subjects, but none of the quality signals needed for a gate, and it gets junkier the deeper the offset goes. Open Library's **search API** (`https://openlibrary.org/search.json`) returns the quality signals inline in one paginated call (no extra per-book fetch), supports a quality-first sort, and exposes the fields the gate needs.
- **The schema already holds the enrichment fields.** `packages/schemas/src/BookRecord.ts` already declares `isbn13`, `isbn10`, `language`, `pageCount`, `publishYear`, `openLibraryId`, `subjects`, and `blurb`, and `toBookRecordEvent` already serializes them onto the kind-39999 event (`isbn`, `isbn10`, `lang`, `year`, `pages` tags). These fields are simply **empty today** because the subjects API never supplied them. Populating them needs **no schema change**.

This story is the data-quality and growth pass. It also re-applies the new standard to the existing ~2K records by enriching keepers in place. Removing the records that fail the new gate (the NIP-09 prune) is a follow-up — **Story 56** — because making a deletion actually take effect requires capabilities this story does not build (see Out of scope). This story carries the expand + gate + enrich scope, which works end-to-end on the existing infrastructure today.

## User-facing description

As a Reader (PRD §3.1) browsing and searching Unbnd, I want a large catalog that feels like a real bookstore — broad and deep, including obscure-but-real books — without junk records (vanity one-offs, study guides, pamphlets, box sets) cluttering the results, so that browsing and search are trustworthy and discovery surfaces real books rather than noise.

## Acceptance criteria

Testable from the outside. The real test surface is the **legitimacy gate** (a pure, unit-testable function over an Open Library search document) plus the seeder's dedup and enrichment behavior; the size and enrichment results are operator-observable after the re-seed and re-index.

**Source swap**
- [ ] Given the seeder runs, when it fetches a genre, then it reads the Open Library **search API** (`https://openlibrary.org/search.json`) with a subject-scoped, English-scoped, quality-first-sorted query and an explicit lean `fields=` set, instead of the subjects API. The requested fields include at least `key`, `title`, `author_name`, `author_key`, `edition_count`, `cover_i`, `first_publish_year`, `language`, `number_of_pages_median`, `readinglog_count`, `ratings_count`, `isbn`, and `subject`.

**The legitimacy gate (drop a work unless ALL pass)**
- [ ] Given a search doc with no title or no first author name, when gated, then it is dropped (existing behavior, kept).
- [ ] Given a search doc with no `cover_i`, when gated, then it is dropped.
- [ ] Given a search doc whose `language` does not include `eng`, when gated, then it is dropped.
- [ ] Given a work with `edition_count` of 2, when gated, then it is dropped; given `edition_count` of 3 or more, the edition signal passes.
- [ ] Given a work whose `number_of_pages_median` is present and below 50, when gated, then it is dropped; given the field absent, the page signal passes (absence does not drop); given it 50 or more, the page signal passes.
- [ ] Given a work whose `first_publish_year` is absent, or before 1800, or after the current year, when gated, then it is dropped; given a year within `1800..currentYear`, the year signal passes.
- [ ] Given a work whose title matches the junk denylist (case-insensitive) — for example `Summary of Dune`, `The X Study Guide`, `… Workbook`, a `SparkNotes`/`CliffsNotes`/`Cliffs Notes` title, or an omnibus/box-set title — when gated, then it is dropped. A title that does not match the denylist passes that signal.
- [ ] Given the gate, when invoked as a function on a fixture search doc, then it is **pure and unit-testable in isolation** (deterministic, no I/O), and is covered by unit tests using fixture Open Library search documents for each signal above, including the passing case.

**Readership is a sort, not a cutoff**
- [ ] Given the genre query, when issued, then it is sorted by reading-log (`sort=readinglog`) so the catalog fills better-known-first, and there is **no** hard `readinglog_count` or `ratings_count` floor: an obscure-but-legitimate work (low or zero reading-log count) that passes every gate signal is kept.

**Dedup + schema enrichment**
- [ ] Given the same book reached via two different genre queries (same ISBN-13), when seeded, then it yields **one** BookRecord (deduped by ISBN-13, in addition to the existing slug dedup).
- [ ] Given a kept work, when its BookRecord is published, then the kind-39999 event carries `isbn13` (a valid 13-digit ISBN selected from the search doc's `isbn` array; `isbn10` derived or kept when trivially available), `language` (normalized, e.g. `eng`/`en`), and `pageCount` (from `number_of_pages_median`), in addition to the title/author/cover/openLibraryId/publishYear/subjects/blurb already populated today.
- [ ] Given the blurb enrichment path (the `/works/{id}.json` description fetch, the 2000-char cap, and the description disk cache from ADR 0051 / 0052), when seeding, then it is **unchanged** and continues to populate `blurb` as today.

**Scale + genres**
- [ ] Given a full re-seed, when complete, then the catalog reaches roughly **10,000 books** total (operator-observable, e.g. via relay/index count), spread across the **existing 8 product genres** (literary-fiction, science-fiction, mystery, romance, fantasy, thriller, biography, history) at roughly ~1,250 post-gate each, with **no new genres** and **no taxonomy or UI change**. The per-genre target count is operator-configurable (e.g. via the existing `PER_SUBJECT`-style env).

**Enrich existing keepers in place (no relay-read, no deletion)**
- [ ] Given the gated set is re-seeded, when a book whose slug already exists on the relay is published, then it is **re-published in place via its deterministic d-tag** (the existing per-book fingerprint/replace mechanism), carrying the new `isbn13` / `language` / `pageCount`, with no duplicate record. Enrichment of still-passing existing books therefore happens **automatically** as a side effect of the re-seed — there is **no relay read and no deletion**. Books present only in the old set that are absent from the new gated set simply **persist as stale records**; their removal is **Story 56**. Story 55 **does NOT add a relay-read capability** and **does NOT publish any kind-5** — the Tester and Implementer must not reintroduce either.

**Invariants preserved**
- [ ] Given the seeder runs, when observed, then the epoch-namespaced resumable checkpoint, the work-level description disk cache, Open Library politeness (`User-Agent` header + inter-page delay), and relay rate limiting are all **retained**, and a re-run is idempotent and resumable.

**Gates green, no out-of-scope change**
- [ ] Given the change, when CI runs, then the seeder builds and its **new unit tests** (gate signals + ISBN-13 dedup + enrichment mapping) are green, and `pnpm -r typecheck` / `pnpm -r test` stay green.
- [ ] Given the change, when reviewed, then there is **no change to the web app, the design system, or the API**, and **no schema change** (the enrichment fields already exist on `BookRecord`). The only indexer change is a full re-index that reflects the enriched keepers and the larger gated set.

## DList shapes touched

- `kind:39999` — book record (`bookSubmission`), seeded by the librarian. Enrichment populates the already-declared `isbn13` / `isbn10` / `language` / `pageCount` fields (serialized as the existing `isbn` / `isbn10` / `lang` / `pages` tags) on records that today carry them empty. The d-tag (slug) is unchanged, so enriched re-publishes replace in place. **No new tag, no new field, no kind change.** No new relay capability: the seeder still only publishes, exactly as today.

## Out of scope

- **Pruning the existing ~2K (NIP-09 kind-5 deletion of records that fail the new gate) is deferred to Story 56** — it requires a relay-read capability, a kind-5 publish path, a down-sync filter change to propagate librarian kind-5 to the local strfry, and verification that the local strfry honors NIP-09 deletion. See Story 56 / ADR 0055. This story enriches keepers in place but does not remove anything; legacy junk persists until Story 56.
- **No new genres or taxonomy change.** The expansion stays within the existing 8 product genres. The PRD §2.2 / §4 "14+ genres" direction is explicitly **not** adopted by this story — it remains a later, separate decision. No UI change to the genre taxonomy.
- **No web / UI / API / design-system change.** This is seeder + a full re-index only.
- **No popularity floor.** Reading-log count and ratings count are a sort input only, never a cutoff. Obscure-but-real books are kept by design.
- **No edition-level ISBN fetch** beyond what the search API returns inline. We do not make extra per-edition calls to chase ISBNs.
- **No multi-language catalog.** English-only (`language` includes `eng`) for this pass.
- **No schema change.** The enrichment fields already exist on `BookRecord`; this story only populates them.
- **No blurb-enrichment change.** The `/works/{id}.json` description fetch, the 2000-char cap, and the description disk cache stay exactly as shipped in stories 52/53.

## Open questions

For the Architect to resolve during the Architecture phase (the PO does not answer these):

1. **Exact denylist regex.** Finalize the precise case-insensitive pattern set from the seed intent + list: `Summary of`, `Study Guide`, `Workbook`, `SparkNotes`, `Cliffs Notes` / `CliffsNotes`, and omnibus/box-set patterns. Pin the exact anchoring and the omnibus/box-set phrasings so the gate neither under- nor over-matches.
2. **Per-genre count + search-API paging.** Pin the exact per-genre target (~1,250 gated each toward ~10K total) and how to page the search API — accounting for gate attrition — so each genre actually yields its target post-gate (page size, offset/cursor strategy, max pages, and how the `PER_SUBJECT`-style env is raised or replaced).
3. **`edition_count >= 3` sensitivity.** The decided default is `>= 3`. The Architect should keep this a single tunable constant and run a sensitivity check on `>= 3` vs `>= 2` against real OL search results, since the threshold trades junk-rejection against long-tail retention. Decided default stands unless the check shows it is clearly wrong; this is a note, not a re-litigation.

The original delete/diff and indexer-deletion-awareness questions have **moved to Story 56** along with the prune, because a kind-5 delete published to dcosl never reaches the local strfry under the current down-sync filter (kinds 39998/39999 only), so it cannot take effect in this deployment without further work. The full prune design the Architect worked out is preserved in ADR 0054's "Deferred to Story 56 (prune existing junk)" subsection.

## Linked artifacts

- Depends on / relates to: Story 52 / ADR 0051 (blurb seeding, description disk cache, epoch checkpoint), Story 53 / ADR 0052 (2000-char blurb cap). The blurb path is reused unchanged.
- Followed by: `engineering-team/stories/56-catalog-prune.md` (the NIP-09 prune of records that fail the new gate, deferred from this story). It depends on Story 55 (the gate function is the shared oracle).
- ADR: `engineering-team/decisions/0054-catalog-expansion.md`.
- Test plan: (filled in after Test Design phase)
- Review: `engineering-team/reviews/55-catalog-expansion.md` (pending).
