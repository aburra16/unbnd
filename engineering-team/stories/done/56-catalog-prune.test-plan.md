# Test Plan: Story 56 — Prune existing catalog junk via a read-time filter

**Story:** `engineering-team/stories/done/56-catalog-prune.md`
**ADR:** `engineering-team/decisions/0055-catalog-prune.md` (Accepted — read-time filter, NOT NIP-09 deletion)
**Date:** 2026-06-05
**Branch:** `story-56-catalog-prune`

> **Refinement (2026-06-05, applied in the green commit):** "missing cover" was DROPPED as a read-time junk signal (see ADR 0055's "Refinement" note). `parseBook` serves community submissions + author overlays + user shelves where `coverUrl` is optional legitimate content, so a cover-less record is KEPT, not junk. The cover rows below describe the original red set; the implemented tests assert cover-less → kept. The other four signals (missing title/author, denylist title, present out-of-range year) are unchanged.

## Scope

Tests only (TDD red). Three surfaces, all reusing one shared oracle homed in `@unbnd/schemas` (ADR 0055 §1):

1. The shared junk oracle `isJunkRecord(book, currentYear)` + the relocated `JUNK_TITLE_RE` in `packages/schemas/src/BookRecord.ts`.
2. The indexer build-site skip (`apps/indexer/src/build-documents.ts buildSearchDocuments`) — junk never indexed.
3. The API choke-point filter (`apps/api/src/books/effective.ts parseBook`) — junk parses to `null`.
4. The indexer flush-before-upsert ordering (`provider.deleteAll()` before the upsert sweep) — a re-index is self-cleaning.

Out of scope for the Tester (Implementer owns these): all of `apps/*/src/*` and `packages/schemas/src/*` production code, the seeder `gate.ts` re-export edit, the operator re-index runbook step. **No relay / strfry / kind-5 / down-sync change** is tested or touched (ADR's whole point — nothing crosses the dcosl→local-strfry boundary). No web/e2e/visual change (the book-detail route already 404s; no UI change).

The existing seeder `apps/seeder/test/gate.test.ts` is **NOT modified** and must stay green after the `JUNK_TITLE_RE` relocation (it imports `JUNK_TITLE_RE` from `gate.ts`, which will re-export the relocated constant — behavior byte-stable).

## Contracts under test (pinned verbatim from ADR 0055)

| Contract | Where | Decided value (ADR) |
|---|---|---|
| `isJunkRecord(book: BookRecord, currentYear: number): boolean` | `packages/schemas/src/BookRecord.ts` (exported via `@unbnd/schemas`) | true iff a STORED record is positively junk; pure, deterministic, I/O-free; `currentYear` **injected** (§1) |
| Positive signals | `isJunkRecord` | empty/missing `title`; empty/missing `authorName`; missing/empty `coverUrl`; `JUNK_TITLE_RE.test(title)`; a **present** `publishYear < 1800` or `> currentYear` (§1) |
| Conservative rule | `isJunkRecord` | absence is NOT junk — absent `publishYear`, `language`, `pageCount`, `blurb` → keep; `edition_count` not read (not stored) (§1) |
| `JUNK_TITLE_RE` | RELOCATED to `packages/schemas/src/BookRecord.ts`, exported | the **exact** Story-55 regex, case-insensitive, segment-anchored: `summary of`, `study guide`, `workbook`, `sparknotes`, `cliffs?\s*notes`, `omnibus`, `box ?set` / `boxed set` (§1) |
| ONE denylist | `gate.ts` re-exports the relocated `JUNK_TITLE_RE` | seeder `gate.test.ts` unchanged + green; the regex is defined ONCE (§1) |
| `RECORD_YEAR_MIN` | `BookRecord.ts` (private) | `1800` — the year lower bound (§1) |
| `buildSearchDocuments(books, taxonomy, assertions, currentYear)` | `apps/indexer/src/build-documents.ts` | after the parse guard, `if (isJunkRecord(rec, currentYear)) { skipped++; continue; }`; `currentYear` threaded from `index.ts` (§2) |
| `parseBook(event, currentYear?)` | `apps/api/src/books/effective.ts` | after `fromBookRecordEvent`, `if (isJunkRecord(record, currentYear)) return null;` before `toPublicBook`; `currentYear` a defaulted param (§3) |
| Flush before upsert | indexer orchestration | `await provider.deleteAll()` AFTER `configureIndex()` and BEFORE the upsert loop; tolerates an empty index (§4) |

## Coverage map (acceptance criterion → test)

| Story AC | Test(s) | File | Level |
|---|---|---|---|
| **Shared junk oracle** — positive evidence flags junk | `flags a record with a missing title / whitespace-only title`; `…missing authorName / whitespace-only authorName`; `…missing coverUrl (absent) / empty-string coverUrl`; `flags the junk-denylist title: <8 titles>`; `flags a record whose publishYear is before 1800 (1799) / after currentYear` | `packages/schemas/test/junk-record.test.ts` | unit |
| Oracle: clean record kept | `returns false (not junk) for a clean, complete BookRecord`; `keeps a record at the lower bound year 1800 / upper bound (currentYear)` | `junk-record.test.ts` | unit |
| **Conservative — absence is not junk** | `keeps a record with an ABSENT publishYear`; `…absent pageCount`; `…absent language`; `…absent blurb`; `keeps a legacy record lacking pageCount, language, blurb, AND publishYear all at once` | `junk-record.test.ts` | unit |
| Oracle: denylist false-positive guards | `does NOT flag the legit title (false-positive guard): A Study in Scarlet / Notes from Underground / Summary` | `junk-record.test.ts` | unit |
| Oracle: purity / determinism / no I/O | `returns the same result…across calls`; `does not mutate the input record`; `uses the injected currentYear, not the wall clock` | `junk-record.test.ts` | unit |
| **One denylist, not two** | `JUNK_TITLE_RE … is exported from the schemas BookRecord module and is a case-insensitive regex`; `matches a junk-denylist title`; `does NOT match a clean title`; AND the unchanged seeder `gate.test.ts` stays green (re-export) | `junk-record.test.ts` + (existing) `apps/seeder/test/gate.test.ts` | unit |
| **Indexer skips junk** (never indexed → absent from search/genre) | `includes a clean record in the output documents`; `excludes a record with a junk-denylist title`; `…missing cover`; `…out-of-range publishYear`; `indexes clean records and drops junk in a mixed batch` | `apps/indexer/test/build-documents-junk.test.ts` | unit |
| **API read paths filter junk** (`parseBook` → null; detail 404s) | `returns null for a junk-denylist title (so /api/books/:slug 404s)`; `…missing a cover`; `…publishYear after currentYear`; `…publishYear before 1800` | `apps/api/test/books/effective.test.ts` | unit |
| API: clean / conservative still parses | `returns a PublicBook for a clean, complete record`; `returns a PublicBook for a record that merely lacks year/language/pages` | `effective.test.ts` | unit |
| **Search / genre browse need no API change** | Negative coverage: `apps/api/src/routes/search.ts` is index-backed and never calls `parseBook`; the indexer-skip tests above already cleanse the index. No search-route test is added or changed (it is unaffected by design, ADR §3). | (existing search route tests stay green) | — |
| **Flushed re-index drops already-indexed junk** | `calls provider.deleteAll() exactly once`; `calls deleteAll() AFTER configureIndex() and BEFORE any index() upsert`; `flushes even when there are zero documents` | `apps/indexer/test/flush-before-upsert.test.ts` | unit (mock provider records call order) |
| **Idempotent / single oracle** | the oracle purity tests + the flush-ordering tests together pin "flush + rebuild from the same filtered set is idempotent"; the SAME `isJunkRecord` is imported at both the indexer and the API sites (one import source) | `junk-record.test.ts`, `flush-before-upsert.test.ts` | unit |
| **Gates green** | `pnpm -r typecheck` clean; existing seeder `gate.test.ts` + `build-documents.test.ts` + the full existing API suite stay green | full workspace | gate |

## Edge cases covered beyond the AC

- Oracle **all-pass** fixture (the clean, complete record every positive-junk test mutates a single field from).
- Year **boundary** values: `1799`→junk, `1800`→keep, `currentYear`→keep, `currentYear+1`→junk (inclusive bounds, present-only).
- The **absent-year-is-not-junk** distinction (the deliberate divergence from the Story-55 gate, which fails an absent year): an absent `publishYear` keeps; only a present out-of-range year flags.
- The **all-signals-absent legacy record** (no pageCount, language, blurb, year) — the conservative posture's worst case, must keep.
- Denylist **false-positive guards** (the ADR's documented over-match tradeoff): `A Study in Scarlet`, `Notes from Underground`, bare `Summary` keep.
- Oracle **purity**: no input mutation; injected `currentYear` (a 2200 record flags against 2026, keeps against 2200) proving no `Date` read inside.
- Indexer **mixed batch**: clean records kept, junk dropped in one pass (the operator-observable skip behavior at the unit level).
- Flush **ordering**: `deleteAll` strictly after `configureIndex`, strictly before the first `index` upsert; flush even on a zero-doc rebuild (the empty-index tolerance).

## The red mechanism (why it is a clean assertion-level red, not a tsc wall)

The modules under test all **already exist** — only new *exports* and a new *parameter* are missing. A static import/call of the new surface would be a `tsc` error (TS2305 missing member / TS2554 arity) and break CI's typecheck gate — a compile wall, not an assertion-level red. Every new surface is therefore routed through an **opaque specifier loader** (mirroring the seeder `apps/seeder/test/_load.ts` precedent), hiding the missing export/arity from tsc's resolver:

- `packages/schemas/test/_load.ts` → loads `../src/BookRecord` by name; `isJunkRecord` / `JUNK_TITLE_RE` are read off it. Missing export ⇒ `TypeError: isJunkRecord is not a function` / `JUNK_TITLE_RE` is `undefined` — readable, assertion-level.
- `apps/indexer/test/_load.ts` → loads `../src/build-documents` (real function, run with a widened 4-arg local type so the new `currentYear` arg is invisible to tsc; the assertion fails because junk is still indexed) and `../src/run-index` (the flush seam — does not exist yet ⇒ `Failed to load url ../src/run-index`).
- `apps/api/test/books/_load.ts` → loads `../../src/books/effective` (real `parseBook`, widened to accept `currentYear`; the assertion fails because junk does not yet return `null`).

So `pnpm -r typecheck` stays **clean** (confirmed below — all 10 projects Done), and each test fails at the **assertion** (`isJunkRecord is not a function`, `expected [...] to not include 'junk'`, `expected null`) or at a readable **module-not-found** (`run-index`), never as a type error.

### The indexer flush seam (interpretation flagged)

ADR 0055 §4 pins the flush as a **one-line change inside `index.ts` `main()`** (`await provider.deleteAll()` after `configureIndex()`, before the upsert loop). But `main()` is private and runs relay I/O at module load, so it is not unit-testable as written, and importing `index.ts` would execute that I/O. To assert the flush-**before-upsert ordering** at the smallest seam, these tests pin a pure orchestration helper **`runIndex(provider, docs)`** exported from a new sibling module **`apps/indexer/src/run-index.ts`**, which `main()` calls. The Implementer extracts the `configureIndex → deleteAll → upsert-loop` body into `runIndex` (keeping it importable without triggering `main()`'s relay read). If the Architect/Implementer prefers a different seam (e.g. exporting `main` with an injected provider+docs), the loader's module/function name is a one-line test change; the **load-bearing contract is the ordering**: `deleteAll` after `configureIndex`, before any `index` upsert, on every run including a zero-doc rebuild.

## Test infrastructure

- Runner: **Vitest** (workspace default; all three packages' `test` = `vitest run`). No new framework.
- New test files: `packages/schemas/test/junk-record.test.ts`, `apps/indexer/test/build-documents-junk.test.ts`, `apps/indexer/test/flush-before-upsert.test.ts`, `apps/api/test/books/effective.test.ts`. New loaders: `packages/schemas/test/_load.ts`, `apps/indexer/test/_load.ts`, `apps/api/test/books/_load.ts`.
- **No live network / relay / Docker / Neo4j / real crypto.** Wire events are built with the real `@unbnd/schemas` builders (`toBookRecordEvent`/`toWireTemplate`). The flush test injects a mock `SearchProvider` (`vi.fn`s recording call order) — no Meili.
- **Not modified:** `apps/seeder/test/gate.test.ts` (must stay green post-relocation), `apps/indexer/test/build-documents.test.ts` (its 3-arg `buildSearchDocuments` call stays valid — the new `currentYear` is optional/defaulted), the existing `packages/schemas/test/BookRecord.test.ts`.

## How to run

```
pnpm --filter @unbnd/schemas test
pnpm --filter @unbnd/indexer test
pnpm --filter @unbnd/api test
pnpm -r typecheck
```

## Verification

Confirmed RED for the right reason on 2026-06-05 (branch `story-56-catalog-prune`).

### `pnpm --filter @unbnd/schemas test`

```
❯ test/junk-record.test.ts   (33 tests | 33 failed)  — isJunkRecord is not a function / JUNK_TITLE_RE is undefined
  (all other schemas test files green)
Test Files  1 failed | 12 passed (13)
     Tests  33 failed | 112 passed (145)
```

### `pnpm --filter @unbnd/indexer test`

```
❯ test/build-documents-junk.test.ts  (5 tests | 4 failed)  — assertion: junk still indexed ("expected [...] to not include 'junk'")
                                                              (1 green: the clean record is included today)
❯ test/flush-before-upsert.test.ts   (3 tests | 3 failed)  — Failed to load url ../src/run-index (seam not extracted yet)
  test/build-documents.test.ts        — GREEN (unchanged 3-arg call)
  test/relay.test.ts                  — GREEN
Test Files  2 failed | 2 passed (4)
     Tests  7 failed | 7 passed (14)
```

### `pnpm --filter @unbnd/api test`

```
❯ test/books/effective.test.ts  (6 tests | 4 failed)  — assertion: parseBook does not yet return null for junk ("expected null")
                                                         (2 green: the clean + legacy records parse today)
Test Files  1 failed | 85 passed | 2 skipped (88)
     Tests  4 failed | 786 passed | 10 skipped (800)
```

- New reds: **44** (33 oracle/denylist + 4 indexer-skip + 3 flush + 4 api-null).
- New greens (correct today): the indexer clean-include test, the api clean + legacy parse tests.
- All **pre-existing tests stay green**, including the unmodified seeder `gate.test.ts` (37 tests) and the indexer `build-documents.test.ts`.
- Red reasons are clean: schemas = **missing export** (`isJunkRecord is not a function`); indexer-skip + api = **assertion-level** (junk not yet filtered); flush = **module-not-found** (`run-index` seam not yet extracted). None is a tsc/syntax failure.

### `pnpm -r typecheck`

```
Scope: 10 of 11 workspace projects — all Done (clean).
packages/schemas: Done   apps/indexer: Done   apps/api: Done   (+ search, ui, promoter, seeder, trust, web, shelves)
```

The red set typechecks cleanly — the opaque-specifier loaders keep the missing exports/arity out of tsc's resolver, and the locally-declared widened types pin the decided signatures (`isJunkRecord(book, currentYear)`, `buildSearchDocuments(…, currentYear?)`, `parseBook(event, currentYear?)`, `runIndex(provider, docs)`) without importing the missing surface.

## ADR ambiguities flagged (for orchestrator / Architect / Implementer confirmation)

1. **Indexer flush seam.** ADR §4 pins the flush inline in `index.ts` `main()`, which is not unit-testable (private, runs relay I/O at load). The tests pin a pure `runIndex(provider, docs)` in a new `apps/indexer/src/run-index.ts` that `main()` calls, so the flush-before-upsert **ordering** is assertable with a mock provider and no relay. The Implementer should extract the orchestration body into this seam. If a different seam is preferred, the loader's module/function name is a one-line test change — the ordering is the contract. **Flagged.**

2. **`currentYear` parameter position + optionality.** ADR §2 threads `currentYear` into `buildSearchDocuments` from `index.ts`; §3 makes `parseBook`'s `currentYear` a *defaulted* param. The tests pin `currentYear` as the **last** argument in both (`buildSearchDocuments(books, taxonomy, assertions, currentYear)`, `parseBook(event, currentYear)`) and **optional/defaulted** — required so the existing 3-arg `build-documents.test.ts` call and 1-arg `parseBook` callers keep typechecking. If the Implementer makes it required, those existing call sites must be updated in lockstep (the ADR's defaulted-param choice avoids that). **Flagged, low-risk** — matches the ADR's stated "defaulted parameter".

3. **`gate.ts` re-export shape.** ADR §1 / story OQ-2: `gate.ts` keeps `export const JUNK_TITLE_RE` as a public name, now sourced from `@unbnd/schemas`. No new test asserts this directly (the Tester does not modify the source); it is verified by the **unchanged** seeder `gate.test.ts` staying green after the relocation. Recorded for the Implementer to keep the public name and behavior byte-stable. **Flagged for confirmation at Review.**
```
