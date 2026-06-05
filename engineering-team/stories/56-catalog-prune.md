# Story 56: Prune existing catalog junk that fails the legitimacy gate

**Status:** In progress
**Created:** 2026-06-04
**Type:** Feature / Data

## Background

Story 55 shipped the catalog expansion, the legitimacy gate (`apps/seeder/src/gate.ts`), and in-place enrichment of still-passing books. It deliberately did **not** remove the legacy records that fail the new gate: junk seeded before the gate (vanity one-offs, study guides, pamphlets, box sets, records with an out-of-range year) persists on the relay and in the app.

This story makes that junk stop appearing in Unbnd. The chosen approach is a **read-time filter**, not relay deletion. A pure junk oracle reuses the Story-55 gate's conservative junk signals on the **stored** `BookRecord`, applied at the two sites every surface flows through: the indexer (which builds the search index) and the API's `parseBook` (which serves every direct-relay book read). A junk record is never indexed and never resolves to a `PublicBook`, so it is invisible across search, genre browse, recent/home, book detail, shelves, For-You, and claimed books. The record stays on the relay; it is simply never surfaced.

**Why read-time filtering, not NIP-09 hard-deletion.** The prune was first designed (ADR 0054's "Deferred to Story 56" subsection) as an in-protocol kind-5 delete pass. That design is blocked: the seeder publishes to **dcosl**, but catalog data reaches the **local** strfry (the indexer's source) only through the down-sync cron, whose filter pulls only kinds 39998/39999 — a kind-5 never reaches the local strfry, so the prune would silently no-op. Making it work would require a down-sync filter change plus an unverified confirmation that the local strfry honors NIP-09 deletion on REQ. The read-time filter reaches the same in-app outcome and is **simpler** (one shared oracle, two call sites, no new seeder capability), **reversible** (relaxing the oracle restores the records; nothing is destroyed), and has **no advisory-delete / strfry / down-sync dependency**. The tradeoff is recorded: junk remains on the relay, invisible in-app but still returnable by a raw external REQ outside Unbnd. The kind-5 design is preserved in ADR 0054 for a future revival if protocol-level removal is ever required. See **ADR 0055** for the full decision.

## User-facing description

As a Reader browsing and searching Unbnd, I want the junk records that predate the legitimacy gate (vanity one-offs, study guides, pamphlets, box sets, records with an implausible year) to be **gone** from browse, search, and book detail, so that the catalog is uniformly trustworthy rather than clean only for books added after the gate.

## Acceptance criteria

- [ ] **The shared junk oracle.** A pure `isJunkRecord(book, currentYear)` in `@unbnd/schemas` returns true on **positive junk evidence** observable on a stored `BookRecord`: missing/empty title, missing/empty author, junk-denylist title, or a **present** `publishYear` outside `1800..currentYear`. It is deterministic and I/O-free (`currentYear` injected). **Cover is NOT a read-time signal** (Refinement 2026-06-05): the oracle runs at `parseBook`, which serves community submissions and author overlays where `coverUrl` is optional legitimate content, so a missing cover does not flag a record as junk. The seed-time gate's `cover_i` check is unchanged.
- [ ] **Conservative — absence is not junk.** `isJunkRecord` returns **false** (keep) when a record merely lacks `coverUrl`, `language`, `pageCount`, or a `publishYear` (an absent year is not positive evidence), and it never reads `edition_count` (not stored). A plausibly-legitimate legacy record that simply predates enrichment, or a cover-less community/author record, is never flagged.
- [ ] **One denylist, not two.** The oracle reuses the **exact** `JUNK_TITLE_RE` from Story 55, which now lives in `@unbnd/schemas`; `apps/seeder/src/gate.ts` imports it from there. The seeder gate's behavior (`gateWork` / `gateReason`) is unchanged — there is a single denylist definition in the codebase.
- [ ] **Indexer skips junk.** `apps/indexer/src/build-documents.ts` skips any record for which `isJunkRecord` is true (after the existing parse guard), so junk is never indexed → absent from search and genre browse. The number skipped is counted and logged.
- [ ] **API read paths filter junk.** `parseBook` (`apps/api/src/books/effective.ts`) returns `null` for a junk record, so every direct-relay surface drops it: recent/home (`GET /api/books`), batch hydrate (`?slugs=`), house shelves, For-You, user shelves, and claimed books. The book-detail route (`GET /api/books/:slug`) returns **404** for a junk slug (it already 404s when no book parses).
- [ ] **Search / genre browse need no API change.** `GET /api/search` (including genre browse via `?genre=`) reads the Meili index, which the indexer filter already cleansed; this route is unchanged.
- [ ] **Flushed re-index drops already-indexed junk.** The indexer calls `provider.deleteAll()` once before the upsert sweep, so a stale junk document indexed before this change does not survive a normal re-index.
- [ ] **Idempotent.** The oracle is pure and stateless (no checkpoint); re-running the indexer (flush + rebuild) is naturally idempotent. The same `isJunkRecord` is the single oracle at both the indexer and the API.
- [ ] **Gates green.** `pnpm -r typecheck` and `pnpm -r test` pass, including the new `isJunkRecord` unit tests, the indexer skip/count test, the `parseBook` null-on-junk test, and the unchanged seeder gate tests.

## DList shapes touched

- **None.** This is a read-time filter over the stored `kind:39999` book record. No new event, no kind-5, no schema change, no write to the relay.

## Out of scope

- **No relay deletion / no kind-5 / no NIP-09 pass** — junk stays on the relay, invisible in-app.
- **No down-sync filter change / no strfry dependency / no local-strfry NIP-09 verification** — the dcosl→local-strfry boundary is never crossed.
- **No seeder re-run / no re-seed / no `CHECKPOINT_EPOCH` bump** — the seeder is untouched at runtime; only the import-source of `JUNK_TITLE_RE` moves.
- **No gate re-tuning** — the gate signals, `EDITION_MIN`, and the denylist contents are unchanged; only the denylist's home moves to `@unbnd/schemas`.
- **No web / design-system change** — the book detail already 404s and the web already handles it; no string or token change.
- **No popularity-based filtering** — the oracle reads no rating/readership signal; positive structural junk evidence only.

## Open questions

For the Tester / Implementer:

1. **`currentYear` injection.** Confirm the threading of `currentYear` into `buildSearchDocuments` (from `index.ts`) and into `parseBook` (a defaulted param) so both stay pure and tests pin a year — matches ADR 0055 §1–§3.
2. **`gate.ts` re-export shape.** Confirm `apps/seeder/src/gate.ts` keeps `JUNK_TITLE_RE` as a public name (re-exported from `@unbnd/schemas`) so the existing `gate.test.ts` imports resolve unchanged with no behavior drift.

## Linked artifacts

- **Decision:** `engineering-team/decisions/0055-catalog-prune.md` — the read-time-filter design (shared oracle home + name, indexer filter site, the API read-path map, the flush decision, the book-detail 404 decision, and the recorded weakness vs hard-delete).
- **Depends on:** Story 55 / ADR 0054 — the legitimacy gate is the source of the shared junk signals and `JUNK_TITLE_RE`; ADR 0054 also preserves the set-aside kind-5 hard-delete design.
- Test plan: (filled in after Test Design phase)
- Review: `engineering-team/reviews/56-catalog-prune.md` (pending).
