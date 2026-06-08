// Periodic maintenance sweeper (ADR 0061, Block E).
//
// A single background timer that, each tick, runs three injected sweeps:
//   - keys:       the in-memory ephemeral-key idle sweep (sync thunk)
//   - sessions:   sweepExpiredSessions() (async DB sweep)
//   - challenges: sweepExpiredChallenges() (async DB sweep)
//
// Each sweep is fault-isolated: a throw/rejection in one is caught + logged and
// the others still run, and the timer keeps ticking. The interval is unref()'d
// so it never holds the process open. The sweeps are injected so the tick is
// unit-testable with mocks + a fake clock and no real DB/time.

export type MaintenanceSweeps = {
  /** Ephemeral-key idle sweep, bound to Date.now()+ttl by the caller. */
  keys: () => number;
  /** Expired-session DB sweep. */
  sessions: () => Promise<number>;
  /** Expired-challenge DB sweep. */
  challenges: () => Promise<number>;
  /** Auto-promotion evaluation pass (Story 77 / ADR 0075): enqueues threshold-
   * crossing submissions. Returns the count enqueued this tick. */
  autoPromote: () => Promise<number>;
};

export type MaintenanceSweeperOptions = {
  /** How often to tick, in ms. */
  intervalMs: number;
  /**
   * Idle TTL for the ephemeral key store. Threaded to the `keys` thunk by the
   * caller (per ADR 0061), so it is opaque to the timer itself; accepted here
   * to keep the option bag complete.
   */
  ephemeralTtlMs: number;
  /** Optional clock seam (unused by the timer; reserved for callers/tests). */
  now?: () => number;
  /** The three injected sweeps. */
  sweeps: MaintenanceSweeps;
  /** One-line logger; defaults to console.log. */
  log?: (line: string) => void;
};

export type MaintenanceSweeperHandle = {
  /** Clear the interval (tests / graceful shutdown). */
  stop(): void;
};

/**
 * Run one fault-isolated sweep, returning its count or 0 on failure (logged).
 */
async function runSweep(
  name: string,
  sweep: () => number | Promise<number>,
  log: (line: string) => void,
): Promise<number> {
  try {
    return await sweep();
  } catch (err) {
    log(`[maintenance] ${name} sweep failed: ${String(err)}`);
    return 0;
  }
}

/**
 * Start the periodic maintenance sweeper. Returns a handle whose `stop()` clears
 * the interval. The interval is `unref()`'d so it never keeps the event loop
 * alive. ADR 0061.
 */
export function startMaintenanceSweeper(
  opts: MaintenanceSweeperOptions,
): MaintenanceSweeperHandle {
  const { intervalMs, sweeps } = opts;
  // eslint-disable-next-line no-console
  const log = opts.log ?? console.log;

  async function tick(): Promise<void> {
    const keys = await runSweep("keys", sweeps.keys, log);
    const sessions = await runSweep("sessions", sweeps.sessions, log);
    const challenges = await runSweep("challenges", sweeps.challenges, log);
    const autoPromoted = await runSweep("autoPromote", sweeps.autoPromote, log);
    log(
      `[maintenance] swept ${keys} keys, ${sessions} sessions, ${challenges} challenges, ${autoPromoted} auto-promotions`,
    );
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
