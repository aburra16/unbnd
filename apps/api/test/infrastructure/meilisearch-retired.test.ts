// Story 112 / ADR 0100: Meilisearch is retired. Brainstorm's search relay is
// the only search backend; nothing builds, runs, configures or writes to a
// Meilisearch index any more.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");
const SKIP = new Set(["node_modules", "dist", ".git", "engineering-team", "test", "e2e"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx|mjs|json)$/.test(name) ? [full] : [];
  });
}

describe("Meilisearch is retired (story 112)", () => {
  it("no source file under apps/ or packages/ speaks to Meilisearch or writes a search index", () => {
    const offenders = [join(REPO, "apps"), join(REPO, "packages")]
      .flatMap(walk)
      .filter((f) => /meili|:7700|reindexBook|buildBookDocument|configureIndex|deleteAll\(/i.test(readFileSync(f, "utf8")))
      .map((f) => relative(REPO, f));
    expect(offenders).toEqual([]);
  });

  it("the indexer app is gone", () => {
    expect(existsSync(join(REPO, "apps/indexer"))).toBe(false);
  });

  it("neither compose file runs Meilisearch or the indexer", () => {
    for (const file of ["docker-compose.yml", "docker-compose.prod.yml"]) {
      const text = read(file);
      expect(text, file).not.toMatch(/meilisearch|MEILI_|:7700/i);
      expect(text, file).not.toMatch(/^ {2}(search|indexer):/m);
      expect(text, file).not.toMatch(/SEARCH_API_KEY|SEARCH_PROVIDER/);
    }
  });

  it("the deploy builds no indexer image", () => {
    expect(read(".github/workflows/staging.yml")).not.toMatch(/indexer/);
  });

  it("ops has no index or provider-switch tasks, a task to remove the old container, and no indexer cron line", () => {
    const ops = read(".github/workflows/staging-ops.yml");
    expect(ops).not.toMatch(/^\s*- (index|search-relay|search-meili)\b/m);
    expect(ops).not.toMatch(/run --rm indexer/);
    expect(ops).toMatch(/^\s*- retire-meilisearch\b/m);
    expect(ops).toMatch(/docker rm -f unbnd-search/);
  });

  it("the env examples ask for no search key", () => {
    for (const file of [".env.example", ".env.production.example"]) {
      expect(read(file), file).not.toMatch(/SEARCH_API_KEY|Meilisearch|SEARCH_PROVIDER/);
    }
  });
});
