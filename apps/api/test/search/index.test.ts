import { describe, expect, it } from "vitest";
import { MeiliProvider, resolveProvider } from "../../src/search";
import type { Config } from "../../src/config";

const cfg = (provider: Config["searchProvider"]): Config => ({
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "test",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "test-key",
  searchProvider: provider,
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
});

describe("resolveProvider", () => {
  it("returns a MeiliProvider when searchProvider is 'meili'", () => {
    const p = resolveProvider(cfg("meili"));
    expect(p).toBeInstanceOf(MeiliProvider);
    expect(p.name).toBe("meili");
  });

  it("throws when searchProvider is 'vespa' until the Vespa impl ships", () => {
    expect(() => resolveProvider(cfg("vespa"))).toThrow(/vespa/i);
  });

  it("throws on an unrecognized provider", () => {
    const bad = { ...cfg("meili"), searchProvider: "elastic" as never };
    expect(() => resolveProvider(bad)).toThrow();
  });
});
