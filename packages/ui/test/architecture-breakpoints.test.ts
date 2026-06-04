// Guard — "every @media pixel value is a member of the canonical breakpoint set,
// and that set has no dead members" (ADR 0043 §5).
//
// CSS custom properties cannot be used inside @media queries (ADR 0038 §1), so
// there is no var() sweep for breakpoints. The canonical values instead live in
// ONE typed source — the `breakpoints` const exported from @unbnd/ui
// (packages/ui/src/breakpoints.ts) — and this guard binds the CSS @media literals
// to that source: it derives the allowed set from the export and flags any
// @media pixel outside it (forward), and flags any canonical member that no
// @media uses (reverse, so dead canonical values cannot accumulate). It also
// extends the TSX forward net: a matchMedia / window.innerWidth / innerHeight
// comparison against a hardcoded pixel literal in .ts/.tsx is an offender
// (future JS-driven responsive logic must read `breakpoints`).
//
// This guard lives in its OWN file (separate from architecture-shape-literals
// .test.ts) so its load-time dependency on the not-yet-existing breakpoints
// module does NOT take down the pure-filesystem radius/shadow/z-index scans.
//
// TYPECHECK NOTE FOR THE ORCHESTRATOR: ../src/breakpoints does not exist yet, so
// a static `import { breakpoints } from "../src/breakpoints"` would be a hard
// `tsc` error (Cannot find module). To keep this guard reviewable AND
// typecheckable in the pre-Implementer state, the module is loaded behind a
// dynamic import() against a runtime-computed specifier (the Story-40 palette-
// sync pattern). The shape the Implementer must ship is pinned by the Breakpoints
// type below — that type IS the contract this guard locks. When the module
// lands, the dynamic import resolves and the assertions run against real values;
// until then, each `it` fails cleanly at the load step with a readable message
// ("not present yet") rather than an unreadable compiler error.
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED-PENDING by import resolution.
// packages/ui/src/breakpoints.ts does not exist yet, so loadBreakpoints()
// returns null and the forward/reverse assertions fail with the readable "not
// present yet" message (NOT an import crash). The app CSS already carries the 7
// distinct @media values {480,540,620,700,720,860,880}; once the Implementer
// lands `breakpoints` equal to that set, the forward check (every @media value is
// a member) and the reverse check (every member is used) both turn green. The
// TSX net is green on landing (no matchMedia/innerWidth literal exists today).
//
// Allowlist (ADR 0043 §5 — the typed source IS the canonical set):
//   - packages/ui/src/breakpoints.ts   (its literals ARE the canonical values)
// Scope-excludes (handled by SKIP_DIRS): e2e, packages/ui/test.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// The @media set is checked across app CSS; the TSX net scans app .ts/.tsx.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui")];

// The typed-source file whose literals ARE the canonical set (never an offender).
const ALLOWLIST = new Set(["packages/ui/src/breakpoints.ts"]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  "e2e",
  "test",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(css|ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

// The contract the Implementer must satisfy (ADR 0043 §4 / Option G): a typed
// `breakpoints` const object mapping value-keyed names to pixel integers. Only
// the numeric values matter to this guard (the names are the Implementer's per
// the ADR); the type pins "string-keyed record of numbers".
type Breakpoints = Record<string, number>;

// Load the typed `breakpoints` export by its ADR-pinned relative path. The
// specifier is built through a variable so `tsc` does not statically resolve it:
// the module does not exist yet (pre-Implementer), and a static
// `import("../src/breakpoints")` would be a hard TS2307 compiler error in the
// red state. Routing it through a runtime-computed specifier keeps THIS file
// typecheck-clean now while the contract is pinned by the Breakpoints type and
// resolved at runtime. Returns null (not throwing) when the module is absent, so
// the assertion fails with a readable "not present yet" message rather than an
// unreadable import crash. Once the Implementer adds the module, the dynamic
// import resolves and the assertions run against real values — NO edit to this
// file required.
const dynamicImport = (specifier: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ specifier);

async function loadBreakpoints(): Promise<Breakpoints | null> {
  try {
    const mod = await dynamicImport("../src/breakpoints");
    return (mod.breakpoints as Breakpoints | undefined) ?? null;
  } catch {
    return null;
  }
}

// Extract every pixel value from a @media prelude (the text between `@media` and
// the opening `{`). Handles the colon feature forms (min-width / max-width /
// min-height / max-height) AND the modern range forms (`(width >= Npx)`,
// `(Npx <= width <= Npx)`), so a future range-syntax breakpoint is also caught.
// Non-length features (prefers-*, hover, pointer, orientation) carry no `px`
// length and contribute nothing. Returns the distinct integer px values found.
function pxValuesInPrelude(prelude: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)px\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prelude)) !== null) {
    out.push(Number(m[1]));
  }
  return out;
}

// Collect every @media block's prelude from a CSS file, with the 1-based line
// number of the `@media` token (for offender reporting).
function mediaPreludes(css: string): Array<{ line: number; prelude: string }> {
  const out: Array<{ line: number; prelude: string }> = [];
  const re = /@media([^{]*)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const line = css.slice(0, m.index).split("\n").length;
    out.push({ line, prelude: m[1].trim() });
  }
  return out;
}

// TSX/TS forward net: a matchMedia / window.innerWidth / window.innerHeight
// expression that contains a hardcoded pixel literal is an offender. The
// patterns match a numeric literal that appears near one of these surfaces:
//   - matchMedia("(max-width: 600px)")  → the px literal in the query string
//   - window.innerWidth < 600           → the bare comparison literal
// A computed value (a member access, a reference to `breakpoints.bp480`, an
// expression) is never matched — only a literal. None exist today.
const TS_MATCHMEDIA_PX = /matchMedia\s*\([^)]*?(\d+(?:\.\d+)?)px[^)]*\)/g;
const TS_INNER_DIM_LITERAL =
  /\b(?:window\.)?inner(?:Width|Height)\s*(?:[<>]=?|===?|!==?)\s*(\d+(?:\.\d+)?)\b/g;

const css = (function readAllCss() {
  const files = SCAN_ROOTS.flatMap(walk);
  return files
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ rel: relative(REPO, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));
})();

const tsFiles = (function readAllTs() {
  const files = SCAN_ROOTS.flatMap(walk);
  return files
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => ({ rel: relative(REPO, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));
})();

describe("breakpoint tokens: every @media pixel is a canonical member, and no member is dead (ADR 0043 §5)", () => {
  it("forward — every app-CSS @media pixel value is a member of the typed breakpoints set", async () => {
    const breakpoints = await loadBreakpoints();
    expect(
      breakpoints,
      "@unbnd/ui must export `breakpoints` from packages/ui/src/breakpoints.ts (ADR 0043 §4); not present yet",
    ).not.toBeNull();

    const allowed = new Set(Object.values(breakpoints!));
    const offenders: string[] = [];
    for (const { rel, text } of css) {
      if (ALLOWLIST.has(rel)) continue;
      for (const { line, prelude } of mediaPreludes(text)) {
        for (const px of pxValuesInPrelude(prelude)) {
          if (!allowed.has(px)) {
            offenders.push(`${rel}:${line} @media ${prelude} uses ${px}px, not in breakpoints`);
          }
        }
      }
    }
    expect(
      offenders,
      `@media pixel values outside the canonical breakpoint set (${offenders.length}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("reverse — every member of the typed breakpoints set is used by at least one @media", async () => {
    const breakpoints = await loadBreakpoints();
    expect(
      breakpoints,
      "@unbnd/ui must export `breakpoints` from packages/ui/src/breakpoints.ts (ADR 0043 §4); not present yet",
    ).not.toBeNull();

    const used = new Set<number>();
    for (const { rel, text } of css) {
      if (ALLOWLIST.has(rel)) continue;
      for (const { prelude } of mediaPreludes(text)) {
        for (const px of pxValuesInPrelude(prelude)) used.add(px);
      }
    }
    const dead: string[] = [];
    for (const [name, px] of Object.entries(breakpoints!)) {
      if (!used.has(px)) {
        dead.push(`breakpoints.${name} = ${px} is never used by any @media`);
      }
    }
    expect(
      dead,
      `dead canonical breakpoint members with no @media consumer (${dead.length}):\n${dead.join("\n")}`,
    ).toEqual([]);
  });

  it("TSX net — no matchMedia / innerWidth / innerHeight comparison against a hardcoded pixel literal", () => {
    const offenders: string[] = [];
    for (const { rel, text } of tsFiles) {
      if (ALLOWLIST.has(rel)) continue;
      TS_MATCHMEDIA_PX.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TS_MATCHMEDIA_PX.exec(text)) !== null) {
        offenders.push(`${rel} hardcodes ${m[1]}px in a matchMedia query (read breakpoints instead)`);
      }
      TS_INNER_DIM_LITERAL.lastIndex = 0;
      while ((m = TS_INNER_DIM_LITERAL.exec(text)) !== null) {
        offenders.push(`${rel} compares innerWidth/innerHeight to literal ${m[1]} (read breakpoints instead)`);
      }
    }
    expect(
      offenders,
      `hardcoded breakpoint literals in JS (${offenders.length}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
