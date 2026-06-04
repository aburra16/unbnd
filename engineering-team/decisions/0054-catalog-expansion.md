# ADR 0054: Catalog expansion to ~10K with a legitimacy gate and enrichment

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/55-catalog-expansion.md`

**Accepted 2026-06-04 (re-scoped).** This ADR ships **expand + gate + enrich**. Swap the seeder's collect step from the Open Library **subjects API** (`fetch.ts`, `/subjects/{subject}.json`) to the **search API** (`/search.json`, `q=subject:<ol> language:eng`, `sort=readinglog`, lean `fields=`), which returns the gate signals inline in one paginated call. A new pure module `gate.ts` drops a work unless ALL pass: title + first author, `cover_i` present, `language` includes `eng`, `edition_count >= EDITION_MIN` (default 3), `number_of_pages_median` absent-or-`>= 50`, `first_publish_year` in `1800..currentYear`, and title not on a junk denylist (study guide / summary-of / workbook / sparknotes / cliffs notes / omnibus / box set). Readership is a **sort, not a cutoff**. Paging is sized to a **post-gate** target (`PER_SUBJECT_TARGET`, default 1250) bounded by `MAX_PAGES` (default 60), accounting for a measured ~80% shallow / ~46% deep gate pass-rate. ISBN-13 is selected from the search doc's `isbn` array and deduped alongside the existing slug dedup; `number_of_pages_median`→`pageCount`, `language[]`→`language` scalar (`eng`) populate the already-declared, currently-empty `BookRecord` fields — **no schema change**. Existing keepers are enriched **in place**: any book whose slug already exists is re-published via its deterministic d-tag (the fingerprint/replace mechanism), so enrichment of still-passing legacy records happens automatically with **no relay read and no deletion**. This is a **new epoch** (`CHECKPOINT_EPOCH=4`). The blurb path (ADR 0051 / 0052), the desc cache, the epoch checkpoint, the per-record fingerprint, OL politeness, and relay rate limiting are all **reused unchanged**. The indexer needs **no code change** for the additions: it already reads live relay state by `#z` and rebuilds the whole document set, so the enriched and new records (kind-39999) ride the existing down-sync and land on the next re-index (flush-before-rebuild for cleanliness). Measured edition sensitivity keeps `>= 3` as the default (the `==2` band is ~7.5% of docs and is junk-heavy at depth).

**The prune of existing junk (the NIP-09 kind-5 read→diff→delete pass) is split to Story 56 / ADR 0055** because of a verified integration gap: a kind-5 delete published to dcosl never reaches the **local** strfry under the current down-sync filter (kinds 39998/39999 only, per `ops/sync-runbook.md`), so the indexer — which rebuilds from local relay state — would never drop the deleted book, and the prune would silently not take effect. The full prune design is preserved below under "Deferred to Story 56 (prune existing junk)" so nothing is lost; it is not built in this story.

## Context

The catalog is the one unmet Phase-2 engineering success criterion (PRD §4, "~10K good records, quality over the round number"). It sits at ~2K today (PRD §2.2), pulled from the Open Library **subjects API** by `apps/seeder/src/fetch.ts` (`fetchSubjectWorks` → `/subjects/{subject}.json`). The story (PO-gate-approved) carries the locked product posture — **legitimacy-gated, not popularity-gated** — and the locked technical decisions; this ADR designs to them and resolves the five Open Questions. It does not relitigate the story.

### Verified survey (read directly against source, 2026-06-04)

- **The collect step.** `apps/seeder/src/index.ts` step 3 calls `fetchSubjectWorks(s.ol, perSubject)` for each of 8 `SUBJECTS` (`fiction`, `science_fiction`, `mystery`, `romance`, `fantasy`, `thriller`, `biography`, `history`) and dedups into `Map<slug, {work, genres}>` keyed by `deriveSlug(work.key)`. `fetch.ts` pages the subjects API at `pageSize = 100`, `pageDelayMs = 1000`, polite `SEEDER_USER_AGENT`. The subjects API `OLWork` shape (`openlibrary.ts`) carries only `key`, `title`, `authors[]`, `first_publish_year`, `cover_id`, `subject[]` — **none of the gate signals** (`edition_count`, `language`, `number_of_pages_median`, `isbn`).
- **The mapper is pure.** `mapWorkToBookRecord(work, parentHeader)` (`openlibrary.ts`) is pure/synchronous, returns `null` on missing title/first-author, and already populates `slug`, `title`, `authorName`, `openLibraryId` (bare id via `workId()`), `coverUrl`, `publishYear`, `subjects`. The enrichment fields `isbn13`, `isbn10`, `language`, `pageCount` are **declared on `BookRecord`** (`packages/schemas/src/BookRecord.ts` lines 28–33) and **serialized by `toBookRecordEvent`** as the `isbn` / `isbn10` / `lang` / `pages` tags (lines 103–111) — they are simply empty today because the subjects API never supplied them. Populating them needs **no schema change**.
- **The blurb path (ADR 0051 / 0052) — reused unchanged.** `index.ts` (lines 142–166) reads the desc cache (`desc-cache.ts`), calls `requestWorkDescription` (`description.ts`, work-level `/works/{id}.json`, fail-open, `BLURB_MAX_CHARS = 2000`), sanitizes + caps, and sets `blurb`. The cache (`DESC_CACHE_PATH=/data/desc-cache`) caches the raw description (and a genuine `null`); a transient failure is not cached. This whole block is retained verbatim.
- **The checkpoint + fingerprint (ADR 0051) — reused unchanged.** `checkpoint.ts` is epoch-namespaced: each persisted line is `e<epoch>:<key>`; `loadCheckpoint(path, epoch)` reports only that epoch's keys, so bumping `CHECKPOINT_EPOCH` treats prior-epoch completions as not-done while leaving prior lines intact (audit / rollback). `index.ts` gates the book publish on `book:<slug>:<fingerprint(record)>` (`fingerprint.ts`: a stable 12-char `node:crypto` sha256 over `title|authorName|blurb|coverUrl|publishYear|subjects`). Epochs to date: 1 = original seed, 2 = blurb backfill (ADR 0051), 3 = cap-2000 re-backfill (ADR 0052).
- **Signing — the path to reuse for kind-5.** `index.ts` `publish()` (lines 81–86) calls `finalizeEvent(template, sk)` from `nostr-tools/pure` (the explicit fallback under the crypto policy; `sk` decoded from `LIBRARIAN_NSEC` via `nostr-tools/nip19`), then `relay.publish(signed)` (`publish.ts`, one socket, awaits the matching `OK`). A kind-5 deletion is the same `finalizeEvent` → `relay.publish` path with a different template. No bespoke crypto.
- **Book record vs assertion — both kind 39999, separated by `#z`.** `BOOK_RECORD_KIND`, `BOOK_TAG_ASSERTION_KIND`, and `BOOK_TAG_KIND` are **all `39999`** (`BookRecord.ts:9`, `BookTagAssertion.ts:16`, `BookTag.ts:6`). They are distinguished only by their `#z` parent-header address: `buildBookRecordsHeaderAddress(lib)` for books, `buildBookTagAssertionsHeaderAddress(lib)` for assertions, `buildBookTagsHeaderAddress(lib)` for the taxonomy. The **indexer already relies on exactly this**: `apps/indexer/src/index.ts` issues three separate `#z`-scoped reads (`booksZ`, `tagsZ`, `assertZ`) via `queryAllPages`. This is the precedent the Story-56 prune pass will reuse to read *only* book records.
- **The read path the seeder must gain.** The seeder has no relay read today (only `publish.ts`). The indexer's `apps/indexer/src/relay.ts` is a clean, reusable one-shot REQ→EOSE reader (`queryRelay`) plus a `queryAllPages` paginator (until-cursor on `created_at`, dedup by id, stop on a short page or no-new plateau) that pages past strfry's per-REQ cap (default 500). The API's `apps/api/src/nostr/query.ts` carries the same paginator with a `MAX_PAGES` bound. The seeder will read existing book records by REQ-ing `{kinds:[39999], authors:[librarian], "#z":[booksZ]}` with the `queryAllPages` pattern.
- **The indexer (deletion awareness).** `apps/indexer/src/index.ts` reads the **whole** live catalog from the relay (`STRFRY_URL`) by `#z`, builds `SearchDocument`s in `build-documents.ts` (pure; maps `isbn13`, `language`, `publishYear`, `blurb`, `coverUrl`, `openLibraryId`, etc.), and **upserts** them into the provider. It never deletes from the index; it replaces the document set with whatever the relay returns. So a book the relay no longer returns (because a NIP-09 kind-5 deleted it and the relay suppresses it from REQ results) is simply **absent from the rebuilt set** — dropped from search with no indexer code change, provided the relay honors the deletion in REQ. (The one caveat is index *staleness*: an upsert-only indexer leaves a stale document for an id that vanished unless the index is rebuilt from empty. See §5 and the runbook for the clean-rebuild step.)
- **Deletion propagation — the integration gap (why prune is split out).** Staging memory records that dcosl honors NIP-09 by **event id (`e` tag), not `a` tag**. But the seeder publishes to **dcosl**, and catalog data reaches the **local** strfry (the indexer's source via `STRFRY_URL`) only through the down-sync cron `/etc/cron.d/unbnd-sync` (`--dir down`), whose filter pulls **only kinds 39998/39999** (per `ops/sync-runbook.md`). A kind-5 published to dcosl therefore **never reaches the local strfry**, so the indexer (which rebuilds from local relay state and reads only kind 39999) would never drop the deleted book — the prune would silently not take effect. The expansion + enrichment path has **no** such dependency: enriched/new records are kind-39999, ride the existing down-sync, and the indexer picks them up. This gap is the reason the prune is its own Story 56; the full design is preserved below.

### Constraints that bind this design

- **Quality bar** (`memory/feedback_unbnd_quality_bar.md`): no shortcuts, no tech-or-product debt, optimize long-term. Splitting the prune to Story 56 is a direct expression of this bar: it was found to depend on a down-sync/relay capability not present in this deployment, so shipping it here would have been a silent no-op. The prune design (preserved below) remains conservative (delete only on a positive gate-fail of a confirmed librarian book record, idempotent, never republish-after-delete).
- **No hand-rolled crypto** (CLAUDE.md "Cryptographic library policy"; ADR 0002): every signature goes through the existing `finalizeEvent` librarian path (`nostr-tools/pure`, the audited fallback) — including the Story-56 kind-5 delete, which is an ordinary NIP-09 template signed by the same path. No bespoke event construction.
- **No schema change** — the enrichment fields already exist on `BookRecord` and round-trip through `toBookRecordEvent` / `fromBookRecordEvent`.
- **No web / API / design-system change** — seeder + a full re-index only. The indexer needs no code change.
- **No new dependency, no new tooling** (house rule): Vitest already runs in the seeder; `node:crypto` already backs the fingerprint; the relay read reuses the indexer's `ws` REQ pattern.
- **No AI-slop** in any string or doc this work authors (`memory/feedback_unbnd_copy_and_visual.md`): the denylist phrases and log lines are reviewed against it.
- **No new genres / taxonomy / UI change** (story Out of scope): the 8 product genres are unchanged; genre stays an assertion over the preserved full OL `subjects` array.

### DList shapes touched

- **`kind:39999` book record (`bookSubmission`)** — enrichment populates the already-declared `isbn13` / `isbn10` / `language` / `pageCount` fields (serialized as the existing `isbn` / `isbn10` / `lang` / `pages` tags) on records that today carry them empty. The d-tag (slug) is unchanged, so an enriched re-publish **replaces in place**. No new tag, no new field, no kind change. The kind 39998/39999 pattern baseline (`concept-graph`, cribbed by ADR 0008) is unchanged.
- **`kind:5` NIP-09 deletion** — **deferred to Story 56**; the shape is preserved in the "Deferred to Story 56" subsection below. This story (ADR scope as shipped) publishes no kind-5.

## Options considered

Four Open Questions are in this ADR's shipped scope (OQ-1 search request/paging, OQ-2 the gate, OQ-3 ISBN/dedup/enrichment, OQ-5 edition sensitivity + indexer-for-additions). The fifth — the read/diff/prune pass (originally OQ-4) — is **deferred to Story 56**; its full design is preserved verbatim-in-substance under the "Deferred to Story 56 (prune existing junk)" subsection at the end of §Decision.

### OQ-1 — Search-API request, fields, sort, and paging-to-target

#### The probe (live OL, 2026-06-04)

`GET https://openlibrary.org/search.json?q=subject:fiction%20language:eng&fields=...&sort=readinglog&limit=100&offset=N`:

- `numFound` for `subject:fiction language:eng` is **1,279,742** — depth is not a constraint at our scale.
- Deep offsets work: `offset=50000` and `offset=100000` both return `HTTP 200` with `numFoundExact:true` and real docs. No low offset cap.
- The requested `fields=` are returned and populated in practice: `key`, `title`, `author_name[]`, `edition_count`, `cover_i`, `first_publish_year`, `language[]`, `number_of_pages_median`, `isbn[]` (mixed 10s and 13s). `number_of_pages_median` is sometimes absent (expected — the gate treats absence as a pass). `readinglog_count` / `ratings_count` are requested for the sort/diagnostics but are **not** gate inputs.
- **Gate pass-rate, measured** over 2,400 docs across all 8 genres at offsets {0, 2000, 8000}: **79.9% at `edition_count >= 3`**, 87.0% at `>= 2`. Over 1,000 docs at deep offsets {20000, 40000}: **46.4% at `>= 3`**, 60.9% at `>= 2`. The pass-rate falls with depth (junk concentrates deep, as the story anticipated). A blended planning pass-rate of ~**60%** is conservative for sizing the page budget to a post-gate target.

#### Option A — `q=subject:<ol> language:eng`, `sort=readinglog`, lean `fields=`, page to a post-gate target (CHOSEN)

Replace `fetchSubjectWorks` with a `fetchSubjectSearch(subject, target, opts)` that pages `/search.json` with the verified query form until it has collected `target` **post-gate** passing docs (the gate is applied at collect time so paging stops at the real target, not a raw count), bounded by `MAX_PAGES`. The exact request template, fields, sort, page size, and paging strategy are pinned in §Decision.

- Pros: one paginated call returns every gate signal inline (no per-book fetch); the query form, sort, deep-paging, and field availability are all confirmed against the live API; sizing to a *post-gate* target absorbs the attrition the probe measured (so each genre actually reaches ~1,250 kept). The `q=subject:… language:…` free-text form is the form the probe validated and is robust to OL's subject normalization (it matches the `subject` facet without requiring the exact subject-key slug).
- Cons: the search API is a heavier endpoint than the subjects API; at 8 genres × thousands of pages it must be polite (retained `User-Agent` + inter-page delay) and bounded (`MAX_PAGES`) so a pathological low pass-rate genre cannot page forever. Mitigated below.

#### Option B — subject-key form `q=subject_key:fiction` + separate `language=eng` param

- Pros: the subject *key* facet is a tighter match than free-text `subject:`.
- Cons: the subject-key slugs are an OL-internal normalization (e.g. `fiction` vs `Fiction` vs hyphenated variants) that the probe did not need — the free-text `subject:fiction language:eng` form returned 1.28M correctly-faceted English docs. Adding a second axis (`subject_key` + `language` param) is more brittle against OL's facet naming for marginal gain. Rejected: the validated `q=subject:<ol> language:eng` form is simpler and proven.

#### Option C — keep the subjects API, add per-book `/works` + `/editions` fetches for the gate signals

- Cons: the subjects API gives no `edition_count` / `language` / `isbn` inline, so the gate would need an extra HTTP round-trip per work (and an editions call for ISBNs) — multiplying OL load by the catalog size and reintroducing exactly the depth-junk problem the search API's `sort=readinglog` avoids. The story explicitly rejects extra per-edition ISBN calls. Rejected.

### OQ-2 — The legitimacy gate (pure function spec)

A new pure module `apps/seeder/src/gate.ts` exporting a single deterministic function over a search-doc subset. The signal checks, the denylist regex, the edition constant, and the absent-field handling are pinned in §Decision. The function is I/O-free and unit-testable with fixture docs.

- **Option A (chosen):** a single `gateWork(doc): boolean` (plus an exported `gateReason(doc)` returning the first failing signal name, for diagnostics/tests), with one named constant `EDITION_MIN = 3` and one named denylist regex `JUNK_TITLE_RE`. Ordered checks, short-circuit on first fail. Lives in its own module so the Tester can exercise each signal with a fixture doc in isolation.
- **Option B:** fold the gate into `mapWorkToBookRecord`. Rejected — it would couple the pure mapper to gate policy and make the gate untestable without constructing a full `BookRecord`; the story requires the gate be a pure function over a **search doc**, tested in isolation.

### OQ-3 — ISBN-13 selection, dedup, enrichment mapping

- **Option A (chosen):** select the canonical `isbn13` as the first 13-digit, `978`/`979`-prefixed entry of the doc's `isbn[]` (probe-confirmed shape: mixed 10s and 13s, often several 13s); keep `isbn10` as the first 10-char entry when trivially present. Validate by length + digit shape (and the 978/979 prefix for the 13). Dedup by ISBN-13 composes with the existing slug dedup at collect time: slug dedup runs first (it always exists), then a second `Map<isbn13, slug>` collapses two slugs that share an ISBN-13 onto the first-seen slug. A book with **no** ISBN falls back to slug-only dedup (kept; ISBN dedup simply does not apply). `number_of_pages_median`→`pageCount`; `language[]`→`language` scalar normalized to `eng`. `toBookRecordEvent` already serializes all of these.
- **Option B:** ISBN-10→13 checksum conversion / full ISBN-13 checksum validation. Rejected as over-engineering for this pass — the search doc already supplies valid 13s directly (no conversion needed), and a checksum recompute adds bespoke arithmetic for a field that is display/dedup metadata, not a trust signal. Length + prefix + digit shape is sufficient; a malformed ISBN is simply not selected (the field stays empty, which the schema allows). Documented as a deliberate non-goal.

### OQ-4 — The read → diff → NIP-09 delete (prune) pass

**Deferred to Story 56.** The full options analysis (read-by-`#z` + re-gate + `e`-tag delete vs. per-record re-fetch vs. wipe-and-reseed) and the chosen approach are preserved under "Deferred to Story 56 (prune existing junk)" at the end of §Decision.

### OQ-5 — Indexer-for-additions + edition sensitivity

- **Indexer (for the additions/enrichment this story ships):** read against real code (`apps/indexer/src/index.ts` + `build-documents.ts`): the indexer reads the whole live catalog by `#z` and **rebuilds** the document set from whatever the relay returns; it never deletes a document itself. The enriched keepers and new records are kind-39999, ride the existing down-sync, and land on the next rebuild. Because the indexer *upserts* (it does not clear the index first), the re-index runs against a flushed/re-created index so the rebuild reflects the current live set cleanly — still no indexer *code* change (the existing `configureIndex()` + a flush, or a documented index re-create). (The deletion-awareness analysis — how a NIP-09-deleted book would or would not drop from the rebuild — is part of the prune and is preserved in the "Deferred to Story 56" subsection.)
- **Edition sensitivity (measured):** the `edition_count == 2` band is **~7.5%** of all docs (the delta between `>= 3` at 79.9% and `>= 2` at 87.0% shallow; 46.4% vs 60.9% deep). At depth the `>= 2` admission lets in materially more long-tail-looking but lower-signal works. The probe does **not** contradict the story's default; **`EDITION_MIN = 3` stands** as the single tunable constant. Recorded, not relitigated.

## Decision

We choose **Option A on every in-scope Open Question.** The search-API swap with post-gate paging (OQ-1), a pure `gate.ts` module (OQ-2), first-valid ISBN-13 selection composed with slug dedup (OQ-3), in-place enrichment of existing keepers via the deterministic d-tag, and a flush-before-rebuild re-index with `EDITION_MIN = 3` retained (OQ-5). This satisfies the shipped acceptance criteria with no schema, web, API, or indexer code change, and keeps the blurb path, desc cache, checkpoint, fingerprint, politeness, and rate limiting intact. The prune pass (originally OQ-4) is **deferred to Story 56**; its design is preserved in the subsection at the end of this section.

### 1. Search-API request + paging (OQ-1)

**Request template** (per page, per genre):

```
GET https://openlibrary.org/search.json
  ?q=subject:<ol> language:eng        # <ol> = the genre's OL subject (e.g. fiction, science_fiction)
  &fields=key,title,author_name,author_key,edition_count,cover_i,first_publish_year,language,number_of_pages_median,readinglog_count,ratings_count,isbn,subject
  &sort=readinglog                     # readership is a SORT, not a cutoff (fills better-known-first)
  &limit=100                           # PAGE_SIZE
  &offset=<page * 100>
Headers: User-Agent: SEEDER_USER_AGENT  # retained politeness
```

The `SUBJECTS` table's `ol` values are reused verbatim (`fiction`, `science_fiction`, `mystery`, `romance`, `fantasy`, `thriller`, `biography`, `history`). The query interpolates the OL subject and `language:eng` into the free-text `q`; `q` is URL-encoded (the seeder builds it with `URLSearchParams` / `encodeURIComponent`, never string-concatenated raw).

**Paging-to-target strategy (gate attrition aware).** Each genre pages until it has collected `PER_SUBJECT_TARGET` **post-gate** passing docs or hits `MAX_PAGES`:

- `PER_SUBJECT_TARGET` (env, default **1250**) — the post-gate keep target per genre → ~10,000 across 8 genres.
- `PAGE_SIZE = 100` (the subjects-API page size, retained).
- `MAX_PAGES` (env, default **60**) — a hard safety bound. With the measured blended ~60% pass-rate, 1,250 kept needs ~2,100 raw docs ≈ 21 pages; the bound is set to ~60 (≈ 6,000 raw / genre) so a deep low-pass-rate genre (≈46% at depth → ~2,700 raw for 1,250) still reaches target with headroom, but a pathological genre cannot page indefinitely.
- The gate is applied **inside** the collect loop: each page's docs are gated, passers accumulate toward the target, and paging stops the moment the target is met. This is what makes the post-gate count exact rather than a raw-count guess.
- Politeness retained: the existing inter-page delay (`pageDelayMs`, ~1s) and `User-Agent` carry over to the search pager.

**Env knob.** `PER_SUBJECT` (current raw-count knob, default 300) is **replaced** by `PER_SUBJECT_TARGET` (post-gate keep target, default 1250) and `MAX_PAGES` (default 60) in the seeder and in `docker-compose.prod.yml`. The old `PER_SUBJECT` is removed (it no longer has a coherent meaning under post-gate paging); the runbook documents the rename.

### 2. The legitimacy gate (OQ-2)

New pure module `apps/seeder/src/gate.ts`. Input is the search-doc subset; the function is deterministic and I/O-free.

```ts
export type OLSearchDoc = {
  readonly key?: string;
  readonly title?: string;
  readonly author_name?: readonly string[];
  readonly edition_count?: number;
  readonly cover_i?: number | null;
  readonly first_publish_year?: number;
  readonly language?: readonly string[];
  readonly number_of_pages_median?: number;
  readonly isbn?: readonly string[];
  readonly subject?: readonly string[];
};

export const EDITION_MIN = 3;            // single tunable constant (OQ-5: 3 stands)

/** True iff the work passes EVERY legitimacy signal. Pure, deterministic. */
export function gateWork(doc: OLSearchDoc, currentYear: number): boolean;

/** The first failing signal name, or null if it passes. For tests/diagnostics. */
export function gateReason(doc: OLSearchDoc, currentYear: number): string | null;
```

**Ordered signal checks** (short-circuit on first fail; `gateReason` returns that signal's name):

1. **title** — `doc.title?.trim()` is non-empty, else fail (`"title"`).
2. **author** — `doc.author_name?.[0]?.trim()` is non-empty, else fail (`"author"`).
3. **cover** — `doc.cover_i` is a number (present, not `null`/absent), else fail (`"cover"`).
4. **language** — `doc.language` includes `"eng"`, else fail (`"language"`). (Absent/empty `language` fails — no `eng`.)
5. **editions** — `(doc.edition_count ?? 0) >= EDITION_MIN`, else fail (`"editions"`). (`edition_count` 2 fails; 3+ passes.)
6. **pages** — if `doc.number_of_pages_median` is present (a number), it must be `>= 50`, else fail (`"pages"`); **absent → pass** (absence does not drop).
7. **year** — `doc.first_publish_year` present and in `1800..currentYear` inclusive, else fail (`"year"`). (Absent → fail; before 1800 → fail; after `currentYear` → fail.)
8. **denylist** — `!JUNK_TITLE_RE.test(doc.title)`, else fail (`"denylist"`).

`currentYear` is injected (e.g. `new Date().getUTCFullYear()`), not read inside the pure function, so tests pin a year deterministically.

**The denylist regex (pinned, case-insensitive, anchored at a segment boundary):**

```
export const JUNK_TITLE_RE =
  /(?:^|[\s:(\[]|\s-\s)(?:summary of\b|study guide\b|workbook\b|sparknotes\b|cliffs?\s*notes\b|omnibus\b|box\s?set\b|boxed set\b)/i;
```

Anchoring rationale (the over-/under-match tradeoff, decided): each phrase must begin at the **start of the title, or after whitespace / `:` / `(` / `[` / a spaced hyphen** (`\s-\s`), and end at a **word boundary** (`\b`). This:

- **Catches** the junk classes the probe surfaced — `Summary of Dune`, `The X Study Guide`, `… Workbook`, `SparkNotes on Hamlet`, `Cliffs Notes` / `CliffsNotes` (`cliffs?\s*notes`), `… omnibus` / `Omnibus`, `box set` / `boxset` / `boxed set` (the two real deny-hits the probe found were `… omnibus` and `… Boxed Set`).
- **Does not catch** legitimate titles where the word is not at a segment boundary or is a different word: `A Study in Scarlet` (no `study guide`), `Notes from Underground` (no `cliffs notes`), `Guide to the Galaxy` (no `study guide`), a bare `Summary` (no `summary of`).
- **Known, accepted false-drops:** a novel literally titled `Workbook`, `The Workbook (a novel)`, or `The Summary of My Life is a Novel` would be dropped. This is a deliberate tradeoff per the story's "be careful not to over-match … decide anchoring and document the tradeoff": at the measured denylist hit-rate of ~0.1–0.2%, the denylist is a precision tool for a small junk class, and the rare loss of a book that *names itself* after a junk category is an acceptable, documented cost of a clean catalog. The edition/cover/year signals do the bulk of the filtering; the denylist removes the specific study-guide/omnibus residue those signals miss.

`gate.ts` holds no other state and imports nothing with I/O — it is unit-testable with fixture docs for each signal (including the all-pass case and each false-positive/false-negative title above).

### 3. ISBN-13 selection, dedup, enrichment (OQ-3)

In a small pure helper (in `openlibrary.ts` or a sibling), from the search doc:

- **isbn13** = the first entry of `doc.isbn` matching `/^(?:978|979)\d{10}$/` (13 digits, valid prefix). If none, `isbn13` is left unset.
- **isbn10** = the first entry matching `/^\d{9}[\dXx]$/` (10 chars, last may be `X`), uppercased. If none, unset. (No 10↔13 conversion — Option B rejected.)
- **pageCount** = `doc.number_of_pages_median` when it is a number, else unset.
- **language** = `"eng"` (the gate guarantees `language` includes `eng`; the stored scalar is normalized to `eng`, matching the schema's `lang` tag and the indexer/UI expectation).
- title / author / cover / openLibraryId / publishYear / subjects continue to come from the search doc via the existing mapper shape (the search doc's `key`, `title`, `author_name[0]`, `cover_i`, `first_publish_year`, `subject[]`).

**Mapper.** `mapWorkToBookRecord` is extended to accept the richer search-doc shape (or a thin adapter maps the search doc into the existing `OLWork` plus the new fields) and to set `isbn13`, `isbn10`, `language`, `pageCount` when present. It stays **pure** and still returns `null` on missing title/first-author. `toBookRecordEvent` already serializes the new fields (confirmed — no schema change).

**Dedup composition** (at collect time, in `index.ts`):

1. **Slug dedup first** (existing, always applies): `deriveSlug(doc.key)` keys the `Map`, accumulating the genre set per slug.
2. **ISBN-13 dedup second** (new): a `Map<isbn13, slug>` records the first slug seen per ISBN-13; a later doc with the same ISBN-13 but a different slug is folded onto the first slug (its genres merged), yielding **one** `BookRecord`. A doc with **no** ISBN-13 is deduped by slug only (kept). Slug dedup wins on identity; ISBN-13 dedup additionally collapses the two-slugs-same-book case the story calls out.

### 4. Enrich existing keepers in place (no relay-read, no deletion)

This story enriches still-passing existing books **automatically**, as a side effect of the re-seed — there is no relay read and no deletion in the shipped scope.

- The seed/enrich loop produces `keptSlugs` = the slugs that **passed the gate** on the fresh search-API pass. Each is published via its deterministic d-tag (`deriveSlug(doc.key)`).
- When a published slug **already exists** on the relay, the publish is a **replace in place** (same `kind:pubkey:d-tag` address → the relay supersedes the prior event with the now-enriched record carrying `isbn13` / `language` / `pageCount`). This is the existing fingerprint/replace mechanism; no new capability is needed.
- Books present only in the **old** set and absent from the new gated set simply **persist as stale records**. Removing them is the prune — **deferred to Story 56**. This story does not read the relay and publishes no kind-5.

**Fingerprint refinement (for the enrichment fields).** The existing `fingerprint()` covers `title, authorName, blurb, coverUrl, publishYear, subjects` — it does **not** include `isbn13`, `language`, or `pageCount`. Under the fresh epoch this is harmless (every record is not-done and re-published once regardless). But so that a *future* same-epoch re-run re-publishes a record whose **enrichment fields** changed (e.g. an ISBN added), the fingerprint input is **extended** to include `isbn13`, `language`, and `pageCount` (a small, backward-compatible addition to `FingerprintInput` and the canonical string in `fingerprint.ts`). This keeps the delta-aware checkpoint honest for the enrichment fields this story populates. (This is the single change to a reused ADR-0051 module; it does not alter the epoch-namespacing or the cache.)

**Epoch.** This is a **new epoch: `CHECKPOINT_EPOCH=4`** (1=seed, 2=blurb, 3=cap-2000). The bump is required because the enrich pass re-publishes every keeper with new fingerprints (the now-populated `isbn`/`lang`/`pages` change the published record). The prior epochs' lines stay intact (audit / rollback).

### 5. Indexer + re-index for the additions (OQ-5)

- **No indexer code change.** The indexer reads the whole catalog by `#z` and rebuilds the document set from whatever the relay returns. The enriched keepers and new records are kind-39999, ride the existing down-sync, and land on the next rebuild.
- **The re-index runs against a flushed/re-created index** so the rebuild reflects the current live set cleanly (the indexer upserts; it does not clear first). Mechanism: the existing `provider.configureIndex()` step against a freshly-created/cleared index, then the full upsert sweep. This is an **operator/runbook** step using the existing `--profile index` run; the indexer code is unchanged.
- **`EDITION_MIN = 3` stands** (measured: the `==2` band is ~7.5%, junk-heavy at depth; the probe does not contradict the default). One tunable constant in `gate.ts`.

### Deferred to Story 56 (prune existing junk)

The prune of the legacy ~2K — removing records that fail the new gate so junk seeded before the gate does not persist — is **split to Story 56 / ADR 0055**. The design below is preserved so it is not lost; **none of it is built in this story** (no relay-read, no kind-5, no down-sync change).

**Why it is its own story — the integration gap (verified 2026-06-04).** The seeder publishes to **dcosl**. Catalog data reaches the **local** strfry (the indexer's source via `STRFRY_URL`) only through the down-sync cron `/etc/cron.d/unbnd-sync` (`--dir down`), whose filter pulls **only kinds 39998/39999** (per `ops/sync-runbook.md`). A NIP-09 **kind-5** delete published to dcosl therefore **never reaches the local strfry**, so the indexer — which rebuilds from local relay state and reads only kind 39999 — would never drop the deleted book; the prune would **silently not take effect**. Making prune real additionally requires: (a) extending the down-sync to pull librarian **kind-5** events, and (b) confirming the local strfry honors NIP-09 deletion on ingest — **unverified** in this deployment (stubbed in stories 28b/30b, never exercised). The expansion + enrichment path (this story) has no such dependency: enriched/new records are kind-39999 and ride the existing down-sync.

**Re-gate data source (the conservative diff).** Existing records seeded from the subjects API lack `edition_count` / `language` inline, so they cannot be re-gated against their *stored* fields without over-deleting. The diff is computed against the **fresh gated set built in the same run** (`keptSlugs`), not a per-record re-fetch (a per-record re-search is prohibitively chatty and ambiguous — rejected). A book is a **keeper** iff its slug ∈ `keptSlugs`. A **prune candidate** is an existing librarian book record whose slug is ∉ `keptSlugs` **and** whose **stored fields positively fail** a gate signal that does not depend on the missing search-only signals — missing title/author, missing cover, junk-denylist title, out-of-range year. Edition/language/pages (the signals the old records lack) are **never** used to delete a record (absence is not evidence of failure). Net: the prune removes structurally-junk legacy records while keeping every plausibly-legitimate legacy record; a future epoch, once every record carries the full signals, can tighten further.

**Read.** A new `apps/seeder/src/read.ts` (mirroring `apps/indexer/src/relay.ts`): open a WS, REQ `{kinds:[39999], authors:[librarian], "#z":[booksZ]}` where `booksZ = formatAddress(buildBookRecordsHeaderAddress(librarian))`, collect to EOSE, page past the relay cap with the indexer's `queryAllPages` pattern (until-cursor on `created_at`, dedup by id, stop on short page / no-new plateau). **Book records and `BookTagAssertion`s are both kind 39999** — they are distinguished only by `#z`, so `#z=booksZ` structurally guarantees **only book records** are read (assertions and the taxonomy live under different `#z` headers and are excluded). Each event is reconstructed via `fromWireEvent` → `fromBookRecordEvent` (the indexer's parse); a parse failure is skipped, not deleted.

**Delete (kind-5 shape).** For each prune candidate, publish a NIP-09 kind-5 through the existing librarian path:

```ts
const template = {
  kind: 5,
  created_at: now(),
  tags: [
    ["e", failingEventId],   // delete by EVENT ID — the form dcosl honors
    ["k", "39999"],          // NIP-09: the kind being deleted
  ],
  content: "Removed by catalog legitimacy re-gate.",  // neutral, no slop
};
const signed = finalizeEvent(template, sk);   // EXISTING librarian signing path — no bespoke crypto
await relay.publish(signed);
await sleep(rateMs);                            // retained relay rate limiting
```

`finalizeEvent` and `relay.publish` are reused unchanged; the kind-5 is signed by the librarian (`sk` from `LIBRARIAN_NSEC`), the only key authorized to delete the librarian's own records. No bespoke crypto.

**Idempotency + safety.** Key the pass against the epoch checkpoint with a `prune:<eventId>` namespace, recorded after a successful publish, so a re-run is a no-op. Run prune **after** the enrich loop and exclude keepers from candidates by construction, so **delete-then-republish of the same slug cannot happen**. The pass **never deletes a still-passing book** (keepers excluded), **never deletes a non-book or assertion event** (the `#z=booksZ` read filter excludes them; the `k:39999` tag and per-event id are book-record-scoped), and is idempotent and resumable.

**Indexer / re-index for deletions.** The indexer never deletes a document itself; it rebuilds from whatever the relay returns. So a NIP-09-deleted book that the relay suppresses from REQ would be absent from a flush-before-rebuild — **provided the deletion reaches the local strfry and the local strfry honors it on REQ**, which is exactly the integration gap above. No indexer *code* change is anticipated; a deletion-aware indexer diff is a fallback only if the local-strfry suppression verification fails.

### Composition with the retained invariants

- **Epoch checkpoint:** new epoch 4 (§4). The book publish stays gated on `book:<slug>:<fingerprint>`; tag/assertion keys keep their epoch prefix. Resumable and idempotent. (The `prune:<eventId>` namespace lands with Story 56.)
- **Desc cache:** unchanged (`DESC_CACHE_PATH=/data/desc-cache`). It survives the epoch bump, so re-seeding does not re-hit `/works/{id}.json` for descriptions already pulled. The blurb fetch/sanitize/cap block (ADR 0051 / 0052) is byte-unchanged.
- **OL politeness:** retained `User-Agent` on every search + work-description request; retained inter-page delay on the search pager; retained `RATE_MS` between publishes (and between OL work-description fetches).
- **Relay rate limiting:** the `sleep(rateMs)` between every publish (book, assertion) is retained.

### Runbook implications (design-level)

The full re-seed is the existing `--profile seed` / `--profile index` shape with a bumped epoch and the new env knobs. New/changed env (in `docker-compose.prod.yml` seeder service): **add** `PER_SUBJECT_TARGET` (default 1250) and `MAX_PAGES` (default 60); **remove** `PER_SUBJECT`; `CHECKPOINT_EPOCH` advances to 4; `DESC_CACHE_PATH` / `CHECKPOINT_PATH` unchanged. Operator command shape (finalized at implementation):

1. `docker compose -f docker-compose.prod.yml --profile seed pull seeder` (image staleness).
2. `CHECKPOINT_EPOCH=4 PER_SUBJECT_TARGET=1250 MAX_PAGES=60 docker compose -f docker-compose.prod.yml --profile seed run --rm seeder` — pages the search API to ~1,250 gated per genre and enriches + re-publishes keepers in place. Idempotent: a second run re-publishes nothing. (No deletions — the prune is Story 56.)
3. Re-index from a flushed index: `docker compose -f docker-compose.prod.yml --profile index run --rm indexer` against a re-created/cleared index so the enriched fields and the larger gated set land.
4. Verify (operator-observable): the catalog count approaches ~10K; an enriched book shows ISBN/pages/language. (Legacy junk persists until Story 56.)

## Consequences

- **Enables:** a ~10K legitimacy-gated catalog across the existing 8 genres; the now-empty `isbn13`/`isbn10`/`language`/`pageCount` fields populated end-to-end on new and existing keepers. The in-protocol prune (kind-5) that removes legacy junk is set up for Story 56 with its design preserved here.
- **Constrains / makes harder:** the search API is heavier than the subjects API; the pass must stay polite and `MAX_PAGES`-bounded. The re-index now runs against a flushed/re-created index (no code change, but an operator step). No new relay capability is added in this story (the seeder still only publishes).
- **New debt / follow-ups:** the prune is **deferred to Story 56** (not debt — a deliberately scoped follow-up, blocked on a verified integration gap: the down-sync filter does not propagate kind-5 to the local strfry, and local-strfry NIP-09 honoring is unverified). Legacy junk persists until then. The genre 8→14+ expansion remains a separate logged story (genre is a revisable assertion over the preserved `subjects` array — losslessly deferrable).
- **Affects existing fixtures?** Seeder unit-test fixtures only: new `apps/seeder/test/gate.test.ts` (gate signals + denylist + ISBN-13 dedup + enrichment mapping) is the Tester's surface; the existing `description.test.ts` / `checkpoint.test.ts` are unchanged except the fingerprint test gains the three new enrichment fields. No web/e2e/visual fixture changes (no UI change).
- **New dependency?** No. `node:crypto` already backs the fingerprint; the search pager reuses the existing `ws`/HTTP patterns. No new top-level or dev dependency.
- **PRD section change required?** No. PRD §4 (~10K target) and §2.2 (current state) are satisfied/advanced; §6.2 already lists the enrichment fields as optional; §7.4 (re-import maintenance) is reinforced by the gate + the Story-56 prune design. No PRD §11.3 out-of-scope item is touched.

## Implementation notes

Concrete anchors. The Architect is read-only on source; these are targets for the Implementer.

- **New: `apps/seeder/src/gate.ts`** — `OLSearchDoc` type, `EDITION_MIN = 3`, `JUNK_TITLE_RE`, `gateWork(doc, currentYear)`, `gateReason(doc, currentYear)`. Pure, no I/O. (§2.)
- **New: `apps/seeder/src/search.ts`** (or extend `fetch.ts`) — `fetchSubjectSearch(subject, target, { maxPages, pageSize, pageDelayMs, userAgent })`: pages `/search.json` with the §1 template, gates each page, accumulates passers to `target`, stops at `target` or `maxPages`. Returns the gated search docs. Polite UA + inter-page delay retained. Replace `fetchSubjectWorks` at the `index.ts` collect call site. (The subjects-API `fetch.ts` may be removed or left dormant; the Implementer keeps the surface minimal.)
- **Edit: `apps/seeder/src/openlibrary.ts`** — extend the mapper input to the search-doc shape (or add an adapter) and the ISBN-13/isbn10/pageCount/language helpers (§3); `mapWorkToBookRecord` stays pure, still `null` on missing title/author, now sets the enrichment fields when present.
- **Edit: `apps/seeder/src/index.ts`** — (a) collect via `fetchSubjectSearch` to `PER_SUBJECT_TARGET`; (b) add the ISBN-13 dedup `Map` alongside the slug `Map`; (c) read `PER_SUBJECT_TARGET` / `MAX_PAGES` env (drop `PER_SUBJECT`). Blurb block unchanged. (No prune step — Story 56.)
- **Edit: `apps/seeder/src/fingerprint.ts`** — extend `FingerprintInput` and the canonical string to include `isbn13`, `language`, `pageCount` (§4 fingerprint refinement). Backward-compatible; the new epoch makes the change non-breaking.
- **Edit: `docker-compose.prod.yml`** (seeder service) — add `PER_SUBJECT_TARGET=${PER_SUBJECT_TARGET:-1250}` and `MAX_PAGES=${MAX_PAGES:-60}`; remove `PER_SUBJECT`; document `CHECKPOINT_EPOCH=4` for this re-seed.
- **No edit: `apps/indexer/*`** — re-index is the existing `--profile index` run against a flushed/re-created index (runbook step, §5).
- **No edit: `packages/schemas/*`** — the enrichment fields and their serialization already exist; no new schema helper required.
- **Tests (Tester's surface, named so they can be planned now):** `apps/seeder/test/gate.test.ts` (each signal pass/fail incl. all-pass; the denylist hits and the documented false-positive/negative titles; `EDITION_MIN` boundary 2-fail/3-pass; absent-pages-pass; absent/out-of-range-year-fail); ISBN-13 selection + dedup (mixed array, two-slugs-same-ISBN collapse, no-ISBN slug-only fallback); enrichment mapping (`pageCount`/`language`/`isbn13` onto the record, round-trip through `toBookRecordEvent`); fingerprint extension (changed ISBN → different fp).
- **Deferred to Story 56 (not built here):** `apps/seeder/src/read.ts` (the `#z=booksZ` relay reader), the kind-5 prune step in `index.ts`, the `prune:<eventId>` checkpoint namespace, the down-sync filter change, and the prune unit tests. The full design is in the "Deferred to Story 56" subsection.

## Risks

- **Deletion propagation + local-strfry NIP-09 honoring (moved to Story 56).** This was the load-bearing risk for the prune. It is now the reason the prune is its own story: the down-sync filter pulls only kinds 39998/39999, so a kind-5 never reaches the local strfry; and even with a filter change, the local strfry suppressing a kind-5-deleted kind-39999 from REQ is unverified (stubbed in 28b/30b). Story 56 gates its build on an operator verification of both. This ADR's shipped scope (expand + enrich, kind-39999 only) does not touch this risk.
- **OL search API rate/instability at 8×~thousands of docs.** The pass pulls ~6,000+ raw docs per genre at worst (deep low-pass-rate). **Mitigation:** retained `User-Agent` + inter-page delay; `MAX_PAGES` bound; the desc cache avoids re-hitting `/works`. The search pages are read-only and resumable via the checkpoint, so an interrupted run resumes without re-paging completed genres' published records.
- **Deep-paging depth.** Confirmed working to `offset=100000` with `numFoundExact:true`; our worst case (~6,000/genre) is far inside that. No mitigation needed beyond the `MAX_PAGES` bound.
- **Over-/under-match of the denylist.** Documented tradeoff (§2): accepted rare false-drops of books literally titled after a junk category, in exchange for catching the study-guide/omnibus class the other signals miss; hit-rate ~0.1–0.2% measured.

## Out of scope

- **No new genres / taxonomy / UI change** — the 8 product genres are unchanged; genre stays an assertion over the preserved `subjects` array (8→14+ is a separate logged story).
- **No web / API / design-system change** — seeder + a flushed re-index only.
- **No schema change** — the enrichment fields already exist on `BookRecord` and serialize today.
- **No blurb-path change** — the `/works/{id}.json` fetch, the 2000-char cap, the sanitizer, and the desc cache (ADR 0051 / 0052) are reused unchanged.
- **No popularity floor** — `readinglog_count` / `ratings_count` are a sort input only, never a cutoff.
- **No edition-level ISBN fetch** beyond the search API's inline `isbn[]`; no ISBN-10↔13 checksum conversion.
- **No multi-language catalog** — English-only (`language` includes `eng`) this pass.
- **No prune, no kind-5, no relay-read, no down-sync change** — the prune of legacy junk is **deferred to Story 56 / ADR 0055** for the verified integration gap (down-sync pulls only 39998/39999; local-strfry NIP-09 honoring unverified). Its full design is preserved in the "Deferred to Story 56" subsection.
- **No indexer code change** — the whole-set rebuild from a flushed index reflects the enriched keepers and the larger gated set.
- **No bespoke crypto** — every signature goes through the existing `finalizeEvent` librarian path (and the deferred kind-5 will too).
