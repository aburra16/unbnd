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

  it("declares a `db` service running Postgres 16 with a named volume", () => {
    const text = compose();
    expect(text).toMatch(/^\s*db:/m);
    expect(text).toMatch(/image:\s*postgres:16/);
    expect(text).toContain("unbnd-postgres");
  });

  it("exposes the Postgres port on the host", () => {
    expect(compose()).toContain('"5432:5432"');
  });

  it("references the tagged Tapestry image, not a build context", () => {
    const text = compose();
    expect(text).toMatch(/image:\s*unbnd\/tapestry-data-layer:latest/);
    expect(text).not.toMatch(/build:\s*\./);
  });

  it("exposes the four required host ports", () => {
    const text = compose();
    expect(text).toContain('"8080:80"');
    expect(text).toContain('"7777:7777"');
    expect(text).toContain('"7474:7474"');
    expect(text).toContain('"7687:7687"');
  });

  it("declares named volumes that survive `docker compose down`", () => {
    const text = compose();
    expect(text).toContain("unbnd-neo4j");
    expect(text).toContain("unbnd-strfry");
  });
});
