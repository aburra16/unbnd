import express, { type Router } from "express";
import type { Config } from "../config";
import type { SearchProvider } from "@unbnd/search";
import type { UpsyncHealth } from "../health/upsync";

export type HealthDeps = {
  readonly config: Config;
  readonly probeStrfry: () => Promise<{
    ok: boolean;
    error?: string;
    latencyMs?: number;
  }>;
  readonly probeNeo4j: () => Promise<{
    ok: boolean;
    error?: string;
    latencyMs?: number;
  }>;
  readonly probeTapestry: () => Promise<{
    ok: boolean;
    error?: string;
    latencyMs?: number;
  }>;
  readonly probePostgres?: () => Promise<{
    ok: boolean;
    error?: string;
    latencyMs?: number;
  }>;
  readonly searchProvider: SearchProvider;
  /**
   * Cached up-sync sync-health reader (ADR 0062). Optional: when absent, the
   * `/health/sync` endpoint serves a pre-first-run `unknown` so the router stays
   * usable in partial test fixtures. NEVER added to the `/health/data`
   * aggregate — a backlog/unknown must not flap liveness.
   */
  readonly readUpsyncHealth?: () => UpsyncHealth;
};

/** Pre-first-run `unknown` served when no cache reader is injected. */
function preFirstRunUpsyncHealth(): UpsyncHealth {
  return {
    status: "unknown",
    backlog: 0,
    oldestUnpropagatedAgeMs: null,
    capped: false,
    windowMs: 0,
    limit: 0,
    reason: "not yet computed",
    checkedAtMs: null,
  };
}

export function buildHealthRouter(deps: HealthDeps): Router {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "unbnd-api",
      time: new Date().toISOString(),
    });
  });

  router.get("/health/data", async (_req, res) => {
    const probePostgres =
      deps.probePostgres ??
      (async () => ({ ok: false, error: "postgres probe not configured" }));
    const [strfry, neo4j, tapestry, postgres, search] =
      await Promise.allSettled([
        deps.probeStrfry(),
        deps.probeNeo4j(),
        deps.probeTapestry(),
        probePostgres(),
        deps.searchProvider.health(),
      ]);

    const okOf = (s: PromiseSettledResult<{ ok: boolean }>) =>
      s.status === "fulfilled" && s.value.ok;

    const result = {
      ok:
        okOf(strfry) &&
        okOf(neo4j) &&
        okOf(tapestry) &&
        okOf(postgres) &&
        okOf(search),
      services: {
        strfry: settledOrError(strfry),
        neo4j: settledOrError(neo4j),
        tapestry: settledOrError(tapestry),
        postgres: settledOrError(postgres),
        search: settledOrSearchError(search, deps.searchProvider.name),
      },
    };

    res.status(result.ok ? 200 : 503).json(result);
  });

  // Up-sync sync-health (ADR 0062). Serves the cached value verbatim, ALWAYS
  // HTTP 200 (a backlog/unknown is an eventually-consistent backstop signal, not
  // a liveness failure). Off the `/health/data` aggregate entirely.
  router.get("/health/sync", (_req, res) => {
    const read = deps.readUpsyncHealth ?? preFirstRunUpsyncHealth;
    res.status(200).json(read());
  });

  return router;
}

function settledOrError<T extends { ok: boolean }>(
  s: PromiseSettledResult<T>,
): T | { ok: false; error: string } {
  if (s.status === "fulfilled") return s.value;
  return {
    ok: false,
    error: s.reason instanceof Error ? s.reason.message : String(s.reason),
  };
}

function settledOrSearchError<T extends { ok: boolean }>(
  s: PromiseSettledResult<T>,
  provider: SearchProvider["name"],
): T | { ok: false; provider: SearchProvider["name"]; error: string } {
  if (s.status === "fulfilled") return s.value;
  return {
    ok: false,
    provider,
    error: s.reason instanceof Error ? s.reason.message : String(s.reason),
  };
}
