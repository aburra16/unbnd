# Test plan: Story 103 (books first printed before 1800 show again)

ADR 0091. All unit level; no relay, no compose services.

| AC | What | Where | Tests |
|---|---|---|---|
| 1 | An early year never makes a record junk (1726, 1603, 1478, 1799) | `packages/schemas/test/junk-record.test.ts` | `keeps a record first printed before 1800 (…)` |
| 1 | Gulliver's Travels and The Canterbury Tales resolve with their years | `apps/api/test/books/effective.test.ts` | `parseBook — early books resolve` |
| 1 | Gulliver's Travels is indexed with its year | `apps/indexer/test/build-book-document.test.ts` | `buildBookDocument — early books are indexed` |
| 2 | A future year, denylist title, missing title or author stay junk | existing suites, unchanged | `flags a record whose publishYear is after the current year`, the denylist and title/author cases in `junk-record.test.ts`, `effective.test.ts`, `build-book-document.test.ts` |
| 3 | A year before printing is not junk and reads as no year: book page, search, pending submissions, autofill | the four suites above plus `apps/api/test/routes/ol-lookup.test.ts`, `apps/api/test/routes/submissions-list-enriched.test.ts` | `keeps a record whose year is before printing`, `…with no year (The War of the Worlds at 0)`, `reports no year for 1449 and the year for 1450`, `leaves the year out when Open Library gives one before printing`, `shows an early printed year and no year before printing` |
| 4 | One floor: `PRINT_ERA_START = 1450`, `credibleYear` | `junk-record.test.ts` | `PRINT_ERA_START and credibleYear` |
| 4 | The seed gate admits 1450..currentYear and still drops absent, pre-print and future years | `apps/seeder/test/gate.test.ts` | `gateWork — year signal (PRINT_ERA_START..currentYear inclusive)` |
| 4 | The submit form's lowest year is 1450 | `apps/web/test/routes/submit-autofill.test.tsx` | `Submit year field — accepts early printed works` |

Boundaries: 1449 (no year / gate drop) and 1450 (year kept / gate pass); `currentYear` and `currentYear + 1` unchanged.

New schemas exports (`PRINT_ERA_START`, `credibleYear`) load through the existing opaque loader so the red set typechecks.

Red at commit: 23 failing (schemas 11, api 6, indexer 2, seeder 2, web 1); `pnpm -r --no-bail typecheck` clean.
