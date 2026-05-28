import postgres from "postgres";
import type { Config } from "../config";
import { withTimeout, type ProbeResult } from "./timeout";

/**
 * Open a short-lived connection, run `SELECT 1`, close. Lazy per call so we
 * don't keep a pool open just for health checks.
 */
export function probePostgres(config: Config): Promise<ProbeResult> {
  return withTimeout(async () => {
    const sql = postgres(config.databaseUrl, {
      max: 1,
      connect_timeout: 2,
      idle_timeout: 1,
      onnotice: () => {},
    });
    try {
      await sql`SELECT 1`;
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await sql.end({ timeout: 2 }).catch(() => {});
    }
  }, 3000);
}
