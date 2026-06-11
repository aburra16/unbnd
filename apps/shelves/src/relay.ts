// One-shot relay read for the shelves worker (ADR 0036 §1), mirroring
// apps/indexer/src/relay.ts: REQ → collect EVENTs → EOSE/timeout, plus the
// cap-safe paginating `queryAllPages` (ADR 0021). The worker reads the catalog +
// ratings + taxonomy + genre membership off the LOCAL relay — the same source
// the API read paths use. Read-only; the worker holds no signing key.
import { WebSocket } from "ws";
import { queryAllPages as paginateAllPages } from "@unbnd/relay";
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
    const sub = "shelves-read";
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
 * Read ALL matching events past the relay cap. The loop is the ONE shared
 * pager in @unbnd/relay (Story 82); this caller keeps its exact unbounded
 * walk (no page bound, no wall-clock budget).
 */
export async function queryAllPages(
  fetchPage: (cursor: { until?: number; limit: number }) => Promise<SignedNostrEvent[]>,
  pageSize = 500,
): Promise<SignedNostrEvent[]> {
  const { events } = await paginateAllPages(fetchPage, {
    pageSize,
    maxPages: Infinity,
    totalBudgetMs: Infinity,
  });
  return events;
}
