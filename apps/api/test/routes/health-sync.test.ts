// Red set for Story 63 (ADR 0062) — the GET /health/sync endpoint + the
// non-flapping guarantee for /health and /health/data.
//
// ADR 0062 Decision §3 + §6:
//   - `HealthDeps` gains an OPTIONAL `readUpsyncHealth?: () => UpsyncHealth`.
//   - `GET /health/sync` serves the CACHED value verbatim, ALWAYS HTTP 200
//     (including on "unknown" / "backlog"), carrying status / backlog /
//     oldestUnpropagatedAgeMs / checkedAtMs (+ window/limit/reason for context).
//   - Pre-first-run (dep absent or cache never computed) → status:"unknown",
//     checkedAtMs:null.
//   - /health/sync is OFF the /health/data aggregate: a "backlog"/"unknown" sync
//     reading must NEVER flip /health/data's aggregate ok to 503, and /health
//     (trivial liveness) is unaffected.
//
// This file is ADDITIVE — it does not touch the existing health.test.ts
// assertions; it adds the new /health/sync cases + a non-flap regression.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import { buildHealthRouter, type HealthDeps } from "../../src/routes/health";
import type { UpsyncHealth } from "../../src/health/upsync";

const cfg: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "test",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "test-key",
  searchProvider: "meili",
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
      name: "meili",
      health: vi.fn(async () => ({ ok: true, provider: "meili" as const })),
      configureIndex: vi.fn(async () => {}),
      index: vi.fn(async () => {}),
      delete: vi.fn(async (_ids: readonly string[]) => {}),
    deleteAll: vi.fn(async () => {}),
      search: vi.fn(async () => ({ hits: [], total: 0, offset: 0, limit: 0 })),
    },
    ...overrides,
  };
  const app = express();
  app.use("/", buildHealthRouter(deps));
  return app;
}

const WINDOW_MS = 1_800_000;
const LIMIT = 500;

describe("GET /health/sync — serves the cached upsync health", () => {
  it("returns 200 with an in-sync reading from the injected cache reader", async () => {
    const cached: UpsyncHealth = {
      status: "in-sync",
      backlog: 0,
      oldestUnpropagatedAgeMs: null,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      checkedAtMs: 1_700_000_000_000,
    };
    const res = await request(
      makeApp({ readUpsyncHealth: () => cached }),
    ).get("/health/sync");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in-sync");
    expect(res.body.backlog).toBe(0);
    expect(res.body.oldestUnpropagatedAgeMs).toBeNull();
    expect(res.body.checkedAtMs).toBe(1_700_000_000_000);
  });

  it("returns 200 (NOT an HTTP error) on a backlog reading, carrying count + oldest age", async () => {
    const cached: UpsyncHealth = {
      status: "backlog",
      backlog: 7,
      oldestUnpropagatedAgeMs: 600_000,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      checkedAtMs: 1_700_000_000_000,
    };
    const res = await request(
      makeApp({ readUpsyncHealth: () => cached }),
    ).get("/health/sync");

    expect(res.status).toBe(200); // a backlog is not a liveness failure
    expect(res.body.status).toBe("backlog");
    expect(res.body.backlog).toBe(7);
    expect(res.body.oldestUnpropagatedAgeMs).toBe(600_000);
  });

  it("returns 200 on an unknown reading, carrying the reason", async () => {
    const cached: UpsyncHealth = {
      status: "unknown",
      backlog: 0,
      oldestUnpropagatedAgeMs: null,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      reason: "dcosl read failed/timeout",
      checkedAtMs: 1_700_000_000_000,
    };
    const res = await request(
      makeApp({ readUpsyncHealth: () => cached }),
    ).get("/health/sync");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("unknown");
    expect(res.body.reason).toMatch(/dcosl|fail|timeout/i);
  });

  it("pre-first-run (no readUpsyncHealth dep) → unknown with checkedAtMs:null, still 200", async () => {
    const res = await request(makeApp()).get("/health/sync");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("unknown");
    expect(res.body.checkedAtMs).toBeNull();
  });
});

describe("GET /health and /health/data — unaffected by the sync signal (non-flap)", () => {
  it("/health stays a trivial 200 liveness payload", async () => {
    const cached: UpsyncHealth = {
      status: "unknown",
      backlog: 0,
      oldestUnpropagatedAgeMs: null,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      reason: "x",
      checkedAtMs: null,
    };
    const res = await request(
      makeApp({ readUpsyncHealth: () => cached }),
    ).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("unbnd-api");
  });

  it("a sync 'unknown' does NOT flip /health/data's aggregate to 503", async () => {
    const cached: UpsyncHealth = {
      status: "unknown",
      backlog: 0,
      oldestUnpropagatedAgeMs: null,
      capped: false,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      reason: "dcosl unreachable",
      checkedAtMs: 1_700_000_000_000,
    };
    const res = await request(
      makeApp({ readUpsyncHealth: () => cached }),
    ).get("/health/data");

    expect(res.status).toBe(200); // all in-container probes ok → 200 regardless of sync
    expect(res.body.ok).toBe(true);
    // The sync signal must not be merged into the /health/data aggregate.
    expect(res.body.services?.sync).toBeUndefined();
  });

  it("a sync 'backlog' does NOT flip /health/data's aggregate to 503", async () => {
    const cached: UpsyncHealth = {
      status: "backlog",
      backlog: 99,
      oldestUnpropagatedAgeMs: 9_000_000,
      capped: true,
      windowMs: WINDOW_MS,
      limit: LIMIT,
      checkedAtMs: 1_700_000_000_000,
    };
    const res = await request(
      makeApp({ readUpsyncHealth: () => cached }),
    ).get("/health/data");

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
