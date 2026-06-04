// Guard B — "no raw color literals outside the token layer" (ADR 0040 §5).
//
// Color literals (hex, rgb()/rgba(), and a curated list of CSS named colors)
// may live ONLY in the legitimate token-source files. Everywhere else — app
// CSS, and app components/routes/hooks/lib (.ts/.tsx) — a color must reference a
// token (CSS) or a typed @unbnd/ui color constant (runtime-injected props).
//
// Mirrors packages/trust/test/architecture.test.ts: REPO resolve, walk() +
// SKIP_DIRS, readFileSync per file, single aggregated expect(offenders)
// .toEqual([]). walk() is widened to .css/.ts/.tsx.
//
// Allowlist (ADR 0040 §5 — the ONLY legitimate literal homes):
//   - packages/ui/styles/tokens.css   (the CSS literal home)
//   - packages/ui/src/palette.ts      (GENRE_PALETTE, the genre/cover source)
//   - packages/ui/src/colors.ts       (SEMANTIC_COLORS, runtime-injected props)
// Scope-excludes (handled by scope, not allowlist):
//   - apps/web/e2e        (visual-harness fixtures)
//
// `transparent` and `currentColor` are CSS keywords / inherited values, NOT
// literals, and are explicitly NOT flagged (ADR 0040 §5).
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. App CSS still carries ~40 hex
// literals (#fff, #ffffff, #dc3545, #1d9e75, the drift greys, #fffbf6) and ~79
// rgba() calls, and the runtime-injected components (Avatar.tsx, view-model.ts,
// SearchIcon.tsx, LogoMark.tsx, Footer.tsx, AuthWelcome.tsx, AuthNostrConnect
// .tsx) still inline their hex/rgba. After the sweep every literal moves into an
// allowlisted source file and the guard is green.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scan roots. App source (CSS + TS/TSX) is the primary target; the two
// allowlisted @unbnd/ui source files are scanned too so the allowlist is an
// explicit, auditable exemption rather than an unscanned blind spot.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui")];

// Files where color literals are legitimate (the token layer itself).
const ALLOWLIST = new Set([
  "packages/ui/styles/tokens.css",
  "packages/ui/src/palette.ts",
  "packages/ui/src/colors.ts",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures (ADR 0040 §5) are scope-excluded.
  "e2e",
  // @unbnd/ui's own test dir holds these guards (which name literals as test
  // expectations) and tokens.test.ts; it is not app source.
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

// Curated CSS named colors that count as literals. Deliberately a small,
// real-world-relevant list (NOT the full 140-name set) per ADR 0040 §5's
// "curated list" framing; `transparent` and `currentColor` are intentionally
// absent because they are not literals. Matched on word boundaries so they only
// trip when used as a standalone color value, not as a substring of an
// identifier.
const NAMED_COLORS = [
  "white",
  "black",
  "red",
  "green",
  "blue",
  "yellow",
  "orange",
  "purple",
  "pink",
  "gray",
  "grey",
  "silver",
  "navy",
  "teal",
  "maroon",
  "olive",
  "lime",
  "aqua",
  "fuchsia",
  "gold",
  "coral",
  "crimson",
  "salmon",
  "khaki",
  "violet",
  "indigo",
  "magenta",
  "cyan",
  "brown",
  "beige",
  "ivory",
  "tan",
];

const PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  // Hex on a word boundary: #rgb, #rgba, #rrggbb, #rrggbbaa.
  { label: "hex literal", pattern: /#[0-9a-fA-F]{3,8}\b/g },
  // rgb() / rgba() functional notation.
  { label: "rgb()/rgba() literal", pattern: /\brgba?\(/g },
  // Named colors used as a VALUE, not as part of a hyphenated identifier. A bare
  // \b…\b would false-positive on CSS properties like `white-space` (the `-` is
  // a regex word boundary), so the name must NOT be flanked by `-` or an alnum:
  // the lookbehind rejects a leading `-`/word char and the lookahead rejects a
  // trailing `-`/word char, leaving only standalone color values. transparent /
  // currentColor are not in NAMED_COLORS, so they are never flagged.
  {
    label: "named-color literal",
    pattern: new RegExp(`(?<![\\w-])(${NAMED_COLORS.join("|")})(?![\\w-])`, "g"),
  },
];

describe("color tokens: no raw color literals outside the token layer (ADR 0040 §5, Guard B)", () => {
  const files = SCAN_ROOTS.flatMap(walk);

  it("color literals appear only in the allowlisted token-source files", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");
      for (const { label, pattern } of PATTERNS) {
        const matches = text.match(pattern);
        if (matches) {
          for (const hit of [...new Set(matches)]) {
            offenders.push(`${rel} contains ${label}: ${hit}`);
          }
        }
      }
    }
    expect(
      offenders,
      `raw color literals found outside the token layer:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
