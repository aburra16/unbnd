# Review: Story 60 — Index-on-write (incremental, best-effort search index updates on live writes)

**Reviewer:** Claude (acting as Reviewer, independent / fresh context)
**Date:** 2026-06-05
**Story:** `engineering-team/stories/done/60-index-on-write.md`
**ADR:** `engineering-team/decisions/0059-index-on-write.md`
**Test plan:** `engineering-team/stories/done/60-index-on-write.test-plan.md`
**Diff:** `git diff 7954412...afae72e` (Tester red `7954412` → Implementer green `afae72e`)
**PR:** #105 (`story-60-index-on-write`)

## Verdict: **PASS**

---

## 1. Test integrity (the non-negotiable gate)

`git diff 7954412 afae72e -- '**/*.test.ts' '**/test/**'` → **EMPTY**. Not one test
file was moved, modified, or weakened between the Tester's red commit and the
Implementer's green commit. The green commit (`afae72e`) touches only source,
package manifests, the lockfile, and compose — never a test:

```
M apps/api/src/index.ts
M apps/api/src/routes/tags.ts
M apps/indexer/src/build-documents.ts
M apps/promoter/package.json
M apps/promoter/src/index.ts
M apps/promoter/src/main.ts
M docker-compose.prod.yml
M packages/relay/src/types.ts
M packages/search/package.json
A packages/search/src/build-document.ts
M packages/search/src/index.ts
A packages/search/src/reindex-book.ts
M pnpm-lock.yaml
```

Note: the test plan §"Opaque-loader pattern" suggested the Implementer *might*
relocate `build-book-document.test.ts` + `reindex-book.test.ts` from
`apps/indexer/test/` to `packages/search/test/` once the dep edge landed. The
Implementer correctly chose NOT to move/edit any test (the test-integrity rule
trumps the relocation suggestion). The tests stay where the Tester put them and
run green against the extracted `@unbnd/search` exports via the indexer's existing
`@unbnd/search` + `@unbnd/schemas` deps. Non-blocking; the right call.

## 2. Quality gates (run by reviewer, not trusted)

- **`pnpm -r typecheck`** — **PASS.** All 12 projects `Done`.
- **`pnpm -r test`** — **PASS.** search 11, trust 23, web 307, librarian 40,
  promoter 32, indexer 26, seeder 121, shelves 26, api 798 (89 files) / 10 skipped.
  Zero failures on the full workspace run.
- **Targeted suites** — `@unbnd/search` 11/11, `@unbnd/indexer` 26/26,
  `@unbnd/api` 798/798 (re-run clean), `@unbnd/promoter` 32/32.
- **Builds** — `@unbnd/indexer`, `@unbnd/api`, `@unbnd/promoter` `tsc` builds all
  `Done`. (`@unbnd/search` has no build script — TS-source workspace package;
  typecheck covers it.)
- **`pnpm install --frozen-lockfile`** — **PASS** ("Lockfile is up to date"), so
  the Docker `--frozen-lockfile` build will not break (ADR 0058 caveat satisfied).
- **`gh pr checks 105`** — **ALL GREEN:** "Typecheck, test, build" pass, "Validate
  Caddyfile" pass, "Visual regression" pass. PR `MERGEABLE`.
- _Lint not configured — skipped._

### foryou / submissions-promote parallel-load flake (recorded, non-blocking)

The Implementer flagged a pre-existing `foryou.test.ts` parallel-load flake. On my
first full `@unbnd/api test` run a *different* file timed out:
`submissions-promote.test.ts` ("no trust provider → gate CLOSES", timed out at
5007ms). This is the **same class** of pre-existing parallel-load resource-
contention flake, not a Story-60 regression:
- In isolation `submissions-promote.test.ts` passes **12/12 in 22ms**.
- In isolation `foryou.test.ts` passes **25/25 in 167ms**.
- A second full `@unbnd/api test` run passed **798/798** with no timeout.
- `submissions-promote.test.ts` is untouched by this PR (a pre-existing submissions
  test, not on the index-on-write path).

Per the review brief, I do not fail the review for a confirmed pre-existing flake.
Recorded here as a known, non-blocking infra flake (test concurrency, not Story 60).

## 3. Behavior-equivalent extraction (the core risk) — VERIFIED EQUIVALENT

Diffed the extracted `buildBookDocument` (`packages/search/src/build-document.ts`)
against the pre-extraction per-book body in `git show 7954412~1:apps/indexer/src/build-documents.ts`:

- `parse` helper — **verbatim.**
- `parseTaxonomy` — **verbatim** (only `readonly` added to the param type).
- Net-polarity reduction — the old `appliedTagsByBook` keyed by `(author|book|tag)`
  then netted per `(book,tag)`; the extracted `netByTagForBook` does the identical
  dedup-by-`(pubkey|bookSlug|tagSlug)`-keeping-latest then nets per tag, restricted
  to the one book's assertions passed in. Same semantics.
- Tag/genre assembly — identical: `net <= 0` drop, `el.sensitivity === "accusatory"`
  exclusion (hide accusatory), `el.type === "genre"` → push slug, same `tagNames`/
  `genreSlugs` arrays, **identical `SearchDocument` field map** (id=slug, title,
  authorName, isbn13, subjects ?? [], tags, genreSlugs, blurb, format, language,
  publishYear, coverUrl, openLibraryId).
- Junk skip — same `isJunkRecord(rec, currentYear)` → `return null`; unparseable
  record → `return null` (old: `continue`). Both omit the doc.

The refactored `buildSearchDocuments` is now a `map` over `buildBookDocument`:
- assertions grouped by parsed `bookSlug` (`groupAssertionsByBook`);
- the per-book lookup keyed by `slugOf(e)` = the book record's `d` tag.

**Join-key equivalence proof:** the old code joined assertions (keyed by
`a.bookSlug`) to books via `applied.get(rec.slug)`. The new code joins assertions
(keyed by `a.bookSlug`) to books via the `d` tag. `buildBookRecordDTag(slug)`
returns `slug` (`packages/schemas/src/BookRecord.ts:88`) and the record event sets
`["d", slug]`, so `slugOf(e) === rec.slug`. The join key is identical → byte-
identical output. The `[indexer] skipped N junk records` log is preserved.

**Proof in tests:** `parity.test.ts` (2) asserts
`buildSearchDocuments(...) === map(buildBookDocument)` (incl. junk-drop), and the
**unmodified** `build-documents.test.ts` (3) + `build-documents-junk.test.ts` (5)
are the regression net — all green, all unmodified. ✅

## 4. RAW consensus / no trust at index time (invariant #3) — VERIFIED

- `build-document.ts` and `reindex-book.ts` import nothing trust-related. No
  `aggregateBookTagsWeighted`, no `TrustProvider`. `buildBookDocument` has no trust
  parameter by signature; raw consensus is structurally the only option.
- The static guard `apps/api/test/search/index-on-write-architecture.test.ts` is
  **real and meaningful**: it asserts the two shared modules exist and that neither
  matches `/aggregateBookTagsWeighted|TrustProvider/`. **Green (3/3).**
- The guard deliberately scopes to the two shared modules, NOT the composition
  roots (which legitimately wire `resolveTrustProvider` for the query-time rerank).
  This is correct and documented in the test + test plan §"Architecture guard scope".
- Index membership stays raw; trust remains the query-time rerank only
  (`rerank.ts` untouched — confirmed below).

## 5. The API hook (`apps/api/src/routes/tags.ts` + composition root) — VERIFIED

- `reindexBook?: (bookSlug: string) => void` added to `TagsDeps` (optional → a
  deployment without search degrades cleanly).
- Fired via `fireReindex(deps, slug)` **after `published.ok`** on **both** branches:
  - custodial (line 412): after `if (!published.ok) … 502`, using body `bookSlug`;
  - sovereign (line 424): after the same guard, using `payloadBookSlug(event)` (the
    parsed `bookTagAssertion.bookSlug` — the same canonical field the read keys on).
- **On a failed publish (502) the route returns before the hook** → no reindex on a
  failed publish (acceptance criterion). ✅
- **Best-effort:** `fireReindex` wraps the injected hook in try/catch so a
  *synchronous* throw never reaches the route (the 200 returns regardless); the
  async `reindexBook` helper swallows internally too. Fire-and-forget (`void`-ed in
  the root closure). ✅
- **Not on the ratings path:** `ratings.ts` has zero reference to `reindex`,
  `provider`, or `searchProvider` (grep clean). The `ratings-no-index.test.ts`
  control (1) passes. ✅
- **Composition root** (`apps/api/src/index.ts`): wires `reindexBook` with the
  resolved `searchProvider` (line 75) and a per-book `makeBookReader` running the
  three ADR §3-scoped reads via `queryEvents`:
  - book record `{ kinds:[39999], "#z":[booksZ], "#d":[slug], limit:1 }`
  - taxonomy `{ kinds:[39999], "#z":[tagsZ] }`
  - this book's assertions `{ kinds:[39999], "#z":[assertZ], "#a":[`39999:${lib}:${slug}`] }`
  Addresses derived from `buildBookRecordsHeaderAddress` / `buildBookTagsHeaderAddress`
  / `buildBookTagAssertionsHeaderAddress` over the **runtime-resolved**
  `config.librarianPubkey` (`asHexPubkey`) — **no hardcoded npub/hex.** A missing
  librarian short-circuits (`if (!lib) return`). ✅
- `tags-index-on-write.test.ts` (4): sovereign-fires-once, custodial-fires-once,
  fire-and-forget-throws-still-200, failed-publish-no-reindex. All green. ✅

  *(Minor, non-blocking observation: `makeBookReader(slug)` returns a zero-arg
  closure over `slug`; the helper calls `read(bookSlug)` with the same slug it was
  given, so the ignored arg is harmless. The promoter side uses the proper
  `(bookSlug) => …` reader shape.)*

## 6. The promoter hook (`apps/promoter/src/{index,main}.ts`) — VERIFIED

- `PromoterDeps.reindexBook?: (bookSlug) => Promise<void> | void` added.
- In `promoteOne`, fired **after `markDone(job, signed.id)`** (the durable contract),
  inside try/catch that logs `[index-on-write] promoter reindex … failed: …` and
  swallows → a reindex failure NEVER fails the job. ✅
- **Not on the reveal path:** `runRevealCycle`/`runRevealCommand` get no
  `reindexBook` dep (grep of `apps/promoter/src/reveal/` is clean);
  `reveal-no-index.test.ts` (1) passes. ✅
- On a failed publish the worker `markFailed`s and returns before `markDone`/the
  hook → no reindex on failed publish (worker side). ✅
- `main.ts` resolves a `SearchProvider` via `@unbnd/search resolveProvider` from
  `SEARCH_PROVIDER`/`SEARCH_URL`/`SEARCH_API_KEY` env (same as the indexer) and
  wires a proper `(bookSlug) => { local.query(...) }` reader off the worker's own
  `local` relay connection, scoped by the same three addresses over the runtime
  `librarianPubkey`. A freshly promoted book has an empty assertion set → correct
  (no tags yet). ✅
- `apps/promoter/package.json` gains `"@unbnd/search": "workspace:*"`. The
  `promoter` compose service gains `SEARCH_URL`/`SEARCH_API_KEY`/`SEARCH_PROVIDER`
  (in `docker-compose.prod.yml`). ✅
- `index-on-write.test.ts` (3): fires-once-after-promotion, no-reindex-on-failed-
  publish, reindex-failure-swallowed-promotion-completes. All green. ✅

## 7. Deletion / demotion (Q6) — VERIFIED

`reindexBook` (helper): `if (!bookEvent) return;` (missing record → no write) and
`if (!doc) return;` (junk/demoted `null` build → **no upsert AND no delete**). The
provider exposes only `deleteAll` (batch flush); stale-row removal is left to the
batch rebuild, exactly per ADR Q6. A tag-withdrawal (dispute flips net ≤ 0) yields
a **rebuilt** doc omitting the tag (not append-only) because the helper rebuilds the
*whole* doc from current consensus and re-upserts. `reindex-book.test.ts` covers
junk-null → no upsert/no delete, missing-book → no upsert, read-failure-swallowed,
provider-rejection-swallowed; `build-book-document.test.ts` covers the dispute-flip
drop. All green. ✅

## 8. The `RelayFilter` `#a` addition (the one out-of-listed-files change) — VERIFIED ADDITIVE

`packages/relay/src/types.ts` gains a single optional field `"#a"?: string[]` on
`RelayFilter` (between `authors` and `#d`). Verdict: **purely additive.**
- Optional → no existing caller is affected; no existing filter behavior changes.
- The relay `query` serializes the whole filter object straight into the REQ frame
  (`ws.send(JSON.stringify(["REQ", subId, filter]))`, `connect.ts:148`), so `#a` is
  forwarded transparently — identical mechanism to the existing `#z`/`#d` fields;
  strfry interprets `#a` as the standard NIP-01 address-tag filter.
- **Actually used:** the promoter's scoped assertion read
  (`local.query({ kinds:[39999], "#z":[assertZ], "#a":[bookAddr] })`) relies on it;
  the API side uses `queryEvents`/`NostrFilter` which already had `#a`. The promoter
  now shares `@unbnd/relay` (Story 59), so the field had to land on `RelayFilter`.
- No `@unbnd/relay` test regressed (full `pnpm -r test` green; relay typecheck
  `Done`). ✅

## 9. Package edges + scope — VERIFIED

- `@unbnd/search` → `@unbnd/schemas` (`workspace:*`) — **acyclic** (`@unbnd/schemas`
  has no `dependencies` block). Lockfile shows the edge under `packages/search`.
- `@unbnd/promoter` → `@unbnd/search` (`workspace:*`) — lockfile shows
  `'@unbnd/search': version: link:../../packages/search`. `--frozen-lockfile` clean.
- ADR 0013 architecture guard (`apps/api/test/search/architecture.test.ts`) — green
  (2/2). No Meili specifics leak; every index write goes through the neutral
  `provider.index`. The no-single-doc-delete Q6 decision specifically avoided
  touching the Meili adapter, so the guard stays trivially green.
- **No `SearchDocument` shape change** (`packages/search/src/types.ts` diff empty).
- **Batch path unchanged:** `apps/indexer/src/run-index.ts` not in the diff; the
  bulk-seed path untouched. The batch `buildSearchDocuments` keeps its signature and
  behavior (proven by unmodified regression suites).
- **No web/UI change** (`apps/web` / `packages/ui` absent from the diff).
- **No rerank change** (`rerank.ts` absent from the diff). Trust stays query-time.

## 10. Spec / ADR adherence

Every acceptance criterion maps to a passing test (test plan coverage map verified
against actual green runs): tag/genre incremental update + dispute-flip removal +
byte-identical-to-batch (parity), junk-never-indexed, promotion→new-doc-in-worker,
ratings-no-index, best-effort-failure-swallowed, no-update-on-failed-publish,
batch-unchanged, ADR 0013 guard green, typecheck/test/build green, no web/no-shape-
change. The implementation files match the ADR Implementation notes §1–§7 exactly.
DList integrity: kinds 39999 / `#z` 39998-headers / `#a` book address all correct;
librarian pubkey resolved at runtime everywhere (no hardcode). No PRD §11.3 scope
creep. No new lint/build tooling. No secrets, no leftover debug code (the
`[index-on-write] …` / `[indexer] …` logs are intentional best-effort diagnostics).

## Findings

**Blocking:** none.

**Non-blocking:**
1. Pre-existing parallel-load test flake (`submissions-promote.test.ts` and the
   Implementer-flagged `foryou.test.ts`) under the full `@unbnd/api test` run; both
   pass in isolation and on re-run. Not a Story-60 regression. Worth a future infra
   story to cap vitest concurrency or raise the per-test timeout for the heavy
   relay-mock suites.
2. The API-side `makeBookReader(slug)` returns a zero-arg closure while the helper
   calls `read(bookSlug)`; harmless (same slug), and the promoter uses the canonical
   `(bookSlug) => …` shape. Cosmetic only.

---

## Conclusion

The extraction is behavior-preserving (verbatim per-book logic + identical join
key, pinned by an unmodified regression suite and a parity test). Trust never
enters the index path (structurally + statically guarded). Both hooks are
best-effort, fire only on durable-write success, and are absent from the ratings
and reveal paths by construction. The `#a` addition is additive and correctly
forwarded. All gates — typecheck, full test, builds, frozen-lockfile, and PR #105
CI — are green. No test was weakened.

**PASS.**
