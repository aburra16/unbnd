# ADR 0059: Index-on-write — incremental, best-effort search index updates on live writes

**Status:** Accepted
**Date:** 2026-06-05
**Story:** `engineering-team/stories/60-index-on-write.md`

## Context

PRD §2.11 (Block E — Hardening, Lane 1) requires that "publishing a book/rating/tag via the API updates the search index immediately or via a near-real-time queue, instead of a batch `apps/indexer` re-run." Today the only path from a live write to search is the **batch indexer** (`apps/indexer`): an operator runs `docker compose --profile index …`, which reads the whole catalog off the relay, rebuilds every `SearchDocument`, `deleteAll()`s the index, and re-upserts the full set (`apps/indexer/src/run-index.ts` `runIndex` = `configureIndex` → `deleteAll` → batched `index`). Between batch runs, search and genre-browse are stale: a freshly applied genre tag or a freshly promoted submission does not appear until someone re-runs the batch.

This ADR closes the gap on the **live API/worker path** only. The batch indexer is untouched and remains the full-rebuild **source of truth** and the **bulk-seed** path (Story out-of-scope §1/§2).

### The real code this design must fit

- **The document builder is a pure function inside an app.** `apps/indexer/src/build-documents.ts` `buildSearchDocuments(bookEvents, taxonomyEvents, assertionEvents, currentYear)` parses each book record, skips junk via `isJunkRecord(rec, currentYear)` (`@unbnd/schemas`, Story 56 / ADR 0055), resolves applied tags via **RAW** consensus (dedup by `(author, book, tag)` keeping latest, net polarity per `(book, tag)`, drop net ≤ 0, drop `sensitivity === "accusatory"`), and emits `tags` (names) + `genreSlugs` (for `type === "genre"`). It lives in `@unbnd/indexer` (an **app**); neither `apps/api` nor `apps/promoter` depends on the indexer, so they cannot import it today.
- **The provider write surface.** `packages/search/src/types.ts` `SearchProvider` exposes `configureIndex()`, `index(docs)` (upsert by `id` = slug, idempotent), `deleteAll()`, `search(query)`. **There is NO single-document delete.** The API already holds a resolved provider (`apps/api/src/index.ts` `resolveProvider(…)`) but only the search route reads through it (`apps/api/src/routes/search.ts` calls `provider.search`).
- **The best-effort side-effect pattern.** `apps/api/src/nostr/propagate.ts` `withUpSync(localPublish, dcoslPublish, onError)` is the house pattern: do the durable local publish, gate the response on it, then — **only on local success** — fire the secondary side effect `void`-ed (never awaited, never rejects the caller), logging and swallowing every failure; a cron is the durability backstop.
- **The write paths and their verdicts** (from the story survey, confirmed in code):
  - **Tag/genre assertion** — `apps/api/src/routes/tags.ts` `POST /api/tags` (sovereign + custodial), publishes a kind-39999 `bookTagAssertion`. **Affects the doc: YES.** This is the primary trigger.
  - **Promotion** — enqueued by `apps/api/src/routes/submissions.ts` but **executed by a separate worker**, `apps/promoter` (`runPromotionCycle` → `mapSubmissionToCatalogRecord` → librarian-sign → publish under `39999:<librarian>:<slug>`). **Affects the doc: YES** (creates a new catalog document). The hook must live in the **worker**, after its durable publish — the API only enqueues.
  - **Rating** — `apps/api/src/routes/ratings.ts` `POST /api/ratings`. **Affects an indexed field: NO.** `SearchDocument` carries no rating field; ratings only feed the **query-time** trust rerank (`apps/api/src/search/rerank.ts`). **A rating write must trigger no index update.**
- **Raw-vs-weighted.** The API has an `aggregateBookTagsWeighted` (`apps/api/src/tags/aggregate.ts`) used by `GET /api/books/:slug/tags` and a `TrustProvider`. Index membership must NOT use either: CLAUDE.md invariant #3 — index membership is **raw** consensus; trust is a query-time rerank only (ADR 0035). The incremental path must match the batch builder's raw semantics exactly.

### Constraints

- ADR 0013 architecture guard (`apps/api/test/search/architecture.test.ts`) scans the whole repo and fails if any Meili HTTP specifics leak outside `packages/search/src/meili.ts`. All index-on-write writes must go through the neutral `SearchProvider` surface.
- No new lint/build/test tooling (CLAUDE.md). No new runtime dependency unless an existing one won't do.
- PRD scope: Phase 1; no new DList shape, no `SearchDocument` shape change (Story out-of-scope §3).
- Package dependency direction is acyclic today: `@unbnd/search` → (nothing), `@unbnd/schemas` → (nothing); the indexer imports `SearchDocument` from `@unbnd/search` and `isJunkRecord`/parse helpers from `@unbnd/schemas`. Any shared-home decision must keep this acyclic.

## Options considered

### Q1 — Immediate-inline-async vs. a near-real-time queue

**Option A (chosen): immediate, best-effort, inline-but-unawaited — mirror `withUpSync`.** After the durable relay publish succeeds, fire a single-doc index update `void`-ed off the critical path; log and swallow failures; never block or fail the user write. No broker, no in-process queue.

**Option B: a small in-process queue with debounce/coalescing** so a burst of assertions on one book collapses to one upsert. Pros: fewer provider calls under bursty load. Cons: introduces a queue/lifecycle/retry surface, a flush-on-shutdown concern, and ordering/coalescing logic — real complexity for a problem the current volume does not have, and the doc-build is a small scoped read plus one idempotent upsert. Over-engineering today.

**Decision: Option A.** Inline-async best-effort. Rationale: idempotent upsert-by-id means a redundant rebuild is harmless (re-upserting the same doc is a no-op for search); the batch indexer is the backstop that reconciles any dropped update; and `withUpSync` is the proven house pattern for exactly this shape. No new queue/broker — explicitly rejected as over-engineering for current write volume. Failure/retry story: there is **no inline retry**; a failed update is logged (`[index-on-write] …`) and left to the next batch rebuild (the documented backstop). If a future story shows bursty single-book churn making redundant upserts a measured cost, coalescing is an additive change behind the same shared hook.

### Q3 — Where the per-book doc builder lives (decided early because Q2/Q4 depend on it)

The constraint is **zero logic duplication**: the live doc and the batch doc must come from one implementation (acceptance criterion: byte-identical output for the same events).

**Option A (chosen): extract a pure `buildBookDocument` into `@unbnd/search`.** `@unbnd/search` already owns `SearchDocument`; it gains a `@unbnd/schemas` dependency (for `isJunkRecord` + the parse helpers it needs) — acyclic, since `@unbnd/schemas` depends on nothing. The indexer's `buildSearchDocuments` is rewritten to `map` over books calling the shared helper (proven unchanged by the indexer's existing tests staying green). The API and the promoter import `buildBookDocument` from `@unbnd/search` (the API already depends on `@unbnd/search`; the promoter gains the dep alongside its new provider — see Q2).

**Option B: a new `@unbnd/catalog-doc` package.** A dedicated home avoids growing `@unbnd/search`'s surface. Cons: a whole new workspace package, build wiring, and Docker bundling for one pure function, when `@unbnd/search` is the type's natural owner and already a shared dep of the indexer + API.

**Option C: have the API/promoter depend on `@unbnd/indexer` (the app).** Rejected: apps are not libraries; depending on an app inverts the dependency direction, drags in the indexer's relay/CLI code, and is the anti-pattern the story explicitly flags.

**Decision: Option A.** `buildBookDocument` lands in `@unbnd/search`. One implementation, consumed by all three.

### Q2 — Where the index-update hook sits

**Option A (chosen): two call sites, one shared helper.** The assertion path hooks in the API **`POST /api/tags` route**, after the durable publish; the promotion path hooks in the **promoter worker**, after `runPromotionCycle`'s durable publish. Both call ONE shared "reindex this book" function.

**Option B: fold the hook into the shared publish dependency** (`withUpSync` / the API `publish`) so any catalog-affecting publish opts in. Rejected: the API's `publish` is shared by **ratings, profile, follows, claims, shelves** — wiring the reindex there would either fire on a rating write (forbidden) or require the publish layer to inspect event kind/intent, which is the wrong layer and couples a transport primitive to search semantics. The promoter is a separate process and never touches the API `publish` anyway, so a publish-layer hook cannot serve both sites. Per-call-site placement keeps the trigger explicit: tags route reindexes, ratings route does not.

**Decision: Option A.** The route/worker decides *whether* to reindex (so ratings stay a no-op by construction); the shared helper decides *how*. See Implementation notes for exact placement and signatures.

### Q4 — Where the incremental build reads its inputs

**Option A (chosen): a scoped per-book relay read at hook time.** On a tag write the API knows the book slug; it issues a small `#z`/`#a`-scoped read for exactly that one book's record + taxonomy + that book's assertions (the same shape `tags.ts`/`rerank.ts` already use), then `buildBookDocument` → `provider.index([doc])`. On promotion the worker already holds the promoted record; it reads that book's assertions similarly.

**Option B: derive the doc from the just-published event alone.** Rejected: a single assertion event is insufficient — the doc needs the *net* consensus across all asserters for that book plus the taxonomy (for genre-type + accusatory sensitivity) plus the book record (title/format/etc.). Building from one event would diverge from the batch builder.

**Decision: Option A**, strictly scoped to one book — never a full-catalog scan. Filters in Implementation notes.

### Q5 — Raw-consensus parity

Not an option set; an invariant. The incremental path computes `genreSlugs`/`tags` from **raw** consensus (net-positive, accusatory-hidden, dedup-by-author) via the **same** `buildBookDocument` the batch uses — never `aggregateBookTagsWeighted`, never the `TrustProvider`. Parity is guaranteed structurally (one implementation) and pinned by a guard test idea (see Consequences / Implementation notes).

### Q6 — Deletion/demotion symmetry

- **Tag withdrawn (dispute flips net ≤ 0):** handled naturally. The hook rebuilds the *whole* doc from current consensus and re-upserts; a tag that fell to net ≤ 0 simply isn't in the rebuilt `tags`/`genreSlugs`. The path is not append-only (acceptance criterion). No delete needed.
- **Book becomes junk / is demoted (`buildBookDocument` returns `null`):** the `SearchProvider` has **no single-document delete** (only `deleteAll`, which is the batch-only flush). 
  - **Option A (chosen): on a `null` build result, skip — issue no upsert and no delete; log it; leave stale-row removal to the batch rebuild.** Lower risk: it requires no new provider method (no Meili specifics added, ADR 0013 guard stays trivially green) and never deletes a live row on the best-effort path.
  - **Option B: add a `deleteById` to `SearchProvider` + the Meili adapter.** Rejected for this story: it widens the provider interface and the Vespa-parity burden for a demotion path that the batch reconciles within one maintenance cycle, and a demoted/junk book lingering until the next batch is an acceptable eventual-consistency window (the same window that already exists for everything pre-this-story).

**Decision: Option A.** A `null` build → no index write (skip), logged; removal is the batch's job. This is documented as a known, bounded staleness, not a defect. (If product later needs instant removal-on-demotion, a follow-up ADR adds `deleteById` through the neutral surface.)

## Decision

We chose, across the six questions:

1. **Immediate, best-effort, inline-unawaited** single-doc upsert mirroring `withUpSync`; **no queue/broker**; the batch indexer is the backstop. No inline retry.
2. **Two hook sites, one shared helper:** the API `POST /api/tags` route (after the durable publish) and the promoter worker (after `runPromotionCycle`'s durable publish). Ratings are a no-op by construction (no hook in the ratings route).
3. **Extract `buildBookDocument` into `@unbnd/search`** (which gains a `@unbnd/schemas` dep, acyclic); the indexer reuses it; the API + promoter import it.
4. **Scoped per-book relay read** at hook time (one book's record + taxonomy + that book's assertions) — never a catalog scan.
5. **Raw-consensus parity** guaranteed by the single `buildBookDocument`; the `TrustProvider`/`aggregateBookTagsWeighted` are never consulted for index membership; a guard test pins it.
6. **No single-doc delete:** a `null` build (junk/demoted) results in skip-and-log; stale-row removal is left to the batch rebuild.

The promoter gains a resolved `SearchProvider` (via `@unbnd/search` `resolveProvider`, the same way the indexer resolves it from env) so its hook can call `index([doc])`; the `promoter` compose service gains the search env vars.

## Consequences

- **Enables:** live freshness for tag/genre applies-and-disputes and for promotions, without an operator batch run — the PRD §2.11 freshness bullet on the live path.
- **Constrains / known staleness (bounded):** a dropped best-effort update or a junk/demoted book is reconciled by the next batch rebuild, not instantly. This eventual-consistency window is explicitly accepted (and is strictly smaller than today's "stale until the next batch for *everything*").
- **New surface:** the promoter now holds a `SearchProvider` and a scoped relay read for assertions; the `promoter` compose service grows three env vars.
- **Parity guard (new test idea):** add a unit test asserting `buildSearchDocuments(books, tax, asserts)` equals `books.map(b => buildBookDocument(b, assertsForB, year)).filter(Boolean)` for a fixture set — so the two paths can never diverge. Plus a guard that the API/promoter hook code does NOT import `aggregateBookTagsWeighted` or call `TrustProvider` (keeps raw-consensus from regressing into trust-weighting at index time).
- **Affects existing fixtures?** No. The indexer's existing `build-documents`/`run-index` tests must stay green unchanged (they are the proof the extraction is behavior-preserving). New tests are added (see Implementation notes), not edited.
- **New dependency?** No new third-party package. Two new `workspace:*` edges: `@unbnd/search` → `@unbnd/schemas` (for `isJunkRecord` + parse helpers), and `@unbnd/promoter` → `@unbnd/search` (for `resolveProvider` + `buildBookDocument`). The lockfile must be regenerated (`pnpm install`) or the Docker `--frozen-lockfile` build fails (same caveat as ADR 0058).
- **PRD section change required?** No. This satisfies the existing §2.11 bullet; no PRD claim is invalidated.
- **ADR 0013 guard stays green:** every index write goes through the neutral `SearchProvider`; no Meili specifics are added anywhere (the no-single-doc-delete decision specifically avoids touching the adapter).
- **No web/UI change, no `SearchDocument` shape change, no rerank change** (Story acceptance).

## Implementation notes

### 1. Extract the pure builder into `@unbnd/search`

- File: **`packages/search/src/build-document.ts`** (new). Export a pure function:

  ```ts
  // raw consensus, accusatory-hidden, dedup-by-author — IDENTICAL to the batch.
  // returns null when the record is junk (isJunkRecord) → caller skips.
  export function buildBookDocument(
    bookEvent: SignedNostrEvent,
    taxonomyEvents: readonly SignedNostrEvent[],
    assertionEvents: readonly SignedNostrEvent[],   // assertions FOR THIS BOOK
    currentYear: number,
  ): SearchDocument | null;
  ```

  Move the per-book body of `buildSearchDocuments` here verbatim: the `parse` helper, `parseTaxonomy`, the per-book net-polarity reduction (`appliedTagsByBook` restricted to one book), the `isJunkRecord` skip (→ `return null`), and the `tags`/`genreSlugs`/field assembly. **No trust, no `aggregateBookTagsWeighted`.**
- File: `packages/search/src/index.ts` — re-export `buildBookDocument` and `SearchDocument` (already exported).
- File: `packages/search/package.json` — add `"@unbnd/schemas": "workspace:*"` to `dependencies`.
- File: `apps/indexer/src/build-documents.ts` — rewrite `buildSearchDocuments` to:
  ```ts
  const tax = taxonomyEvents;
  const byBook = groupAssertionsByBook(assertionEvents); // map slug→assertions[]
  return bookEvents
    .map((e) => buildBookDocument(e, tax, byBook.get(slugOf(e)) ?? [], currentYear))
    .filter((d): d is SearchDocument => d !== null);
  ```
  The signature and exported behavior of `buildSearchDocuments` are unchanged; the indexer's existing tests are the regression net.

### 2. The shared reindex helper (one implementation, two callers)

- File: **`packages/search/src/reindex-book.ts`** (new), or co-located in `build-document.ts`. A best-effort, never-throwing wrapper that does the scoped read → build → upsert, parameterized by an injected reader so it is unit-testable with a fake:

  ```ts
  export type BookReader = (bookSlug: string) => Promise<{
    bookEvent: SignedNostrEvent | null;
    taxonomyEvents: SignedNostrEvent[];
    assertionEvents: SignedNostrEvent[];   // for this book only (#a-scoped)
  }>;

  // Best-effort: logs `[index-on-write] …`, never throws to the caller.
  export async function reindexBook(
    provider: SearchProvider,
    read: BookReader,
    bookSlug: string,
    currentYear: number,
  ): Promise<void> {
    try {
      const { bookEvent, taxonomyEvents, assertionEvents } = await read(bookSlug);
      if (!bookEvent) return;                         // nothing to index
      const doc = buildBookDocument(bookEvent, taxonomyEvents, assertionEvents, currentYear);
      if (!doc) return;                               // junk/demoted → skip (Q6)
      await provider.index([doc]);
    } catch (err) {
      console.warn(`[index-on-write] reindex ${bookSlug} failed: ${
        err instanceof Error ? err.message : String(err)}`);
    }
  }
  ```

  This lives in `@unbnd/search`, goes through the neutral `provider.index`, and contains no backend specifics (ADR 0013 safe).

### 3. The scoped per-book read (Q4) — exact filters

The book record kind is **39999**; z-tags point at the **39998** concept headers; the assertion's book address is the `#a` value `39999:<librarian>:<slug>`. With `lib = config.librarianPubkey` (resolved at runtime, never hardcoded — CLAUDE.md):

- Book record: `{ kinds: [39999], "#z": ["39998:" + lib + ":books"], "#d": [slug], limit: 1 }`
  (equivalently `formatAddress(buildBookRecordsHeaderAddress(lib))` for the `#z` value).
- Taxonomy: `{ kinds: [39999], "#z": ["39998:" + lib + ":book-tags"] }`
  (`buildBookTagsHeaderAddress(lib)`).
- This book's assertions: `{ kinds: [39999], "#z": ["39998:" + lib + ":book-tag-assertions"], "#a": ["39999:" + lib + ":" + slug] }`
  (`buildBookTagAssertionsHeaderAddress(lib)` for `#z`, the book address for `#a`).

The `#a`-scoped assertion read is **one book** (mirrors `apps/api/src/routes/tags.ts` `GET /api/books/:slug/tags` and `rerank.ts`). No `authors:` Librarian filter beyond the `#z` header scoping. Use the API's existing `queryEvents(config, filter)` (`apps/api/src/nostr/query.ts`) as the reader on the API side, and the promoter's `local.query(...)` (`@unbnd/relay`, already used for the submission read-back) on the worker side.

### 4. API hook — `POST /api/tags` only (Q2)

- File: `apps/api/src/routes/tags.ts` `buildTagsRouter`. Add to `TagsDeps` an optional best-effort reindex hook (injected so it is testable and so a deployment without search degrades cleanly):

  ```ts
  readonly reindexBook?: (bookSlug: string) => void;  // fire-and-forget
  ```

  In `POST /api/tags`, on **both** branches, AFTER the durable publish succeeds (`published.ok`), and ONLY then, fire it unawaited — mirroring `withUpSync`'s "on local success" guard:
  - custodial branch: after `const published = await deps.publish(signed); if (!published.ok) …`, before `res.status(200)`, add `deps.reindexBook?.(bookSlug);`
  - sovereign branch: same, using the book slug parsed from the validated event's `bookTagAssertion.bookSlug` (already available via `payloadTagSlug`'s sibling — read `bookSlug` from the parsed payload). Do **not** await; the 200 returns exactly as today.
  - If `deps.publish` resolves `!ok`, the route already 502s and returns — **no reindex is attempted** (acceptance criterion: no index update on a failed publish).
- File: `apps/api/src/index.ts`. Wire the hook into `userEventDeps` (or specifically the tags router) using the resolved `searchProvider` already in scope and the existing `queryEvents`:

  ```ts
  const reindexBook = (slug: string) =>
    void reindexBook(searchProvider, makeBookReader(config), slug, new Date().getUTCFullYear());
  ```

  where `makeBookReader(config)` runs the three scoped reads of §3 via `queryEvents(config, …)`. Pass `reindexBook` into `buildTagsRouter(userEventDeps)` (extend `userEventDeps` or the tags-specific deps). **Ratings router gets no such hook** — `POST /api/ratings` stays a pure publish, satisfying the "no index write on a rating" criterion by construction.

### 5. Promoter hook + provider (Q2, Q4) — `apps/promoter`

- File: `apps/promoter/package.json` — add `"@unbnd/search": "workspace:*"` to `dependencies`.
- File: `apps/promoter/src/index.ts` `PromoterDeps` + `promoteOne`. Add an optional injected hook (keeps the loop fixture-testable with a fake):

  ```ts
  readonly reindexBook?: (bookSlug: string) => Promise<void> | void;
  ```

  In `promoteOne`, AFTER the durable publish succeeds (today: `if (!local.ok && !dcosl.ok) { markFailed…; return; }` then `markDone`), fire `await deps.reindexBook?.(job.slug);` wrapped so a reindex failure is logged and swallowed and **never** fails the job (`markDone` must still run). Placement is after `markDone` (the durable write + queue state is the contract; the index is best-effort). The book record was just built/signed in-process, but to stay byte-identical to the batch we still resolve the doc via the shared `buildBookDocument` over a scoped read of this book's assertions (an empty assertion set on a brand-new promotion is correct — a freshly promoted book has no tags yet).
- File: `apps/promoter/src/main.ts` `promote()`. Resolve a provider from env (same as the indexer) and wire the reader off the worker's `local` connection:

  ```ts
  import { resolveProvider, reindexBook, buildBookDocument } from "@unbnd/search";
  const provider = resolveProvider({
    provider: env("SEARCH_PROVIDER", "meili") as ProviderName,
    url: env("SEARCH_URL"), apiKey: env("SEARCH_API_KEY"),
  });
  const booksZ = formatAddress(buildBookRecordsHeaderAddress(librarianPubkey));
  const tagsZ = formatAddress(buildBookTagsHeaderAddress(librarianPubkey));
  const assertZ = formatAddress(buildBookTagAssertionsHeaderAddress(librarianPubkey));
  // deps.reindexBook = (slug) => reindexBook(provider, slug => ({ … via local.query … }), slug, year)
  ```

  Resolve `LIBRARIAN_PUBKEY` from env (the worker already derives `librarianPubkey` from `LIBRARIAN_NSEC`; reuse it for the address scoping). The `reveal` subcommand does NOT reindex (a reveal surfaces an accusatory tag at read-time only — not an indexed field; leave it untouched).
- File: `docker-compose.prod.yml` `promoter` service `environment:` — add:
  ```yaml
      - SEARCH_URL=http://search:7700
      - SEARCH_API_KEY=${SEARCH_API_KEY}
      - SEARCH_PROVIDER=${SEARCH_PROVIDER:-meili}
  ```
  (matching the `indexer` service block). `LIBRARIAN_PUBKEY` is already present on the promoter service. No other compose change.

### 6. Parity + no-trust guards (Q5)

- File: `packages/search/test/build-document.test.ts` (new) — unit-test `buildBookDocument`: a net-positive genre assertion yields the slug in `genreSlugs` + name in `tags`; a dispute flipping net ≤ 0 drops it; an accusatory tag is hidden; a junk record (`isJunkRecord` true) returns `null`; raw consensus only (no trust input exists in the signature — structurally enforced).
- File: an indexer-side parity test asserting `buildSearchDocuments(...)` equals mapping `buildBookDocument` over the same fixtures (so the batch and the per-book helper can never diverge).
- File: a static guard (extend the spirit of the ADR 0013 architecture test, or a small new test) asserting the index-on-write hook modules do not import `aggregateBookTagsWeighted` and do not reference a `TrustProvider` — pinning raw-consensus-at-index-time.

### 7. Best-effort error handling

Every reindex failure logs `[index-on-write] reindex <slug> failed: <message>` and is swallowed; the durable relay publish (API) / the `markDone` (promoter) is the contract and is never gated on the index write. No path awaits the index update in a way that can delay or fail the user response / the job.

## Out of scope

- Replacing or changing the batch indexer (`runIndex` + `build-documents.ts` stay the full-rebuild source of truth and bulk-seed path).
- Index-on-write on the seeder/bulk path (stays batch-then-reindex).
- A single-document delete on the provider (`deleteById`) and instant removal-on-demotion — deferred; junk/demoted removal is left to the batch rebuild (Q6). A future ADR may add `deleteById` through the neutral surface if product requires instant removal.
- A near-real-time queue / debounce-coalescing (Q1) — deferred unless measured single-book churn warrants it.
- `SearchDocument` shape changes, rating-driven index updates, trust-weighted index membership, and per-POV index state — all explicitly excluded (Story out-of-scope; CLAUDE.md invariants #1/#3).
- Any web/UI change.
