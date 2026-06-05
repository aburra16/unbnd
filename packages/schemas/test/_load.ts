// Test-only loader for Story 56 (catalog prune) exports that do not exist yet.
//
// `isJunkRecord` and a relocated `JUNK_TITLE_RE` are NEW exports of the EXISTING
// module `../src/BookRecord` (per ADR 0055 §1). A static
// `import { isJunkRecord } from "../src/BookRecord"` would be a `tsc` error
// (TS2305 — module has no exported member) and break CI's typecheck gate — a
// compile wall, not a clean assertion-level red.
//
// Routing the import through a runtime-computed specifier hides the missing
// export from the TypeScript resolver, so:
//   - `pnpm -r typecheck` stays clean while the export is missing, and
//   - the test fails at the assertion level ("isJunkRecord is not a function" /
//     "JUNK_TITLE_RE is undefined"), not as a type error.
//
// Once the Implementer adds the exports to BookRecord.ts, this loader resolves
// the real symbols and the tests exercise them. No dangling @ts-expect-error.

/** Import a sibling `../src/<name>` module via an opaque specifier. */
export async function loadSchemasModule<T>(name: string): Promise<T> {
  // The runtime-computed specifier keeps the path opaque to tsc's resolver.
  const spec = `../src/${name}`;
  return (await import(/* @vite-ignore */ spec)) as T;
}
