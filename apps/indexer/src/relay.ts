// One-shot relay read (REQ → collect EVENTs → EOSE/timeout). The indexer reads
// the catalog from the LOCAL relay — the same source the API read paths use.
import { WebSocket } from "ws";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type NostrFilter = {
  readonly kinds?: number[];
  readonly limit?: number;
  readonly until?: number;
  readonly since?: number;
  readonly [tagFilter: `#${string}`]: string[] | number[] | undefined;
};

export function queryRelay(
  relayUrl: string,
  filter: NostrFilter,
  timeoutMs = 20000,
): Promise<SignedNostrEvent[]> {
  return new Promise((resolve, reject) => {
    const collected: SignedNostrEvent[] = [];
    let settled = false;
    const sub = "indexer-read";
    const ws = new WebSocket(relayUrl);
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      err ? reject(err) : resolve(collected);
    };
    const timer = setTimeout(() => done(), timeoutMs);
    ws.on("open", () => ws.send(JSON.stringify(["REQ", sub, filter])));
    ws.on("message", (data) => {
      let msg: unknown;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (!Array.isArray(msg) || msg[1] !== sub) return;
      if (msg[0] === "EVENT" && msg[2] && typeof msg[2] === "object") {
        collected.push(msg[2] as SignedNostrEvent);
      } else if (msg[0] === "EOSE") {
        done();
      }
    });
    ws.on("error", (err) => done(err instanceof Error ? err : new Error(String(err))));
  });
}

/**
 * Read ALL matching events, paging past the relay's per-REQ cap (strfry
 * `maxFilterLimit`, default 500). Walks backwards by `created_at` using an
 * `until` cursor, dedups by id, and stops when a page is short or yields no
 * new events. `fetchPage` is injected for testability.
 */
export async function queryAllPages(
  fetchPage: (cursor: { until?: number; limit: number }) => Promise<SignedNostrEvent[]>,
  pageSize = 500,
): Promise<SignedNostrEvent[]> {
  const byId = new Map<string, SignedNostrEvent>();
  let until: number | undefined;
  for (;;) {
    const page = await fetchPage({ until, limit: pageSize });
    let added = 0;
    let oldest = Infinity;
    for (const e of page) {
      if (!byId.has(e.id)) {
        byId.set(e.id, e);
        added++;
      }
      if (e.created_at < oldest) oldest = e.created_at;
    }
    // Short page → exhausted. No new events → boundary plateau, stop to avoid a loop.
    if (page.length < pageSize || added === 0) break;
    until = oldest; // overlap at the boundary second is handled by id dedup
  }
  return [...byId.values()];
}
