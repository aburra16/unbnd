import express, { type Router } from "express";
import type { Config } from "../config";
import type { SearchProvider } from "../search/SearchProvider";

/**
 * Builds the /health and /health/data routes. The caller injects the
 * concrete probe functions and the search provider so the routes are
 * testable without bringing up real services.
 */
export type HealthDeps = {
  readonly config: Config;
  readonly probeStrfry: () => Promise<{ ok: boolean; error?: string }>;
  readonly probeNeo4j: () => Promise<{ ok: boolean; error?: string }>;
  readonly probeTapestry: () => Promise<{ ok: boolean; error?: string }>;
  readonly searchProvider: SearchProvider;
};

export function buildHealthRouter(_deps: HealthDeps): Router {
  // Stub: returns an empty router. Tests will hit the routes and get 404.
  return express.Router();
}
