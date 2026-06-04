# Test Plan: Story 52 — Populate book blurbs from Open Library

**Story:** `engineering-team/stories/done/52-book-blurbs-openlibrary.md`
**ADR:** `engineering-team/decisions/0051-book-blurbs-openlibrary.md`
**Date:** 2026-06-04

All new tests are pure, deterministic unit tests in `apps/seeder/test/`, matching
the existing seeder Vitest layout (`test/**/*.test.ts`, `environment: node`). No
network, no relay, no Docker dependency. The Implementer turns them green.

## Coverage map

Maps each acceptance criterion (story §"Acceptance criteria") to its tests.

| Criterion | Test name(s) | Test file | Level |
|---|---|---|---|
| OL description fetch — string shape | `it("extracts a plain-string description")` | `apps/seeder/test/description.test.ts` | unit |
| OL description fetch — `{type,value}` shape | `it("extracts the value from a { type, value } description object")` | `description.test.ts` | unit |
| OL description fetch — work-detail endpoint | `it("requests the work-detail JSON endpoint for the given work id")` | `description.test.ts` | unit |
| Sanitize — newlines / footnotes / refs / rules / emphasis / attribution / entities / whitespace / no over-strip / real-world | the 11 `sanitizeDescription` cases | `description.test.ts` | unit |
| Cap — under-cap unchanged | `it("returns text unchanged (no ellipsis) when at or under the cap")` | `description.test.ts` | unit |
| Cap — sentence boundary | `it("cuts at the last sentence terminator at/after ~60% of the window when one exists")` | `description.test.ts` | unit |
| Cap — word-boundary fallback, never mid-word | `it("falls back to a word boundary (never mid-word) when no sentence end is in range")` | `description.test.ts` | unit |
| Cap — single `…`, ≤ max incl. ellipsis, no `word, …` artifact | `it("never returns a string longer than the cap...")`, `it("appends a single U+2026 ellipsis...")`, `it("never produces a 'word, …'...")`, `it("respects a custom max")`, `it("pins the cap constant at 700")` | `description.test.ts` | unit |
| Optional / absent | `it("returns null when the description is absent")`, `it("returns null for an empty / whitespace-only description")` | `description.test.ts` | unit |
| Polite + idempotent (cache) — cached raw returned, genuine null cached, network error not cached | the 5 `loadDescCache` cases | `apps/seeder/test/desc-cache.test.ts` | unit |
| Polite + idempotent (fail-open) — HTTP error / thrown error / timeout return null, do not throw | the 3 fail-open `fetchWorkDescription` cases | `description.test.ts` | unit |
| Backfill — bumped epoch re-publishes a done slug once; identical content skipped; changed content re-publishes | the epoch + fingerprint-key cases | `apps/seeder/test/checkpoint-epoch.test.ts` | unit |
| Backfill — fingerprint stable / blurb-sensitive | `it("is stable for identical content...")`, `it("changes when the blurb changes...")` | `checkpoint-epoch.test.ts` | unit |
| Unit-tested | (all of the above) | — | unit |
| Gates green | `pnpm --filter @unbnd/seeder typecheck`, `pnpm -r typecheck` clean | — | gate |

## Edge cases covered

- Empty / whitespace-only OL description → `null` (blurb left unset).
- Description absent entirely (field missing) → `null`.
- HTTP non-200, thrown network error, and AbortController timeout all fail open to `null` (do not throw, do not abort the seed).
- `capBlurb` exact-cap boundary (length === max) → unchanged, no ellipsis.
- `capBlurb` no-sentence-terminator window → word-boundary fallback, never mid-word.
- Punctuation/space immediately before the cut → trimmed so no `word, …` / `word. …` artifact.
- Sanitizer does NOT over-strip ordinary hyphens or non-footnote parentheticals.
- Cache distinguishes a cached `null` (genuine no-description, do not retry) from an absent entry (transient network error, do retry).
- Epoch isolation: a key recorded under one epoch is invisible under another (so the backfill re-publishes once), while the prior epoch's file stays intact (audit / rollback).

## Not covered here (and why)

- **`index.ts` enrichment wiring.** `apps/seeder/src/index.ts` runs `main()` on import (`main().catch(...)`), so importing it executes the seeder. The ADR does not extract an importable enrichment unit from `index.ts`, and a Tester must not refactor production source to make it testable. The composition the loop uses (`capBlurb(sanitizeDescription(raw))`, set only when non-empty) and the gating key shape (`book:<slug>:<fp>`) are each covered by the pure tests above; a brittle full-loop integration test was deliberately not written (per the role's "do not write a brittle full-loop integration test").
- **Live Open Library / relay round-trips.** Out of scope for this pure unit surface; the network function is tested with an injected `fetchImpl` mock.

## Test infrastructure

- Runner: Vitest (`apps/seeder/vitest.config.ts`, `environment: node`, `include: ["test/**/*.test.ts"]`). No new framework.
- `fetchWorkDescription` is tested with an injected `opts.fetchImpl` (the ADR's injection point) and a fake `AbortSignal`-aware fetch for the timeout case. No real network, no real timers needed.
- Not-yet-existing modules (`description.ts`, `desc-cache.ts`, `fingerprint.ts`) are loaded through `apps/seeder/test/_load.ts`, a test-only helper that imports `../src/<name>` via a runtime-computed specifier. This keeps `pnpm -r typecheck` clean while the modules are missing (no TS2307 compile wall) and makes the red an assertion-level "module not found" rather than a build break. Once the Implementer creates the modules, the loader resolves them and no `@ts-expect-error` cleanup is needed.
- `loadCheckpoint` already exists with a 1-arg signature; the ADR threads an `epoch` second arg. The epoch test imports the real function and views it through an epoch-aware type alias, so `tsc` stays clean and the runtime behavior (epoch namespacing) is what fails — assertion-level red, not a compile wall.

## How to run

```
pnpm --filter @unbnd/seeder test
pnpm --filter @unbnd/seeder typecheck
pnpm -r typecheck
```

## Verification

Confirmed on 2026-06-04 at commit `3670061` (branch `story-52-book-blurbs`):

- **New tests fail for the right reason.** `pnpm --filter @unbnd/seeder test` → `Test Files 3 failed | 4 passed (7)`, `Tests 36 failed | 15 passed (51)`.
  - `description.test.ts` (27/27 fail): `Failed to load url ../src/description` — the module is not implemented yet.
  - `desc-cache.test.ts` (5/5 fail): `Failed to load url ../src/desc-cache` — the cache module is not implemented yet.
  - `checkpoint-epoch.test.ts` (4/7 fail):
    - the 2 epoch-namespacing tests fail with `expected true to be false` — today's flat checkpoint ignores the epoch arg, so a bumped epoch still sees the old key (the exact gap the ADR's epoch namespacing closes).
    - the 2 `fingerprint helper` tests fail with `Failed to load url ../src/fingerprint` — the fingerprint helper is not implemented yet.
    - the other 3 (`persists epoch-scoped keys across reload`, and the two `book:<slug>:<fp>` key-shape tests) pass against the current flat store and pin contract that must remain true through implementation.
- **Existing seeder tests still pass.** `vitest run test/checkpoint.test.ts test/openlibrary.test.ts test/headers.test.ts test/taxonomy.test.ts` → `Tests 12 passed (12)`.
- **Typecheck clean.** `pnpm --filter @unbnd/seeder typecheck` → exit 0. `pnpm -r typecheck` → exit 0 (all packages Done). The red set does not break the build gate.

```
 ❯ test/desc-cache.test.ts (5 tests | 5 failed)
   × loadDescCache > reports a miss for an unknown work id
     → Failed to load url ../src/desc-cache. Does the file exist?
 ❯ test/checkpoint-epoch.test.ts (7 tests | 4 failed)
   × checkpoint epoch namespacing (the backfill) > treats a previously-completed slug as not-done under a bumped epoch (re-publishes once)
     → expected true to be false // Object.is equality
   × fingerprint helper > is stable for identical content (same fp on a second run)
     → Failed to load url ../src/fingerprint. Does the file exist?
 ❯ test/description.test.ts (27 tests | 27 failed)
   × sanitizeDescription > normalizes Windows and bare-CR newlines to \n
     → Failed to load url ../src/description. Does the file exist?
   ...
 Test Files  3 failed | 4 passed (7)
      Tests  36 failed | 15 passed (51)
```
