# Test plan: Story 104 (catalog records carry a year the book could have been published)

ADR 0092. All in `apps/seeder/test`, unit level: no relay, no network, no compose services. Open Library is mocked with an injected `fetch`; hub records are built with the real schema builders (`toBookRecordEvent` + `toWireTemplate`), so they have the hub's exact wire shape. Edition years and birth years in the fixtures are Open Library's own for those books (read 2026-10-20).

| AC | What | Where | Tests |
|---|---|---|---|
| 1 | An impossible, lone year becomes the earliest possible edition year: Step on a Crack 1658 → 2007, The Lake House 1662 → 2003, The War of the Worlds 0 → 1898, Two Years Before the Mast 1000 → 1840, Persuasion 1789 → 1818 | `year.test.ts`, `year-corrections.test.ts` | `judgeYear — impossible and alone: corrected`, `planYearCorrections — what changes` |
| 1 | The replacement skips stray editions below the floor and never picks a future edition | `year.test.ts` | `skips edition years below the floor…`, `never picks an edition year after the current year` |
| 2 | A possible year never changes: Gulliver's Travels 1726, Hamlet 1603, The Canterbury Tales 1478, the Odyssey 1488 (no birth); the floor itself is possible | `year.test.ts`, `year-corrections.test.ts` | `judgeYear — possible: credible, never changed`, `never plans a change for Gulliver's Travels, Hamlet or the Odyssey` |
| 2 | A birth year counts only when the author record names the record's author (Homer re-spelled) | `year.test.ts`, `year-corrections.test.ts` | `authorBirthFor — evidence must name the record's author`, `uses the author's birth only when…` |
| 3 | An impossible year with company stays and is reported: Jack's Baby 1996, The Outsiders 1967, Little Dorrit's 1800/1802; 9 years is company, 10 is not | `year.test.ts`, `year-corrections.test.ts` | `judgeYear — impossible but with company: kept`, `keeps and reports a year with company` |
| 4 | An impossible year with no possible edition stays and is reported: Old Yeller 1920 | `year.test.ts`, `year-corrections.test.ts` | `…nothing to replace it: unresolved`, `reports an impossible year with no possible edition as unresolved` |
| 4 | A record Open Library returns nothing for is reported and left | `year-corrections.test.ts` | `reports a record Open Library returned no evidence for…` |
| 5 | The dry run publishes nothing and logs every correction (slug, stored year, new year, title, author), then kept, unresolved, no-evidence, refused, then counts | `year-corrections.test.ts` | `formatPlan — the dry-run list Avi checks`, `a dry run publishes nothing and logs the plan` |
| 5 | Only live Open Library records with a year are candidates (community, no-year, no-id and delisted records are not); the newest event per slug is judged | `year-corrections.test.ts` | `considers only live Open Library records with a year`, `judges only the newest event per slug` |
| 6 | The corrected record changes only the `year` tag and `publishYear`; d-tag, content and every other field stay; a record that does not rebuild exactly is refused, never published | `year-corrections.test.ts` | `correctedRecordTemplate — only the year changes`, `the planner reports such a record as refused…` |
| 6 | Apply publishes one record per correction stamped now, counts refusals as failed, and a second run plans nothing | `year-corrections.test.ts` | `runYearCorrection — dry run and apply` |
| 6 | Evidence comes in batches of 100 from Open Library search (works, then first authors); the request names the right keys and fields; an HTTP error throws | `ol-evidence.test.ts` | `fetchWorkEvidence — works by key`, `fetchAuthors — first authors by key` |
| 7 | A seed of Step on a Crack's search doc writes 2007; kept, credible and unresolved verdicts leave Open Library's year | `year-corrections.test.ts` | `the seed writes the same year` |
| 7 | The seed requests `publish_year` and `author_key`, fetches first authors and judges each record before fingerprinting | `search.test.ts`, `years-wiring.test.ts` | `hits search.json with the decided fields…`, `the seed judges each record's year` |
| 5–6 | The `years.js` entrypoint exists, is a dry run unless `--apply`, reads and publishes dcosl, ships in the seeder image; Staging ops offers `years-check` and `years-fix`; DEPLOY.md documents both | `years-wiring.test.ts` | `the years entrypoint`, `Staging ops runs it` |

`scope-guard.test.ts` (story 55) forbade a relay read in any seeder file. Its boundary is the seed itself, so the read check now skips the two one-off ops entrypoints that read the catalog by design (`recast.ts`, ADR 0073; `correct-years.ts`, ADR 0092). The seed and every other module stay publish-only.

Missing modules load through the opaque `_load.ts` specifier so the red set typechecks.

Red at commit: 77 failing in `apps/seeder` (5 files); `pnpm -r --no-bail typecheck` and `lint` clean.

The real dry run over the hub (11,282 records, Open Library live) is the Reviewer's acceptance check, not a unit test: it needs the network.
