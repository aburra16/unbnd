import neo4j from "neo4j-driver";
import type { Config } from "../config";
import { withTimeout, type ProbeResult } from "./timeout";

/**
 * Open a bolt driver, run `RETURN 1`, close. Driver creation is lazy
 * per call so we don't keep a pool open just for health checks.
 */
export function probeNeo4j(config: Config): Promise<ProbeResult> {
  return withTimeout(async () => {
    const driver = neo4j.driver(
      config.neo4jBoltUrl,
      neo4j.auth.basic(config.neo4jUser, config.neo4jPassword),
      { connectionTimeout: 2500 },
    );
    try {
      const session = driver.session();
      try {
        const result = await session.run("RETURN 1 AS ok");
        const row = result.records[0]?.get("ok");
        const okValue =
          typeof row?.toNumber === "function" ? row.toNumber() : row;
        if (okValue !== 1) {
          return {
            ok: false,
            error: `neo4j: unexpected RETURN 1 result ${JSON.stringify(okValue)}`,
          };
        }
        return { ok: true };
      } finally {
        await session.close();
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await driver.close();
    }
  }, 3000);
}
