# ADR 0093: A catalog year must be possible and have company; the librarian corrects it at source

**Status:** Accepted
**Date:** 2026-10-20
**Story:** `engineering-team/stories/104-catalog-year-correction.md`
**Builds on:** ADR 0091 (`PRINT_ERA_START`, `credibleYear`), ADR 0054 (search-API seed), ADR 0051 (record fingerprint), ADR 0087 (one-off seeder entrypoints)

## Context
PRD §6.2 says a record's `publishYear` is the original publication year. Seeded records take it from Open Library's search `first_publish_year`, which is the minimum over a work's editions, so one mis-dated edition pulls the whole work back. Story 103 stopped hiding early years and made the worst of these visible.

Facts from the hub (`wss://dcosl.brainstorm.world`, librarian `books` header, 11,282 records, read 2026-10-20) and Open Library (batched search for every work's `publish_year` and first `author_key`, then every first author's `birth_date`):

- **The works record's `first_publish_date` cannot be the source.** It is right for some modern books (Step on a Crack 2007, The Boys from Brazil 1976), missing for others (The War of the Worlds, Persuasion), and wrong for many classics: Macbeth 2003, Hamlet 1950, Gulliver's Travels 1966, The Divine Comedy 2007, Romeo and Juliet 1949.
- **The edition years hold the answer.** Step on a Crack's editions are 1658, 1947, 2007, 2008…; The War of the Worlds' are 0, 1898, 1906…. The bad year is one stray edition.
- **The author's birth year exposes an impossible year.** 255 records carry a year before their first author turned 20, and almost all are plain errors: 1800 is a common placeholder (A Tale of Two Cities, Middlemarch, Keats' Poems), and many sit at or near the birth year (The Lorax 1911, Endless Night 1905, 4th of July 1947).
- **Open Library's birth dates are sometimes wrong too.** Emma Darcy is recorded as born 1983 and Karen Traviss as 2000, against twenty-odd romances and Star Wars novels dated 1985 to 2008. Real young authors exist: The Outsiders (1967, S. E. Hinton born 1948), Eragon (2000, Christopher Paolini 1983), Bonjour tristesse (1954, Françoise Sagan 1935), Zlata's diary (1993, Zlata Filipović 1980).
- **What separates those cases is company.** A mis-dated edition stands alone, decades before the next (1658 then 1947; 1800 then 1832). A real first year, or a correct year under a wrong birth date, has reprints right behind it (Jack's Baby 1996, 1997; The Outsiders 1967, 1968; Eragon 2000, 2002).
- Every hub record round-trips exactly through `fromWireEvent` → `fromBookRecordEvent` → `toBookRecordEvent` → `toWireTemplate` (11,278 byte-identical payloads; 4 old records gain an explicit `submittedBy: null`, the same record). So a corrected record can be rebuilt from the schema and proven to differ only in its year.
- 74 records' work ids no longer come back from search (Open Library merged those works; `/works/<id>.json` is a `/type/redirect`). Only one of them looks mis-dated (I promessi sposi, 1800).
- Seeded records come from the seeder (ADR 0054) and are republished on content change through the epoch-namespaced fingerprint (ADR 0051). Legacy records from the subjects API (story 103's 181) are not in today's search results, so a seed epoch cannot reach them.

## Options considered

### Option A: works `first_publish_date` wins when present
Simple and one request per work. Rejected: it moves Macbeth to 2003, Hamlet to 1950 and Gulliver's Travels to 1966, and is missing for The War of the Worlds and Persuasion.

### Option B: an impossible year is replaced by the earliest possible edition year (no company test)
Uses the author's birth to nominate and the edition years to correct. Rejected on the data: with the birth test alone, a wrong birth date rewrites correct years (Emma Darcy's Jack's Baby 1996 → 2011; Karen Traviss' Star Wars books left impossible or rewritten), so it fails AC 3.

### Option C: impossible *and* alone, replaced by the earliest possible edition year (chosen)
The birth test nominates; the company test confirms; the edition years supply the replacement.

### Option C′: as C, but the replacement must also have company
Considered because some replacements land on a second stray edition (A Tale of Two Cities 1800 → 1832, not 1859). Across the 26 records where C and C′ differ, C is right or closer on 12 and C′ on 9, and C′'s misses are larger (Milton's Poems 1645 → 1791, Civil Disobedience 1849 → 1943). Rejected: more rule, no better result. The dry run is where a person catches the near misses.

## Decision
**Option C.**

1. **The rule** (`judgeYear`, pure, in `apps/seeder/src/year.ts`):
   - `MIN_AUTHOR_AGE = 20`, `EDITION_COMPANY_YEARS = 10`.
   - The **floor** is `PRINT_ERA_START` (ADR 0091), raised to `authorBirthYear + MIN_AUTHOR_AGE` when the birth year is known.
   - A stored year at or above the floor is **credible**: never changed.
   - A stored year below the floor that has another edition year within `EDITION_COMPANY_YEARS` after it is **kept** and reported (the birth date is the likelier error).
   - Otherwise the stored year is **corrected** to the earliest edition year in `[floor, currentYear]`, or, when none exists, it is **unresolved**: unchanged and reported.
   - A future stored year is out of this rule's reach (the read-time oracle already hides it, ADR 0055).
   The 20 is a nomination threshold, not a claim about authors: the company test is what protects a real young author, and raising the threshold from 15 to 20 adds 27 corrections on the hub, each a plain error (Washington Irving's 1800s, The Bell Jar 1948, Little Women 1848), and no false one.
2. **Author evidence must name the record's author.** The birth year counts only when the Open Library author record's `name` equals the record's `authorName` (trimmed). Otherwise the floor stays `PRINT_ERA_START`. Open Library re-spelled Homer since seeding (Όμηρος → Ὅμηρος), and a record must never move on evidence about someone else. `birthYearOf` reads the first three- or four-digit year in Open Library's free-text `birth_date` ("21 September 1866", "ca. 1775") and gives none for a BC date or no year.
3. **Evidence comes from Open Library search in batches** (`apps/seeder/src/ol-evidence.ts`): works by `q=key:("/works/A" OR …)` with `fields=key,publish_year,author_key`, 100 per request; first authors by `search/authors.json` the same way with `fields=key,name,birth_date`. The seeder's User-Agent, a delay between requests, an injectable `fetch`; an HTTP error throws, so a run never acts on partial evidence.
4. **The librarian corrects existing records with a dedicated ops entrypoint** (`apps/seeder/src/correct-years.ts`, bundled as `years.js`), not a seed epoch, because a seed epoch cannot reach legacy records and would re-fetch the whole catalog to change a year.
   - It reads every librarian record under the `books` header from dcosl (the source the seeder publishes to; the droplet's relay is a down-synced mirror) through the shared pager (`queryAllPages`), and keeps only events whose signature verifies as the librarian's: the correction re-signs their content with the librarian key, so nothing a relay sends on someone else's behalf may pass.
   - It considers only live (not delisted, ADR 0078) records with `source: "openlibrary"`, an Open Library id and a year. Community records keep their submitter's year.
   - It plans everything before publishing anything (`planYearCorrections`, pure, in `apps/seeder/src/year-corrections.ts`).
   - **Dry run is the default** and prints the corrections, then the kept and unresolved records, as tab-separated lines, then counts. It needs only the librarian's public key (`LIBRARIAN_PUBKEY`, or derived from `LIBRARIAN_NSEC`).
   - `--apply` requires `LIBRARIAN_NSEC`, signs each corrected record with the librarian key and publishes it to dcosl at its own address (`39999:<librarian>:<slug>`; kind 39999 is parameterized-replaceable, so it replaces in place, as every seeder republish does).
   - Just before each publish it reads that record again (signature verified). A record that changed since it was planned (a promoter demotion, a seed write, minutes later after the Open Library fetches) is skipped as `stale`, never overwritten. It exits non-zero if any publish is refused or any record was stale.
   - **Only the year changes.** Each corrected event is `toBookRecordEvent({ ...record, publishYear })`, and `correctedRecordTemplate` checks before returning it that the tags equal the original's except the `year` value, the content is the same, and the `json` payload equals the original's except `bookSubmission.publishYear` (the one allowed addition is the explicit `submittedBy: null` four old records lack). A record that fails the check is reported as `refused`, never published.
   - **Idempotent:** a corrected year is credible under the same rule, so a second run plans nothing.
5. **The seeder writes the same year** so a later epoch cannot reintroduce a bad one. `SEARCH_FIELDS` gains `publish_year`; after dedup the seeder fetches the first authors of the books it will publish (point 3) and passes the record through the same `judgeYear` before fingerprinting. A corrected or kept year goes into the record; an unresolved one keeps Open Library's year (as the repair does). The gate is unchanged: it still judges the search result's own `first_publish_year`.
6. **Staging ops** gains `years-check` (dry run) and `years-fix` (apply), each pulling the deployed seeder image, as `headers` does. After `years-fix`, the five-minute down-sync brings the records to the droplet relay and an `index` run refreshes search years. Brainstorm reads dcosl and sees them at once.

## Consequences
- About 255 records get a possible year: the 44 modern books story 103 exposed and about 211 more after 1800. The four records before 1450 get real years, so ADR 0091's `credibleYear` stops blanking them.
- Some corrections land a few years early on a second stray edition (The Boys from Brazil 1969, Lipstick Jungle 2001, A Tale of Two Cities 1832). Each is still far closer than before, and each appears on the dry-run list for a person to fix by hand.
- Kept records (40 on the hub: Emma Darcy's and Karen Traviss' books, The Outsiders, Eragon, Little Dorrit's 1800 and 1802 pair) stay as they are and are listed every run.
- A seed run makes one extra batched author lookup (about one request per 100 books).
- Follow-ups: follow Open Library work redirects for the 74 merged works (catalog hygiene, also fixes their stale `open-library-id`); a hand-correction path for the near misses if Avi wants one.
- **Affects existing fixtures?** No.
- **New dependency?** No.
- **PRD section change required?** No; this makes records meet §6.2.

## Implementation notes
- `apps/seeder/src/year.ts` (new): `MIN_AUTHOR_AGE`, `EDITION_COMPANY_YEARS`, `birthYearOf(date?: string): number | undefined`, `yearFloor(authorBirthYear?: number): number`, `judgeYear(input: { year: number; editionYears: readonly number[]; authorBirthYear?: number }, currentYear: number): YearVerdict` where `YearVerdict = { kind: "credible" } | { kind: "corrected"; year: number } | { kind: "kept"; floor: number } | { kind: "unresolved"; floor: number }`; `authorBirthFor(recordAuthor: string, author?: { name?: string; birthYear?: number }): number | undefined` (the name rule).
- `apps/seeder/src/ol-evidence.ts` (new): `fetchWorkEvidence(workIds, opts) → Map<workId, { editionYears: number[]; authorKey?: string }>`, `fetchAuthors(authorKeys, opts) → Map<authorKey, { name?: string; birthYear?: number }>`. `opts = { fetchImpl?, userAgent?, batchSize? (100), delayMs? }`. Ids are bare (`OL45804W`, `OL13066A`).
- `apps/seeder/src/year-corrections.ts` (new): `planYearCorrections(events, evidence, authors, currentYear) → { corrections, kept, unresolved, noEvidence, refused }`; `correctedRecordTemplate(event, year, createdAt)`; `formatPlan(plan) → string[]` (the dry-run lines).
- `apps/seeder/src/correct-years.ts` (new): the entrypoint (env `DCOSL_RELAY_URL`, `LIBRARIAN_PUBKEY` | `LIBRARIAN_NSEC`, `YEARS_RATE_MS`, the `RELAY_RECONNECT_*` knobs; flag `--apply`).
- `apps/seeder/src/gate.ts`: `OLSearchDoc.publish_year?: readonly number[]`. `apps/seeder/src/search.ts`: `publish_year` in `SEARCH_FIELDS`.
- `apps/seeder/src/index.ts`: after dedup, `fetchAuthors` for the chosen docs' `author_key[0]`; `judgeYear` on each mapped record before the fingerprint.
- `apps/seeder/esbuild.config.mjs` + `Dockerfile`: the `years.js` entrypoint. `.github/workflows/staging-ops.yml`: `years-check`, `years-fix`. `docs/DEPLOY.md`: the two tasks.

## Out of scope
- Following merged-work redirects; hand corrections; the seed gate's year signal; community records' years.
