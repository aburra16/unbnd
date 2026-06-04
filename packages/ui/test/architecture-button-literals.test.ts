// Guard — "no raw <button> in app code; every button goes through the
// @unbnd/ui Button / IconButton primitive" (ADR 0045 §6 "The guard", refining
// ADR 0038 §6 "No raw <button> ... allowlist names the registry/primitive files
// only"; story 45 AC "the guard scans apps/web/src, finds none, passes").
//
// Mirrors the Story-40..44 guards (packages/ui/test/architecture-*-literals.test
// .ts, themselves mirrors of packages/trust/test/architecture.test.ts): REPO
// resolve, walk() + SKIP_DIRS, readFileSync per file, a single aggregated
// expect(offenders).toEqual([]).
//
// SCOPE (ADR 0045 §6): apps/web/src only (.ts/.tsx). The primitive's own home —
// packages/ui/src/components — is NOT scanned (it is the one legitimate place a
// raw <button> lives), so it never needs an allowlist entry here. SKIP_DIRS
// matches the prior guards (node_modules / dist / .git / engineering-team / e2e
// / data / test).
//
// DETECTION (comment-aware, ADR 0045 §6 "Detection"):
//
//   1. Comment-strip first. `//` line comments and `/* */` block comments are
//      stripped before scanning, so CopyButton.tsx:2's `// <button> so it is
//      keyboard-focusable…` is NOT an offender. This is the documented 38-vs-37
//      correction: a literal `<button` grep returns 38 hits, one of which is that
//      comment; the true count of raw <button> JSX elements is 37.
//
//   2. Raw <button> JSX opening tags. Each `<button …>` opening tag (its
//      attribute span up to the tag-closing `>`, brace/string-aware) is an
//      offender UNLESS it is DEFERRED-exempt by class name (below).
//
//   3. Dynamic / polymorphic forms so a button cannot hide outside literal
//      `<button>` syntax (ADR 0045 §6; story 45 open question "the dynamic-tag /
//      createElement form"):
//        - createElement("button" / createElement('button'  → offender.
//        - a "button" / 'button' STRING LITERAL used as a polymorphic component
//          tag (e.g. CallToAction.tsx's `const Btn = ctaHref ? "a" : "button"`)
//          → offender. The HTML `type="button"` / `type: "button"` attribute
//          value is NOT a polymorphic tag and is NEVER flagged (it is the button
//          *type*, not the element); the discriminator is the `type` key
//          immediately preceding the literal.
//
// DEFERRED class-name allowlist (ADR 0045 §3 "Scope deferrals" + §6 "How the
// guard stays honest"; shrunk to one entry by Story 47a / ADR 0047 §4): a raw
// <button> is EXEMPT only if its className (the JSX `className="…"` or
// `className={`…`}` on THAT element) contains one of the deferred class names
// below. A raw <button> with any OTHER className (or none) is an offender. The
// exemption is keyed to the CLASS NAME, not the file, so:
//   (a) a NEW raw <button className="something-else"> is flagged even inside a
//       file that already holds a deferred button (e.g. SearchBox.tsx holds both
//       searchbox-hit and the migrated searchbox-seeall);
//   (b) a migrated <Button …> cannot accidentally match — it is not a raw
//       <button> at all, and it has shed its bespoke class.
//
// THIS LIST IS A COUNTDOWN TO EMPTY. Each name retires when its proper primitive
// lands (Link / Pill / a listbox Option). DO NOT ADD TO THIS LIST. When a
// deferred site migrates, delete its entry; the guard tightens automatically.
// Story 47a (ADR 0047 §4) shrank this list from five to one: auth-linklike ×2 +
// sub-back migrated to Link, gps-pill + rated-by-more migrated to Pill, so those
// four entries are deleted. Only the listbox-option site remains:
//
//   - searchbox-hit   (SearchBox.tsx)           role=option listbox item → future listbox / Option primitive
//
// (Retired by Story 47a — no longer exempt, must render through their primitive:
//   - auth-linklike   (AuthEmailSignup.tsx ×2)  link-styled control → Link
//   - sub-back        (Submit.tsx)              link-styled control → Link
//   - gps-pill        (GenrePillSelector.tsx)   selectable pill     → Pill
//   - rated-by-more   (RatedByRow.tsx)          "+N" count pill     → Pill )
//
// EXPECTED STATE BEFORE THE IMPLEMENTER (Story 47a): RED. Only searchbox-hit is
// exempt now. The four sites whose exemptions Story 47a removed are still raw
// <button>s in apps/web/src (auth-linklike ×2 in AuthEmailSignup, sub-back in
// Submit, gps-pill in GenrePillSelector, rated-by-more in RatedByRow), so they
// are now OFFENDERS until the Implementer migrates them to <Link>/<Pill> (which
// moves their rendered <button>, where any, into packages/ui/src/components,
// outside SCAN_ROOT). After that migration only searchbox-hit remains (exempt)
// and the guard is GREEN.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scope: app source only. The primitive home (packages/ui/src/components) is
// deliberately NOT scanned — that is where a raw <button> is supposed to live.
const SCAN_ROOT = join(REPO, "apps/web/src");

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures and dead fixture data (not in the render path),
  // consistent with the color/type/spacing/shape guards.
  "e2e",
  "data",
  // Test dirs hold guards (which name literals as expectations), never app JSX.
  "test",
]);

// The remaining DEFERRED class name (ADR 0045 §3; shrunk to one by Story 47a /
// ADR 0047 §4). A raw <button> whose className contains one of these is exempt.
// COUNTDOWN TO EMPTY — do not add. Story 47a migrated auth-linklike ×2, sub-back
// → Link and gps-pill, rated-by-more → Pill, so their entries are deleted; only
// the listbox-option site remains, awaiting a future listbox/Option primitive.
const DEFERRED_CLASSES = [
  "searchbox-hit", // SearchBox.tsx         — role=option item    → future listbox/Option
];

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
// are preserved. String literals are respected so a `//` or `/*` inside a string
// is not treated as a comment (none drive button detection today, but this keeps
// the strip honest). This is the 38-vs-37 correction: CopyButton.tsx:2's
// `// <button>` comment is whitespaced out before scanning.
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

// From the `<` of a `<button` opening tag, return the tag's full opening-tag
// text up to its closing `>` (brace- and string-aware, so a `className={`a ${x}
// b`}` or an `onClick={() => f(">")}` does not terminate the tag early). Returns
// the substring `<button … >`.
function openingTag(text: string, start: number): string {
  let depth = 0; // JSX expression-container `{ }` depth
  let i = start;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      // Skip a string / template literal wholesale.
      const quote = ch;
      i++;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === ">" && depth === 0) return text.slice(start, i + 1);
    i++;
  }
  return text.slice(start); // unterminated (shouldn't happen in valid JSX)
}

// True when an opening-tag string carries a className (string OR template) that
// contains one of the five deferred class names.
function isDeferred(tag: string): boolean {
  // className="…"  /  className='…'  /  className={`…`}  (the JSX forms in use).
  const m =
    /className\s*=\s*"([^"]*)"/.exec(tag) ??
    /className\s*=\s*'([^']*)'/.exec(tag) ??
    /className\s*=\s*\{`([^`]*)`\}/.exec(tag);
  if (!m) return false;
  const classes = m[1];
  return DEFERRED_CLASSES.some((c) => new RegExp(`(^|\\s)${c}(\\s|$)`).test(classes));
}

// A `<button` JSX opening tag (word boundary so `<buttonish` / a custom
// `<ButtonX>` is not matched; lowercase `b` only — `<Button>` the primitive is
// not a raw button).
const RAW_BUTTON = /<button(?=[\s/>])/g;

// createElement("button" / createElement('button' — the React.createElement form.
const CREATE_ELEMENT_BUTTON = /\bcreateElement\(\s*(["'])button\1/g;

// A "button" / 'button' string literal used as a POLYMORPHIC component tag, e.g.
// `const Btn = ctaHref ? "a" : "button"`. We match a bare "button" literal and
// then EXCLUDE the HTML `type` attribute value (`type="button"` / `type:
// "button"`), which is not a tag. The negative lookbehind rules out a `type`
// key (with `=` or `:` and optional spaces) immediately before the literal.
const POLYMORPHIC_BUTTON = /(?<!\btype\s*[:=]\s*)(["'])button\1/g;

describe("button primitive: no raw <button> in apps/web/src (ADR 0045 §6; story 45 AC)", () => {
  const files = walk(SCAN_ROOT);

  it("every button goes through Button / IconButton — only the deferred-by-class sites remain", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      const text = stripComments(readFileSync(file, "utf8"));

      // (2) Raw <button> JSX opening tags, minus the deferred-by-class exempt set.
      RAW_BUTTON.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = RAW_BUTTON.exec(text)) !== null) {
        const tag = openingTag(text, m.index);
        if (isDeferred(tag)) continue; // deferred-exempt (countdown to empty)
        offenders.push(`${rel}:${lineAt(text, m.index)} raw <button> (migrate to <Button>/<IconButton>)`);
      }

      // (3a) createElement("button" / createElement('button'.
      CREATE_ELEMENT_BUTTON.lastIndex = 0;
      while ((m = CREATE_ELEMENT_BUTTON.exec(text)) !== null) {
        offenders.push(`${rel}:${lineAt(text, m.index)} createElement("button") (migrate to <Button>/<IconButton>)`);
      }

      // (3b) polymorphic "button"/'button' tag literal (excluding type="button").
      POLYMORPHIC_BUTTON.lastIndex = 0;
      while ((m = POLYMORPHIC_BUTTON.exec(text)) !== null) {
        offenders.push(
          `${rel}:${lineAt(text, m.index)} polymorphic "button" tag literal (migrate the button branch to <Button>)`,
        );
      }
    }

    expect(
      offenders,
      `raw / dynamic <button> found in apps/web/src (${offenders.length}); ` +
        `only the searchbox-hit DEFERRED-by-class site is exempt:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
