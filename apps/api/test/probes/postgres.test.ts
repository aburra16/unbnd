import { describe, expect, it } from "vitest";
import { probePostgres } from "../../src/probes/postgres";
import type { Config } from "../../src/config";

// Points at a port with nothing listening so the probe exercises its
// real error path (connect → fail → ok:false) without a live database.
const deadConfig: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "x",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "x",
  searchProvider: "meili",
  databaseUrl: "postgres://x:x@127.0.0.1:1/none",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
};

describe("probePostgres", () => {
  it("returns ok:false when the database is unreachable", async () => {
    const result = await probePostgres(deadConfig);
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("reports a latency measurement", async () => {
    const result = await probePostgres(deadConfig);
    expect(typeof result.latencyMs).toBe("number");
  });
});
