import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const docs = () =>
  readFileSync(resolve(REPO_ROOT, "docs", "data-layer.md"), "utf8");

describe("docs/data-layer.md", () => {
  it("exists", () => {
    expect(() => docs()).not.toThrow();
  });

  it.each([
    /prerequisites/i,
    /(build|building).*image/i,
    /start/i,
    /stop/i,
    /reset/i,
    /health/i,
    /env|environment/i,
    /swap.*provider|provider.*swap/i,
  ])("covers section matching %s", (pattern) => {
    expect(docs()).toMatch(pattern);
  });

  it("references the docker compose commands", () => {
    const text = docs();
    expect(text).toMatch(/docker compose up/);
    expect(text).toMatch(/docker compose down/);
  });

  it("warns that `docker compose down -v` clears the data volumes", () => {
    expect(docs()).toMatch(/down -v|-v.*clear|clear.*volumes/i);
  });
});
