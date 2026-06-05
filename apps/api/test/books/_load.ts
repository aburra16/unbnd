// Test-only loader for the Story 56 (catalog prune) parseBook signature change.
//
// ADR 0055 §3 widens parseBook with an injected, DEFAULTED `currentYear` param:
//   export function parseBook(event, currentYear = new Date().getUTCFullYear())
//
// parseBook is a REAL existing export; the new behavior (return null for junk)
// and the new 2nd parameter are not in place yet. A static
// `parseBook(event, currentYear)` is a tsc TS2554 arity wall (Expected 1, got 2),
// not an assertion-level red. Routing through a runtime-computed specifier hides
// the call from tsc's signature check, so the test runs the REAL function (and
// fails its ASSERTION — "expected null" — because junk is not yet filtered),
// while `pnpm -r typecheck` stays clean. When the Implementer adds the param +
// the filter, these turn green against the real signature.

/** Import `../../src/<path>` via an opaque specifier (hidden from tsc). */
export async function loadApiModule<T>(path: string): Promise<T> {
  const spec = `../../src/${path}`;
  return (await import(/* @vite-ignore */ spec)) as T;
}
