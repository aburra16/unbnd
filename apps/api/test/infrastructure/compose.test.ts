import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const compose = () =>
  readFileSync(resolve(REPO_ROOT, "docker-compose.yml"), "utf8");

describe("docker-compose.yml", () => {
  it("exists at the repo root", () => {
    expect(() => compose()).not.toThrow();
  });

  it("declares a `tapestry` service", () => {
    expect(compose()).toMatch(/^\s*tapestry:/m);
  });

  it("declares a `search` service (generic name, not provider-specific)", () => {
    const text = compose();
    expect(text).toMatch(/^\s*search:/m);
    expect(text).not.toMatch(/^\s*meili:/m);
    expect(text).not.toMatch(/^\s*meilisearch:/m);
  });

  it("references the tagged Tapestry image, not a build context", () => {
    const text = compose();
    expect(text).toMatch(/image:\s*unbnd\/tapestry-data-layer:latest/);
    expect(text).not.toMatch(/build:\s*\./);
  });

  it("uses the official Meilisearch image for the search service today", () => {
    expect(compose()).toMatch(/image:\s*getmeili\/meilisearch:v1\.10/);
  });

  it("exposes the five required host ports", () => {
    const text = compose();
    expect(text).toContain('"8080:80"');
    expect(text).toContain('"7777:7777"');
    expect(text).toContain('"7474:7474"');
    expect(text).toContain('"7687:7687"');
    expect(text).toContain('"7700:7700"');
  });

  it("declares named volumes that survive `docker compose down`", () => {
    const text = compose();
    expect(text).toContain("unbnd-neo4j");
    expect(text).toContain("unbnd-strfry");
    expect(text).toContain("unbnd-search");
  });

  it("passes SEARCH_API_KEY into the Meili container as MEILI_MASTER_KEY", () => {
    expect(compose()).toMatch(/MEILI_MASTER_KEY=\$\{SEARCH_API_KEY\}/);
  });
});
