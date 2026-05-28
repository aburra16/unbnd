// Shared 3-second probe timeout helper per ADR 0002.

export type ProbeResult = {
  readonly ok: boolean;
  readonly error?: string;
  readonly latencyMs?: number;
};

/**
 * Run `fn`, racing it against a `timeoutMs` deadline. If the timeout fires
 * first, returns a failed ProbeResult with the timeout error. If `fn`
 * rejects, returns a failed ProbeResult with the rejection's message.
 * Otherwise returns whatever `fn` resolved with, with `latencyMs` set.
 */
export async function withTimeout(
  _fn: (signal: AbortSignal) => Promise<ProbeResult>,
  _timeoutMs: number,
): Promise<ProbeResult> {
  throw new Error("withTimeout not implemented");
}
