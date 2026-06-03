// Guard — "no raw radius / box-shadow-geometry / z-index literals outside the
// token layer" (ADR 0043 §5).
//
// Three CSS shape axes share one guard file because they share the identical
// scan machinery (the spacing guard's walk / SKIP_DIRS / splitComponents /
// per-property regex), and the story bundles "four small related axes at once".
// Shape literals may live ONLY in the legitimate token-source file. Everywhere
// else — app CSS, and app components/routes (.ts/.tsx) — a radius, box-shadow,
// or z-index value must reference a token: `var(--…)` in CSS, or be a
// non-literal expression in TSX.
//
// Mirrors packages/ui/test/architecture-spacing-literals.test.ts (itself a
// mirror of architecture-type-literals.test.ts and packages/trust/test/
// architecture.test.ts): REPO resolve, walk() + SKIP_DIRS, readFileSync per
// file, single aggregated expect(offenders).toEqual([]). walk() collects
// .css/.ts/.tsx excluding .test.*. Reuses the spacing guard's parenthesis-aware
// splitComponents() so `var(...)` / `calc(...)` are single atoms.
//
// The three CSS axes (ADR 0043 §5):
//
//   - border-radius (+ logical/longhand corner forms): tokenize the value into
//     components; an offender is any component that is a bare length literal
//     (`Npx`) or a bare `50%` / `999px`-style literal that is NOT var()/calc()/a
//     zero/a keyword. So the multi-value corner shorthand follows the ADR 0042
//     rule — `0 0 var(--u-radius-7) var(--u-radius-7)` passes (the `0` stays
//     bare, the lengths are tokens), `0 0 7px 7px` is an offender. `50%` and
//     `999px` ARE flagged (the ADR tokenizes them as --u-raw-radius-circle /
//     -pill); `var(--u-radius)` / `var(--u-radius-lg)` pass; bare `0` passes.
//
//   - box-shadow: match `box-shadow:` declarations ONLY — the regex keys on
//     `box-shadow` followed by a colon, so a `transition: ... box-shadow 120ms
//     ease ...` (box-shadow as a transition PROPERTY NAME, e.g.
//     AuthMethodCard.css:13) is NEVER matched. An offender is a box-shadow VALUE
//     whose GEOMETRY is literal: after stripping the leading `inset` keyword
//     (allowed) and the already-var()-backed color component, if any remaining
//     component is a bare number/length it is an offender. So
//     `box-shadow: var(--u-elevation-card)` (one var() atom) passes;
//     `box-shadow: 0 1px 3px var(--u-ink-tint-14)` has bare `0`/`1px`/`3px`
//     geometry → offender. `none` / global keywords are not flagged. The
//     already-var()-backed color is not independently flagged. Comma-separated
//     multi-layer shadows (none today) are split per-layer first.
//
//   - z-index: an offender is a bare integer literal. `z-index: var(--u-z-*)`
//     passes; `z-index: 40` is an offender. `auto` / global keywords pass.
//
//   - TSX forward regression net: inline-style keys borderRadius / boxShadow /
//     zIndex assigned a numeric or quoted-string literal are offenders (never an
//     expression, mirroring the type/spacing guards — a computed value such as
//     Avatar.tsx's `width: size` / `Math.round(size * 0.4)` is never flagged,
//     and width/height are not shape keys anyway). None exist today, so this net
//     is green on landing and red on any future inline literal.
//
// Allowlist (ADR 0043 §5 — the ONLY legitimate shape-literal home):
//   - packages/ui/styles/tokens.css   (the Tier-1 raw radius/elevation/z literals
//                                       live here)
// Scope-excludes (handled by SKIP_DIRS, not the allowlist):
//   - apps/web/src/data   (dead fixture data, not in the render path)
//   - apps/web/e2e        (visual-harness fixtures)
//   - packages/ui/test    (these guards, which name literals as expectations)
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. App CSS still carries ~94
// border-radius declarations (incl. the bare `8px`/`12px` duplicates, `50%`,
// `999px`, and the `0 0 7px 7px` corner shorthand), 16 box-shadow declarations
// with literal geometry, and 3 z-index literals. After the sweep every shape
// value moves to a var(--u-*) reference and the guard is green. The
// `var(--u-radius, 8px)` fallback in TagControl.css:132 is a single parenthesis-
// aware atom (the `8px` lives inside the var()), so it is NOT flagged — it is
// already a token reference today and the Implementer drops the dead fallback.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scan roots. App source (CSS + TS/TSX) is the primary target; the allowlisted
// @unbnd/ui token sheet is scanned too so the allowlist is an explicit,
// auditable exemption rather than an unscanned blind spot.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui")];

// The single legitimate home for raw shape literals (the token layer itself).
const ALLOWLIST = new Set(["packages/ui/styles/tokens.css"]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures and dead fixture data (not in the render path) are
  // scope-excluded, consistent with the color/type/spacing guards.
  "e2e",
  "data",
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

// CSS-wide keywords that may sit in a shape value and are NOT literals. Used
// across all three axes so a future `border-radius: inherit` / `box-shadow:
// none` / `z-index: auto` is not a false positive.
const KEYWORD_VALUES = new Set([
  "auto",
  "none",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

// A bare length literal: an optionally-signed number with an optional length
// unit. Used to decide whether a single radius/shadow component is an offending
// length. `vh`/`vw` are included defensively though only px is in use today.
const LENGTH_LITERAL = /^[+-]?\d*\.?\d+(px|rem|em|vh|vw)?$/i;

// A bare percentage literal (`50%`). The ADR tokenizes `50%` (the circle radius)
// to --u-raw-radius-circle, so a bare `%` radius component IS an offender.
const PERCENT_LITERAL = /^[+-]?\d*\.?\d+%$/;

// A bare unitless integer (`40`, `1`) — the z-index literal shape.
const INT_LITERAL = /^[+-]?\d+$/;

// True when a numeric component resolves to zero (`0`, `0px`, `0rem`, `0.0`),
// which the ADR leaves bare (value-stable) — never an offender (the `0` corner
// of the `0 0 7px 7px` shorthand, and the unitless `0` offsets/spread inside a
// box-shadow geometry, stay bare).
function isZero(component: string): boolean {
  const n = parseFloat(component);
  return Number.isFinite(n) && n === 0;
}

// Split a CSS value into space-separated components, PARENTHESIS-AWARE so a
// `var(--a-b)` / `var(--u-radius, 8px)` / `calc(100% + 8px)` (which contain
// spaces / commas / operators) is one atom, not several. Any run of whitespace
// at paren-depth 0 is a separator. (Copied verbatim from the spacing guard.)
function splitComponents(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(ch)) {
      if (cur !== "") out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur !== "") out.push(cur);
  return out;
}

// Strip a trailing `!important` and surrounding whitespace from a captured value.
function cleanValue(rawValue: string): string {
  return rawValue.replace(/!important\s*$/i, "").trim();
}

// --- border-radius ----------------------------------------------------------
// An offender is a border-radius declaration with AT LEAST ONE component that is
// a bare length literal OR a bare `%` literal, judged independently (the ADR
// 0042 multi-value rule). var()/calc()/keyword/zero are exempt.
function radiusValueHasLiteral(rawValue: string): boolean {
  const value = cleanValue(rawValue);
  if (value === "") return false;
  return splitComponents(value).some((raw) => {
    const c = raw.toLowerCase();
    if (c.startsWith("var(")) return false; // token reference (incl. var(--u-radius, 8px))
    if (c.startsWith("calc(")) return false; // calc() atom — not a bare literal
    if (KEYWORD_VALUES.has(c)) return false; // CSS keyword
    if (PERCENT_LITERAL.test(c)) return true; // bare `50%` IS an offender (tokenized to -circle)
    if (LENGTH_LITERAL.test(c)) return !isZero(c); // bare length: offender unless 0
    return false; // anything else (a stray unknown unit/keyword) is not a bare radius literal
  });
}

// --- box-shadow --------------------------------------------------------------
// An offender is a box-shadow VALUE whose geometry is literal. After splitting
// on top-level commas (per-layer; none today are multi-layer), for each layer:
// strip the leading `inset` keyword (allowed) and accept a single var(--…) atom
// (the post-sweep token) as the whole layer; otherwise any bare number/length
// component (offset/blur/spread) flags the layer. The already-var()-backed color
// component is exempt (it is a var()); only the literal geometry offends.
function shadowValueHasGeometryLiteral(rawValue: string): boolean {
  const value = cleanValue(rawValue);
  if (value === "") return false;
  if (KEYWORD_VALUES.has(value.toLowerCase())) return false; // `none` / global keyword
  // Split into layers at top-level commas (parenthesis-aware so a color
  // function's internal commas don't split a layer).
  const layers: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === ",") {
      layers.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  layers.push(cur);
  return layers.some((layer) => {
    const components = splitComponents(layer.trim());
    return components.some((raw) => {
      const c = raw.toLowerCase();
      if (c === "inset") return false; // the inset keyword is allowed
      if (c.startsWith("var(")) return false; // token (geometry token, or the color var)
      if (c.startsWith("calc(")) return false; // calc() atom
      if (KEYWORD_VALUES.has(c)) return false; // CSS keyword
      if (LENGTH_LITERAL.test(c)) return !isZero(c); // bare length geometry: offender unless 0
      return false; // a stray non-geometry token is not a bare literal
    });
  });
}

// --- z-index -----------------------------------------------------------------
// An offender is a bare integer literal (not var()/auto/keyword).
function zIndexValueHasLiteral(rawValue: string): boolean {
  const value = cleanValue(rawValue).toLowerCase();
  if (value === "") return false;
  if (value.startsWith("var(")) return false; // token reference
  if (value.startsWith("calc(")) return false; // calc() atom
  if (KEYWORD_VALUES.has(value)) return false; // `auto` / global keyword
  return INT_LITERAL.test(value); // bare integer (incl. 0) is an offender
}

// Per-property capture regexes. The capture group is the value, taken up to the
// declaration terminator (`;`, or `}` for the last declaration in a rule);
// `[^;}]+` excludes the terminators so the captured value is exactly this
// declaration's value.
//
// border-radius + the corner longhand / logical forms (included so a future one
// is caught, though none exist today). Listed so the bare `border-radius` is one
// alternative and the corner forms are the others.
const RADIUS_PROP_NAMES = [
  "border-start-start-radius",
  "border-start-end-radius",
  "border-end-start-radius",
  "border-end-end-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-radius",
];
const CSS_RADIUS_PATTERN = new RegExp(
  `\\b(${RADIUS_PROP_NAMES.join("|")})\\s*:\\s*([^;}]+)`,
  "gi",
);

// box-shadow: keyed on the colon so `transition: ... box-shadow 120ms ease`
// (a property NAME inside a transition list, no colon after `box-shadow`) is
// NOT matched. The negative lookbehind-free form relies on the required `:`
// immediately after the property name.
const CSS_SHADOW_PATTERN = /\bbox-shadow\s*:\s*([^;}]+)/gi;

// z-index.
const CSS_ZINDEX_PATTERN = /\bz-index\s*:\s*([^;}]+)/gi;

// TSX inline-style shape keys (forward regression net, ADR 0043 §5). The
// camelCase equivalents. None carry inline literals today.
const TS_KEYS = ["borderRadius", "boxShadow", "zIndex"];

// For each shape key, match a LITERAL value only — never an expression. A
// numeric literal (`zIndex: 40`) terminated by `,`/`}`/newline so a digit that
// heads an expression is not matched; or a quoted-string literal
// (`borderRadius: "8px"`). A bare identifier, a member/call (`Math.round(...)`),
// or any operator expression is NOT matched by these value-shape patterns —
// mirroring the type/spacing guards exactly.
const TS_PATTERNS: Array<{ label: string; pattern: RegExp }> = TS_KEYS.flatMap((key) => [
  {
    label: `inline ${key} number literal`,
    pattern: new RegExp(`\\b${key}\\s*:\\s*[+-]?\\d+(?:\\.\\d+)?\\s*(?=[,}\\n])`, "g"),
  },
  {
    label: `inline ${key} string literal`,
    pattern: new RegExp(`\\b${key}\\s*:\\s*(["'])[^"']*\\1`, "g"),
  },
]);

// Each CSS axis runs its capture regex and judges the captured value with its
// axis predicate. `border-radius` captures (property-name, value) so the longhand
// corner forms report their real property; `box-shadow` and `z-index` capture
// (value) only and report a fixed property label.
interface CssAxis {
  pattern: RegExp;
  hasLiteral: (value: string) => boolean;
  // The capture group index that holds the value, and the property-name group
  // (or null to use the fixed `label`).
  valueGroup: number;
  propGroup: number | null;
  label: string;
}

const CSS_AXES: CssAxis[] = [
  {
    pattern: CSS_RADIUS_PATTERN,
    hasLiteral: radiusValueHasLiteral,
    valueGroup: 2,
    propGroup: 1,
    label: "border-radius",
  },
  {
    pattern: CSS_SHADOW_PATTERN,
    hasLiteral: shadowValueHasGeometryLiteral,
    valueGroup: 1,
    propGroup: null,
    label: "box-shadow",
  },
  {
    pattern: CSS_ZINDEX_PATTERN,
    hasLiteral: zIndexValueHasLiteral,
    valueGroup: 1,
    propGroup: null,
    label: "z-index",
  },
];

describe("shape tokens: no raw radius / box-shadow geometry / z-index literals outside the token layer (ADR 0043 §5)", () => {
  const files = SCAN_ROOTS.flatMap(walk);

  it("radius, box-shadow geometry, and z-index literals appear only in the allowlisted token-source file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");

      if (rel.endsWith(".css")) {
        for (const axis of CSS_AXES) {
          axis.pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = axis.pattern.exec(text)) !== null) {
            const captured = m[axis.valueGroup];
            if (axis.hasLiteral(captured)) {
              const prop = axis.propGroup !== null ? m[axis.propGroup] : axis.label;
              offenders.push(`${rel} contains raw ${prop} literal: ${prop}: ${captured.trim()}`);
            }
          }
        }
      } else {
        for (const { label, pattern } of TS_PATTERNS) {
          const matches = text.match(pattern);
          if (matches) {
            for (const hit of [...new Set(matches)]) {
              offenders.push(`${rel} contains ${label}: ${hit.trim()}`);
            }
          }
        }
      }
    }
    expect(
      offenders,
      `raw shape literals found outside the token layer (${offenders.length}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
