// Shared 3-second probe timeout helper per ADR 0002.

export type ProbeResult = {
  readonly ok: boolean;
  readonly error?: string;
  readonly latencyMs?: number;
};

/**
 * Run `fn`, racing it against a `timeoutMs` deadline.
 *
 * - If the timeout fires first, returns a failed ProbeResult with a
 *   "timeout" error message and aborts the signal handed to `fn` so it
 *   can short-circuit any pending I/O.
 * - If `fn` rejects, returns a failed ProbeResult with the rejection's
 *   message.
 * - Otherwise returns whatever `fn` resolved with, with `latencyMs` set.
 */
export async function withTimeout(
  fn: (signal: AbortSignal) => Promise<ProbeResult>,
  timeoutMs: number,
): Promise<ProbeResult> {
  const started = Date.now();
  const controller = new AbortController();

  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<ProbeResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({
        ok: false,
        error: `timeout: probe exceeded ${timeoutMs}ms`,
        latencyMs: Date.now() - started,
      });
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([fn(controller.signal), timeoutPromise]);
    if (timer) clearTimeout(timer);
    return {
      ...result,
      latencyMs: result.latencyMs ?? Date.now() - started,
    };
  } catch (err) {
    if (timer) clearTimeout(timer);
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}
