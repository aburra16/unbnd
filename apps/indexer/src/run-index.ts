// The index orchestration seam (Story 56, ADR 0055 §4). Extracted from `main()`
// so the flush-before-upsert ordering is unit-testable against a mock provider
// without executing relay I/O.
//
// A re-index is self-cleaning: configure the index, flush every document, then
// upsert the current filtered set. `deleteAll()` runs AFTER `configureIndex()`
// and BEFORE any upsert, so a junk document indexed before the read-time filter
// cannot survive a rebuild. `deleteAll()` tolerates a 404, so a first-ever run
// (empty/new index) is unaffected.
import type { SearchDocument, SearchProvider } from "@unbnd/search";

const BATCH = 500;

export async function runIndex(
  provider: SearchProvider,
  docs: readonly SearchDocument[],
): Promise<void> {
  await provider.configureIndex();
  await provider.deleteAll(); // clean rebuild — drop any stale/junk doc first
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await provider.index(batch);
    console.log(`[indexer] indexed ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }
}

/**
 * Story 108 / ADR 0096 §4: the same clean rebuild, a page at a time. `eachPage`
 * hands over each page's documents; nothing holds the whole catalog.
 */
export async function runIndexInPages(
  provider: SearchProvider,
  eachPage: (onDocs: (docs: readonly SearchDocument[]) => Promise<void>) => Promise<void>,
): Promise<number> {
  await provider.configureIndex();
  await provider.deleteAll();
  let indexed = 0;
  await eachPage(async (docs) => {
    for (let i = 0; i < docs.length; i += BATCH) {
      await provider.index(docs.slice(i, i + BATCH));
    }
    indexed += docs.length;
    if (docs.length > 0) console.log(`[indexer] indexed ${indexed}`);
  });
  return indexed;
}
