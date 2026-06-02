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

  it("leaves librarianPubkey undefined when LIBRARIAN_PUBKEY is unset", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).librarianPubkey).toBeUndefined();
  });

  it("leaves dcosl propagation off (fail-safe) when DCOSL_RELAY_URL is unset", () => {
    const c = loadConfig({ ...ALL_REQUIRED });
    expect(c.dcoslRelayUrl).toBeUndefined();
    expect(c.propagateWrites).toBe(false);
  });

  it("enables propagation when DCOSL_RELAY_URL is a ws(s) URL", () => {
    const c = loadConfig({
      ...ALL_REQUIRED,
      DCOSL_RELAY_URL: "wss://dcosl.brainstorm.world/",
    });
    expect(c.dcoslRelayUrl).toBe("wss://dcosl.brainstorm.world/");
    expect(c.propagateWrites).toBe(true);
  });

  it("PROPAGATE_WRITES=false overrides propagation off even with a URL set", () => {
    const c = loadConfig({
      ...ALL_REQUIRED,
      DCOSL_RELAY_URL: "wss://dcosl.brainstorm.world/",
      PROPAGATE_WRITES: "false",
    });
    expect(c.dcoslRelayUrl).toBe("wss://dcosl.brainstorm.world/");
    expect(c.propagateWrites).toBe(false);
  });

  it("throws when DCOSL_RELAY_URL is set but not a ws(s) URL", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, DCOSL_RELAY_URL: "https://nope.example" }),
    ).toThrow(/DCOSL_RELAY_URL/);
  });

  it("reads LIBRARIAN_PUBKEY when it is 64 lowercase hex chars", () => {
    const pk = "9".repeat(64);
    expect(
      loadConfig({ ...ALL_REQUIRED, LIBRARIAN_PUBKEY: pk }).librarianPubkey,
    ).toBe(pk);
  });

  it("throws when LIBRARIAN_PUBKEY is set but not 64 hex chars", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, LIBRARIAN_PUBKEY: "nope" }),
    ).toThrow(/LIBRARIAN_PUBKEY/);
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, LIBRARIAN_PUBKEY: "A".repeat(64) }),
    ).toThrow(/LIBRARIAN_PUBKEY/);
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

describe("loadConfig — trust provider (ADR 0017)", () => {
  const FIXTURE = JSON.stringify({ weights: { ["d".repeat(64)]: { ["a".repeat(64)]: 0.9 } } });

  it("defaults TRUST_PROVIDER to 'brainstorm' with no fixture", () => {
    const c = loadConfig({ ...ALL_REQUIRED });
    expect(c.trustProvider).toBe("brainstorm");
    expect(c.trustFixture).toBeUndefined();
  });

  it("throws when TRUST_PROVIDER is an unknown value", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, TRUST_PROVIDER: "nope" }),
    ).toThrow(/TRUST_PROVIDER/);
  });

  it("selects the fixture provider and parses TRUST_FIXTURE", () => {
    const c = loadConfig({ ...ALL_REQUIRED, TRUST_PROVIDER: "fixture", TRUST_FIXTURE: FIXTURE });
    expect(c.trustProvider).toBe("fixture");
    expect(c.trustFixture?.weights["d".repeat(64)]?.["a".repeat(64)]).toBe(0.9);
  });

  it("throws when TRUST_PROVIDER=fixture but TRUST_FIXTURE is missing", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, TRUST_PROVIDER: "fixture" }),
    ).toThrow(/TRUST_FIXTURE/);
  });

  it("throws when TRUST_FIXTURE is not valid JSON", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, TRUST_PROVIDER: "fixture", TRUST_FIXTURE: "{not json" }),
    ).toThrow(/TRUST_FIXTURE must be valid JSON/);
  });

  it("throws when TRUST_FIXTURE lacks a weights map", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, TRUST_PROVIDER: "fixture", TRUST_FIXTURE: "{}" }),
    ).toThrow(/weights/);
  });
});

// Story 34 / ADR 0035: the trust-vs-text search blend weight. A single legible
// knob in [0,1]; default 0.25 (conservative, text-leaning); 0 is a meaningful
// no-op (pure text relevance). FAILING until loadConfig parses + validates
// SEARCH_TRUST_BLEND onto `searchTrustBlend`.
describe("loadConfig — SEARCH_TRUST_BLEND (ADR 0035)", () => {
  it("defaults to 0.25 (conservative, text-leaning nudge)", () => {
    const c = loadConfig({ ...ALL_REQUIRED });
    expect(c.searchTrustBlend).toBe(0.25);
    expect(typeof c.searchTrustBlend).toBe("number");
  });

  it("respects an explicit numeric override", () => {
    expect(loadConfig({ ...ALL_REQUIRED, SEARCH_TRUST_BLEND: "0.5" }).searchTrustBlend).toBe(0.5);
  });

  it("accepts the boundary values 0 and 1", () => {
    expect(loadConfig({ ...ALL_REQUIRED, SEARCH_TRUST_BLEND: "0" }).searchTrustBlend).toBe(0);
    expect(loadConfig({ ...ALL_REQUIRED, SEARCH_TRUST_BLEND: "1" }).searchTrustBlend).toBe(1);
  });

  it("throws when the value is below 0", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, SEARCH_TRUST_BLEND: "-0.1" }),
    ).toThrow(/SEARCH_TRUST_BLEND/);
  });

  it("throws when the value is above 1", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, SEARCH_TRUST_BLEND: "1.1" }),
    ).toThrow(/SEARCH_TRUST_BLEND/);
  });

  it("throws on a non-numeric value", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, SEARCH_TRUST_BLEND: "lots" }),
    ).toThrow(/SEARCH_TRUST_BLEND/);
  });
});

// Story 26 / ADR 0026 Decision 2: the custodial personalize follow-count gate.
describe("loadConfig — PERSONALIZE_MIN_FOLLOWS (ADR 0026)", () => {
  it("defaults to 10 (PRD §9.5 'ten follows')", () => {
    expect(loadConfig({ ...ALL_REQUIRED }).personalizeMinFollows).toBe(10);
  });

  it("respects a numeric override (staging may set 1 or 2)", () => {
    const c = loadConfig({ ...ALL_REQUIRED, PERSONALIZE_MIN_FOLLOWS: "1" });
    expect(c.personalizeMinFollows).toBe(1);
    expect(typeof c.personalizeMinFollows).toBe("number");
  });

  it("throws on a non-integer / negative value (parsed like PORT)", () => {
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, PERSONALIZE_MIN_FOLLOWS: "abc" }),
    ).toThrow(/PERSONALIZE_MIN_FOLLOWS/);
    expect(() =>
      loadConfig({ ...ALL_REQUIRED, PERSONALIZE_MIN_FOLLOWS: "-3" }),
    ).toThrow(/PERSONALIZE_MIN_FOLLOWS/);
  });
});
