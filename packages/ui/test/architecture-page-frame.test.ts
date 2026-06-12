// Guard — "no raw page-frame outside Container" (ADR 0049 §4).
//
// The page-frame tokens `--page-max` and `--page-pad-x` define the one shared
// page frame. After Story 49 that frame ships from @unbnd/ui as the Container
// primitive (its co-located Container.css), so a `var(--page-max)` /
// `var(--page-pad-x)` reference may live ONLY in two places:
//   - packages/ui/src/components/Container.css   the primitive's frame (the
//                                                relocated `.page` declarations)
//   - apps/web/src/components/RatingControl.css  the bespoke `.rate` frame, the
//                                                one legitimate remaining
//                                                app-side consumer (ADR 0049
//                                                §"divergent .rate frame", OQ-2)
// Any other `var(--page-max)` / `var(--page-pad-x)` use in app or package source
// is a hand-rolled page frame and an offender.
//
// Mirrors packages/ui/test/architecture-spacing-literals.test.ts exactly: REPO
// resolve, SCAN_ROOTS, walk() + SKIP_DIRS, readFileSync per file, single
// aggregated expect(offenders).toEqual([]). walk() collects .css/.ts/.tsx
// excluding .test.*.
//
// Scope note — `var(...)` USES, not token DEFINITIONS. The pattern matches the
// reference form `var(--page-max)` / `var(--page-pad-x)`, so the token
// DEFINITIONS in packages/ui/styles/tokens.css (`--page-max: 720px;`,
// `--page-pad-x: 24px;` — a custom-property assignment, no `var(`) are not
// matched and need no allowlist entry. tokens.css is still walked (the
// definitions are not references), it simply contains no matching use.
//
// Scope-excludes (handled by SKIP_DIRS, not the allowlist):
//   - dist                this guard scans source, not build artifacts (the
//                         bundled dist CSS re-emits the frame; not source).
//   - apps/web/e2e        visual-harness fixtures.
//   - packages/ui/test    these guards (which name the tokens as expectations,
//                         e.g. this file) are not app source — so the guard does
//                         not flag itself.
//
// EXPECTED STATE BEFORE THE IMPLEMENTER: RED. apps/web/src/styles/base.css still
// carries the `.page { max-width: var(--page-max); margin: 0 auto; padding: 0
// var(--page-pad-x) var(--u-space-32); }` rule, which is NOT allowlisted, so it
// is an offender (two hits: `var(--page-max)` and `var(--page-pad-x)`). After
// the Implementer moves the three `.page` declarations into the allowlisted
// packages/ui/src/components/Container.css and removes the base.css `.page` rule,
// the only remaining uses are Container.css (allowlisted) and RatingControl.css
// `.rate` (allowlisted) → green. A future `var(--page-max)` added to any new app
// CSS/TS file would be flagged. This is the page-frame-token analogue of the
// spacing guard's "tokens only in the token file" lock (ADR 0049 §4).
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

// Scan roots. App source (CSS + TS/TSX) is the primary target; packages/ui is
// scanned too so the allowlisted Container.css is an explicit, auditable
// exemption rather than an unscanned blind spot.
const SCAN_ROOTS = [join(REPO, "apps/web/src"), join(REPO, "packages/ui")];

// The only two legitimate consumers of the page-frame tokens (ADR 0049 §4):
// the Container primitive's relocated frame, and the bespoke `.rate` frame.
const ALLOWLIST = new Set([
  "packages/ui/src/components/Container.css",
  "apps/web/src/components/RatingControl.css",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  "engineering-team",
  // Visual-harness fixtures are scope-excluded, consistent with the
  // spacing/color/type guards.
  "e2e",
  // @unbnd/ui's own test dir holds these guards (which name the page-frame
  // tokens as test expectations — including this file); it is not app source.
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

// The page-frame tokens, matched in their `var(--…)` REFERENCE form. The custom
// `[-\w]` token name keeps the match anchored to the exact token (so
// `--page-max-foo` would not match `--page-max`): each alternative is followed
// by an optional run of fallback whitespace and a closing paren. Global so every
// occurrence on a line is counted.
// --chrome-max joined the geometry at ADR 0086 (the chrome row) — same home,
// same rule.
const PAGE_FRAME_TOKEN = /var\(\s*(--page-max|--page-pad-x|--chrome-max)\s*\)/g;

describe("page frame: no raw --page-max/--page-pad-x/--chrome-max outside Container (ADR 0049 §4, ADR 0086 §5)", () => {
  const files = SCAN_ROOTS.flatMap(walk);

  it("page-frame tokens are referenced only by Container.css and the bespoke .rate frame", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      if (ALLOWLIST.has(rel)) continue;
      const text = readFileSync(file, "utf8");

      PAGE_FRAME_TOKEN.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = PAGE_FRAME_TOKEN.exec(text)) !== null) {
        offenders.push(`${rel} contains raw page-frame token: var(${m[1]})`);
      }
    }
    expect(
      offenders,
      `raw page-frame tokens found outside Container (${offenders.length}):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
