// Test-only loader for the Story 56 (catalog prune) indexer flush seam.
//
// ADR 0055 §4 pins a one-line change inside index.ts `main()`:
//   await provider.configureIndex();
//   await provider.deleteAll();   // NEW: clean rebuild — drop stale/junk first
//   for (...) await provider.index(batch);
//
// `main()` is private today and runs at module load (it connects to a relay), so
// it is not unit-testable as written. To assert the flush-before-upsert ORDERING
// at the smallest seam, the Implementer extracts a pure orchestration helper —
// `runIndex(provider, docs)` — and `main()` calls it. That helper is the seam
// these tests pin.
//
// `runIndex` does not exist yet, so a static `import { runIndex } from
// "../src/index"` would be a tsc TS2305 wall (and importing index.ts directly
// would execute main()'s relay I/O at load). Routing through a runtime-computed
// specifier hides the missing export from tsc and lets the test fail at the
// assertion level ("runIndex is not a function"), not as a type error.

/** Import a sibling `../src/<name>` module via an opaque specifier. */
export async function loadIndexerModule<T>(name: string): Promise<T> {
  const spec = `../src/${name}`;
  return (await import(/* @vite-ignore */ spec)) as T;
}
