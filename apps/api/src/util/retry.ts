// Small retry-with-backoff helper. Used to wait out a not-yet-ready Postgres
// at startup (the API container can come up before the db accepts
// connections). Defense in depth alongside the compose healthcheck.

export type RetryOptions = {
  /** Total attempts (including the first). */
  readonly attempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  /** Return false to stop retrying and rethrow immediately. */
  readonly shouldRetry?: (err: unknown) => boolean;
  readonly onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** Injectable for tests; defaults to setTimeout. */
  readonly sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((r) => setTimeout(r, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    attempts = 10,
    baseDelayMs = 1000,
    maxDelayMs = 8000,
    shouldRetry = () => true,
    onRetry,
    sleep = defaultSleep,
  } = options;

  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1 || !shouldRetry(err)) throw err;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** i);
      onRetry?.(err, i + 1, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

const CONN_ERROR_PATTERNS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "terminating connection",
  "the database system is starting up",
];

/** True when an error looks like "Postgres isn't accepting connections yet". */
export function isRetryableConnError(err: unknown): boolean {
  if (!err) return false;
  const code = (err as { code?: unknown }).code;
  const msg = `${code ?? ""} ${
    err instanceof Error ? err.message : String(err)
  }`;
  return CONN_ERROR_PATTERNS.some((p) => msg.includes(p));
}
