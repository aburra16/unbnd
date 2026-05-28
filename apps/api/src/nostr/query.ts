// Generic strfry read: open a WS, send ["REQ", subId, filter], collect
// ["EVENT", subId, ev] frames until ["EOSE", subId] (or timeout). ADR 0005.
import { WebSocket } from "ws";
import type { Config } from "../config";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type NostrFilter = {
  readonly kinds?: number[];
  readonly authors?: string[];
  readonly limit?: number;
  // Tag filters such as "#a", "#t".
  readonly [tagFilter: `#${string}`]: string[] | undefined;
};

const QUERY_TIMEOUT_MS = 5000;
const SUB_ID = "unbnd-read";

export function queryEvents(
  config: Config,
  filter: NostrFilter,
): Promise<SignedNostrEvent[]> {
  return new Promise<SignedNostrEvent[]>((resolve) => {
    const collected: SignedNostrEvent[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(collected);
    };

    const ws = new WebSocket(config.strfryUrl);
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      finish();
    }, QUERY_TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(JSON.stringify(["REQ", SUB_ID, filter]));
    });

    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg[1] !== SUB_ID) return;
      if (msg[0] === "EVENT" && msg[2] && typeof msg[2] === "object") {
        collected.push(msg[2] as SignedNostrEvent);
      } else if (msg[0] === "EOSE") {
        finish();
      }
    });

    ws.on("error", () => finish());
  });
}
