// ADR 0013 architecture guard: provider *API specifics* must not leak past the
// adapter. The provider NAME is allowed at the seam — the `SEARCH_PROVIDER`
// enum in config and the `resolveProvider` switch/import in search/index.ts —
// because selecting a provider is the whole point of the seam. What must stay
// inside the adapter (src/search/meili.ts today, src/search/vespa.ts later) is
// any knowledge of the backend's HTTP API: its image/SDK, endpoint paths,
// settings keys, and response field names. If this test fails, a backend
// detail escaped its adapter and the provider swap is no longer mechanical.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const SRC = resolve(__dirname, "..", "..", "src");

// Backend API tokens, each allowed ONLY in its adapter file.
const RULES: Array<{ adapter: string; label: string; pattern: RegExp }> = [
  {
    adapter: "search/meili.ts",
    label: "Meili API specifics",
    // image/sdk, env prefix, REST index paths, and Meili-only JSON keys.
    pattern:
      /getmeili|MEILI_|\/indexes\/|estimatedTotalHits|_rankingScore|searchableAttributes|filterableAttributes/,
  },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? walk(full)
      : full.endsWith(".ts")
        ? [full]
        : [];
  });
}

describe("search provider-agnosticism (ADR 0013)", () => {
  const files = walk(SRC);

  it("backend API specifics live only in the matching adapter", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = relative(SRC, file).replace(/\\/g, "/");
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
