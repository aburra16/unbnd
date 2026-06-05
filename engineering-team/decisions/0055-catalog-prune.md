# ADR 0055: Prune catalog junk by a read-time filter, not NIP-09 deletion

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/56-catalog-prune.md`

## Context

Story 55 / ADR 0054 shipped the catalog expansion, the legitimacy gate (`apps/seeder/src/gate.ts`), and in-place enrichment. It deliberately did **not** remove the legacy records that fail the new gate: junk seeded before the gate (vanity one-offs, study guides, pamphlets, box sets, records with no cover or an out-of-range year) persists on the relay and in the app. Story 56 makes that junk stop appearing in Unbnd.

ADR 0054's "Deferred to Story 56 (prune existing junk)" subsection designed the prune as an in-protocol **NIP-09 kind-5 read→diff→delete** pass on the relay. That design carries a verified blocker (ADR 0054 §"Deletion propagation — the integration gap"): the seeder publishes to **dcosl**, but catalog data reaches the **local** strfry (the indexer's source via `STRFRY_URL`) only through the down-sync cron `/etc/cron.d/unbnd-sync` (`--dir down`), whose filter pulls **only kinds 39998/39999** (per `ops/sync-runbook.md`). A kind-5 published to dcosl never reaches the local strfry, so the indexer — which rebuilds from local relay state — would never drop the deleted book; the prune would silently no-op. Making the kind-5 prune real would require a down-sync filter change to propagate librarian kind-5, plus an unverified confirmation that the local strfry honors NIP-09 deletion on REQ (stubbed in stories 28b/30b, never exercised in this deployment).

**A gate decision re-scopes Story 56 to a read-time filter instead.** The product goal — "gate-failing junk does not appear in the app" — does not require deleting anything from the relay. It requires that junk never reach a Reader's eyes. We achieve that by reusing the Story-55 gate's conservative junk signals on the **stored** `BookRecord` at the two read sites every surface flows through: the indexer (which builds the search index) and the API (which serves every direct-relay book read). No relay deletion, no kind-5, no down-sync change, no strfry dependency, no new seeder relay capability. The blocker disappears because nothing crosses the dcosl→local-strfry boundary.

### Verified survey (read directly against source, 2026-06-05)

- **What a read-time check can see.** The stored `BookRecord` (`packages/schemas/src/BookRecord.ts`) carries `slug`, `title`, `authorName`, `coverUrl`, `publishYear`, `subjects`, `isbn13`, `isbn10`, `openLibraryId`, `language`, `pageCount`, `blurb`, `format`, `source`. It does **not** carry `edition_count` or `readinglog_count` — those are Open-Library search-doc signals consumed by the seeder gate at collect time and never persisted. So a stored-record check has **title, author, cover, publishYear** as positive junk signals; it has **no** edition-count signal. Legacy records also frequently lack `language` and `pageCount` (they predate enrichment). This is exactly ADR 0054's conservative-diff rule: absence of edition/language/pages is **not** evidence of junk.
- **The shared denylist lives in the seeder today.** `JUNK_TITLE_RE` and `EDITION_MIN` are exported from `apps/seeder/src/gate.ts`. The denylist is a pure, I/O-free regex with no seeder-only dependency, so it can move to a shared package and be imported by the seeder unchanged.
- **`@unbnd/schemas` is the common import.** `apps/seeder`, `apps/indexer`, and `apps/api` all depend on `@unbnd/schemas` (`workspace:*`), and it already owns `BookRecord` and its (de)serializers. It is the natural single home for a `BookRecord`-shaped junk oracle and the denylist.
- **The indexer build site.** `apps/indexer/src/build-documents.ts` `buildSearchDocuments()` loops `bookEvents`, calls `parse(e, fromBookRecordEvent)`, skips on parse failure (`if (!rec) continue;`), and pushes a `SearchDocument`. This is the one place documents are minted from records, and it is pure/testable. A junk record skipped here is never indexed → absent from search and genre browse.
- **The search/genre-browse read path is index-only.** `apps/api/src/routes/search.ts` (`GET /api/search`) is the sole API surface that reads the Meili index (`deps.searchProvider.search`). Genre browse is the **same route** with a `?genre=` filter (`filters: { genre }`) — there is no separate genre endpoint. Both are covered by the indexer filter and need no API change.
- **The direct-relay book reads all funnel through `parseBook`.** Every API surface that serves a catalog book off the relay reconstructs it via `parseBook` (`apps/api/src/books/effective.ts`), which wraps `fromBookRecordEvent` and returns `PublicBook | null` (null on parse failure, already dropped by every caller). The callers:
  - `routes/books.ts` — `GET /api/books/:slug` (book-detail-by-slug; 404s when no book parses), `GET /api/books` (recent/home shelf — untargeted `#z` read sorted by `created_at` desc), and `GET /api/books?slugs=` (batch hydrate).
  - `routes/homepage-shelves.ts` — hydrates the house-shelf cache's slugs.
  - `routes/foryou.ts` — hydrates the For-You ranked slugs.
  - `routes/shelves.ts` — hydrates a user's shelf membership (`/api/shelves/mine`, `/api/profile/:npub/shelves`).
  - `routes/profile-claims.ts` — hydrates a profile's claimed-book slugs.
  - `routes/author-edits.ts` — read-back of a single edited book.
  `parseBook`'s `PublicBook` projection (`Pick<BookRecord, …>`) includes `title`, `authorName`, `coverUrl`, `publishYear` — every field the junk oracle reads. So `parseBook` is the **single choke point** for the API filter: a junk-returns-null there drops junk from all seven callers at once, with no per-route edits.
- **The flush capability already exists.** ADR 0013's `SearchProvider` interface declares `deleteAll(): Promise<void>` ("Drop all documents (for a clean re-index)"), implemented in `packages/search/src/meili.ts` (`DELETE /indexes/books/documents`, tolerant of 404). The indexer's `main()` calls `provider.configureIndex()` then upserts batches; it does **not** call `deleteAll()` today, so an already-indexed junk doc would linger across a re-index.

### Constraints that bind this design

- **Quality bar** (`memory/feedback_unbnd_quality_bar.md`): no shortcuts, no tech-or-product debt. The single hardest line here is **ONE denylist, not two** — the read-time oracle must reuse the *exact* `JUNK_TITLE_RE`, and `gate.ts` must import it from the shared home rather than the two diverging independently.
- **No hand-rolled crypto** — n/a; this ADR signs nothing, publishes nothing, deletes nothing.
- **No schema change** — the oracle reads existing `BookRecord` fields; nothing is added to the type or its serialization.
- **POV-first / decentralized-first (CLAUDE.md invariants):** the junk oracle is **not** a trust or popularity judgement and is **not** per-POV. It is a structural integrity check ("is this a real catalog record") computed identically for every observer — the same class of global, POV-independent validity check `parseBook` already performs when it drops a record that fails to parse. It never reads ratings, trust, or readership, so it does not violate the "filter trust at view time, per POV" rule (there is no trust here to filter).
- **No new dependency, no new tooling** — Vitest already runs in seeder, indexer, and the schemas package; the oracle is pure TS.
- **No AI-slop** in any string this work authors (`memory/feedback_unbnd_copy_and_visual.md`): the one new log line is reviewed against it.

## Options considered

### Option A — Read-time junk filter, shared oracle in `@unbnd/schemas`, applied at the indexer build and in `parseBook` (CHOSEN)

A pure `isJunkRecord(book: BookRecord, currentYear: number): boolean` lives in `@unbnd/schemas` alongside `BookRecord`. `JUNK_TITLE_RE` moves there too; `apps/seeder/src/gate.ts` re-exports/imports it so there is one denylist. The indexer's `build-documents` skips junk records (never indexed). `parseBook` returns `null` for junk (drops junk from all seven direct-relay surfaces, and makes the detail page 404). A flushed re-index drops already-indexed junk.

- **Pros:** No relay deletion, no kind-5, no down-sync change, no strfry dependency — the ADR-0054 blocker is gone. Reversible (junk stays on the relay; relaxing the oracle restores it). One denylist, one oracle, two call sites — internally consistent by construction. Reuses the existing `deleteAll()` flush. No schema change, no new dependency, no new seeder capability. `parseBook` is a single choke point, so the API change is one function, not seven routes.
- **Cons:** Junk is **invisible in-app but still on the relay** — a raw REQ to dcosl (outside Unbnd) still returns it. This is weaker than hard-deletion for an actor querying the relay directly, but the product goal is the in-app catalog, and nothing in Unbnd's surfaces is fed by a raw external REQ. The oracle runs on every read (indexer build + every `parseBook`); it is O(1) per record (a few field checks + one regex) and negligible. Already-indexed junk persists until one flushed re-index runs (a runbook step, same flush ADR 0054 already prescribes).

### Option B — NIP-09 kind-5 hard-delete on the relay (the ADR-0054 deferred design)

Read the librarian's kind-39999 book records, re-gate on stored fields, publish a kind-5 (`e`-tag) for each positive junk record through the librarian signing path; the indexer's whole-set rebuild drops what the relay suppresses.

- **Pros:** Removes junk from the protocol layer, not just the app — a raw relay query no longer returns it. In-protocol and auditable.
- **Cons:** Blocked on the verified integration gap (down-sync pulls only 39998/39999, so kind-5 never reaches the local strfry) **and** on unverified local-strfry NIP-09-on-REQ honoring (stubbed in 28b/30b). Shipping it requires a down-sync filter change, an operator droplet verification gating the build, a new seeder relay-read capability (`read.ts`), a kind-5 publish path, and a `prune:<eventId>` checkpoint namespace — materially more surface and more ops risk for the same in-app outcome. Irreversible per record (a deleted event is gone). **Rejected** by the gate decision: the read-time filter reaches the same in-app result with far less machinery and no unverified dependency.

### Option C — Wipe and re-seed the catalog from empty

Delete the librarian's records wholesale and re-run the seeder so only gated records exist.

- **Cons:** Destroys enrichment, claims, ratings, shelves, and overlays keyed to existing slugs; loses the audit trail; is the heaviest possible operation for a junk subset. Contradicts the conservative "remove only positive-junk" posture. **Rejected.**

## Decision

We choose **Option A**: a read-time junk filter with a single shared oracle.

### 1. The shared junk oracle (single source of truth)

**Home:** `packages/schemas/src/BookRecord.ts` (exported via `@unbnd/schemas`), alongside `BookRecord` and its (de)serializers. All three consumers (`seeder`, `indexer`, `api`) already import `@unbnd/schemas`, so this is the one place none of them duplicates.

**The denylist moves here.** `JUNK_TITLE_RE` is relocated from `apps/seeder/src/gate.ts` to `@unbnd/schemas` and exported. `apps/seeder/src/gate.ts` is refactored to **import** `JUNK_TITLE_RE` from `@unbnd/schemas` and re-export it (so its existing `export const JUNK_TITLE_RE` surface and its tests keep working) — the regex is defined **once**. `EDITION_MIN` stays in `gate.ts` (it is a search-doc-only signal; the stored-record oracle never uses it). `gate.ts`'s `gateWork`/`gateReason` behavior is unchanged byte-for-byte; only the source of the regex constant moves.

**The oracle (exported names):**

```ts
// packages/schemas/src/BookRecord.ts

/** The junk-title denylist (ADR 0054 §2), case-insensitive and segment-anchored.
 *  The SINGLE definition: apps/seeder/src/gate.ts imports it from here. */
export const JUNK_TITLE_RE =
  /(?:^|[\s:(\[]|\s-\s)(?:summary of\b|study guide\b|workbook\b|sparknotes\b|cliffs?\s*notes\b|omnibus\b|box\s?set\b|boxed set\b)/i;

/** The earliest publish year a real catalog record admits (ADR 0054 §2). */
const RECORD_YEAR_MIN = 1800;

/**
 * True iff a STORED book record is positively junk — i.e. it fails a legitimacy
 * signal that is observable on the stored fields. Pure, deterministic, no I/O.
 * `currentYear` is injected so the function stays pure and tests pin a year.
 *
 * Conservative by design (ADR 0054's "absence is not evidence" rule): it fires
 * ONLY on positive junk evidence and NEVER on a missing edition_count / language
 * / pageCount — legacy records lack those and absence does not make a record junk.
 */
export function isJunkRecord(book: BookRecord, currentYear: number): boolean {
  if (!book.title?.trim()) return true;                       // missing/empty title
  if (!book.authorName?.trim()) return true;                  // missing/empty author
  if (!book.coverUrl?.trim()) return true;                    // missing cover
  if (JUNK_TITLE_RE.test(book.title)) return true;            // junk-denylist title
  const y = book.publishYear;                                 // out-of-range year
  if (typeof y === "number" && (y < RECORD_YEAR_MIN || y > currentYear)) return true;
  return false;                                               // otherwise: keep
}
```

Signal-by-signal correspondence to the Story-55 gate, and the deliberate differences (because the oracle reads a *stored record*, not a *search doc*):

- **title** — positive: empty/missing → junk. (Same as gate.)
- **author** — positive: empty/missing → junk. (Same as gate.)
- **cover** — positive: missing `coverUrl` → junk. (The gate checks `cover_i`; the stored equivalent is `coverUrl`.)
- **denylist** — positive: `JUNK_TITLE_RE.test(title)` → junk. The **exact** shared regex. (Same as gate.)
- **year** — positive: a `publishYear` **present** and `< 1800` or `> currentYear` → junk. **Absent year is NOT junk** here. (The gate fails an absent year because a fresh OL search doc always carries one; a legacy stored record may legitimately lack it, and absence is not positive evidence — ADR 0054's conservative rule.)
- **editions / language / pages — deliberately NOT checked.** `edition_count` is not stored at all. `language` and `pageCount` are absent on legacy records; absence is not evidence. Checking them would over-delete plausibly-legitimate legacy records, violating the conservative rule. The four positive signals above remove the structural junk; the stored-field oracle does not attempt the edition floor.

This is the **single oracle** used at both the indexer and the API, so the app is internally consistent (§6).

### 2. The indexer filter (primary site)

In `apps/indexer/src/build-documents.ts` `buildSearchDocuments()`, after the existing parse guard, skip junk:

```ts
for (const e of bookEvents) {
  const rec = parse(e, fromBookRecordEvent);
  if (!rec) continue;                              // existing: unparseable
  if (isJunkRecord(rec, currentYear)) {            // NEW: positive junk → never indexed
    skipped++;
    continue;
  }
  // … build + push SearchDocument …
}
```

`currentYear` is threaded in from `buildSearchDocuments`'s caller (`apps/indexer/src/index.ts`, `new Date().getUTCFullYear()`) so `build-documents` stays pure and the Tester pins a year. The skip is **counted** and logged once at the end of the build (e.g. `[indexer] skipped N junk records`), so the operator can see how many the prune removed. A junk record skipped here is never indexed → absent from `/api/search` and from genre browse (same route, `?genre=` filter). This is the primary site: it covers every index-backed surface with no API change.

### 3. The API read-path filter (one choke point)

Apply `isJunkRecord` inside `parseBook` (`apps/api/src/books/effective.ts`): after `fromBookRecordEvent` yields the record, return `null` when `isJunkRecord(record, currentYear)` is true, **before** projecting to `PublicBook`. Because every direct-relay book surface already calls `parseBook` and already drops its `null`s, this single edit filters junk from all of them at once:

| Read path | Route | Effect of the `parseBook` filter |
|---|---|---|
| Recent / home shelf | `GET /api/books` (books.ts) | junk no longer appears in "recent" |
| Book detail by slug | `GET /api/books/:slug` (books.ts) | **404** — the route already 404s when no book parses; a junk slug now parses to `null` → `not_found` |
| Batch hydrate | `GET /api/books?slugs=` (books.ts) | a junk slug is skipped from the returned set |
| House shelves | `GET /api/homepage/shelves` (homepage-shelves.ts) | a junk slug drops from hydration (already drops unresolved slugs) |
| For-You | `GET /api/foryou` (foryou.ts) | a junk slug drops from hydration |
| User shelves | `/api/shelves/mine`, `/api/profile/:npub/shelves` (shelves.ts) | a junk slug drops; the shelf count recounts to survivors (existing AC-2 behavior) |
| Claimed books | `GET /api/profile/:npub/claimed-books` (profile-claims.ts) | a junk slug drops |
| Author-edit read-back | `apps/api/src/routes/author-edits.ts` | a junk slug parses to `null` (no effective book) |

`currentYear` is injected into `parseBook` (a defaulted parameter, `new Date().getUTCFullYear()`, overridable in tests) so it stays pure and deterministic under test.

**Already index-covered (NO API change):** `GET /api/search` (search.ts), including genre browse via `?genre=`. These read the Meili index, which the indexer filter (§2) already cleansed. They never call `parseBook` and need no change.

**Book-detail behavior decision — 404 (chosen over a soft "hidden" page).** A junk record is, by the oracle's definition, not a legitimate catalog entry; there is no honest detail page to render for it. Returning `404 not_found` is consistent with the route's existing contract (it already 404s for an absent/unparseable slug), keeps the API's notion of "a book exists" identical to "the catalog surfaces it," and avoids a second, softer hidden-but-reachable state to reason about. The web's existing 404 handling for a missing slug applies unchanged. (No web change is needed: the route already returns 404 and the web already handles it.)

### 4. Flush + re-index

The indexer **upserts** (it never clears the index first), so a junk document indexed before this change lingers across a plain re-run even though §2 now skips it on rebuild. The fix uses the **already-declared** `SearchProvider.deleteAll()` (ADR 0013; implemented in `meili.ts`).

**Decision: a one-line indexer code change — call `provider.deleteAll()` once before the upsert sweep**, so a normal `--profile index` run is self-cleaning and a stale junk doc cannot survive a re-index. This is preferable to a runbook-only flush because it removes a manual step the operator could forget, and it makes "re-index" mean "rebuild from the current live, filtered set" unconditionally — which is the honest contract for an index that mirrors relay state. Concretely, in `apps/indexer/src/index.ts` `main()`:

```ts
await provider.configureIndex();
await provider.deleteAll();          // NEW: clean rebuild — drop any stale/junk doc first
for (let i = 0; i < docs.length; i += BATCH) { … }
```

`deleteAll()` already tolerates a 404 (empty/new index), so a first-ever run is unaffected. After this, the re-index is naturally idempotent and the rebuild reflects exactly the current filtered set. No runbook flush step is required (the indexer does it); ADR 0054's "flush-before-rebuild" note is now satisfied in code.

### 5. Operator runbook (design level)

The deploy is the **already-built** indexer and api images carrying §2 and §3; there is **no seeder re-run** and **no relay change**.

1. Deploy the new `indexer` and `api` images (the standard image bump; `web` unchanged).
2. Re-index once: `docker compose -f docker-compose.prod.yml --profile index run --rm indexer`. With §4, the run flushes then rebuilds from the filtered live set — already-indexed junk is dropped, new builds skip junk.
3. Verify (operator-observable): junk titles no longer appear in search or genre browse; a known junk slug's detail page returns 404; "recent" on the home shelf carries no junk; the indexer log reports the skipped-junk count.

No `--profile seed` run, no `CHECKPOINT_EPOCH` bump, no down-sync filter change, no kind-5, no strfry verification. The relay state is untouched.

### 6. Idempotency / consistency

The oracle is **pure and stateless** — no checkpoint, no `prune:<eventId>` namespace (those belonged to the deleted-design). Re-running the indexer is naturally idempotent (flush + rebuild from the same live set yields the same documents). The **same** `isJunkRecord` from `@unbnd/schemas` is the single oracle at both the indexer build (§2) and the API `parseBook` (§3), so a record judged junk is invisible on every surface — index-backed and direct-relay alike — with no possibility of one site keeping what the other drops.

## Consequences

- **Enables:** gate-failing legacy junk vanishes from every in-app surface (search, genre browse, recent/home, book detail, shelves, For-You, claimed books) after a single re-index of the deployed images. One shared denylist and one shared oracle across seeder, indexer, and api.
- **Constrains / makes harder:** the oracle runs on every read site; it is O(1) per record and negligible. The book-detail page now 404s for a junk slug (intended). `parseBook` becomes time-aware (an injected `currentYear`), a small purity-preserving change.
- **New debt / follow-ups:** **Junk persists on the relay** (dcosl) — invisible in-app, but a raw external REQ still returns it. This is the deliberate, recorded weakness versus hard-deletion (see Risks). If a future requirement needs protocol-level removal, the ADR-0054 kind-5 design is preserved there and can be revived once the down-sync/strfry gap is closed. The stored-field oracle is intentionally weaker than the full search-doc gate (no edition floor on legacy records); a future epoch that backfills the full signals onto every record could tighten it.
- **Affects existing fixtures?** Seeder unit tests only at the boundary: `apps/seeder/test/gate.test.ts` still imports `JUNK_TITLE_RE` (now re-exported from `gate.ts`, sourced from `@unbnd/schemas`) — its assertions are unchanged. New test surfaces: `isJunkRecord` unit tests in the schemas package (each positive signal; the conservative absence-≠-junk cases for year/language/pages/editions; the all-pass keeper; the shared-denylist hits), the indexer build skip + count, and the `parseBook` null-on-junk behavior. No web/e2e/visual fixture changes (no UI change).
- **New dependency?** No. Pure TS; Vitest already runs in all three packages.
- **PRD section change required?** No. PRD §4 (catalog quality) and §7.4 (re-import maintenance) are advanced; no §11.3 out-of-scope item is touched.

## Implementation notes

Concrete anchors. The Architect is read-only on source; these are targets for the Implementer.

- **Edit: `packages/schemas/src/BookRecord.ts`** — add `export const JUNK_TITLE_RE` (moved verbatim from the seeder gate) and `export function isJunkRecord(book, currentYear)` (§1). Pure, no I/O. Re-exported through `@unbnd/schemas` (the package already `export *`s `BookRecord`).
- **Edit: `apps/seeder/src/gate.ts`** — remove the local `JUNK_TITLE_RE` definition; `import { JUNK_TITLE_RE } from "@unbnd/schemas"` and `export` it (keep the public name so `gate.test.ts` and `gateReason` are unchanged). `EDITION_MIN`, `gateWork`, `gateReason` behavior unchanged. **One denylist, not two.**
- **Edit: `apps/indexer/src/build-documents.ts`** — thread `currentYear` into `buildSearchDocuments`; after the parse guard, `if (isJunkRecord(rec, currentYear)) { skipped++; continue; }`; return/log the skipped count. **Edit: `apps/indexer/src/index.ts`** — pass `new Date().getUTCFullYear()` into the build; add `await provider.deleteAll();` after `configureIndex()` and before the upsert loop (§4); log the skipped-junk count.
- **Edit: `apps/api/src/books/effective.ts`** — in `parseBook`, after `fromBookRecordEvent`, `if (isJunkRecord(record, currentYear)) return null;` before `toPublicBook`; add a defaulted `currentYear = new Date().getUTCFullYear()` param. No route edits — the seven direct-relay surfaces inherit the filter through `parseBook`.
- **No edit: `apps/api/src/routes/search.ts`** — index-covered.
- **No edit: `packages/search/*`** — `deleteAll()` already exists (ADR 0013, `meili.ts`).
- **No edit: `packages/schemas` serializers** — no schema change; the oracle reads existing fields.
- **Tests (Tester's surface):** `isJunkRecord` per-signal (empty title/author/cover → junk; denylist title → junk; present out-of-range year → junk; **absent** year/language/pageCount/edition → keep; full record → keep), all sharing the moved `JUNK_TITLE_RE`; indexer build skips junk and counts it; `parseBook` returns null for junk (so `/api/books/:slug` 404s); the seeder gate's `JUNK_TITLE_RE` is the imported one (no behavior change).

## Out of scope

- **No relay deletion / no kind-5 / no NIP-09 pass** — junk stays on the relay, invisible in-app.
- **No down-sync filter change / no strfry dependency / no local-strfry NIP-09 verification** — the dcosl→local-strfry boundary is never crossed.
- **No seeder re-run / no re-seed / no `CHECKPOINT_EPOCH` bump** — the seeder is untouched at runtime (only the import-source of `JUNK_TITLE_RE` moves).
- **No gate re-tuning** — `EDITION_MIN`, the gate signals, and the denylist contents are unchanged; only the denylist's *home* moves.
- **No web / design-system change** — the book detail already 404s and the web already handles it; no string or token change.
- **No popularity-based filtering** — the oracle reads no rating/readership signal; it fires only on positive structural junk evidence.
- **No bespoke crypto** — this ADR signs/publishes/deletes nothing.
