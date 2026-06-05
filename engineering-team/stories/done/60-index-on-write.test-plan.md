# Test Plan: Story 60 — Index-on-write (incremental, best-effort search index updates on live writes)

**Story:** `engineering-team/stories/done/60-index-on-write.md`
**ADR:** `engineering-team/decisions/0059-index-on-write.md`
**Date:** 2026-06-05
**Branch:** `story-60-index-on-write`
**Baseline commit:** `e7bfb14`

## Summary

This red set pins ADR 0059 exactly: the extracted pure builder `buildBookDocument`
in `@unbnd/search`, the raw-consensus parity that locks the extraction, the
shared best-effort `reindexBook` helper, the two hook sites (API `POST /api/tags`
and the promoter worker), the two no-op controls (ratings, reveal), and the
static no-trust-at-index-time guard. All provider/relay/network deps are
injected/mocked — no real I/O, no real keys.

The existing indexer regression suites
(`apps/indexer/test/build-documents.test.ts`,
`apps/indexer/test/build-documents-junk.test.ts`) are the proof the extraction is
behavior-preserving and are **not modified** (ADR 0059 Consequences). They stay
green.

## Signatures pinned from ADR 0059

| Symbol | Package / file (ADR-pinned home) | Signature |
|---|---|---|
| `buildBookDocument` | `@unbnd/search` — `packages/search/src/build-document.ts` (§1) | `(bookEvent, taxonomyEvents, assertionEventsForBook, currentYear) => SearchDocument \| null` |
| `BookReader` | `@unbnd/search` — `packages/search/src/reindex-book.ts` (§2) | `(bookSlug: string) => Promise<{ bookEvent: SignedNostrEvent \| null; taxonomyEvents: SignedNostrEvent[]; assertionEvents: SignedNostrEvent[] }>` |
| `reindexBook` | `@unbnd/search` — `packages/search/src/reindex-book.ts` (§2) | `(provider: SearchProvider, read: BookReader, bookSlug: string, currentYear: number) => Promise<void>` (best-effort, never throws) |
| `TagsDeps.reindexBook?` | `apps/api/src/routes/tags.ts` (§4) | `(bookSlug: string) => void` (fire-and-forget; fired after `published.ok` on both branches) |
| `PromoterDeps.reindexBook?` | `apps/promoter/src/index.ts` (§5) | `(bookSlug: string) => Promise<void> \| void` (fired after `markDone`, try/catch-swallowed) |

## Coverage map (AC → test)

| Acceptance criterion (story) | Test name | Test file | Level |
|---|---|---|---|
| Tag/genre → incremental update; net-positive genre surfaces in `tags`/`genreSlugs` | `it("returns a SearchDocument carrying net-positive non-accusatory tags + genre slugs and the book's fields")` | `apps/indexer/test/build-book-document.test.ts` | unit |
| Dispute flips net ≤ 0 → tag/genre **removed** (not append-only) | `it("drops a tag/genre whose disputes cancel its applies")` | `apps/indexer/test/build-book-document.test.ts` | unit |
| Incremental doc **byte-identical** to batch (reuse, not reimplement; raw consensus) | `it("the batch builder and the per-book helper produce the same docs for the same events")` + `it("a junk book is dropped identically by both paths")` | `apps/indexer/test/parity.test.ts` | unit |
| Junk never indexed on write (`isJunkRecord` honored) | `it("returns null for a denylist-title book")` + `it("returns null for an out-of-range future publishYear")` | `apps/indexer/test/build-book-document.test.ts` | unit |
| Single-doc upsert through the `@unbnd/search` provider (the HOW) | `it("reads the book, builds the doc, and upserts exactly one doc through provider.index")` | `apps/indexer/test/reindex-book.test.ts` | unit |
| Junk/demoted (`null` build) → no upsert AND no delete (Q6) | `it("a junk record (buildBookDocument null) issues NO index upsert and NO delete")` + `it("a missing book (bookEvent null) issues NO index upsert")` | `apps/indexer/test/reindex-book.test.ts` | unit |
| Tag write → exactly one reindex for that book (sovereign + custodial) | `it("sovereign: a successful assertion write fires reindexBook once for that book slug")` + `it("custodial: a successful server-signed assertion fires reindexBook once for that book slug")` | `apps/api/test/routes/tags-index-on-write.test.ts` | route |
| Best-effort off critical path: failure swallowed, 200 still returned | `it("the hook is fire-and-forget: the 200 returns even if reindexBook throws synchronously")` (route) + `it("a provider.index rejection does not throw to the caller")` + `it("a read failure does not throw to the caller and issues no upsert")` (helper) | `apps/api/test/routes/tags-index-on-write.test.ts`, `apps/indexer/test/reindex-book.test.ts` | route + unit |
| Failed publish → no index update attempted (on-local-success guard) | `it("a FAILED publish (502) fires NO reindex (mirrors withUpSync's on-local-success guard)")` | `apps/api/test/routes/tags-index-on-write.test.ts` | route |
| Ratings do not touch the index (provider write surface not called) | `it("a successful sovereign rating publish never invokes a reindex hook")` | `apps/api/test/routes/ratings-no-index.test.ts` | route (control) |
| Promotion → new book document, upserted after the durable publish, in the worker | `it("fires reindexBook once for the promoted slug after a successful promotion")` | `apps/promoter/test/index-on-write.test.ts` | worker |
| Promotion: no reindex on failed publish; reindex failure never fails the job | `it("fires NO reindex when the publish fails")` + `it("a reindex failure is swallowed: the promotion still completes")` | `apps/promoter/test/index-on-write.test.ts` | worker |
| Reveal does NOT reindex (read-time only) | `it("a completed reveal never invokes a reindex hook")` | `apps/promoter/test/reveal-no-index.test.ts` | worker (control) |
| Index membership stays RAW consensus — no trust-weighting at index time (CLAUDE.md #3) | `it("the shared index-on-write modules exist (extraction landed)")` + `it("no shared index-on-write module imports the trust-weighted aggregator or a TrustProvider")` + `it("the extracted builder does NOT reference trust weighting")` | `apps/api/test/search/index-on-write-architecture.test.ts` | architecture |
| Batch indexer unchanged; existing build-documents tests stay green | (no new test — the existing `build-documents.test.ts` + `build-documents-junk.test.ts` + `flush-before-upsert.test.ts` are the regression proof, unmodified) | `apps/indexer/test/*` | regression |
| ADR 0013 guard stays green (all writes via the neutral provider) | (existing `architecture.test.ts`, unmodified, stays green) | `apps/api/test/search/architecture.test.ts` | regression |

## Edge cases covered

- [x] A clean book with **no assertions** still builds (empty `tags`/`genreSlugs`).
- [x] Accusatory-sensitivity tag is excluded from `tags` and `genreSlugs`.
- [x] `currentYear` injected (deterministic out-of-range-year junk).
- [x] Provider `index` rejection swallowed; read failure swallowed.
- [x] Missing book (`bookEvent` null) → no upsert.
- [x] Failed publish → no reindex (API + promoter).
- [x] Order-insensitive doc-set equality in the parity test (sort-by-id).

## Test infrastructure & key implementation notes (flag for the Implementer)

- **Runner:** Vitest (workspace default). No new framework.
- **No I/O / no real keys.** The API tests use `supertest` + injected `vi.fn` deps
  (the house DI pattern); the promoter tests inject fake queue/sign/publish deps
  (mirrors `consume-loop.test.ts` / `reveal-cycle.test.ts`); the helper test uses
  a fake `SearchProvider` and a fake `BookReader`. Fixtures are synthetic events
  built via `@unbnd/schemas` builders + ephemeral `nostr-tools` keypairs (no real
  pubkeys beyond the existing `LIB = "1"*63+"a"` test fixture).

- **Opaque-loader pattern (why the new indexer tests live where they do).**
  ADR 0059 §6 pins the canonical home for the `buildBookDocument` /`reindexBook`
  unit tests at `packages/search/test/`. They cannot be RED there today: ADR 0059
  Q3/Consequences add the `@unbnd/search` → `@unbnd/schemas` workspace dep edge,
  which does **not exist yet**, so `@unbnd/schemas` does not resolve from
  `packages/search` until the Implementer adds the dep + regenerates the lockfile
  (`pnpm install`, the ADR 0058 caveat). `apps/indexer` already depends on BOTH
  `@unbnd/search` and `@unbnd/schemas`, so the contract is pinned RED there at the
  assertion level for now. The not-yet-present `@unbnd/search` exports are imported
  via a runtime-computed specifier (`apps/indexer/test/_load-search.ts`, mirroring
  the existing `apps/indexer/test/_load.ts`) so the missing export fails at the
  **assertion** level (`buildBookDocument is not a function`), not as a tsc TS2305
  wall. **Implementer action:** once the dep edge lands, move
  `build-book-document.test.ts` + `reindex-book.test.ts` to
  `packages/search/test/{build-document,reindex-book}.test.ts` and flip the opaque
  import to a static `import { buildBookDocument, reindexBook } from "../src/index"`.
  `apps/indexer/test/parity.test.ts` stays in the indexer (it needs the indexer's
  `buildSearchDocuments`).

- **The injected hook seams (assumed; pinned to the ADR — confirm shape).**
  - API: `TagsDeps.reindexBook?: (bookSlug: string) => void` — fired unawaited
    after `published.ok` on BOTH branches (custodial: body `bookSlug`; sovereign:
    parsed payload `bookTagAssertion.bookSlug`). The route only decides *whether*;
    the closure wired in `apps/api/src/index.ts` (`reindexBook(searchProvider,
    makeBookReader(config), slug, year)`) decides *how*.
  - Promoter: `PromoterDeps.reindexBook?: (bookSlug: string) => Promise<void> | void`
    — fired after `markDone(job, signed.id)` inside a try/catch that logs +
    swallows, so the job stays done. Driven through the exported
    `runPromotionCycle` (since `promoteOne` is module-private).
  Both are injected as `vi.fn` via an `as TagsDeps`/`as PromoterDeps` cast so the
  not-yet-present optional property is not a tsc excess-property error.

- **Architecture guard scope (deliberate; flag).** The no-trust guard scans ONLY
  the two shared modules (`packages/search/src/build-document.ts`,
  `reindex-book.ts`) — NOT the composition roots (`apps/api/src/index.ts`,
  `apps/promoter/src/main.ts`). Those roots legitimately wire a trust provider for
  the query-time rerank (`resolveTrustProvider`), which would be a false positive
  under a whole-file scan. CLAUDE.md #3's index-membership invariant lives entirely
  in the two shared modules (`buildBookDocument` has no trust param by signature;
  `reindexBook` only calls the builder + the neutral provider).

## How to run

```
pnpm --filter @unbnd/search test
pnpm --filter @unbnd/api test
pnpm --filter @unbnd/promoter test
pnpm --filter @unbnd/indexer test
pnpm -r typecheck
pnpm -r test
```

## Verification (RED for the right reason)

Confirmed on 2026-06-05 at baseline commit `e7bfb14`:

- **`pnpm -r typecheck`: CLEAN** (all 12 projects `Done`). The opaque-loader +
  `as` casts keep the not-yet-present exports/props invisible to tsc, so the red
  set is assertion-level, not a compiler wall.

- **`@unbnd/indexer`:** new files RED at the assertion level —
  `build-book-document.test.ts` (5 fail: `buildBookDocument is not a function`),
  `parity.test.ts` (2 fail: same), `reindex-book.test.ts` (5 fail:
  `reindexBook is not a function`). Existing regression suites GREEN:
  `build-documents.test.ts` (3), `build-documents-junk.test.ts` (5),
  `flush-before-upsert.test.ts` (3), `relay.test.ts` (3).

- **`@unbnd/api`:** `tags-index-on-write.test.ts` — 3 fail (reindex hook not
  wired: "expected reindexBook to be called once") + 1 pass (the failed-publish
  no-reindex guard, vacuously green now). `index-on-write-architecture.test.ts` —
  2 fail (shared modules don't exist yet) + 1 pass (vacuous trust-token scan).
  `ratings-no-index.test.ts` — GREEN (the ratings control). All 87 other API
  suites GREEN (existing `tags.test.ts`, `ratings.test.ts`, `architecture.test.ts`
  unaffected).

- **`@unbnd/promoter`:** `index-on-write.test.ts` — 2 fail (reindex spy not called)
  + 1 pass (no-reindex-on-failed-publish guard, vacuously green now).
  `reveal-no-index.test.ts` — GREEN (the reveal control). All 6 existing promoter
  suites GREEN (`consume-loop.test.ts`, `reveal-cycle.test.ts`, etc.).

All failures are assertion-level (missing export / unimplemented hook), never an
import/typecheck wall — exactly the red TDD contract for the Implementer to turn
green.
