# Test Plan: Story 55 — Catalog expansion to ~10K (search-API swap + legitimacy gate + ISBN dedup + enrichment)

**Story:** `engineering-team/stories/done/55-catalog-expansion.md`
**ADR:** `engineering-team/decisions/0054-catalog-expansion.md` (Accepted, re-scoped: expand + gate + enrich; prune deferred to Story 56)
**Date:** 2026-06-04
**Branch:** `story-55-catalog-expansion`

## Scope

Tests only (TDD red). One surface: the **seeder** (`apps/seeder`). No web / API / design-system / schema test changes — the enrichment fields already exist on `BookRecord` and serialize today (ADR §"No schema change"). The test set pins the ADR's decided contracts:

1. The pure legitimacy gate (`apps/seeder/src/gate.ts`, new).
2. Search-doc → BookRecord mapping + enrichment (extends `apps/seeder/src/openlibrary.ts`).
3. ISBN-13 dedup composition (collection-level).
4. The search-API fetch + paging (`apps/seeder/src/search.ts`, new — replaces `fetchSubjectWorks`).
5. Fingerprint extension for the enrichment fields (`apps/seeder/src/fingerprint.ts`).
6. A scope guard locking that Story 55 adds **no** relay-read and **no** kind-5 publish.

Out of scope for the Tester (Implementer/orchestrator own these): all of `apps/seeder/src/*` production code, `docker-compose.prod.yml` env changes, the operator re-seed/re-index runbook step. None were touched.

## Contracts under test (pinned verbatim from ADR 0054)

| Contract | Where | Decided value (ADR) |
|---|---|---|
| `EDITION_MIN` | `gate.ts` | `3` (§2, OQ-5 — the single tunable) |
| `JUNK_TITLE_RE` | `gate.ts` | case-insensitive, segment-anchored denylist (§2): `summary of`, `study guide`, `workbook`, `sparknotes`, `cliffs?\s*notes`, `omnibus`, `box ?set` / `boxed set` |
| `gateWork(doc, currentYear): boolean` | `gate.ts` | true iff ALL signals pass; `currentYear` **injected** (§2) |
| `gateReason(doc, currentYear): string \| null` | `gate.ts` | first failing signal name: `title`/`author`/`cover`/`language`/`editions`/`pages`/`year`/`denylist` (§2 ordered checks) |
| `OLSearchDoc` | `gate.ts` | the search-doc subset (§2 type block) |
| Gate signal order + thresholds | `gate.ts` | title, author, cover (`cover_i` number), language includes `eng`, `edition_count >= 3`, pages absent-or-`>= 50`, year `1800..currentYear`, denylist (§2) |
| `mapSearchDocToBookRecord(doc, header)` | `openlibrary.ts` | maps a search doc; sets `isbn13`/`isbn10`/`pageCount`/`language`; pure; `null` on missing title/author (§3, Impl notes §278/§284) |
| `isbn13` selection | `openlibrary.ts` | first `/^(?:978\|979)\d{10}$/` entry of `doc.isbn` (§3) |
| `isbn10` selection | `openlibrary.ts` | first `/^\d{9}[\dXx]$/`, uppercased (§3) |
| `language` normalization | `openlibrary.ts` | scalar `"eng"` (§3) |
| Dedup composition | collect-time (`index.ts`) | slug dedup first, then `isbn13` collapse onto first-seen slug; no-ISBN → slug-only, kept (§3) |
| `fetchSubjectSearch(subject, target, opts)` | `search.ts` | pages `/search.json`, `sort=readinglog`, `q=subject:<ol> language:eng`, lean `fields=`, `limit=100`; gate inside loop; stop at `target` or `maxPages` (§1, Impl notes §277) |
| `PER_SUBJECT_TARGET` / `MAX_PAGES` | env | 1250 / 60 (§1) — exercised as the `target` arg and `maxPages` opt |
| fingerprint extension | `fingerprint.ts` | canonical string also includes `isbn13`, `language`, `pageCount` (§4) |
| Scope boundary | seeder | no relay-read (`read.ts`/`queryAllPages`/`REQ`), no kind-5 (§"Out of scope") |

## Coverage map (acceptance criterion → test)

| Story AC | Test(s) | File | Level |
|---|---|---|---|
| **Source swap** — search.json, subject + `language:eng`, `sort=readinglog`, lean `fields=` incl. all listed | `hits search.json with the decided fields, sort, query, and page size`; `sends the polite User-Agent header on every request` | `test/search.test.ts` | unit (HTTP mocked) |
| Gate: no title / no first author → drop | `drops a doc with no title` / `…whitespace-only title`; `drops a doc with no first author` / `…empty author array` | `test/gate.test.ts` | unit |
| Gate: no `cover_i` → drop | `drops a doc with no cover_i`; `…null cover_i` | `test/gate.test.ts` | unit |
| Gate: language excludes `eng` → drop | `drops a doc whose language does not include eng`; `…absent language`; `passes a doc whose language includes eng among others` | `test/gate.test.ts` | unit |
| Gate: `edition_count` 2 drop / 3 pass | `drops a doc with edition_count of 2`; `passes a doc with edition_count of 3 (the floor)`; `…absent edition_count`; `EDITION_MIN defaults to 3` | `test/gate.test.ts` | unit |
| Gate: pages <50 drop / absent pass / ≥50 pass | `drops a doc whose number_of_pages_median is 30`; `passes…absent`; `passes…50 (the floor)` | `test/gate.test.ts` | unit |
| Gate: year absent/1799/`+1` drop; in-range pass | `drops…absent first_publish_year`; `…before 1800 (1799)`; `…after the current year`; `passes the lower bound year 1800`; `passes the upper bound year` | `test/gate.test.ts` | unit |
| Gate: denylist drop; non-match pass | `drops the junk title: <8 titles>`; `does NOT drop…: A Study in Scarlet / Notes from Underground / Summary`; `JUNK_TITLE_RE…carries the i flag` | `test/gate.test.ts` | unit |
| Gate is pure / unit-testable in isolation | `returns the same result…across calls`; `does not mutate the input doc`; `uses the injected currentYear, not the wall clock`; `passes a fully valid search doc` | `test/gate.test.ts` | unit |
| **Readership is a sort, not a cutoff** | `hits search.json with…sort=readinglog…` (sort present); gate file has **no** `readinglog_count`/`ratings_count` check (an obscure passer is kept — see the all-pass fixture carries no popularity field) | `test/search.test.ts`, `test/gate.test.ts` | unit |
| **Dedup by ISBN-13 → one BookRecord** | `collapses two DIFFERENT slugs sharing an isbn13 onto the first-seen slug, merging genres`; `collapses the same slug reached under two genres…` | `test/dedup.test.ts` | unit |
| Dedup: no-ISBN slug-only fallback (kept) | `keeps two distinct slugs that both lack an isbn13`; `keeps a no-isbn book alongside an isbn'd one`; `keeps two slugs with DIFFERENT isbn13 as two records` | `test/dedup.test.ts` | unit |
| **Enrichment** — `isbn13`/`isbn10`/`language`/`pageCount` on the kind-39999 event, plus existing fields | `selects isbn13 as the first 978/979…`; `selects isbn10…uppercased`; `leaves isbn… unset when no match / absent`; `maps pageCount…`; `leaves pageCount unset…absent`; `normalizes language to the eng scalar`; `serializes…onto the kind-39999 event and back`; `maps the core fields…`; `derives the slug stably…`; `returns null when title or first author is missing` | `test/search-mapping.test.ts` | unit |
| **Blurb path unchanged** | Negative coverage: the seeder's blurb block (`requestWorkDescription`/`capBlurb`/`sanitizeDescription`/desc-cache) is untouched — existing `description.test.ts` / `desc-cache.test.ts` stay green (no Story-55 edit). | `test/description.test.ts`, `test/desc-cache.test.ts` | unit (existing, green) |
| **Scale + genres** (~10K, 8 genres, ~1,250 post-gate each, operator-configurable) | `pages toward the post-gate target across multiple pages and stops at target` (the per-genre `target` knob = `PER_SUBJECT_TARGET`); `stops at maxPages even when the target is never reached` | `test/search.test.ts` | unit (operator-observable scale is not unit-testable; the per-genre paging mechanism is) |
| **Enrich keepers in place** (replace via deterministic d-tag; no relay-read; no kind-5) | `derives the slug stably from the OL work key (so re-seeds replace in place)`; plus the scope guard (below) | `test/search-mapping.test.ts`, `test/scope-guard.test.ts` | unit |
| **Invariants preserved** (checkpoint epoch, desc cache, politeness, rate limit; idempotent/resumable) | `sends the polite User-Agent header on every request`; existing `checkpoint-epoch.test.ts` / `checkpoint.test.ts` / `desc-cache.test.ts` stay green | `test/search.test.ts` + existing | unit |
| **Fingerprint honest for enrichment** (changed ISBN/lang/pages → re-publish) | `changes when isbn13 changes`; `changes when language changes`; `changes when pageCount changes`; `yields the same fingerprint for two identical enriched records` | `test/fingerprint-enrichment.test.ts` | unit |
| **No out-of-scope change** (no web/API/design-system; no schema; no relay-read; no kind-5) | `does not add a relay reader module`; `the seeder issues no relay REQ / subscription`; `the seeder builds no NIP-09 kind-5 deletion template`; `the seeder publishes no 'delete' / prune step` | `test/scope-guard.test.ts` | unit (structural guard) |

## Edge cases covered beyond the AC

- Gate **all-pass** fixture (the positive control every DROP test mutates a single field from).
- Gate **boundary** values: edition `3` (floor), pages `50` (floor), year `1800` and `currentYear` (inclusive bounds).
- Denylist **false-positive guards** (the ADR's documented over-match tradeoff): `A Study in Scarlet`, `Notes from Underground`, bare `Summary` must NOT be dropped.
- Gate **purity**: no input mutation; injected `currentYear` (a 2200 doc passes against year 2200, fails against 2026) proving no `Date` read inside the pure function.
- ISBN selection: mixed `isbn[]` (13s + 10s + noise), no-match array, absent array, `X`-suffixed isbn10.
- Dedup: same-slug-two-genres merge; two-slugs-same-isbn13 collapse (first-seen wins); two distinct isbn13 kept; no-isbn never dropped.
- Search pager: gate-inside-loop (junk dropped before counting), multi-page accumulation to target, `maxPages` cap on a zero-pass-rate genre.
- Fingerprint: identical enriched content → identical fp (stability), each new field individually flips the fp.

## The red mechanism (why it is a clean assertion-level red, not a tsc wall)

`gate.ts`, `search.ts`, and `dedup.ts` do not exist yet, and `mapSearchDocToBookRecord` is not yet an export of `openlibrary.ts`. A static `import` of any of these would be a `tsc` error (TS2307 / TS2305) and break CI's typecheck gate — a compile wall, not an assertion-level red.

Every Story-55 module-under-test is therefore loaded through the existing **opaque specifier loader** (`apps/seeder/test/_load.ts`: `await import("../src/<name>")` via a runtime-computed specifier), mirroring the Story-52 `description.test.ts` precedent. This hides the missing module/export from tsc's resolver, so:

- `pnpm -r typecheck` stays **clean** (confirmed below — all projects Done), and
- each test fails at the first `await load()` with `Failed to load url ../src/<name>` (missing module) or `TypeError: <fn> is not a function` (missing export) — a readable, assertion-level red.

`fingerprint.ts` already exists, so its tests fail at the **assertion** (`expected 'X' not to be 'X'`): today the fingerprint ignores `isbn13`/`language`/`pageCount`, so two records differing only in those fields hash identically. The reds go green when the Implementer extends the canonical string (§4).

`scope-guard.test.ts` reads the seeder source from disk and asserts the prune surfaces are **absent**; it is **green today** and is the lock that turns red if the Implementer drifts into Story 56 (adds `read.ts`, a `queryAllPages`/`REQ` reader, or a `kind: 5` template).

## Test infrastructure

- Runner: **Vitest** (workspace default; `apps/seeder` `test` = `vitest run`). No new framework.
- Tests live under `apps/seeder/test/` next to the existing seeder suite.
- **No live network**: the search pager's HTTP is mocked via an injected `fetchImpl` (`vi.fn`), following the `description.test.ts` / `fetch.ts` precedent. The mock returns `{ docs: [...] }` (search-API shape) and the tests assert the **request shape**, not live data.
- **No relay / Docker / Neo4j / real crypto** dependency. The schema round-trip (`toBookRecordEvent`/`fromBookRecordEvent`) uses the real `@unbnd/schemas` builders (already in the workspace).
- New opaque modules loaded via the existing `_load.ts` (no edit needed — its generic `loadSeederModule<T>(name)` already resolves `../src/<name>` for any name).

## How to run

```
pnpm --filter @unbnd/seeder test
pnpm -r typecheck
```

## Verification

Confirmed RED for the right reason on 2026-06-04 (branch `story-55-catalog-expansion`).

### `pnpm --filter @unbnd/seeder test`

```
✓ test/scope-guard.test.ts        (4 tests)                 — GREEN (scope lock)
❯ test/gate.test.ts               (37 tests | 37 failed)    — missing module ../src/gate
❯ test/search-mapping.test.ts     (11 tests | 11 failed)    — missing export mapSearchDocToBookRecord
❯ test/dedup.test.ts              (5 tests  | 5 failed)     — missing module ../src/dedup
❯ test/search.test.ts             (5 tests  | 5 failed)     — missing module ../src/search
❯ test/fingerprint-enrichment.test.ts (4 tests | 3 failed) — assertion: fp ignores isbn13/language/pageCount

Test Files  5 failed | 8 passed (13)
     Tests  61 failed | 56 passed (117)
```

- New reds: **61** (37 gate + 11 mapping + 5 dedup + 5 search + 3 fingerprint).
- New greens: **5** (4 scope-guard + the 1 fingerprint stability test — both correct).
- The **51 pre-existing seeder tests stay green** (56 passed − 5 new green = 51).
- The gate/mapping/dedup/search reds are **module/export not found** (clean assertion-level red via the opaque loader). The fingerprint reds are **assertion-level** (`expected '0c403b9a833c' not to be '0c403b9a833c'`) — the fp collapses identical because the new fields are not yet in the canonical string.

### `pnpm -r typecheck`

```
All 11 workspace projects: Done (clean).
apps/seeder typecheck: Done
```

The red set typechecks cleanly — the opaque-specifier loader keeps the missing modules/exports out of tsc's resolver, and the locally-declared `OLSearchDoc` / `CollectedBook` / opts types pin the contract shape without importing the missing source.

## ADR ambiguities flagged (for orchestrator / Architect confirmation)

1. **Search-doc mapper name.** ADR §3 "Decision" prefers *extending* `mapWorkToBookRecord` to accept the richer shape **or** adding an adapter; Implementation notes §278/§284 and the story-brief name `mapSearchDocToBookRecord`. The tests pin a dedicated **`mapSearchDocToBookRecord`** export on `openlibrary.ts` (keeps the existing subjects-API `mapWorkToBookRecord` test green, and isolates the ISBN/enrichment helpers to the search-doc path). If the Architect prefers a single overloaded `mapWorkToBookRecord(searchDoc, …)`, the Implementer would re-point the loader's export name — a one-line test change. Flagged for confirmation.

2. **Dedup helper name + location.** ADR §3 / §279 pins dedup as **inline `Map` logic in `index.ts`**, not an exported function — so it is not directly unit-testable as written. The tests pin a small **pure `dedupBooks(collected)` helper** in a new `apps/seeder/src/dedup.ts` capturing the decided composition (slug-first, then isbn13 collapse onto first-seen, genres merged, no-isbn slug-only). The Implementer should extract the collapse logic into this pure helper (and call it from `index.ts`) to satisfy the contract without coupling the test to `index.ts`'s I/O-bound `main()`. If the Architect insists the logic stays inline, the dedup contract is instead only integration-observable — flagged as a deliberate Tester decision to keep it pure + unit-tested per the quality bar.

3. **`fetchSubjectSearch` options/return.** ADR §277 names `fetchSubjectSearch(subject, target, { maxPages, pageSize, pageDelayMs, userAgent })` and says it "returns the gated search docs"; it does not pin the response-JSON field the docs live under. The tests assume the live OL search response shape `{ docs: [...] }` (ADR §1 probe) and inject `fetchImpl` + a `currentYear` opt (so the in-loop gate is deterministic). If the Implementer reads docs from a differently-named field or injects `currentYear` elsewhere, the mock wiring adjusts — the asserted request shape and paging behavior are the load-bearing contract. Flagged.

4. **`number_of_pages_median` page floor = 50.** ADR §2 signal 6 pins `>= 50`; the story AC says "below 50 dropped". Tests pin `30`→drop, `50`→pass, absent→pass. No ambiguity, recorded for completeness.
