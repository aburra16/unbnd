// ADR 0014 architecture guard: Brainstorm / NIP-85 API specifics may appear
// ONLY in the adapter (packages/trust/src/brainstorm.ts). Everything else depends on the
// neutral TrustProvider. The provider NAME and relay/API URLs are allowed at
// the seam (config + factory) — what must stay in the adapter is knowledge of
// the backend's HTTP routes and event kind (the /setup + /authChallenge +
// /user/graperank paths, kind 30382). Scans the whole repo.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");

const RULES: Array<{ adapter: string; label: string; pattern: RegExp }> = [
  {
    adapter: "packages/trust/src/brainstorm.ts",
    // ADR 0026 amendment: `brainstorm_login` joins the forbidden list. The
    // challenge-template construction moved BEHIND the provider, so the
    // Brainstorm-flavored kind-27235 shape (incl. the brainstorm_login tag) may
    // live ONLY in the adapter. kind 27235 is the standard NIP-98 kind and is
    // intentionally NOT added to the guard.
    label: "Brainstorm/NIP-85 API specifics",
    pattern: /\/setup\/|\/authChallenge|\/user\/graperank|graperankResult|\b30382\b|brainstorm_login/,
  },
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "engineering-team"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

describe("trust provider-agnosticism (ADR 0014)", () => {
  const files = [join(REPO, "apps"), join(REPO, "packages")].flatMap(walk);

  it("Brainstorm API specifics live only in the adapter", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      const text = readFileSync(file, "utf8");
      for (const { adapter, label, pattern } of RULES) {
        if (rel === adapter) continue;
        if (pattern.test(text)) offenders.push(`${rel} leaks ${label}`);
      }
    }
    expect(offenders, `trust details leaked outside the adapter:\n${offenders.join("\n")}`).toEqual([]);
  });
});
