import express, { type Router } from "express";
import type { Config } from "../config";
import type { SearchProvider } from "../search/SearchProvider";

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
};

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
