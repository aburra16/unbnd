// Guard A — "no undefined token references" (ADR 0040 §5).
//
// Every `var(--…)` reference in the app's CSS (and in the token sheet's own
// internal references) must resolve to a custom property DEFINED in the single
// definition site, packages/ui/styles/tokens.css. A reference to a name that is
// never defined renders its inline fallback silently and is disconnected from
// the token system — that is the `--u-bg` / `--u-line` / `--u-danger` drift this
// guard kills and prevents from recurring.
//
// Mirrors packages/trust/test/architecture.test.ts exactly: REPO resolve,
// walk() + SKIP_DIRS, readFileSync per file, a single aggregated
// expect(offenders).toEqual([]). The walk() filter is widened to include .css.
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. tokens.css today defines neither
// --u-bg, --u-line, nor --u-danger, but AuthorEdit.css / AuthorBadge.css /
// ClaimControl.css reference them, so this guard reports them as offenders.
// After the migration every referenced name is defined and the guard is green.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// The single definition site for color/layout/type custom properties.
const TOKENS = join(REPO, "packages/ui/styles/tokens.css");

// The roots whose .css we scan for var(--…) references. App CSS is the primary
// target; the token sheet itself is scanned too, because after the two-tier
// migration its Tier-2 aliases reference Tier-1 raws via var(--u-raw-color-…),
// and those internal references must resolve as well.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui/styles")];

// node_modules / dist / .git / engineering-team per the trust precedent, plus
// the visual-harness fixture tree (apps/web/e2e), which is test-layer fixtures,
// not app source (ADR 0040 §5).
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  "e2e",
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.css$/.test(name) ? [full] : [];
  });
}

// Parse every `--name:` custom-property DEFINITION from the token sheet. This
// is the authoritative defined-token set: --u-*, --signal-*, --genre-* (the
// gate decision keeps --signal-*/--genre-* as defined Tier-2 tokens, so Guard A
// must treat them as defined), plus the non-color --font-*/--page-* entries and
// the post-migration --u-raw-color-* raws. A definition is a custom property
// name immediately followed by a colon.
function definedTokens(css: string): Set<string> {
  const defined = new Set<string>();
  const re = /(--[a-zA-Z0-9-]+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) defined.add(m[1]);
  return defined;
}

// Every custom property a `var(--…)` REFERENCE points at, in source order.
function referencedTokens(css: string): string[] {
  const refs: string[] = [];
  const re = /var\(\s*(--[a-zA-Z0-9-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) refs.push(m[1]);
  return refs;
}

describe("color tokens: no undefined token references (ADR 0040 §5, Guard A)", () => {
  const defined = definedTokens(readFileSync(TOKENS, "utf8"));
  const files = SCAN_ROOTS.flatMap(walk);

  it("every var(--…) reference resolves to a token defined in @unbnd/ui", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      const css = readFileSync(file, "utf8");
      for (const ref of referencedTokens(css)) {
        if (!defined.has(ref)) offenders.push(`${rel} references undefined token ${ref}`);
      }
    }
    expect(
      offenders,
      `undefined token references found (each renders its inline fallback, not a token):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
