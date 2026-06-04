// Guard — "no raw transition / animation duration or easing literals outside
// the motion layer", plus "the reduced-motion block is present" (ADR 0044 §4).
//
// Motion is the fifth and last token axis (color/type/spacing/radii-elevation-z
// are done). Duration and easing literals may live ONLY in the legitimate
// token-source file. Everywhere else — app CSS, and app components/routes
// (.ts/.tsx) — a `transition` / `animation` timing component must reference a
// token: `var(--…)` in CSS, or be a non-literal expression in TSX. A second
// assertion locks the global `@media (prefers-reduced-motion: reduce)` block
// present in the token sheet so the accessibility addition cannot be silently
// removed.
//
// Mirrors packages/ui/test/architecture-spacing-literals.test.ts and
// architecture-shape-literals.test.ts (themselves mirrors of
// packages/trust/test/architecture.test.ts): REPO resolve, walk() + SKIP_DIRS,
// readFileSync per file, single aggregated expect(offenders).toEqual([]).
// walk() collects .css/.ts/.tsx excluding .test.*. Reuses the parenthesis-aware
// splitComponents() so `var(...)` / `cubic-bezier(...)` are single atoms.
//
// The decisive extension over the spacing/shape guards (ADR 0044 §4): a motion
// value is a SHORTHAND that frequently carries comma-separated LAYERS
// (`transition: background-color 0.15s ease, border-color 0.15s ease`), and a
// `cubic-bezier(a, b, c, d)` easing carries internal commas. So the value is
// first split on TOP-LEVEL commas (parenthesis-aware — a cubic-bezier()/steps()
// comma is NOT a layer break), then each layer is split on whitespace at
// paren-depth 0. An offender is any component that is:
//   - a bare DURATION literal — `^[+-]?\d*\.?\d+(ms|s)$` (e.g. `120ms`, `0.15s`),
//     OR
//   - a bare EASING literal — `ease` / `ease-in` / `ease-out` / `ease-in-out` /
//     `linear` / `step-start` / `step-end`, or a bare `cubic-bezier(…)` /
//     `steps(…)` function atom,
//   that is NOT `var(--…)`.
// NON-offenders (never flagged): property names (`color`, `transform`, `width`,
// `background`, `border-color`, `box-shadow`, `background-color`), `var(...)`
// references, `none`, the global keywords, and the value-stable `0s` / `0ms`.
// So `transition: color var(--u-duration-120ms) var(--u-ease-default)` passes
// (property name `color` is neither a duration nor an easing literal; the other
// two are var()); `transition: color 120ms ease` is an OFFENDER (both `120ms`
// and `ease` are raw literals); `transition: none` passes.
//
// Property scope (ADR 0044 §4(a)): `transition` (shorthand),
// `transition-duration`, `transition-timing-function`, `animation` (shorthand),
// `animation-duration`, `animation-timing-function`. (`transition-delay` /
// `animation-delay` carry durations too and are included defensively;
// `transition-property` / `animation-name` carry property/keyword names, not
// durations/easings, and are NOT scanned; `scroll-behavior` is NOT scanned —
// ADR 0044 Option I.) The capture group is the value up to the declaration
// terminator (`;`, or `}` for the last declaration in a rule); `[^;}]+` spans
// multiple physical lines, so a multi-line `transition:` shorthand is captured
// whole.
//
// TSX forward net (ADR 0044 §4(a)): inline-style keys `transition`,
// `transitionDuration`, `transitionTimingFunction`, `animation`,
// `animationDuration`, `animationTimingFunction` assigned a quoted-string
// literal (any string — a `transition`/`animation` shorthand string carries a
// duration/easing) are offenders; never an expression (a bare identifier, a
// member/call, an operator expression). None exist today, so this net is green
// on landing and red on any future inline motion literal. Avatar.tsx's computed
// `width: size` / `Math.round(size * 0.4)` are not motion keys and are never
// matched.
//
// Allowlist (ADR 0044 §4 — the ONLY legitimate motion-literal home):
//   - packages/ui/styles/tokens.css   (the Tier-1 raw duration/easing literals
//                                       and the reduced-motion block live here)
// Scope-excludes (handled by SKIP_DIRS, not the allowlist):
//   - apps/web/e2e        (visual-harness fixtures)
//   - packages/ui/test    (these guards, which name literals as expectations)
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. App CSS still carries 29
// `transition:` declarations whose duration components (120/140/160/180/200ms
// and FollowButton's 0.15s) and `ease` easing are raw literals, AND the token
// sheet does NOT yet contain the `@media (prefers-reduced-motion: reduce)`
// block. After the sweep every duration/easing component moves to a
// var(--u-duration-*) / var(--u-ease-*) reference and the Implementer adds the
// reduced-motion block, so both assertions go green.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scan roots. App source (CSS + TS/TSX) is the primary target; the allowlisted
// @unbnd/ui token sheet is scanned too so the allowlist is an explicit,
// auditable exemption rather than an unscanned blind spot.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui")];

// The single legitimate home for raw motion literals (the token layer itself),
// which is also where the reduced-motion block lives.
const ALLOWLIST = new Set(["packages/ui/styles/tokens.css"]);

// The token sheet path, used by both assertions: the literal scan exempts it,
// the presence assertion reads it directly.
const TOKENS_CSS = join(REPO, "packages/ui/styles/tokens.css");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures are scope-excluded, consistent with the
  // color/type/spacing/shape guards.
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

// CSS-wide keywords that may sit in a motion value and are NOT literals. Used so
// a future `transition: none` / `animation: inherit` is not a false positive.
const KEYWORD_VALUES = new Set([
  "none",
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);

// A bare DURATION literal: an optionally-signed number with a `ms`/`s` time unit
// (e.g. `120ms`, `0.15s`, `200ms`). This is the raw-time shape the motion tokens
// replace.
const DURATION_LITERAL = /^[+-]?\d*\.?\d+(ms|s)$/i;

// The bare easing KEYWORDS (timing-function values). A bare `cubic-bezier(…)` /
// `steps(…)` function atom is also an easing literal, handled separately below
// (it is a single parenthesis-aware atom, so it is matched by prefix).
const EASING_KEYWORDS = new Set([
  "ease",
  "ease-in",
  "ease-out",
  "ease-in-out",
  "linear",
  "step-start",
  "step-end",
]);

// True when a duration component resolves to zero (`0s`, `0ms`, `0.0ms`), which
// is value-stable and left bare — never an offender (mirrors the spacing/shape
// guards' zero exemption).
function isZeroDuration(component: string): boolean {
  const n = parseFloat(component);
  return Number.isFinite(n) && n === 0;
}

// Split a CSS value into space-separated components, PARENTHESIS-AWARE so a
// `var(--a-b)` / `cubic-bezier(0.4, 0, 0.2, 1)` / `steps(4, end)` (which contain
// spaces / commas) is one atom, not several. Any run of whitespace at
// paren-depth 0 is a separator. (Copied verbatim from the spacing/shape guards.)
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

// Split a CSS value into top-level (per-layer) segments at PARENTHESIS-AWARE
// commas, so a `cubic-bezier(0.4, 0, 0.2, 1)` / `steps(4, end)` internal comma
// is NOT a layer break, but the comma between `a 120ms ease, b 120ms ease` IS.
function splitLayers(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Classify a single component as an offending raw motion literal.
//   - var(--…)                       → token reference, never an offender
//   - cubic-bezier(…) / steps(…)     → a bare easing FUNCTION literal, offender
//   - other (…)-containing atom      → not a recognized motion literal, skip
//   - bare duration `<n>(ms|s)`      → offender unless it resolves to zero
//   - bare easing keyword            → offender
//   - property name / other keyword  → not a motion literal, skip
function componentIsMotionLiteral(raw: string): boolean {
  const c = raw.toLowerCase();
  if (c.startsWith("var(")) return false; // token reference
  if (c.startsWith("cubic-bezier(") || c.startsWith("steps(")) return true; // bare easing function literal
  if (c.includes("(")) return false; // some other function atom; not a duration/easing literal
  if (KEYWORD_VALUES.has(c)) return false; // none / global keyword
  if (DURATION_LITERAL.test(c)) return !isZeroDuration(c); // bare duration: offender unless 0
  if (EASING_KEYWORDS.has(c)) return true; // bare easing keyword
  return false; // property name (color/transform/width/box-shadow/…) or anything else
}

// A motion declaration's value is an OFFENDER when, after stripping a trailing
// `!important`, ANY component of ANY layer is a bare duration or easing literal
// that is not a var() token reference. The value is split into layers at
// top-level commas first (so a cubic-bezier()'s internal commas are intact and a
// multi-layer transition is split per layer), then each layer into components.
function motionValueHasLiteral(rawValue: string): boolean {
  const value = rawValue.replace(/!important\s*$/i, "").trim();
  if (value === "") return false;
  if (KEYWORD_VALUES.has(value.toLowerCase())) return false; // `none` / global keyword as the whole value
  return splitLayers(value).some((layer) =>
    splitComponents(layer.trim()).some(componentIsMotionLiteral),
  );
}

// In-scope motion CSS properties (ADR 0044 §4(a)): the two shorthands plus the
// duration/easing/delay longhands. The capture group is the value, taken up to
// the declaration terminator (`;`, or `}` for the last declaration in a rule);
// `[^;}]+` excludes the terminators and spans physical newlines, so a multi-line
// `transition:` shorthand is captured whole. Property names are listed
// longest-first inside the alternation so `transition-timing-function` is
// preferred over `transition`, and word boundaries keep `transition-property` /
// `animation-name` (NOT listed) out.
const MOTION_PROP_NAMES = [
  "transition-timing-function",
  "transition-duration",
  "transition-delay",
  "transition",
  "animation-timing-function",
  "animation-duration",
  "animation-delay",
  "animation",
];

const CSS_MOTION_PATTERN = new RegExp(
  `\\b(${MOTION_PROP_NAMES.join("|")})\\s*:\\s*([^;}]+)`,
  "gi",
);

// TSX inline-style motion keys (forward regression net, ADR 0044 §4(a)). The
// camelCase equivalents of the in-scope CSS properties.
const TS_KEYS = [
  "transition",
  "transitionDuration",
  "transitionTimingFunction",
  "transitionDelay",
  "animation",
  "animationDuration",
  "animationTimingFunction",
  "animationDelay",
];

// For each motion key, match a LITERAL value only — never an expression. A
// quoted-string literal (`transition: "color 120ms ease"`, `animationDuration:
// "200ms"`) is the realistic inline-motion shape — any transition/animation
// shorthand or duration/easing string carries a literal. A bare numeric literal
// (`transitionDuration: 200` — unusual but possible for a unitless ms in some
// libs) is also matched, terminated by `,`/`}`/newline so a digit that heads an
// expression (`200 + base`) is not matched. A bare identifier (`transition: x`),
// a member/call (`Math.round(...)`), a template literal, or any operator
// expression begins with a non-quote, non-digit, non-sign char (or contains
// operators) so it is NOT matched by these value-shape patterns — mirroring the
// spacing/shape guards exactly.
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

// Whitespace-tolerant matcher for the global reduced-motion block in the token
// sheet (ADR 0044 §4(b)). Asserts presence only — not the block interior — so
// the guard is not coupled to the exact alias spellings; the literal scan and
// the Story-39 visual gate already cover the values.
const REDUCED_MOTION_PATTERN = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/;

describe("motion tokens: no raw transition / animation duration or easing literals outside the token layer (ADR 0044 §4)", () => {
  const files = SCAN_ROOTS.flatMap(walk);

  it("transition / animation duration and easing literals appear only in the allowlisted token-source file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");

      if (rel.endsWith(".css")) {
        CSS_MOTION_PATTERN.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = CSS_MOTION_PATTERN.exec(text)) !== null) {
          const prop = m[1];
          const value = m[2];
          if (motionValueHasLiteral(value)) {
            offenders.push(
              `${rel} contains raw ${prop} literal: ${prop}: ${value.replace(/\s+/g, " ").trim()}`,
            );
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
      `raw motion literals found outside the token layer (${offenders.length}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the token sheet ships a global @media (prefers-reduced-motion: reduce) block", () => {
    const tokens = readFileSync(TOKENS_CSS, "utf8");
    expect(
      REDUCED_MOTION_PATTERN.test(tokens),
      "packages/ui/styles/tokens.css must contain a @media (prefers-reduced-motion: reduce) block (ADR 0044 §3/§4(b)) — the one intentional accessibility addition. It is absent until the Implementer adds it.",
    ).toBe(true);
  });
});
