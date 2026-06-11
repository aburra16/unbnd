// Generic strfry read: open a WS, send ["REQ", subId, filter], collect
// ["EVENT", subId, ev] frames until ["EOSE", subId] (or timeout). ADR 0005.
import { WebSocket } from "ws";
import { queryAllPages as paginateAllPages } from "@unbnd/relay";
import type { Config } from "../config";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type NostrFilter = {
  readonly kinds?: number[];
  readonly authors?: string[];
  readonly ids?: string[];
  readonly limit?: number;
  readonly since?: number;
  readonly until?: number;
  // Tag filters such as "#a", "#t".
  readonly [tagFilter: `#${string}`]: string[] | undefined;
};

const QUERY_TIMEOUT_MS = 5000;
const SUB_ID = "unbnd-read";

/** One-shot REQ→EOSE read against an explicit relay URL (ADR 0012). */
export function queryRelayUrl(
  relayUrl: string,
  filter: NostrFilter,
  timeoutMs = QUERY_TIMEOUT_MS,
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

    const ws = new WebSocket(relayUrl);
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      finish();
    }, timeoutMs);

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

/**
 * Success-signalling one-shot REQ→EOSE read (ADR 0062 §2). Unlike
 * `queryRelayUrl` (which resolves-on-error, making a failed read
 * indistinguishable from "0 events"), this resolves `{ ok:true, events }` only
 * when EOSE was demonstrably seen within the timeout, and `{ ok:false,
 * events:[] }` on timeout / socket error. The sync-health check needs that
 * distinction so an unreachable dcosl is never mistaken for "in-sync".
 * `queryRelayUrl`/`queryEvents` stay byte-identical (resolve-on-error, bare
 * array); this is an additive sibling.
 */
export function queryRelayUrlChecked(
  relayUrl: string,
  filter: NostrFilter,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<{ ok: boolean; events: SignedNostrEvent[] }> {
  return new Promise<{ ok: boolean; events: SignedNostrEvent[] }>((resolve) => {
    const collected: SignedNostrEvent[] = [];
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore
      }
      resolve(ok ? { ok: true, events: collected } : { ok: false, events: [] });
    };

    const ws = new WebSocket(relayUrl);
    const timer = setTimeout(() => {
      try {
        ws.terminate();
      } catch {
        // ignore
      }
      finish(false);
    }, timeoutMs);

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
        finish(true);
      }
    });

    ws.on("error", () => finish(false));
  });
}

export function queryEvents(
  config: Config,
  filter: NostrFilter,
): Promise<SignedNostrEvent[]> {
  return queryRelayUrl(config.strfryUrl, filter);
}

// --- Paginating author-scoped read (ADR 0021) ---------------------------------
// The shared @unbnd/relay pager (until-cursor on created_at, page size = the
// relay cap, dedup by id across the boundary second, stop on a short page or a
// no-new-events plateau), bounded at MAX_PAGES and returning
// a PagedResult so callers can surface an honest "N+". `queryEvents`/
// `queryRelayUrl` above are left untouched so the under-cap path is byte-identical.

const RELAY_PAGE_SIZE = 500; // tracks strfry maxFilterLimit (indexer BATCH)
const MAX_PAGES = 20; // ceiling: 20 × 500 = 10,000 events
const PAGE_TIMEOUT_MS = 8000; // per-REQ budget (ample on the local relay)
const TOTAL_BUDGET_MS = 25000; // overall wall-clock budget across all pages

export type PagedResult = {
  readonly events: SignedNostrEvent[];
  readonly capped: boolean; // true iff we stopped at maxPages with a still-full last page
};

/**
 * Read ALL of an author's matching events, paging past the relay's per-REQ cap.
 * The loop itself is the ONE shared pager in @unbnd/relay (Story 82); this
 * wrapper applies the ADR 0021 defaults (page size = the cap, the MAX_PAGES
 * bound with an honest `capped`, the wall-clock budget that THROWS) so every
 * existing caller's behavior is byte-identical. `fetchPage` and `now` are
 * injected so tests never touch a real relay.
 */
export async function queryAllPages(
  fetchPage: (cursor: { until?: number; limit: number }) => Promise<SignedNostrEvent[]>,
  opts?: { pageSize?: number; maxPages?: number; totalBudgetMs?: number; now?: () => number },
): Promise<PagedResult> {
  return paginateAllPages(fetchPage, {
    pageSize: opts?.pageSize ?? RELAY_PAGE_SIZE,
    maxPages: opts?.maxPages ?? MAX_PAGES,
    totalBudgetMs: opts?.totalBudgetMs ?? TOTAL_BUDGET_MS,
    now: opts?.now,
  });
}

/**
 * Author-scoped paginating read against config.strfryUrl — the drop-in for the
 * helpers' injected paged read. Wires queryAllPages to queryRelayUrl with the
 * per-page timeout, returning a PagedResult.
 */
export function queryEventsPaged(
  config: Config,
  filter: NostrFilter,
): Promise<PagedResult> {
  return queryAllPages((cursor) =>
    queryRelayUrl(config.strfryUrl, { ...filter, ...cursor }, PAGE_TIMEOUT_MS),
  );
}
