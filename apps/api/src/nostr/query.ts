// Generic strfry read: open a WS, send ["REQ", subId, filter], collect
// ["EVENT", subId, ev] frames until ["EOSE", subId] (or timeout). ADR 0005.
import { WebSocket } from "ws";
import type { Config } from "../config";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type NostrFilter = {
  readonly kinds?: number[];
  readonly authors?: string[];
  readonly limit?: number;
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

export function queryEvents(
  config: Config,
  filter: NostrFilter,
): Promise<SignedNostrEvent[]> {
  return queryRelayUrl(config.strfryUrl, filter);
}

// --- Paginating author-scoped read (ADR 0021) ---------------------------------
// Mirrors apps/indexer/src/relay.ts queryAllPages (until-cursor on created_at,
// page size = the relay cap, dedup by id across the boundary second, stop on a
// short page or a no-new-events plateau) — but bounded at MAX_PAGES and returning
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
 * Mirrors apps/indexer/src/relay.ts queryAllPages: until-cursor on created_at,
 * page size = the cap, dedup by id across the boundary second, stop on a short
 * page or a no-new-events plateau. Bounded at maxPages; `capped` is true ONLY
 * when the bound (not exhaustion) stopped the walk on a still-full page, so a
 * short final page at the bound is exact (capped:false). The overall wall-clock
 * budget THROWS when exhausted (never returns a partial as if exact). `fetchPage`
 * and `now` are injected so tests never touch a real relay.
 */
export async function queryAllPages(
  fetchPage: (cursor: { until?: number; limit: number }) => Promise<SignedNostrEvent[]>,
  opts?: { pageSize?: number; maxPages?: number; totalBudgetMs?: number; now?: () => number },
): Promise<PagedResult> {
  const pageSize = opts?.pageSize ?? RELAY_PAGE_SIZE;
  const maxPages = opts?.maxPages ?? MAX_PAGES;
  const totalBudgetMs = opts?.totalBudgetMs ?? TOTAL_BUDGET_MS;
  const now = opts?.now ?? (() => Date.now());

  const start = now();
  const byId = new Map<string, SignedNostrEvent>();
  let until: number | undefined;
  let capped = false;

  for (let pages = 0; pages < maxPages; pages++) {
    const page = await fetchPage({ until, limit: pageSize });

    // Total wall-clock budget: if exhausted mid-walk, throw rather than return a
    // truncated result as if exact (Story 19/20 omit-on-throw at the route).
    if (now() - start > totalBudgetMs) {
      throw new Error("queryAllPages: total budget exhausted");
    }

    let added = 0;
    let oldest = Infinity;
    for (const e of page) {
      if (!byId.has(e.id)) {
        byId.set(e.id, e);
        added++;
      }
      if (e.created_at < oldest) oldest = e.created_at;
    }

    // Short page → exhausted; no new events → boundary plateau. Either way, stop
    // exactly (not capped).
    if (page.length < pageSize || added === 0) break;

    // Reached the bound with a still-full, all-or-partly-new last page → capped.
    if (pages === maxPages - 1) {
      capped = true;
      break;
    }
    until = oldest; // overlap at the boundary second is handled by id dedup
  }

  return { events: [...byId.values()], capped };
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
