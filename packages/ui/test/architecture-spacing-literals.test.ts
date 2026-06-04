// Guard — "no raw spacing literals outside the token layer" (ADR 0042 §5).
//
// Box-spacing literals (padding / margin / gap values, including each component
// of a multi-value shorthand) may live ONLY in the legitimate token-source file.
// Everywhere else — app CSS, and app components/routes (.ts/.tsx) — a spacing
// value must reference a token: `var(--…)` in CSS, or be a non-literal
// expression in TSX.
//
// Mirrors packages/ui/test/architecture-type-literals.test.ts (itself a mirror
// of architecture-color-literals.test.ts and packages/trust/test/architecture
// .test.ts): REPO resolve, walk() + SKIP_DIRS, readFileSync per file, single
// aggregated expect(offenders).toEqual([]). walk() collects .css/.ts/.tsx
// excluding .test.*.
//
// The decisive extension over the type guard (ADR 0042 §5, Option E): a spacing
// value is a MULTI-COMPONENT shorthand (`padding: 8px 12px`, `margin: 0 auto
// 16px`), so the value cannot be checked as one atom. The captured value is
// tokenized into space-separated components (parenthesis-aware, so `var(...)`
// and `calc(...)` are single atoms), and an offender is any declaration with AT
// LEAST ONE component that is a bare length literal. The exempt component kinds
// (ADR 0042 §3 / §5) are:
//   - var(--…)                         → a token reference
//   - calc(…)                          → no spacing calc exists today; exempted
//   - auto / inherit / initial / unset / normal → CSS keywords
//   - bare 0 / 0px / 0rem (value parses to zero) → value-stable, left bare (§2)
// So `padding: var(--u-space-8) var(--u-space-12)` passes, `margin: 0 auto`
// passes, `margin: 0 auto var(--u-space-28)` passes, and
// `padding: 8px var(--u-space-12)` is an OFFENDER (the `8px` is a bare length).
//
// Property scope (ADR 0042 §2): `padding`, `margin`, `gap`, `row-gap`,
// `column-gap`, and the longhand/logical forms (`padding-top|right|bottom|left`,
// `padding-block|inline[-start|-end]`, the `margin-*` equivalents). Positioning
// offsets `top` / `right` / `bottom` / `left` / `inset` are OUT of scope (§2:
// positioning, not box spacing) and are deliberately NOT matched.
//
// Allowlist (ADR 0042 §5 — the ONLY legitimate spacing-literal home):
//   - packages/ui/styles/tokens.css   (the Tier-1 raw spacing literals live here;
//                                       --page-pad-x / --page-max also live here)
// No TS file is allowlisted: per ADR 0042 (Option G) the runtime-injected
// spacing literals are swept into CSS, not into a TS constant, so there is no
// spacing-scale.ts to exempt.
// Scope-excludes (handled by SKIP_DIRS, not the allowlist):
//   - apps/web/e2e        (visual-harness fixtures)
//   - packages/ui/test    (these guards, which name literals as expectations)
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. App CSS still carries ~355
// padding/margin/gap declarations (including multi-value shorthands), and
// NotFound.tsx / AuthWelcome.tsx still inline their spacing literals
// (`padding: "80px 0 60px"`, `marginBottom: 10`, `marginBottom: 22`,
// `marginTop: 16`). After the sweep every length component moves to a
// var(--u-space-*) reference and the guard is green. Avatar.tsx:43/51's computed
// `width: size` / `Math.round(size * 0.4)` are NOT literals (and width/height are
// not spacing keys) and must never be flagged; bare `0`, `auto`, `%`,
// `calc(...)`, `var(--…)`, and positioning `top/right/bottom/left/inset` must
// never be flagged.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scan roots. App source (CSS + TS/TSX) is the primary target; the allowlisted
// @unbnd/ui token sheet is scanned too so the allowlist is an explicit,
// auditable exemption rather than an unscanned blind spot.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui")];

// The single legitimate home for raw spacing literals (the token layer itself).
const ALLOWLIST = new Set(["packages/ui/styles/tokens.css"]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures are scope-excluded, consistent with the color and
  // type guards.
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

// CSS keywords that may sit inside a spacing shorthand and are NOT literals
// (ADR 0042 §3). `auto` (margin centering) is the common one; the global CSS
// keywords are included so a future `margin: inherit` is not a false positive.
const KEYWORD_VALUES = new Set([
  "auto",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "normal",
]);

// A bare length literal: an optionally-signed number with an optional length
// unit. Used to decide whether a single shorthand component is an offending
// literal. `vh`/`vw` are included defensively though only px is in use today.
const LENGTH_LITERAL = /^[+-]?\d*\.?\d+(px|rem|em|vh|vw)?$/i;

// True when a numeric component resolves to zero (`0`, `0px`, `0rem`, `0.0`),
// which ADR 0042 §2 leaves bare (value-stable) — never an offender.
function isZero(component: string): boolean {
  const n = parseFloat(component);
  return Number.isFinite(n) && n === 0;
}

// Split a CSS value into space-separated components, PARENTHESIS-AWARE so a
// `var(--a-b)` or `calc(100% + 8px)` (which contain spaces / operators) is one
// atom, not several. Any run of whitespace at paren-depth 0 is a separator.
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

// A spacing declaration's value is an OFFENDER when, after stripping a trailing
// `!important`, ANY of its space-separated components is a bare length literal
// that is not exempt (var()/calc()/keyword/zero). This is the multi-value
// shorthand check: each component is judged independently, and a single
// remaining literal among otherwise-tokenized components fails the declaration.
function spacingValueHasLiteral(rawValue: string): boolean {
  const value = rawValue.replace(/!important\s*$/i, "").trim();
  if (value === "") return false;
  const components = splitComponents(value);
  return components.some((raw) => {
    const c = raw.toLowerCase();
    if (c.startsWith("var(")) return false; // token reference
    if (c.startsWith("calc(")) return false; // calc() atom — not a bare literal
    if (KEYWORD_VALUES.has(c)) return false; // CSS keyword
    if (LENGTH_LITERAL.test(c)) return !isZero(c); // bare length: offender unless 0
    return false; // anything else (e.g. a stray %, an unknown keyword) is not a bare spacing literal
  });
}

// In-scope box-spacing CSS properties (ADR 0042 §2): the named trio plus its
// longhand and logical forms. The capture group is the value, taken up to the
// declaration terminator (`;`, or `}` for the last declaration in a rule);
// `[^;}]+` excludes the terminators so the captured value is exactly this
// declaration's value. The property names are listed longest-first inside each
// alternation so e.g. `padding-inline-start` is preferred over `padding-inline`,
// and word boundaries keep `top`/`right`/`bottom`/`left`/`inset` (NOT listed) out.
const SPACING_PROP_NAMES = [
  // gap family
  "row-gap",
  "column-gap",
  "gap",
  // padding longhand / logical
  "padding-inline-start",
  "padding-inline-end",
  "padding-inline",
  "padding-block-start",
  "padding-block-end",
  "padding-block",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding",
  // margin longhand / logical
  "margin-inline-start",
  "margin-inline-end",
  "margin-inline",
  "margin-block-start",
  "margin-block-end",
  "margin-block",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin",
];

const CSS_SPACING_PATTERN = new RegExp(
  `\\b(${SPACING_PROP_NAMES.join("|")})\\s*:\\s*([^;}]+)`,
  "gi",
);

// TSX inline-style spacing keys (forward regression net, ADR 0042 §5). The
// camelCase equivalents of the in-scope CSS properties. width/height are NOT
// spacing keys, so Avatar.tsx's `width: size` is out of scope on the key alone.
const TS_KEYS = [
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "paddingInline",
  "paddingInlineStart",
  "paddingInlineEnd",
  "paddingBlock",
  "paddingBlockStart",
  "paddingBlockEnd",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "marginInline",
  "marginInlineStart",
  "marginInlineEnd",
  "marginBlock",
  "marginBlockStart",
  "marginBlockEnd",
  "gap",
  "rowGap",
  "columnGap",
];

// For each spacing key, match a LITERAL value only — never an expression. A
// numeric literal (`marginBottom: 10`) terminated by `,`/`}`/newline so a digit
// that heads an expression (`10 + gap`) is not matched; or a quoted-string
// literal (`padding: "80px 0 60px"`). A bare identifier (`width: size`), a
// member/call (`Math.round(...)`), or any operator expression begins with a
// non-quote, non-digit, non-sign char (or contains operators) so it is NOT
// matched by these value-shape patterns — mirroring the type guard exactly.
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

describe("spacing tokens: no raw spacing literals outside the token layer (ADR 0042 §5)", () => {
  const files = SCAN_ROOTS.flatMap(walk);

  it("spacing literals appear only in the allowlisted token-source file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");

      if (rel.endsWith(".css")) {
        CSS_SPACING_PATTERN.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = CSS_SPACING_PATTERN.exec(text)) !== null) {
          const prop = m[1];
          const value = m[2];
          if (spacingValueHasLiteral(value)) {
            offenders.push(`${rel} contains raw ${prop} literal: ${prop}: ${value.trim()}`);
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
      `raw spacing literals found outside the token layer (${offenders.length}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
