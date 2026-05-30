import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

describe(".env.example", () => {
  const envExample = () =>
    readFileSync(resolve(REPO_ROOT, ".env.example"), "utf8");

  it("exists at the repo root", () => {
    expect(() => envExample()).not.toThrow();
  });

  it.each([
    "OWNER_PUBKEY",
    "NEO4J_PASSWORD",
    "SEARCH_API_KEY",
    "SEARCH_PROVIDER",
    "STRFRY_URL",
    "NEO4J_BOLT_URL",
    "NEO4J_USER",
    "TAPESTRY_API_URL",
    "SEARCH_URL",
    "DATABASE_URL",
    "BACKUP_ENCRYPTION_KEY",
    "PUBLIC_ORIGIN",
    "DCOSL_RELAY_URL",
    "PROPAGATE_WRITES",
    "PROFILE_RELAYS",
    "BRAINSTORM_API_URL",
    "TRUST_RELAYS",
    "HOUSE_OBSERVER_PUBKEY",
  ])("documents %s", (key) => {
    expect(envExample()).toMatch(new RegExp(`^${key}=`, "m"));
  });

  it("does not use Meili-specific env var names", () => {
    const text = envExample();
    expect(text).not.toMatch(/^MEILI_/m);
  });
});

describe(".gitignore", () => {
  const gitignore = () =>
    readFileSync(resolve(REPO_ROOT, ".gitignore"), "utf8");

  it("excludes .env from source control", () => {
    expect(gitignore()).toMatch(/^\.env$/m);
  });
});
