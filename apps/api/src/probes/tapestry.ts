import type { Config } from "../config";
import { withTimeout, type ProbeResult } from "./timeout";

/**
 * Probe the Tapestry Express API. Prefer `/api/health`; if the upstream
 * does not expose one, fall back to the root path and accept any 2xx.
 */
export function probeTapestry(config: Config): Promise<ProbeResult> {
  return withTimeout(async (signal) => {
    const tryUrl = async (url: string) => {
      const res = await fetch(url, { signal });
      return { status: res.status, ok: res.ok };
    };

    try {
      const primary = await tryUrl(`${config.tapestryApiUrl}/api/health`);
      if (primary.ok) return { ok: true };
      if (primary.status !== 404) {
        return {
          ok: false,
          error: `tapestry: /api/health returned ${primary.status}`,
        };
      }
      // 404 → fall back to root probe.
      const root = await tryUrl(config.tapestryApiUrl);
      if (root.ok) return { ok: true };
      return {
        ok: false,
        error: `tapestry: root returned ${root.status}`,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, 3000);
}
