// Equality guard — TS↔CSS palette sync + semantic-color link (ADR 0040 §3 and
// Implementation-notes "Equality guard").
//
// The genre/cover palette has ONE source of color truth: the typed GENRE_PALETTE
// constant in @unbnd/ui (packages/ui/src/palette.ts). The runtime-injected
// component color props have one source: SEMANTIC_COLORS (packages/ui/src/
// colors.ts). The CSS Tier-1 raws in tokens.css must stay byte-equal to those TS
// sources, or the TS arrays (consumed by Avatar.tsx / view-model.ts via runtime
// string interpolation) and the CSS tokens silently drift apart again. This
// guard is the permanent anti-drift lock for that link.
//
// Per ADR 0040 §3: for each NAMED row in GENRE_PALETTE, tokens.css must define
// --u-raw-color-genre-<name> equal to that row's `bg`; and each SEMANTIC_COLORS
// value must equal its tokens.css raw counterpart. (The teal `genre: null` row
// and the `history` genre token are the two pre-existing asymmetries the ADR
// records; this guard checks only the named rows, exactly as §3 specifies.)
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED, by import resolution. Neither
// packages/ui/src/palette.ts nor packages/ui/src/colors.ts exists yet, and the
// --u-raw-color-* tokens are not in tokens.css yet. The Implementer creates all
// three per the ADR; this guard then turns green and locks the invariant.
//
// This guard lives in its OWN file so that its import-time / load-time failure
// (the not-yet-existing modules) does NOT take down Guards A/B, which are pure
// filesystem scans with no @unbnd/ui-source dependency.
//
// TYPECHECK NOTE FOR THE ORCHESTRATOR: ../src/palette and ../src/colors do not
// exist yet, so a static `import { GENRE_PALETTE } from "../src/palette"` would
// be a hard `tsc` error (Cannot find module). To keep this file's guard logic
// reviewable AND typecheckable in the pre-Implementer state, the not-yet-present
// modules are loaded behind a dynamic import() against a typed shim. The shape
// the Implementer must ship is pinned by the GenreRow / SemanticColors types
// below — those types ARE the contract this guard locks. When the modules land,
// the dynamic import resolves and the assertions run against real values; until
// then, each `it` fails cleanly at the load step with a readable message rather
// than an unreadable compiler error.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");
const TOKENS = join(REPO, "packages/ui/styles/tokens.css");

// The contract the Implementer must satisfy (ADR 0040 §3, Option B, and §4).
// GENRE_PALETTE: 8 rows in load-bearing order; named rows carry a `genre`, the
// teal row carries `genre: null`. SEMANTIC_COLORS: the runtime-injected props
// source, keyed by role, values equal to the corresponding tokens.css raws.
interface GenreRow {
  genre: string | null;
  bg: string;
  ink: string;
  coverTo: string;
}
type SemanticColors = Record<string, string>;

// Map each SEMANTIC_COLORS key to the tokens.css raw whose value it must equal
// (ADR 0040 §4: SEMANTIC_COLORS exports { amber, muted, signalPositive,
// signalSovereign, … } for the SVG/icon/iconBg props). The guard only checks
// the keys SEMANTIC_COLORS actually exports, against the matching raw token.
const SEMANTIC_TO_RAW: Record<string, string> = {
  amber: "--u-raw-color-amber-500",
  muted: "--u-raw-color-muted-500",
  signalPositive: "--u-raw-color-green-500",
  signalSovereign: "--u-raw-color-purple-500",
  signalNegative: "--u-raw-color-red-500",
};

// Load the @unbnd/ui color sources by their ADR-pinned relative paths. The
// specifier is built through a variable so `tsc` does not statically resolve it:
// the modules do not exist yet (pre-Implementer), and a static `import("../src/
// palette")` would be a hard TS2307 compiler error in the red state. Routing it
// through a runtime-computed specifier keeps THIS guard file typecheck-clean now
// while the contract is still pinned by the GenreRow / SemanticColors types
// above and resolved at runtime. Returns null (not throwing) when a module is
// absent, so the assertion fails with a readable "not present yet" message
// rather than an unreadable import crash. Once the Implementer adds the modules,
// the dynamic import resolves and the assertions run against real values — with
// NO edit to this file required.
const dynamicImport = (specifier: string): Promise<Record<string, unknown>> =>
  import(/* @vite-ignore */ specifier);

async function loadPalette(): Promise<readonly GenreRow[] | null> {
  try {
    const mod = await dynamicImport("../src/palette");
    return (mod.GENRE_PALETTE as readonly GenreRow[] | undefined) ?? null;
  } catch {
    return null;
  }
}

async function loadSemanticColors(): Promise<SemanticColors | null> {
  try {
    const mod = await dynamicImport("../src/colors");
    return (mod.SEMANTIC_COLORS as SemanticColors | undefined) ?? null;
  } catch {
    return null;
  }
}

// Read the value side of a `--name: value;` definition from the token sheet.
function rawTokenValue(css: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
  return m ? m[1].trim() : null;
}

// Hex compares case-insensitively (the TS source may write #085041 while a token
// writes #085041 — keep them equal regardless of authored case).
function sameColor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

describe("color tokens: TS↔CSS palette + semantic-color sync (ADR 0040 §3, equality guard)", () => {
  const css = readFileSync(TOKENS, "utf8");

  it("each named GENRE_PALETTE row's bg equals its --u-raw-color-genre-<name> token", async () => {
    const palette = await loadPalette();
    expect(
      palette,
      "@unbnd/ui must export GENRE_PALETTE from packages/ui/src/palette.ts (ADR 0040 §3); not present yet",
    ).not.toBeNull();

    const mismatches: string[] = [];
    for (const row of palette!) {
      if (row.genre === null) continue; // the teal row has no genre token (recorded asymmetry)
      const token = `--u-raw-color-genre-${row.genre}`;
      const value = rawTokenValue(css, token);
      if (value === null) {
        mismatches.push(`tokens.css is missing ${token} (GENRE_PALETTE row "${row.genre}".bg = ${row.bg})`);
      } else if (!sameColor(value, row.bg)) {
        mismatches.push(`${token} = ${value} but GENRE_PALETTE row "${row.genre}".bg = ${row.bg}`);
      }
    }
    expect(mismatches, `genre palette TS↔CSS drift:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it("each SEMANTIC_COLORS value equals its tokens.css raw counterpart", async () => {
    const semantic = await loadSemanticColors();
    expect(
      semantic,
      "@unbnd/ui must export SEMANTIC_COLORS from packages/ui/src/colors.ts (ADR 0040 §4); not present yet",
    ).not.toBeNull();

    const mismatches: string[] = [];
    for (const [key, value] of Object.entries(semantic!)) {
      const token = SEMANTIC_TO_RAW[key];
      if (!token) {
        mismatches.push(`SEMANTIC_COLORS.${key} has no known raw-token counterpart in this guard's map`);
        continue;
      }
      const rawValue = rawTokenValue(css, token);
      if (rawValue === null) {
        mismatches.push(`tokens.css is missing ${token} (SEMANTIC_COLORS.${key} = ${value})`);
      } else if (!sameColor(rawValue, value)) {
        mismatches.push(`SEMANTIC_COLORS.${key} = ${value} but ${token} = ${rawValue}`);
      }
    }
    expect(mismatches, `semantic-color TS↔CSS drift:\n${mismatches.join("\n")}`).toEqual([]);
  });
});
