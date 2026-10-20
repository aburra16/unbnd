// Failing tests for Story 104, per ADR 0093 §4–6: structural wiring. The
// behavior is covered by year.test.ts, ol-evidence.test.ts and
// year-corrections.test.ts; here we assert the entrypoints actually use it, so
// the rule cannot be dead code in the seed or the ops task. Like
// resilient-wiring.test.ts, these read source rather than run main() (which
// needs an nsec and the network).
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const seederDir = join(here, "..");
const repoRoot = join(seederDir, "..", "..");
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const indexSrc = read(join(seederDir, "src", "index.ts"));
const searchSrc = read(join(seederDir, "src", "search.ts"));
const entrySrc = read(join(seederDir, "src", "correct-years.ts"));
const esbuildSrc = read(join(seederDir, "esbuild.config.mjs"));
const dockerSrc = read(join(seederDir, "Dockerfile"));
const opsSrc = read(join(repoRoot, ".github", "workflows", "staging-ops.yml"));
const deploySrc = read(join(repoRoot, "docs", "DEPLOY.md"));

describe("the seed judges each record's year (AC 7)", () => {
  it("asks Open Library search for every edition year", () => {
    expect(searchSrc).toMatch(/"publish_year"/);
  });

  it("fetches the first authors and passes each record through the year rule", () => {
    expect(indexSrc).toMatch(/fetchAuthors\s*\(/);
    expect(indexSrc).toMatch(/judgeRecordYear\s*\(/);
    expect(indexSrc).toMatch(/withJudgedYear\s*\(/);
  });

  it("judges the year before fingerprinting, so a corrected year is what gets checkpointed", () => {
    expect(indexSrc.indexOf("withJudgedYear(")).toBeGreaterThan(-1);
    expect(indexSrc.indexOf("withJudgedYear(")).toBeLessThan(indexSrc.indexOf("fingerprint(record)"));
  });
});

describe("the years entrypoint (AC 5, 6)", () => {
  it("exists and runs the shared planner over the hub's records", () => {
    expect(entrySrc).toMatch(/runYearCorrection\s*\(/);
    expect(entrySrc).toMatch(/queryAllPages\s*\(/);
    expect(entrySrc).toMatch(/fetchWorkEvidence/);
    expect(entrySrc).toMatch(/fetchAuthors/);
  });

  it("is a dry run unless --apply is given, and only apply needs the librarian's nsec", () => {
    expect(entrySrc).toContain("--apply");
    expect(entrySrc).toContain("LIBRARIAN_PUBKEY");
    expect(entrySrc).toContain("LIBRARIAN_NSEC");
  });

  it("reads and publishes to dcosl, like the seeder", () => {
    expect(entrySrc).toContain("DCOSL_RELAY_URL");
  });

  it("is bundled into the seeder image as years.js", () => {
    expect(esbuildSrc).toContain("src/correct-years.ts");
    expect(dockerSrc).toMatch(/dist\/correct-years\.js \.\/years\.js/);
  });
});

describe("Staging ops runs it (ADR 0093 §6)", () => {
  it("offers years-check (dry run) and years-fix (apply)", () => {
    expect(opsSrc).toMatch(/- years-check\b/);
    expect(opsSrc).toMatch(/- years-fix\b/);
    expect(opsSrc).toMatch(/years-check\)[\s\S]*?run --rm seeder node years\.js\n/);
    expect(opsSrc).toMatch(/years-fix\)[\s\S]*?run --rm seeder node years\.js --apply/);
  });

  it("documents both tasks in DEPLOY.md", () => {
    expect(deploySrc).toContain("years-check");
    expect(deploySrc).toContain("years-fix");
  });
});
