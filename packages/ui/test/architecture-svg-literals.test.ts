// Guard — "no raw <svg> in app code; every icon goes through the @unbnd/ui
// Icon registry primitive" (ADR 0046 §5 "The guard", refining ADR 0038 §6 "No
// raw <button> / <svg> ... allowlist names the registry/primitive files only";
// story 46 AC "the guard scans apps/web/src, finds none, passes").
//
// Mirrors the no-raw-<button> guard (packages/ui/test/architecture-button-
// literals.test.ts), itself a mirror of the Story-40..44 token guards and
// packages/trust/test/architecture.test.ts: REPO resolve, walk() + SKIP_DIRS,
// readFileSync per file, comment-strip, brace/string-aware opening-tag scan, a
// single aggregated expect(offenders).toEqual([]).
//
// SCOPE (ADR 0046 §5, option 1 "Scope exclusion" — RECOMMENDED): apps/web/src
// only (.ts/.tsx). The Icon registry's home — packages/ui/src/components/Icon —
// is OUTSIDE SCAN_ROOT, so it is never scanned and needs no allowlist entry at
// all, exactly as the button guard does not scan packages/ui/src/components.
// The guard's job is "no raw <svg> in APP code"; the registry is package code.
// SKIP_DIRS matches the prior guards (node_modules / dist / .git /
// engineering-team / e2e / test).
//
// NO DEFERRED SET. Unlike the button guard (which carries a class-name countdown
// for Link / Pill / listbox sites that land later), EVERY one of the five raw
// <svg> sites migrates in THIS story (search, logo, check, bolt, star). So
// apps/web/src reaches ZERO offenders the moment the migration lands, and stays
// zero forever after — no allowlist, no class exemption, no countdown.
//
// DETECTION (comment-aware, ADR 0046 §5 "Detection patterns"):
//
//   1. Comment-strip first. `//` line comments and `/* */` block comments are
//      stripped before scanning, so a `// <svg>` mention in a comment is NOT an
//      offender. (Same strip the button guard uses for its 38-vs-37 correction.)
//
//   2. Raw <svg> JSX opening tags: /<svg(?=[\s/>])/g — a word-boundary lookahead
//      so a hypothetical <svgFoo> / <Svg> custom component is not matched, and
//      lowercase only so <Icon> (the migrated primitive) is never a raw <svg>.
//
//   3. Dynamic / polymorphic forms so an svg cannot hide outside literal <svg>
//      syntax (ADR 0046 §5):
//        - createElement("svg" / createElement('svg'  → offender.
//        - a "svg" / 'svg' STRING LITERAL used as a polymorphic component tag
//          → offender. Unlike "button", the string "svg" has NO HTML-attribute-
//          value role to exclude, so no type-attribute carve-out is needed; the
//          comment-strip + string-aware scan keeps an "svg" inside a comment or
//          an unrelated string from leaking in. In practice apps/web/src has no
//          incidental "svg" literal, so this pattern is a future-proofing
//          tripwire, not an active matcher.
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. apps/web/src holds exactly five
// raw <svg> JSX elements, one per file:
//   - components/SearchIcon.tsx     (search magnifier)
//   - components/LogoMark.tsx       (Unbnd brand mark)
//   - components/FollowButton.tsx   (CheckGlyph)
//   - components/AuthMethodCard.tsx (NostrBolt)
//   - components/RatingControl.tsx  (Star)
// After the Implementer migrates each to <Icon name=…> and removes the one-off
// components / inline SVGs (the registry lives in @unbnd/ui, outside SCAN_ROOT),
// apps/web/src holds ZERO raw <svg> and the guard is GREEN. Avatar.tsx uses an
// <img>/initials gradient and NO <svg> (verified), so it is not flagged and
// needs no exemption.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scope: app source only. The Icon registry home (packages/ui/src/components/
// Icon) is OUTSIDE this root — it is the one legitimate place a raw <svg> lives,
// so it is never scanned and never needs an allowlist entry.
const SCAN_ROOT = join(REPO, "apps/web/src");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures, consistent with the color/type/spacing/shape/button
  // guards.
  "e2e",
  // Test dirs hold guards (which name literals as expectations), never app JSX.
  "test",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    // .ts and .tsx app source, never the *.test.* files.
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

// Strip `//` line comments and `/* */` block comments, replacing each stripped
// span with same-length whitespace so byte offsets (used for the line number)
// are preserved. String / template literals are respected so a `//` or `/*`
// inside a string is not treated as a comment, and so an `"svg"` inside a string
// is still present for the polymorphic-tag scan (the scan distinguishes a
// genuine `"svg"` tag literal from a comment mention). A `<svg` written inside a
// comment is whitespaced out before scanning and is therefore NOT an offender.
function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];
    // Line comment.
    if (ch === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    // Block comment.
    if (ch === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    // String / template literal: copy verbatim so its contents are not parsed
    // as comments. (Escapes are honored so a `\"` does not end the string.)
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        out += src[i];
        if (src[i] === "\\") {
          if (i + 1 < n) {
            out += src[i + 1];
            i += 2;
            continue;
          }
        }
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

// 1-based line number of a character offset.
function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

// A `<svg` JSX opening tag (word-boundary lookahead so `<svgFoo` / a custom
// `<Svg>` is not matched; lowercase `s` only — `<Icon>` the primitive is not a
// raw svg).
const RAW_SVG = /<svg(?=[\s/>])/g;

// createElement("svg" / createElement('svg' — the React.createElement form.
const CREATE_ELEMENT_SVG = /\bcreateElement\(\s*(["'])svg\1/g;

// A "svg" / 'svg' string literal used as a POLYMORPHIC component tag. No HTML
// `type="svg"` analogue exists (unlike "button"), so no carve-out is needed.
const POLYMORPHIC_SVG = /(["'])svg\1/g;

describe("icon registry: no raw <svg> in apps/web/src (ADR 0046 §5; story 46 AC)", () => {
  const files = walk(SCAN_ROOT);

  it("every icon goes through the @unbnd/ui Icon registry — no raw <svg> remains in app code", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      const text = stripComments(readFileSync(file, "utf8"));

      // (2) Raw <svg> JSX opening tags.
      RAW_SVG.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RAW_SVG.exec(text)) !== null) {
        offenders.push(`${rel}:${lineAt(text, m.index)} raw <svg> (migrate to <Icon name=…>)`);
      }

      // (3a) createElement("svg" / createElement('svg'.
      CREATE_ELEMENT_SVG.lastIndex = 0;
      while ((m = CREATE_ELEMENT_SVG.exec(text)) !== null) {
        offenders.push(`${rel}:${lineAt(text, m.index)} createElement("svg") (migrate to <Icon name=…>)`);
      }

      // (3b) polymorphic "svg"/'svg' tag literal (future-proofing tripwire).
      POLYMORPHIC_SVG.lastIndex = 0;
      while ((m = POLYMORPHIC_SVG.exec(text)) !== null) {
        offenders.push(
          `${rel}:${lineAt(text, m.index)} polymorphic "svg" tag literal (migrate to <Icon name=…>)`,
        );
      }
    }

    expect(
      offenders,
      `raw / dynamic <svg> found in apps/web/src (${offenders.length}); ` +
        `every icon must go through the @unbnd/ui Icon registry (no deferred set — ` +
        `all five migrate in story 46):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
