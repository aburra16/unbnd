# Test Plan: Story 1 — DList schemas for the core data model

**Story:** `engineering-team/stories/1-dlist-schemas.md`
**ADR:** `engineering-team/decisions/0001-dlist-schemas.md`
**Date:** 2026-05-28

## Coverage map

Every AC from the story is covered by at least one test. Edge cases get their own tests.

| Criterion | Test file | Level | Notes |
|---|---|---|---|
| AC-1 — Six TS types exist with §6 fields | `packages/schemas/test/Book*.test.ts` | unit | Six per-shape test files exercise the domain type, the payload type, and the wire event type. The fixture-conformance test in `apps/web/test/fixtures.test.ts` exercises the same types from a different consumer. |
| AC-2 — Shared envelope used by all six | `packages/schemas/test/envelope.test.ts` + cascading use in shape tests | unit | Envelope tests cover `HexPubkey` / `EventId` branding, address parse/format round-trip, and the `WordEnvelope` discriminator. Every shape test imports `DListAddress` from envelope to construct cross-references — that import alone exercises the shared use. |
| AC-3 — Typed cross-references via shared `DListAddress<39999>` | `packages/schemas/test/BookRating.test.ts`, `BookGenreTag.test.ts`, `BookShelf.test.ts` | unit | `BookRating.bookAddress`, `BookGenreTag.bookAddress` / `genreAddress`, `BookShelf.bookAddresses[i]` are all `DListAddress<39999>`. Tests assert the `a`-tag emitted on each wire event matches `formatAddress(bookAddress)`. |
| AC-4 — Fixtures conform to new types | `apps/web/test/fixtures.test.ts` | unit | Imports each fixture file, asserts each entry satisfies its declared type and carries a valid `parentHeader: DListAddress<39998>`. The shelves block of `profile-fixtures.ts` additionally asserts `bookSlugs.length === bookAddresses.length`. |
| AC-5 — `pnpm -r typecheck` clean | repo-wide gate | static | Documented as a verification step in the §"Verification" block below. After the Implementer completes the refit, `pnpm -r typecheck` must pass with zero errors. |
| AC-6 — Five screens render against refit fixtures | `apps/web/test/routes.smoke.test.tsx` | component | One smoke test per route (`/`, `/book/orbital`, `/genre/literary-fiction`, `/submit`, `/profile/mira-calloway`). Each test mounts the route inside a `MemoryRouter`, asserts no runtime error, and asserts a uniquely-identifying string from each fixture is in the DOM. Pixel match deferred — manual visual spot-check is sufficient given the refit is pure type annotations. |
| AC-7 — Z-tag parent reference typed | `packages/schemas/test/envelope.test.ts` + every shape test | unit | `UnsignedDListEvent` type narrows `parentHeader` to `DListAddress<39998>`. Every shape's `to*Event` test asserts the emitted `["z", ...]` tag matches `formatAddress(event.parentHeader)` and that `parentHeader.kind === 39998`. |

## Edge cases

- [x] Optional fields absent from `BookRecord` (no ISBN, no cover, no year) — `BookRecord.test.ts` "omits optional tags when the source field is absent"
- [x] Optional review text on `BookRating` — `BookRating.test.ts` "leaves content empty when reviewText is absent"
- [x] Subgenre with `parentGenreSlug` set vs unset — `BookGenre.test.ts` "includes a parent-genre tag only when set"
- [x] Empty shelf (no books) — `BookShelf.test.ts` "round-trips an empty shelf"
- [x] Mismatched `bookSlugs` / `bookAddresses` arrays on `BookShelf` — `BookShelf.test.ts` "rejects shelves where bookSlugs and bookAddresses are not parallel"
- [x] Determinism of `buildBookRatingDTag` for repeated inputs — `BookRating.test.ts`
- [x] D-tag varies when the rater pubkey changes — `BookRating.test.ts`
- [x] Address parse/format round-trip preserves all fields — `envelope.test.ts`
- [x] Address parser rejects malformed input — `envelope.test.ts`
- [x] `parseAddressOfKind` throws when the actual kind differs from the expected kind — `envelope.test.ts`
- [x] Hex pubkey validation rejects non-hex, wrong-length, and uppercase input — `envelope.test.ts`

## Test infrastructure

- **Runner:** Vitest 2.1.x, authorized by ADR 0001 as the workspace test runner. Added to the workspace root and to each package that ships tests.
- **Schemas tests:** `packages/schemas/test/*.test.ts`. Node environment. Run with `pnpm --filter @unbnd/schemas test`.
- **Web tests:** `apps/web/test/*.test.{ts,tsx}`. happy-dom environment. Testing Library for component renders. Run with `pnpm --filter @unbnd/web test`.
- **Setup file:** `apps/web/test/setup.ts` imports `@testing-library/jest-dom/vitest` for the extended matchers (`toBeInTheDocument`, etc.).
- **Test helper:** `packages/schemas/test/_helpers.ts` exports `hex64(s): HexPubkey` and `eventId64(s): EventId` — direct casts that bypass the runtime validation in `asHexPubkey` / `asEventId`. This is intentional: the validation behavior is the subject of `envelope.test.ts`; every other test file just needs sample data that has the right type. Without this helper, the throw-on-not-implemented stubs would break module-load before any test ran.
- **Compose-up prerequisite:** none. All tests are self-contained; no strfry, Neo4j, Meilisearch, or relay state is required. Integration tests against a live relay are out of scope for this story (deferred to a future story that introduces the publish path).

## How to run

```
# Schemas only
pnpm --filter @unbnd/schemas test

# Web only
pnpm --filter @unbnd/web test

# Whole workspace
pnpm -r test
# or
pnpm test
```

The typecheck gate runs independently:

```
pnpm -r typecheck
```

## Verification — failing-for-the-right-reason

Confirmed 2026-05-28. After the Tester phase committed, the following gates fail as designed and will all pass after the Implementer completes the refit and the conversion implementations.

### `pnpm --filter @unbnd/schemas test`

```
Test Files  7 failed (7)
     Tests  48 failed | 1 passed (49)
```

Every failing test prints an "Error: <function> not implemented" stack from the relevant stub in `packages/schemas/src/*.ts`. Examples:

```
Error: buildBookRatingDTag not implemented
 ❯ Module.buildBookRatingDTag src/BookRating.ts:59:9
Error: toBookRecordEvent not implemented
 ❯ Module.toBookRecordEvent src/BookRecord.ts:72:9
```

These are the right failures. The Implementer replaces each stub with a real implementation; the tests then turn green.

The 1 passing test is `buildBookRatingDTag > differs when the rater changes` — both calls throw with the same error message, so `not.toBe(...)` accidentally passes. Acceptable degenerate baseline; the test becomes meaningful once the stub is replaced.

### `pnpm --filter @unbnd/web test`

```
Test Files  1 failed | 1 passed (2)
     Tests  4 failed | 5 passed (9)
```

The 4 failing tests are in `fixtures.test.ts`, all of the form:

```
TypeError: Cannot read properties of undefined (reading 'kind')
```

`parentHeader` is undefined on the unrefit fixtures. The Implementer's refit adds the field; the tests then turn green.

The 5 passing smoke tests confirm the five shipped routes render correctly against today's fixtures. The Implementer must keep these passing after the refit; that is AC-6.

### `pnpm -r typecheck`

Currently passes for `@unbnd/schemas` (the stubs match their declared signatures) and `@unbnd/api`. Fails for `@unbnd/web` because the fixtures' value shapes do not satisfy the new `BookRecord`, `BookGenre`, and `BookShelf` types imported from `@unbnd/schemas` (the test files declare type-annotated variables that catch this). After the refit, all three packages typecheck clean.

## Notes for the Implementer

- Start with `packages/schemas/src/envelope.ts` (`asHexPubkey`, `asEventId`, `parseAddress`, `formatAddress`, `parseAddressOfKind`). Once these are real, every other test file's sample data construction starts working.
- Then `concept-headers.ts` — six small functions that each return `{ kind: 39998, pubkey: librarianPubkey, dTag: <slug> }`.
- Then the six shape files in any order. The conversion functions are pure: they read the domain object, derive the d-tag, list the tags, build the word-wrapper payload, return the unsigned event. No I/O.
- Finally the fixture refit. The three fixture files need a fixture-only librarian pubkey constant; add it as `apps/web/src/data/fixture-constants.ts` per the ADR.
- After the refit, both test suites should turn fully green. Smoke tests should still pass. Typecheck should pass workspace-wide.
