// Test-only loader for Story 52 (book blurbs) modules that do not exist yet.
//
// The Tester writes FAILING tests (TDD red) against not-yet-implemented seeder
// modules. A static `import "../src/description"` (etc.) would break `tsc`
// (TS2307) and the CI build gate — a "compile wall" rather than a clean
// assertion-level red. Routing the import through a runtime-computed specifier
// hides it from the TypeScript resolver, so:
//   - `pnpm -r typecheck` stays clean while the modules are missing, and
//   - the test fails at the assertion level ("module not found" surfaces as a
//     readable test failure), not as a type error.
//
// Once the Implementer creates the modules, these loaders resolve and the
// tests exercise the real exports. No dangling `@ts-expect-error` to clean up.

/** Import a sibling `../src/<name>` module via an opaque specifier. */
export async function loadSeederModule<T>(name: string): Promise<T> {
  // The leading "./" + variable keeps the specifier opaque to tsc's resolver.
  const spec = `../src/${name}`;
  return (await import(/* @vite-ignore */ spec)) as T;
}
