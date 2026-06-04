# ADR 0051: Populate book blurbs from Open Library

**Status:** Accepted
**Date:** 2026-06-04
**Story:** `engineering-team/stories/52-book-blurbs-openlibrary.md`

**Accepted 2026-06-04.** Backend/data only (schema + detail-page display + effective-book overlay + indexer blurb-mapping already exist). Seeder adds a pure/network-split per-work OL description fetch (`description.ts`, work-level, raw-description disk cache so re-runs don't re-hit OL), a pure `sanitizeDescription` + `capBlurb` (cap = **700**, sentence-then-word-boundary truncation, single `…`), sets the optional `blurb`. **Backfill = epoch-namespaced checkpoint (`CHECKPOINT_EPOCH` bump) + per-record content fingerprint** so a re-seed re-publishes every record once (same d-tag replace), a second run re-publishes nothing, and future imports re-publish only changed records. Fail-open fetch (8s timeout; publish without blurb on error; network errors not cached, genuine no-description cached as null). Re-index = the existing `--profile index` run (no code change). No e2e baseline change (fixture already covers `.bh-blurb`). Gate open-Qs resolved as Implementer latitude within the decision: epoch as in-file key prefix (recommended), conservative trailing-attribution stripping, cap 700.

## Context

The book detail page (PRD §5.4) renders a back-cover blurb when one is present, but the seeded catalog (~2k records) never carries one, so the block almost never appears and the page reads sparse. PRD §6.2 lists `blurb` as an optional "Description / back-cover copy" field. The story is **population only** — the `blurb` field already exists end-to-end and was verified during the survey:

- **Schema (no change).** `packages/schemas/src/BookRecord.ts` declares `blurb?: string` on `BookRecord` and `BookRecordPayload.bookSubmission`. `toBookRecordEvent` stores it in the event **`content`** (`content: record.blurb ?? ""`, line 155) and `fromBookRecordEvent` reads it back. There is no blurb tag; the blurb lives in `content`.
- **Effective-book merge (no change).** `apps/api/src/books/effective.ts` already layers a verified author's overlay blurb over the canonical librarian blurb (`OVERLAY_FIELDS` includes `"blurb"`, none-on-conflict per ADR 0033 §5). Populating the canonical blurb is the base layer.
- **Display (no change).** `apps/web/src/components/BookHeader.tsx` renders `{book.blurb && <p className="bh-blurb">…</p>}`; `.bh-blurb` is token-compliant. Empty state = block not rendered.
- **Search (re-index, not code).** `apps/indexer/src/build-documents.ts` line 89 already maps `blurb: rec.blurb` into the `SearchDocument`. Surfacing populated blurbs is a re-index, not a code change.

**The only gap is the seeder.** `apps/seeder/src/fetch.ts` pulls Open Library's **subjects API** (`/subjects/{subject}.json`), which returns title, author, cover id, first-publish year, and subjects but **no description**. `mapWorkToBookRecord` (`apps/seeder/src/openlibrary.ts`) therefore never sets `blurb`. Every seeded record has an empty `content`, and the detail page shows nothing.

### The verified pipeline (as it runs today)

`apps/seeder/src/index.ts` `main()`:

1. Publish the four kind-39998 concept headers.
2. Publish the kind-39998 tag taxonomy (`STARTER_TAXONOMY`), checkpointed by `tag:<type>:<slug>`.
3. **Collect**: for each of the 8 `SUBJECTS`, `fetchSubjectWorks(ol, perSubject)` (paginated, 100/page, 1s `pageDelayMs`, polite `User-Agent`). Dedupe into a `Map<slug, {work, genres}>`.
4. **Publish** each book: `mapWorkToBookRecord(work, booksHeader)` → `toBookRecordEvent` → `toWireTemplate` → `finalizeEvent` (librarian-signed) → `relay.publish`. Then publish baseline genre assertions. **Throttle** `RATE_MS` (default 250ms) between publishes.

The mapping (`mapWorkToBookRecord`) is **pure and synchronous — no I/O**. The OL work-detail HTTP call is new I/O that does not belong inside the pure mapper.

### The checkpoint (the backfill hazard)

`apps/seeder/src/checkpoint.ts` is a newline-delimited file of completed keys at `CHECKPOINT_PATH=/data/seed-checkpoint`, on the `seeder-data` Docker volume (`docker-compose.prod.yml` line 110). Keys are opaque strings: book slugs (`ol-ol45804w`), `tag:<type>:<slug>`, `assert:<slug>:<genre>`. `index.ts` guards every publish with `if (!checkpoint.has(key))` and `checkpoint.add(key)` on success.

The consequence for a backfill: on re-run, `checkpoint.has(slug)` is **true** for all ~2k existing records, so the book-record publish (`index.ts` lines 131–140) is **skipped entirely**. A naive re-seed would fetch zero descriptions and re-publish zero records. **Forcing re-publish without either skipping everything or blindly re-publishing all 2k unchanged records is the central design problem of this story.**

### The indexer (re-index)

`apps/indexer/src/index.ts` reads kind-39999 from the local relay by `#z` header address, builds `SearchDocument`s (blurb already mapped), and upserts them into the search provider (idempotent by `id = slug`). Run via the `index` compose profile. No indexer code change is needed.

### Constraints

- **Binding user decision:** cap to back-jacket length (cleaned + capped, truncate at a sentence/word boundary + ellipsis). NOT full-essay, NO read-more UI, NOT storing the full OL description.
- No schema, web, or design-system change. No new DList kind/tag. No catalog-size expansion (the existing ~10K story is separate; this fetch must stay composable for it).
- No new lint/build tooling. Vitest is already the seeder test runner (`apps/seeder/test/`).
- The OL `/works/{id}.json` `description` field is **either** a plain `string`, an object `{ type: "/type/text", value: string }`, **or absent**.

This story is DList-shape-touching only in that it writes more into the existing kind-39999 `content`; no new kind, d-tag, or word-wrapper shape. The pattern baseline (`concept-graph` kind 39998/39999) is unchanged and already cribbed by ADR 0008.

## Options considered

The story has five sub-decisions. Each is framed as an option set; the headline A/B is the backfill mechanism, which dominates.

### Decision 1 — Where the OL description fetch lives

#### Option 1A — Separate async enrichment step in `index.ts`, between map and publish (chosen)
Keep `mapWorkToBookRecord` pure. Add a new module `apps/seeder/src/description.ts` exporting `fetchWorkDescription(workId, opts): Promise<string | null>` (the network call + shape extraction) plus the two pure helpers `sanitizeDescription` and `capBlurb`. In `index.ts`, after `mapWorkToBookRecord` and immediately before building the event, fetch+sanitize+cap and attach to the record.

- Pros: the pure mapper stays pure and unit-testable; the network call is isolated and individually testable with a mocked `fetch`; mirrors the existing `fetch.ts` separation (network) vs `openlibrary.ts` (pure map). Composable for the future ~10K story (same `fetchWorkDescription`).
- Cons: `index.ts` grows one more `await`.

#### Option 1B — Make `mapWorkToBookRecord` async and fetch inside it
- Pros: one call site.
- Cons: pollutes the pure mapper with I/O, breaks its existing unit tests' purity, and couples mapping to network. Rejected.

#### Option 1C — Pre-fetch all descriptions in `fetch.ts` alongside the subjects pull
- Cons: the subjects API does not return work ids until after dedupe; a second pass is cleaner. Worse, it fetches descriptions for works that may map to `null` (no title/author). Rejected.

**Work vs edition (story open question 3):** fetch the **work** description only (`/works/{id}.json`). The catalog is one record per work, the subjects API gives us work keys, and edition fallback adds an extra HTTP round-trip per work for marginal coverage gain. If the work has no description, leave `blurb` unset. (Edition fallback can be a future enhancement if coverage proves too low; out of scope here.)

### Decision 2 — Sanitizer + cap (the test surface)

Two pure functions in `apps/seeder/src/description.ts`. Spec is pinned below in Implementation notes so the Tester can write tests and the Implementer can build to it.

- Option 2A (chosen): **pattern-strip** with a small set of explicit regexes, then normalize whitespace, then trim. Favors clean prose; deterministic; no markdown-parser dependency.
- Option 2B: pull in a markdown renderer + HTML-strip. Adds a runtime dependency for a job that a handful of regexes do as well, and a renderer can *introduce* artifacts (list bullets, link text). Rejected — no new dependency is justified (house rule).

### Decision 3 — The backfill checkpoint mechanism (headline decision)

#### Option A — Content-fingerprint checkpoint keyed under a bumped epoch (chosen)
Two coordinated changes:

1. **Epoch namespace.** Introduce a `CHECKPOINT_EPOCH` (integer, default `1`). The checkpoint file path becomes epoch-scoped, or each key is prefixed with the epoch. Bumping the epoch to `2` for the blurb backfill makes the seeder treat every record as not-yet-done, so the skip guard no longer suppresses re-publish. The old epoch-1 file is left intact (audit trail; safe rollback).
2. **Per-record content fingerprint.** Within an epoch, the book checkpoint key carries a short fingerprint of the published content: `book:<slug>:<fp>` where `fp` is a stable hash (e.g. `sha256` hex, first 12 chars, via `@noble/hashes` — already the transitive crypto floor) of the canonical fields that go into the event (at minimum `title|authorName|blurb|coverUrl|publishYear|subjects`). On re-run, the seeder recomputes the fingerprint; if `book:<slug>:<fp>` is already present it **skips** (truly unchanged), otherwise it **re-publishes** and records the new key. This makes the backfill idempotent *and* surgical: only records whose published content actually changed (i.e. gained or changed a blurb) re-publish; running the backfill twice re-publishes nothing the second time.

- Pros: idempotent and re-runnable (the AC's "polite + idempotent" and "backfill" criteria); does not silently skip records that need the blurb; does not needlessly re-publish the ~unchanged majority on a *second* backfill pass; no manual file surgery on the droplet; deterministic d-tag means every re-publish replaces in place (no duplicates). The fingerprint generalizes: any future field change (the ~10K expansion, a re-import per PRD §7.4) re-publishes exactly the changed records.
- Cons: more checkpoint logic than today; the epoch bump is a manual operator step (documented in the runbook). The first backfill re-publishes all 2k records once (unavoidable and correct — they all change from no-blurb to blurb-or-confirmed-none).

#### Option B — Explicit `--backfill` / `FORCE_REPUBLISH` flag that ignores the checkpoint for book records
Run-time env that bypasses `checkpoint.has(slug)` for the book-record publish only.

- Pros: simplest to implement.
- Cons: ignores the checkpoint wholesale, so it re-publishes all 2k every time it is run, and re-runs are not idempotent against OL re-fetch unless paired with a description cache. It also leaves the "did this record actually change?" question unanswered, so a future re-import has no cheap way to publish only deltas. Rejected as the primary mechanism — it is a blunt instrument that accrues operational debt. (The epoch bump in Option A is the disciplined equivalent of a one-shot force, scoped and auditable.)

#### Option C — Clear the checkpoint file (delete the seeder-data volume contents)
- Cons: destroys the resumability record; a re-seed then re-publishes everything and loses the "already done" signal for the tag taxonomy and assertions too. Heavy-handed and error-prone on the droplet. Rejected.

#### The description cache (story AC "cached so re-running does not re-fetch")
Independently of the publish checkpoint, cache the **fetched OL descriptions** so an interrupted/re-run seed does not re-hit `/works/{id}.json` for descriptions already pulled. Store a newline-delimited JSON cache at `DESC_CACHE_PATH=/data/desc-cache` (same `seeder-data` volume), keyed by `workId`, value `{ raw: string | null, at: number }` — caching the **raw** description (and the negative result `null`) so the cap/sanitizer can be re-tuned later without re-fetching. The cache is read before the network call and written after. This is orthogonal to the epoch (the epoch governs *publishing*; the cache governs *fetching*) and survives an epoch bump, so bumping the epoch does not re-hammer OL.

### Decision 4 — Re-index

No code change. After the backfill, run the existing `index` compose profile (runbook below). The indexer reads kind-39999 from the local relay and re-builds documents with the now-populated `blurb`. Upsert by `id = slug` keeps it idempotent.

### Decision 5 — Error / coverage / safety

- `blurb` stays optional. Absent / empty / whitespace-only OL description → leave `blurb` unset; publish the record without a blurb (empty state unchanged).
- A failed or slow `/works/{id}.json` fetch must **not** abort the seed or block the record: wrap the fetch in a try/catch with a bounded timeout (`AbortController`, e.g. 8s), log a warning, and publish the record with no blurb. Cache the failure as a *transient miss* (do **not** write a `null` cache entry on a network error — only cache `null` for a successful response that genuinely has no description), so the next run retries it. A genuine 404/no-description is cached as `null` and not retried.

## Decision

We chose **Option A** for the backfill (epoch-namespaced checkpoint + per-record content fingerprint), **Option 1A** for fetch placement (separate enrichment step, pure mapper untouched), and **Option 2A** for sanitization (pattern-strip, no new dependency). Work-level description only; raw-description disk cache on the existing volume; existing `index` profile for re-index; fail-open on fetch errors.

This satisfies every acceptance criterion without a schema, web, or design-system change, keeps the per-work fetch composable for the future ~10K expansion, and makes the backfill both idempotent and surgical.

## Consequences

- **Enables:** populated back-cover blurbs across the existing catalog; a reusable `fetchWorkDescription` + sanitizer + cap for the future ~10K catalog story and for PRD §7.4 periodic re-imports; a delta-aware checkpoint that re-publishes only changed records on any future re-seed.
- **Constrains / harder:** the seeder now makes one extra HTTP request per mapped work (≈ up to 8×300 = 2.4k requests, throttled by `RATE_MS` + the description cache); a full cold backfill is longer-running. The operator must bump `CHECKPOINT_EPOCH` for the backfill (documented).
- **New debt / follow-ups:** none intended. Edition-description fallback is a deliberate non-goal that can be added later behind the same `fetchWorkDescription` if coverage is low. The cap number and sanitizer rules may need one tuning pass after observing real OL output (the raw-description cache makes re-tuning cheap — no re-fetch).
- **Affects existing fixtures?** No. The visual-regression fixture `the-fixture-novel` (`apps/web/e2e/visual/fixtures/index.ts`) already carries a blurb and `book-detail.png` already pixel-covers `.bh-blurb`; the display path is already under harness coverage. **No baseline update.** Leave the e2e harness untouched (story open question 6 confirmed).
- **New dependency?** No new top-level dependency. `@noble/hashes` (the audited crypto floor, per the crypto policy / ADR 0002) is used for the content fingerprint; it is already in the transitive tree via nostr-tools. The fingerprint is a non-cryptographic use (change detection), but using the audited hash avoids hand-rolling and adds nothing new. If `@noble/hashes` is not directly importable from the seeder, use `node:crypto` `createHash("sha256")` instead — both are acceptable; no bespoke hash.
- **PRD section change required?** No. PRD §6.2 already lists `blurb` as optional; PRD §7 (catalog seeding) is satisfied and §7.4 (re-import maintenance) is reinforced.

## Implementation notes

Concrete anchors. The Implementer reads this.

### New module: `apps/seeder/src/description.ts`

Three exports — two pure (tested directly), one network.

```
// 1. Network. Work-level only. Fail-open via the caller's try/catch.
export type OLWorkDetail = { description?: string | { type?: string; value?: string } };
export async function fetchWorkDescription(
  workId: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; userAgent?: string },
): Promise<string | null>;   // returns the RAW description string, or null if absent/empty
//   GET https://openlibrary.org/works/{workId}.json
//   extract: typeof description === "string" ? description
//            : typeof description === "object" ? description.value ?? null : null
//   trim; empty/whitespace-only -> null. AbortController timeout. UA = the seeder UA.

// 2. Pure: sanitize. Unit-tested.
export function sanitizeDescription(raw: string): string;

// 3. Pure: cap. Unit-tested.
export function capBlurb(text: string, max?: number): string;  // default max = BLURB_MAX_CHARS
```

**`sanitizeDescription(raw)` rules (apply in order; pure, deterministic):**
1. Normalize newlines: `\r\n` and `\r` → `\n`.
2. Strip Markdown reference-link footnote markers in the prose, e.g. `([source][1])`, `[1]`, `[source]` inline refs — remove the bracketed footnote ref tokens.
3. Strip trailing reference-definition blocks: lines matching `^\s*\[\d+\]:\s*\S+` (e.g. `[1]: http://example.com`).
4. Strip horizontal-rule separators: lines that are only `-`, `=`, `*`, or `_` repeated (`^\s*[-=*_]{3,}\s*$`), and bare `----` runs.
5. Strip residual markdown emphasis markers (`**`, `*`, `__`, `_`) used purely for emphasis, and inline backticks. Keep the inner text.
6. Strip common OL trailing source attributions, e.g. a trailing line beginning `Source:`, `From:`, `Contains:` that is metadata not prose (conservative — only strip when it is a clearly-delimited trailing line; favor clean prose over preserving every character per story open question 2).
7. Decode the handful of HTML entities OL emits (`&amp; &lt; &gt; &quot; &#39;`).
8. Collapse runs of blank lines to a single `\n\n`, collapse intra-line runs of spaces/tabs to one space.
9. `trim()` the result.

Favor clean prose over byte-fidelity; aggressive stripping of cruft is the intended behavior. Keep each rule as its own well-named step so the Tester can target it.

**`capBlurb(text, max)` rules (pure, deterministic):**
- **Pinned cap: `BLURB_MAX_CHARS = 700`** (a module constant). Inside the story's 600–800 target; ~110–120 words, a true back-jacket length.
- If `text.length <= max`: return `text` unchanged (no ellipsis).
- Else truncate to a back-jacket cut:
  1. Take the window `text.slice(0, max)`.
  2. **Sentence boundary first:** find the last sentence terminator (`.`, `!`, `?`, optionally followed by a closing quote) within a sensible window — i.e. at or after `max * 0.6` (≈ index 420). If one exists, cut there (keep the terminator), no ellipsis needed if the cut lands on a real sentence end. (Decision: when we cut at a genuine sentence end, we still append the ellipsis to signal the blurb continues, since the source text was longer — see next bullet.)
  3. **Word boundary fallback:** otherwise cut at the last whitespace within the window (never mid-word), drop the trailing partial word.
  4. **Append the ellipsis.** Ellipsis form: a single-character `…` (U+2026), not three dots. Trim any trailing whitespace/punctuation immediately before appending so we never produce `word. …` or `word, …` — collapse to `word…` / `sentence.…` → `sentence…`.
  5. **Count the ellipsis against the cap:** the returned string length (including `…`) must be `<= max`. Reserve one char for the ellipsis when computing the cut window.
- Never split a word; never return a string longer than `max`.

### `apps/seeder/src/openlibrary.ts`
- No signature change to `mapWorkToBookRecord` (stays pure, no I/O). Optionally extract a tiny exported helper to expose `workId(work.key)` if the enrichment step needs the bare id (it already has `deriveSlug`; the bare id is `record.openLibraryId`, which is set on the mapped record — use that, no new export needed).

### `apps/seeder/src/index.ts` (the seed loop)
- In the per-book loop, after `const record = mapWorkToBookRecord(...)` and the `null` guard, before building the event:
  - Read the description cache for `record.openLibraryId`. On miss, `try { raw = await fetchWorkDescription(record.openLibraryId, { userAgent: UA, timeoutMs: 8000 }) } catch (e) { log warn; raw = null /* transient, do not cache */ }`. On a successful response, write the cache (`raw` or `null`). On a thrown error, do **not** write the cache (retry next run).
  - If `raw` is non-null: `const blurb = capBlurb(sanitizeDescription(raw)); if (blurb) record = { ...record, blurb };` (only set when non-empty after sanitize+cap).
  - Throttle the description fetch under the same politeness budget (reuse `RATE_MS`/the page delay; a `sleep(RATE_MS)` after a real network fetch — skip the sleep on a cache hit).
- Replace the book-record skip guard: compute `fp = fingerprint(record)` and gate on `book:<slug>:<fp>` (epoch-namespaced) instead of the bare `slug`. Publish + `checkpoint.add(book:<slug>:<fp>)` when the key is absent.
- Genre-assertion keys and tag keys stay as they are but get the epoch prefix too (so an epoch bump cleanly re-publishes the whole graph if ever needed; assertions are cheap and idempotent).

### `apps/seeder/src/checkpoint.ts`
- Add epoch awareness: accept an `epoch` and namespace keys (prefix `e<epoch>:` on every key, or scope the file to `${path}.e${epoch}`). Keep the existing `has`/`add`/`size` surface. Preserve backward-compat read of the legacy unprefixed file under epoch 1 if a no-debt migration is cheap; otherwise epoch 1 = legacy file unchanged and the blurb backfill runs as epoch 2.
- Read `CHECKPOINT_EPOCH` env (default `1`) in `index.ts` and thread it into `loadCheckpoint`.

### Description cache
- New tiny module or fold into `checkpoint.ts`: `loadDescCache(path)` returning `{ get(workId): {raw}|undefined, set(workId, raw|null) }`, persisted append-only as JSON lines at `DESC_CACHE_PATH=/data/desc-cache`. Add `DESC_CACHE_PATH` to the seeder env in `docker-compose.prod.yml` (defaulting under `/data`, same `seeder-data` volume — no new volume).

### Tests (Tester's surface; named so they can be planned now)
- `apps/seeder/test/description.test.ts`:
  - `fetchWorkDescription`: string shape, `{type, value}` shape, absent → null, empty/whitespace → null, HTTP error → throws (caller fails open), timeout. Inject `fetchImpl`.
  - `sanitizeDescription`: each rule above with a representative input (footnote refs, `[1]: http…` block, `----` rule, markdown emphasis, HTML entities, multiple blank lines, leading/trailing whitespace).
  - `capBlurb`: under-cap unchanged (no ellipsis), over-cap sentence-boundary cut + `…`, over-cap word-boundary fallback + `…`, never mid-word, never exceeds 700 incl. ellipsis, no `word, …` artifact.
- `apps/seeder/test/checkpoint.test.ts`: extend for epoch namespacing and the fingerprint-keyed re-publish (changed fp → not `has`; same fp → `has`).

### Operator runbook (the backfill)

On the droplet, from the compose project dir. `LIBRARIAN_NSEC` is worker-only (seeder profile) and never on the web path.

1. **Pull the fresh image (the staleness gotcha).** The seeder runs the published `:latest` (or `${UNBND_IMAGE_TAG}`) image, which goes stale on the droplet:
   `docker compose --profile seed pull seeder`
2. **Run the blurb backfill with a bumped epoch (idempotent replace).**
   `CHECKPOINT_EPOCH=2 docker compose --profile seed run --rm seeder`
   This re-publishes each existing kind-39999 record in place (same slug d-tag → replaces, no duplicates) with the populated blurb; the per-record fingerprint means a *second* run of the same epoch re-publishes nothing. The description cache (`/data/desc-cache`) means a re-run does not re-hit Open Library.
3. **Re-index so the blurbs become searchable.**
   `docker compose --profile index pull indexer` (staleness, if the indexer image changed — not required for this story)
   `docker compose --profile index run --rm indexer`
   The indexer reads kind-39999 from the local relay and upserts documents (blurb already mapped) by `id = slug`.
4. **Verify** on the live detail page: a book whose OL work has a description shows the blurb in the header; a book without one renders unchanged.

(For a fresh environment with no prior catalog, the same steps apply with `CHECKPOINT_EPOCH` unset — the epoch only matters when a prior checkpoint would otherwise skip records.)

## Out of scope

- **No schema change** — `blurb` already exists in `BookRecord` and round-trips through `content`. No new field, no new tag, no kind change.
- **No web / design-system change** — `BookHeader` already renders the blurb and the empty state; `.bh-blurb` is token-compliant.
- **No effective-book / overlay change** — the verified-author overlay (ADR 0033 §5) already layers over the canonical blurb.
- **No read-more / expander UI and no full-description storage** — capped to back-jacket length per the binding user decision.
- **No catalog-size expansion** — this is blurb population of the existing ~2k catalog. The per-work fetch built here is kept composable so the future ~10K story inherits it.
- **No edition-description fallback** — work-level only this round (can be added later behind `fetchWorkDescription`).
- **No new lint/typecheck/CI infrastructure** — Vitest already runs in the seeder.
- **No e2e baseline update** — the existing fixture already covers `.bh-blurb`.
