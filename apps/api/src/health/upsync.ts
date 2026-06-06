// Up-sync sync-health check + cached monitor (ADR 0062, Story 63, Block E).
//
// A best-effort, bounded, graceful-degrading signal that detects a stalled
// community up-sync (kind-39999 ratings + tag assertions not reaching dcosl).
// `checkUpsyncBacklog` is PURE over injected relay reads + an injected clock —
// no real network, no Date.now() inside. A dedicated `unref()`'d timer
// (`startUpsyncHealthMonitor`) recomputes it on the `UPSYNC_CHECK_INTERVAL_MS`
// cadence and caches the result; `GET /health/sync` serves the cache verbatim.
//
// The `{ ok, events }` read wrapper resolves the unreachable-vs-in-sync
// ambiguity: a failed read (ok:false) NEVER reads as in-sync/backlog-0 — it
// degrades to "unknown". This is the load-bearing correctness property.

import type { NostrFilter } from "../nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type UpsyncStatus = "in-sync" | "backlog" | "unknown";

export type UpsyncHealth = {
  status: UpsyncStatus;
  /** local-but-not-on-dcosl count in the window (0 unless status==="backlog"). */
  backlog: number;
  /** now − oldest missing event's created_at; null unless backlog>0. */
  oldestUnpropagatedAgeMs: number | null;
  /** true iff the local window hit the cap (backlog may be ≥ reported). */
  capped: boolean;
  /** the window used (for operator context). */
  windowMs: number;
  /** the cap used. */
  limit: number;
  /** present on status==="unknown". */
  reason?: string;
  /** when this was computed; null before the first run. */
  checkedAtMs: number | null;
};

/** A success-signalling relay read (wraps `queryRelayUrlChecked`). */
export type RelayRead = (
  filter: NostrFilter,
) => Promise<{ ok: boolean; events: SignedNostrEvent[] }>;

export type CheckDeps = {
  /** Local-relay read (wraps queryRelayUrlChecked(strfryUrl, …)). */
  readLocal: RelayRead;
  /** dcosl read; null when dcoslRelayUrl/librarianPubkey unset. */
  readDcosl: RelayRead | null;
  /** Librarian hex pubkey; null when unset. */
  librarianPubkey: string | null;
  /** Injected clock (ms). */
  now: () => number;
  /** UPSYNC_CHECK_WINDOW_MS. */
  windowMs: number;
  /** UPSYNC_CHECK_LIMIT. */
  limit: number;
};

// The kind-39998 concept-header kind the up-sync z-tags reference (matches the
// `unbnd-upsync` cron's --filter exactly).
const HEADER_KIND = 39998;
const COMMUNITY_EVENT_KIND = 39999;

/**
 * Diff a bounded recent window of local community events against dcosl by event
 * id. Pure over its injected reads + clock. Returns the `UpsyncHealth` shape
 * minus `checkedAtMs` (the monitor stamps that when caching). ADR 0062 §2.
 */
export async function checkUpsyncBacklog(
  deps: CheckDeps,
): Promise<Omit<UpsyncHealth, "checkedAtMs">> {
  const { readLocal, readDcosl, librarianPubkey, now, windowMs, limit } = deps;

  const base = {
    backlog: 0,
    oldestUnpropagatedAgeMs: null as number | null,
    capped: false,
    windowMs,
    limit,
  };

  // 1. Not configured → unknown, no reads attempted.
  if (readDcosl === null || librarianPubkey === null) {
    return {
      ...base,
      status: "unknown",
      reason: "dcosl/librarian not configured",
    };
  }

  const ratingsZ = `${HEADER_KIND}:${librarianPubkey}:book-ratings`;
  const tagsZ = `${HEADER_KIND}:${librarianPubkey}:book-tag-assertions`;
  const since = Math.floor((now() - windowMs) / 1000); // nostr created_at is seconds

  // 2. Local read.
  const local = await readLocal({
    kinds: [COMMUNITY_EVENT_KIND],
    "#z": [ratingsZ, tagsZ],
    since,
    limit,
  });
  if (!local.ok) {
    return { ...base, status: "unknown", reason: "local relay read failed" };
  }

  const localEvents = local.events;
  const capped = localEvents.length >= limit;

  // 3. Empty window → clean in-sync; dcosl not consulted.
  if (localEvents.length === 0) {
    return {
      ...base,
      status: "in-sync",
      capped,
    };
  }

  const localIds = localEvents.map((e) => e.id);

  // 4. dcosl read keyed on the local ids (exact membership form).
  const dcosl = await readDcosl({ ids: localIds });
  if (!dcosl.ok) {
    return {
      ...base,
      status: "unknown",
      capped,
      reason: "dcosl read failed/timeout",
    };
  }

  // 5. Both reads succeeded — diff by id set.
  const dcoslIds = new Set(dcosl.events.map((e) => e.id));
  const missing = localEvents.filter((e) => !dcoslIds.has(e.id));

  if (missing.length === 0) {
    return { ...base, status: "in-sync", capped };
  }

  const oldestMissingSec = Math.min(...missing.map((e) => e.created_at));
  return {
    status: "backlog",
    backlog: missing.length,
    oldestUnpropagatedAgeMs: now() - oldestMissingSec * 1000,
    capped,
    windowMs,
    limit,
  };
}

// --- Module-level cache --------------------------------------------------------

function preFirstRun(windowMs: number, limit: number): UpsyncHealth {
  return {
    status: "unknown",
    backlog: 0,
    oldestUnpropagatedAgeMs: null,
    capped: false,
    windowMs,
    limit,
    reason: "not yet computed",
    checkedAtMs: null,
  };
}

let cache: UpsyncHealth = preFirstRun(0, 0);

/** Read the cached up-sync health (or the pre-first-run `unknown`). */
export function getUpsyncHealth(): UpsyncHealth {
  return cache;
}

function setUpsyncHealth(value: UpsyncHealth): void {
  cache = value;
}

// --- The dedicated monitor timer -----------------------------------------------

export type UpsyncMonitorDeps = {
  /** How often to recompute + cache, in ms. */
  intervalMs: number;
  /** The check to run each tick (returns the result minus checkedAtMs). */
  check: () => Promise<Omit<UpsyncHealth, "checkedAtMs">>;
  /** One-line logger; defaults to console.log. */
  log?: (line: string) => void;
};

export type UpsyncMonitorHandle = {
  /** Clear the interval (tests / graceful shutdown). */
  stop(): void;
};

/**
 * Start the dedicated up-sync health monitor (ADR 0062 §1). Each tick runs
 * `check`, then writes the result + `checkedAtMs = Date.now()` into the cache.
 * Fault-isolated: a throw is caught + logged, the prior cache is left untouched
 * (not re-stamped), and the timer keeps ticking. The interval is `unref()`'d so
 * it never keeps the event loop alive.
 */
export function startUpsyncHealthMonitor(
  deps: UpsyncMonitorDeps,
): UpsyncMonitorHandle {
  const { intervalMs, check } = deps;
  // eslint-disable-next-line no-console
  const log = deps.log ?? console.log;

  async function tick(): Promise<void> {
    try {
      const result = await check();
      setUpsyncHealth({ ...result, checkedAtMs: Date.now() });
    } catch (err) {
      log(`[upsync-check] tick failed: ${String(err)}`);
      // Leave the prior cache untouched; keep ticking.
    }
  }

  const handle = setInterval(() => {
    void tick();
  }, intervalMs);
  // Never hold the process open on this background timer.
  handle.unref();

  return {
    stop: () => clearInterval(handle),
  };
}
