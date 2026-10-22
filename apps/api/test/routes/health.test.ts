import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import { buildHealthRouter, type HealthDeps } from "../../src/routes/health";

const cfg: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "test",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "wss://search.example",
  trustProvider: "brainstorm",
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
};

function makeApp(overrides: Partial<HealthDeps> = {}) {
  const deps: HealthDeps = {
    config: cfg,
    probeStrfry: vi.fn(async () => ({ ok: true })),
    probeNeo4j: vi.fn(async () => ({ ok: true })),
    probeTapestry: vi.fn(async () => ({ ok: true })),
    probePostgres: vi.fn(async () => ({ ok: true })),
    searchProvider: {
      name: "nip50",
      health: vi.fn(async () => ({ ok: true, provider: "nip50" as const })),
      search: vi.fn(async () => ({ hits: [], total: 0, offset: 0, limit: 0 })),
    },
    ...overrides,
  };
  const app = express();
  app.use("/", buildHealthRouter(deps));
  return app;
}

describe("GET /health", () => {
  it("returns 200 with a small liveness payload", async () => {
    const res = await request(makeApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("unbnd-api");
    expect(typeof res.body.time).toBe("string");
  });
});

describe("GET /health/data", () => {
  it("returns 200 when every dependency reports ok", async () => {
    const res = await request(makeApp()).get("/health/data");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.services.strfry.ok).toBe(true);
    expect(res.body.services.neo4j.ok).toBe(true);
    expect(res.body.services.tapestry.ok).toBe(true);
    expect(res.body.services.search.ok).toBe(true);
    expect(res.body.services.search.provider).toBe("nip50");
    expect(res.body.services.postgres.ok).toBe(true);
  });

  it("returns 503 when postgres is unreachable", async () => {
    const res = await request(
      makeApp({
        probePostgres: vi.fn(async () => ({
          ok: false,
          error: "ECONNREFUSED 5432",
        })),
      }),
    ).get("/health/data");
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.services.postgres.ok).toBe(false);
  });

  it("returns 503 when strfry is unreachable", async () => {
    const res = await request(
      makeApp({
        probeStrfry: vi.fn(async () => ({
          ok: false,
          error: "ECONNREFUSED",
        })),
      }),
    ).get("/health/data");
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.services.strfry.ok).toBe(false);
    expect(res.body.services.strfry.error).toMatch(/ECONNREFUSED/);
  });

  it("returns 503 when search is unreachable", async () => {
    const res = await request(
      makeApp({
        searchProvider: {
          name: "nip50",
          health: vi.fn(async () => ({
            ok: false,
            provider: "nip50" as const,
            error: "503 Service Unavailable",
          })),
          search: vi.fn(async () => ({ hits: [], total: 0, offset: 0, limit: 0 })),
        },
      }),
    ).get("/health/data");
    expect(res.status).toBe(503);
    expect(res.body.services.search.ok).toBe(false);
    expect(res.body.services.search.provider).toBe("nip50");
  });

  it("runs all probes regardless of which fails (parallel execution)", async () => {
    const calls: string[] = [];
    const trace = (name: string) =>
      vi.fn(async () => {
        calls.push(name);
        return { ok: true };
      });
    await request(
      makeApp({
        probeStrfry: trace("strfry"),
        probeNeo4j: trace("neo4j"),
        probeTapestry: trace("tapestry"),
      }),
    ).get("/health/data");
    expect(calls).toContain("strfry");
    expect(calls).toContain("neo4j");
    expect(calls).toContain("tapestry");
  });
});
