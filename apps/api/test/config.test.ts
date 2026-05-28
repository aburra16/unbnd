import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const ALL_REQUIRED = {
  NEO4J_PASSWORD: "tapestry-local-dev",
  SEARCH_API_KEY: "local-dev-search-key",
  DATABASE_URL: "postgres://unbnd:unbnd@localhost:5432/unbnd",
  BACKUP_ENCRYPTION_KEY: "a".repeat(64),
};

describe("loadConfig — required vars", () => {
  it("throws when NEO4J_PASSWORD is missing", () => {
    const env = { ...ALL_REQUIRED, NEO4J_PASSWORD: undefined } as NodeJS.ProcessEnv;
    delete env.NEO4J_PASSWORD;
    expect(() => loadConfig(env)).toThrow(/NEO4J_PASSWORD/);
  });

  it("throws when SEARCH_API_KEY is missing", () => {
    const env = { ...ALL_REQUIRED } as NodeJS.ProcessEnv;
    delete env.SEARCH_API_KEY;
    expect(() => loadConfig(env)).toThrow(/SEARCH_API_KEY/);
  });

  it("throws when DATABASE_URL is missing", () => {
    const env = { ...ALL_REQUIRED } as NodeJS.ProcessEnv;
    delete env.DATABASE_URL;
    expect(() => loadConfig(env)).toThrow(/DATABASE_URL/);
  });

  it("throws when BACKUP_ENCRYPTION_KEY is missing", () => {
    const env = { ...ALL_REQUIRED } as NodeJS.ProcessEnv;
    delete env.BACKUP_ENCRYPTION_KEY;
    expect(() => loadConfig(env)).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it("throws when BACKUP_ENCRYPTION_KEY is not 64 hex characters", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, BACKUP_ENCRYPTION_KEY: "tooshort" }),
    ).toThrow(/BACKUP_ENCRYPTION_KEY/);
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, BACKUP_ENCRYPTION_KEY: "A".repeat(64) }),
    ).toThrow(/BACKUP_ENCRYPTION_KEY/);
  });

  it("loads DATABASE_URL and BACKUP_ENCRYPTION_KEY when valid", () => {
    const c = loadConfig({ ...ALL_REQUIRED });
    expect(c.databaseUrl).toBe("postgres://unbnd:unbnd@localhost:5432/unbnd");
    expect(c.backupEncryptionKey).toBe("a".repeat(64));
  });
});

describe("loadConfig — defaults", () => {
  it("defaults STRFRY_URL to ws://localhost:7777", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).strfryUrl).toBe(
      "ws://localhost:7777",
    );
  });

  it("defaults NEO4J_BOLT_URL to bolt://localhost:7687", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).neo4jBoltUrl).toBe(
      "bolt://localhost:7687",
    );
  });

  it("defaults TAPESTRY_API_URL to http://localhost:8080", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).tapestryApiUrl).toBe(
      "http://localhost:8080",
    );
  });

  it("defaults SEARCH_URL to http://localhost:7700", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).searchUrl).toBe(
      "http://localhost:7700",
    );
  });

  it("defaults NEO4J_USER to 'neo4j'", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).neo4jUser).toBe("neo4j");
  });

  it("defaults SEARCH_PROVIDER to 'meili'", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).searchProvider).toBe("meili");
  });

  it("defaults PORT to 8787", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).port).toBe(8787);
  });

  it("defaults PUBLIC_ORIGIN to http://localhost:5181", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).publicOrigin).toBe(
      "http://localhost:5181",
    );
  });

  it("respects an explicit PUBLIC_ORIGIN override", () => {
    expect(
      loadConfig({ ...ALL_REQUIRED, PUBLIC_ORIGIN: "https://unbnd.ink" })
        .publicOrigin,
    ).toBe("https://unbnd.ink");
  });
});

describe("loadConfig — env overrides", () => {
  it("respects an explicit STRFRY_URL override", () => {
    expect(
      loadConfig({
        ...ALL_REQUIRED,
        STRFRY_URL: "ws://relay.example.com",
      }).strfryUrl,
    ).toBe("ws://relay.example.com");
  });

  it("respects SEARCH_PROVIDER=vespa", () => {
    expect(
      loadConfig({
        ...ALL_REQUIRED,
        SEARCH_PROVIDER: "vespa",
      }).searchProvider,
    ).toBe("vespa");
  });

  it("parses PORT as a number", () => {
    const c = loadConfig({ ...ALL_REQUIRED, PORT: "9000" });
    expect(c.port).toBe(9000);
    expect(typeof c.port).toBe("number");
  });

  it("throws when SEARCH_PROVIDER is an unknown value", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, SEARCH_PROVIDER: "elasticsearch" }),
    ).toThrow(/SEARCH_PROVIDER/);
  });
});
