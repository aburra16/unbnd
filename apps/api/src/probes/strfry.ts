import { WebSocket } from "ws";
import type { Config } from "../config";
import { withTimeout, type ProbeResult } from "./timeout";

/**
 * Open a WebSocket to the strfry relay; if `open` fires before the deadline,
 * the relay is reachable. Closes the socket immediately on success.
 */
export function probeStrfry(config: Config): Promise<ProbeResult> {
  return withTimeout(async (signal) => {
    return new Promise<ProbeResult>((resolve) => {
      const ws = new WebSocket(config.strfryUrl);
      const abortListener = () => {
        try {
          ws.terminate();
        } catch {
          // ignore
        }
      };
      signal.addEventListener("abort", abortListener, { once: true });

      ws.once("open", () => {
        signal.removeEventListener("abort", abortListener);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve({ ok: true });
      });

      ws.once("error", (err) => {
        signal.removeEventListener("abort", abortListener);
        resolve({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }, 3000);
}
