// Theme-completeness guard (ADR 0050 §"The theme-completeness guard").
//
// ADR 0050 chose Option A: a `[data-theme="<name>"]` skin overrides the Tier-1
// RAW color tier (`--u-raw-color-*`); the 73 Tier-2 semantic color aliases under
// `:root` resolve through the overridden raws automatically, so an app re-skin
// touches no app CSS. This guard makes two promises enforceable:
//
//   Assertion 1 (completeness): every declared `[data-theme]` redefines EVERY
//   `--u-raw-color-*` token that `:root` defines. A theme can never silently
//   ship half-defined — add a raw color to `:root` and every theme must define
//   it too, or this goes red. Theme-invariant groups (non-color raws, Tier-2
//   aliases, `--u-raw-elevation-*`, `--page-*`) are NOT required of a theme
//   (ADR 0050 §4): under Option A they re-theme through the raw overrides, or
//   they are not a skin concern.
//
//   Assertion 2 (swap proof / indirection): at least one declared theme exists
//   in which at least one `--u-raw-color-*` resolves to a value DIFFERENT from
//   its `:root` value, while a sampled Tier-2 color alias's DEFINITION
//   (e.g. `--u-amber: var(--u-raw-color-amber-500)`) is UNCHANGED between
//   `:root` and that theme. This proves the skin swaps purely via the raw tier:
//   the semantic layer keeps doing its one job (role -> raw) unedited, and no
//   app CSS changes. This is a static-analysis proof — it never renders, so it
//   cannot perturb the Story-39 visual baseline.
//
// `var()`-chain RESOLVABILITY across the whole sheet (including theme blocks) is
// already Guard A's job (architecture-token-refs.test.ts, "no undefined token
// references"). This guard's non-redundant jobs are COMPLETENESS and the one
// INDIRECTION assertion above; it does not re-implement a var() resolver.
//
// Mirrors the architecture-*.test.ts pattern: REPO resolve, readFileSync,
// aggregated `expect(offenders).toEqual([])`. The `definedTokens()` regex helper
// is COPIED from architecture-token-refs.test.ts (the lighter, lower-risk option
// the ADR leaves to Implementer latitude — copy vs. extract); a parallel
// `definedTokenMap()` additionally captures each definition's VALUE so the
// indirection assertion can compare resolved values across blocks.
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. tokens.css today defines NO
// `[data-theme]` block, so there is no declared, complete, value-differing theme
// and assertion 2 fails with a clear message ("expected at least one declared
// [data-theme] block; found none"). The guard is NOT vacuously green when zero
// themes exist — it REQUIRES at least one complete theme that differs from
// :root. After the Implementer adds the `[data-theme="dark"]` skeleton
// (redefining every `--u-raw-color-*` with at least one differing value, leaving
// the Tier-2 aliases untouched) both assertions pass and the guard is green.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");
const TOKENS = join(REPO, "packages/ui/styles/tokens.css");

// Copied verbatim from architecture-token-refs.test.ts: every `--name:`
// custom-property DEFINITION in a CSS string, as a Set. A definition is a
// custom-property name immediately followed by a colon.
function definedTokens(css: string): Set<string> {
  const defined = new Set<string>();
  const re = /(--[a-zA-Z0-9-]+)\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) defined.add(m[1]);
  return defined;
}

// Same definition grammar as definedTokens(), but keeps the VALUE (everything up
// to the terminating `;`), trimmed and inner-whitespace-collapsed so two
// definitions that differ only in formatting compare equal. Used by the
// indirection assertion to tell "redefined to a different value" from "redefined
// to the same value" and to confirm a Tier-2 alias's definition is UNCHANGED
// across blocks. Last definition within a block wins (CSS cascade within a rule).
function definedTokenMap(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]*);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    map.set(m[1], m[2].trim().replace(/\s+/g, " "));
  }
  return map;
}

// The body of the first `:root { … }` rule (the default light skin), brace-
// matched so nested constructs do not truncate it. The token sheet's `:root`
// has no nested braces, but matching honestly keeps the parser robust if a
// future rule does.
function rootBody(css: string): string {
  return ruleBody(css, /:root\s*\{/);
}

// Extract the brace-balanced body that follows the first match of `opener`.
function ruleBody(css: string, opener: RegExp): string {
  const start = css.search(opener);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return css.slice(open + 1);
}

// Every declared theme: distinct `[data-theme="<name>"]` selector names, in
// source order, deduped. Enumerating by parse (not a hand-list) means adding a
// theme block automatically enrolls it in the completeness guard.
function declaredThemes(css: string): string[] {
  const names: string[] = [];
  const re = /\[data-theme="([^"]+)"\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

// The brace-balanced body of the FIRST `[data-theme="<name>"] { … }` rule.
function themeBody(css: string, name: string): string {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return ruleBody(css, new RegExp(`\\[data-theme="${esc}"\\]\\s*\\{`));
}

describe("theming substrate: every declared theme is complete and swaps via the raw tier (ADR 0050)", () => {
  const css = readFileSync(TOKENS, "utf8");
  const root = rootBody(css);
  const rootValues = definedTokenMap(root);

  // inScope is DERIVED, never hand-listed: every --u-raw-color-* defined under
  // :root. Add a raw color and every theme must define it or the guard fails.
  const inScope = [...definedTokens(root)].filter((t) => t.startsWith("--u-raw-color-")).sort();

  const themes = declaredThemes(css);

  it("derives a non-empty in-scope raw-color set from :root (guard wiring sanity)", () => {
    // Not the feature under test — a wiring check so a parser regression can't
    // make the real assertions vacuously pass against an empty scope set.
    expect(
      inScope.length,
      "expected :root to define --u-raw-color-* tokens; found none (parser or tokens.css regression)",
    ).toBeGreaterThan(0);
  });

  it("every declared [data-theme] redefines every in-scope --u-raw-color-* token (Assertion 1: completeness)", () => {
    const offenders: string[] = [];
    for (const theme of themes) {
      const defined = definedTokens(themeBody(css, theme));
      for (const token of inScope) {
        if (!defined.has(token)) {
          offenders.push(`[data-theme="${theme}"] does not redefine ${token}`);
        }
      }
    }
    expect(
      offenders,
      `a declared theme is half-defined — it does not redefine every in-scope raw-color token:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("at least one declared theme swaps a raw color while leaving its Tier-2 alias untouched (Assertion 2: swap proof)", () => {
    // RED today: no [data-theme] block exists, so there is no theme to prove the
    // indirection. This MUST NOT pass vacuously — the substrate is unproven until
    // a real, value-differing, complete theme exists.
    expect(
      themes.length,
      "expected at least one declared [data-theme] block to prove the raw-tier swap; found none. " +
        "Add the [data-theme=\"dark\"] skeleton per ADR 0050.",
    ).toBeGreaterThan(0);

    // A Tier-2 color alias that points at a raw, sampled to prove the semantic
    // layer is NOT edited by the swap. `--u-amber` aliases --u-raw-color-amber-500
    // under :root; the swap re-points that raw, not this alias.
    const sampledAlias = "--u-amber";
    const sampledAliasRootDef = rootValues.get(sampledAlias);
    expect(
      sampledAliasRootDef,
      `sampled Tier-2 alias ${sampledAlias} is not defined under :root (tokens.css regression)`,
    ).toBeDefined();

    // Find a declared theme that (a) is complete (defines every in-scope raw),
    // (b) redefines at least one in-scope raw to a value DIFFERENT from :root,
    // and (c) leaves the sampled Tier-2 alias's DEFINITION unchanged from :root
    // (i.e. it does not redefine the alias at all, or redefines it identically).
    // Such a theme proves the skin swaps purely through the raw tier.
    const failureReasons: string[] = [];
    let proven = false;

    for (const theme of themes) {
      const body = themeBody(css, theme);
      const defined = definedTokens(body);
      const values = definedTokenMap(body);

      const missing = inScope.filter((t) => !defined.has(t));
      if (missing.length > 0) {
        failureReasons.push(
          `[data-theme="${theme}"] is incomplete (missing ${missing.length} raw-color token(s)); not a valid swap proof`,
        );
        continue;
      }

      const differing = inScope.filter(
        (t) => values.get(t) !== undefined && values.get(t) !== rootValues.get(t),
      );
      if (differing.length === 0) {
        failureReasons.push(
          `[data-theme="${theme}"] redefines every raw to its :root value; nothing visibly swaps`,
        );
        continue;
      }

      // The sampled alias must NOT be re-pointed by the theme: either it is
      // absent from the theme block (preferred — the indirection does the work)
      // or it is present with the identical definition.
      const aliasInTheme = values.get(sampledAlias);
      if (aliasInTheme !== undefined && aliasInTheme !== sampledAliasRootDef) {
        failureReasons.push(
          `[data-theme="${theme}"] re-points the Tier-2 alias ${sampledAlias} ` +
            `(now "${aliasInTheme}"); the swap must flow through the raw tier, not by editing the semantic layer`,
        );
        continue;
      }

      proven = true;
      break;
    }

    expect(
      proven,
      `no declared theme proves the raw-tier swap. A valid proof is a complete theme that redefines ` +
        `at least one --u-raw-color-* to a value differing from :root while leaving ${sampledAlias}'s ` +
        `definition unchanged (so the semantic layer and app CSS are not touched):\n${failureReasons.join("\n")}`,
    ).toBe(true);
  });
});
