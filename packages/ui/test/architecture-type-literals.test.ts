// Guard — "no raw type literals outside the token layer" (ADR 0041 §5).
//
// Type literals (font-size / font-weight / line-height / letter-spacing values,
// and font-family stacks) may live ONLY in the legitimate token-source file.
// Everywhere else — app CSS, and app components/routes (.ts/.tsx) — a type value
// must reference a token: `var(--…)` in CSS, or be a non-literal expression in
// TSX. CSS-wide keywords (inherit / initial / unset / normal / smaller / larger)
// are NOT literals and are never flagged.
//
// Mirrors packages/ui/test/architecture-color-literals.test.ts (itself a mirror
// of packages/trust/test/architecture.test.ts): REPO resolve, walk() +
// SKIP_DIRS, readFileSync per file, single aggregated expect(offenders)
// .toEqual([]). walk() collects .css/.ts/.tsx excluding .test.*.
//
// Allowlist (ADR 0041 §5 — the ONLY legitimate type-literal home):
//   - packages/ui/styles/tokens.css   (the Tier-1 raw type literals live here)
// No TS file is allowlisted: per ADR 0041 (Option G) the runtime-injected font
// literals are swept into CSS, not into a TS constant, so there is no
// type-scale.ts to exempt.
// Scope-excludes (handled by SKIP_DIRS, not the allowlist):
//   - apps/web/src/data   (dead fixture data, not in the render path)
//   - apps/web/e2e        (visual-harness fixtures)
//   - packages/ui/test    (these guards, which name literals as expectations)
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. App CSS still carries ~210
// font-size, ~109 font-weight, ~41 line-height, and ~36 letter-spacing literals,
// and NotFound.tsx / AuthWelcome.tsx still inline their font literals. After the
// sweep every literal moves to tokens.css (via Tier-2 var() references) and the
// guard is green. Avatar.tsx:43's computed `Math.round(size * 0.4)` is NOT a
// literal and must never be flagged; `font: inherit`, `line-height: 0` swept to
// a token, and `var(--…)` references must never be flagged.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scan roots. App source (CSS + TS/TSX) is the primary target; the allowlisted
// @unbnd/ui token sheet is scanned too so the allowlist is an explicit,
// auditable exemption rather than an unscanned blind spot.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui")];

// The single legitimate home for raw type literals (the token layer itself).
const ALLOWLIST = new Set(["packages/ui/styles/tokens.css"]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures and dead fixture data (not in the render path) are
  // scope-excluded, consistent with the color guard.
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

// CSS-wide keywords + per-property keyword values that are NOT literals. A type
// declaration whose value (after trimming any `!important`) is exactly one of
// these is left alone — `inherit` / `normal` etc. carry no scale literal.
// `font: inherit` is the `font` shorthand and is not matched by any property
// pattern below (they key on `font-size:` / `font-weight:` / … specifically),
// so the three `font: inherit` sites are never flagged either way.
const KEYWORD_VALUES = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
  "normal",
  "bold",
  "bolder",
  "lighter",
  "smaller",
  "larger",
  "small",
  "medium",
  "large",
]);

// A CSS property value is a LITERAL (offender) when, after stripping a trailing
// `!important`, it is neither a `var(--…)` reference nor a CSS keyword. This
// catches `13px`, `0.9rem`, `600`, `1.6`, `-0.6px`, `0.04em`, and the bare `0`
// resets (`line-height: 0`, `letter-spacing: 0`) — all of which must reference a
// token after the sweep.
function cssValueIsLiteral(rawValue: string): boolean {
  const value = rawValue
    .replace(/!important\s*$/i, "")
    .trim()
    .toLowerCase();
  if (value === "") return false;
  if (value.includes("var(")) return false; // token reference
  if (KEYWORD_VALUES.has(value)) return false; // CSS keyword, not a literal
  return true;
}

// CSS declarations for the four scale axes plus font-family. The capture group
// is the value, taken up to the declaration terminator (`;`, or `}` for the last
// declaration in a rule). `[^;}]+` deliberately excludes the terminators so the
// captured value is exactly this declaration's value, never the next rule's.
const CSS_PROPS: Array<{ label: string; pattern: RegExp }> = [
  { label: "font-size literal", pattern: /\bfont-size\s*:\s*([^;}]+)/gi },
  { label: "font-weight literal", pattern: /\bfont-weight\s*:\s*([^;}]+)/gi },
  { label: "line-height literal", pattern: /\bline-height\s*:\s*([^;}]+)/gi },
  { label: "letter-spacing literal", pattern: /\bletter-spacing\s*:\s*([^;}]+)/gi },
  // font-family is already token-referenced or `inherit` in app CSS, so this
  // produces no offenders today; it is included to LOCK the family fold — any
  // future bare family stack (e.g. `font-family: Arial, sans-serif`) is caught.
  { label: "font-family literal", pattern: /\bfont-family\s*:\s*([^;}]+)/gi },
];

// TSX inline-style type LITERALS (forward regression net). Matches the camelCase
// style key followed by a numeric literal (`fontSize: 26`) or a quoted-string
// literal (`letterSpacing: "-0.6px"`). It deliberately does NOT match an
// expression value: `fontSize: Math.round(size * 0.4)` (Avatar.tsx:43), a bare
// identifier (`fontSize: bodySize`), or a member/call (`fontSize: scale.size13`)
// all begin with a non-quote, non-digit, non-sign character or contain
// operators, so the value-shape patterns below do not match them.
//
//   - number literal:  key: <optional sign><digits><optional .digits>
//     followed by a `,` / `}` / newline (declaration boundary), so a digit that
//     starts a larger expression (`13 + gap`) is NOT a bare literal.
//   - string literal:  key: "…" or key: '…'
const TS_KEYS = ["fontSize", "fontWeight", "lineHeight", "letterSpacing", "fontFamily"];
const TS_PATTERNS: Array<{ label: string; pattern: RegExp }> = TS_KEYS.flatMap((key) => [
  {
    label: `inline ${key} number literal`,
    // value is a pure numeric literal terminated by , } or end-of-line — i.e. not
    // the head of an expression. (?=…) keeps the terminator out of the match.
    pattern: new RegExp(`\\b${key}\\s*:\\s*[+-]?\\d+(?:\\.\\d+)?\\s*(?=[,}\\n])`, "g"),
  },
  {
    label: `inline ${key} string literal`,
    pattern: new RegExp(`\\b${key}\\s*:\\s*(["'])[^"']*\\1`, "g"),
  },
]);

describe("type tokens: no raw type literals outside the token layer (ADR 0041 §5)", () => {
  const files = SCAN_ROOTS.flatMap(walk);

  it("type literals appear only in the allowlisted token-source file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");

      if (rel.endsWith(".css")) {
        for (const { label, pattern } of CSS_PROPS) {
          pattern.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(text)) !== null) {
            if (cssValueIsLiteral(m[1])) {
              offenders.push(`${rel} contains ${label}: ${m[1].trim()}`);
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
      `raw type literals found outside the token layer (${offenders.length}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
