// ADR 0013 architecture guard (repo-wide): a search backend's API specifics may
// appear ONLY inside its adapter file in @unbnd/search. The provider NAME is
// allowed at the seam (the SEARCH_PROVIDER enum in config, the resolveProvider
// switch) — selecting a provider is the point. What must stay inside the
// adapter is knowledge of the backend's HTTP API: its image/SDK, endpoint
// paths, settings keys, and response field names. This scans the whole repo
// (apps/* + packages/*), so a leak in the API, the indexer, or anywhere else
// fails CI and the provider swap stays mechanical.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..", "..");

// Backend API tokens, each allowed ONLY in its adapter file (repo-relative).
const RULES: Array<{ adapter: string; label: string; pattern: RegExp }> = [
  {
    adapter: "packages/search/src/meili.ts",
    label: "Meili API specifics",
    pattern:
      /getmeili|MEILI_|\/indexes\/|estimatedTotalHits|_rankingScore|searchableAttributes|filterableAttributes/,
  },
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "engineering-team"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")
      ? [full]
      : [];
  });
}

describe("search provider-agnosticism (ADR 0013)", () => {
  const files = [join(REPO, "apps"), join(REPO, "packages")].flatMap(walk);

  it("scans a non-trivial number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("backend API specifics live only in the matching adapter", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(REPO, file).replace(/\\/g, "/");
      const text = readFileSync(file, "utf8");
      for (const { adapter, label, pattern } of RULES) {
        if (rel === adapter) continue;
        if (pattern.test(text)) offenders.push(`${rel} leaks ${label}`);
      }
    }
    expect(
      offenders,
      `provider details leaked outside the adapter:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
