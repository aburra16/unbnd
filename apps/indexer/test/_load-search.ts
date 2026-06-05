// Test-only opaque loader for the Story 60 (index-on-write) shared per-book
// builder `buildBookDocument`, which ADR 0059 (Q3, Option A) extracts into
// `@unbnd/search` (`packages/search/src/build-document.ts`, re-exported from
// `packages/search/src/index.ts`).
//
// `buildBookDocument` does not exist yet, so a static
//   `import { buildBookDocument } from "@unbnd/search"`
// would be a tsc TS2305 ("no exported member") WALL — the whole indexer
// typecheck would fail to compile and the assertions below would never run.
// Routing through a runtime-computed specifier hides the not-yet-present export
// from tsc, so these tests fail at the ASSERTION level
// ("buildBookDocument is not a function"), which is the correct red for a
// missing-implementation TDD set — mirrors apps/indexer/test/_load.ts.
//
// NOTE ON THE CANONICAL HOME (flag for the Implementer): ADR 0059 §6 pins the
// unit test for `buildBookDocument` at `packages/search/test/build-document.test.ts`.
// That package cannot host it RED today because `@unbnd/search` does not yet
// depend on `@unbnd/schemas` (the dep edge ADR 0059 adds in Q3/Consequences),
// so `@unbnd/schemas` does not resolve from `packages/search` until the
// Implementer adds the workspace dep + regenerates the lockfile (`pnpm install`,
// the ADR 0058 caveat). `apps/indexer` already depends on BOTH `@unbnd/search`
// and `@unbnd/schemas`, so it is the only place this contract can be pinned RED
// at the assertion level today. Once the Implementer lands the dep edge, this
// unit test should MOVE to `packages/search/test/build-document.test.ts`
// verbatim (the import flips to a static `import { buildBookDocument }`).

import type { SignedNostrEvent } from "@unbnd/schemas";
import type { SearchDocument } from "@unbnd/search";

/** The decided `buildBookDocument` signature — ADR 0059 §1 / Implementation
 * notes §1. Loaded opaquely so the not-yet-present export is invisible to tsc. */
export type SearchModule = {
  buildBookDocument: (
    bookEvent: SignedNostrEvent,
    taxonomyEvents: readonly SignedNostrEvent[],
    assertionEventsForBook: readonly SignedNostrEvent[],
    currentYear: number,
  ) => SearchDocument | null;
};

/** Import `@unbnd/search` via an opaque specifier (hidden from tsc). */
export async function loadSearchModule(): Promise<SearchModule> {
  const spec = "@unbnd/search";
  return (await import(/* @vite-ignore */ spec)) as SearchModule;
}
