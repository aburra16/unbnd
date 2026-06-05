// Self-healing relay wrapper for the worker publish path (ADR 0056 §2).
//
// Wraps a RelayConnection so a transport REJECTION (a dead socket, surfaced by
// the hardened connectRelay in connect.ts) triggers a reconnect + bounded
// exponential-backoff retry of the SAME event. A RESOLVED result ({ok:true} or
// a relay NACK {ok:false}) is the relay's answer, not a transport problem, so it
// is returned as-is with no reconnect. Exhausting the attempt budget throws a
// clear error, ending the run cleanly; the operator re-runs and the epoch
// checkpoint (ADR 0051) resumes.
//
// Re-send idempotency: a retry after a reconnect may re-send an event the relay
// accepted just before the drop. This is safe — book records and assertions are
// kind-39999 and replace in place by their deterministic d-tag, and the seed
// loop records a checkpoint key only on a confirmed {ok:true}, so a duplicate is
// at worst a redundant replace.
//
// The same RelayConnection interface is exposed, so index.ts swaps it in with no
// seed-loop change. The `query` read is a thin pass-through to the current
// connection (ADR 0058 §Q1): NO reconnect/retry on a read, because a REQ has no
// re-send idempotency story and no caller asks for read-retry; a read fault
// surfaces unchanged (resolves [] on timeout). The connect and sleep seams are
// injected for deterministic tests (no real sockets, no real timers).
import type { SignedNostrEvent } from "@unbnd/schemas";
import { connectRelay } from "./connect";
import type { PublishResult, RelayConnection, RelayFilter } from "./types";

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export type ReconnectInfo = {
  attempt: number;
  attempts: number;
  delayMs: number;
  error: Error;
};

export type ConnectResilientRelayOptions = {
  url: string;
  connect?: (url: string) => Promise<RelayConnection>;
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onReconnect?: (info: ReconnectInfo) => void;
};

export async function connectResilientRelay(
  opts: ConnectResilientRelayOptions,
): Promise<RelayConnection> {
  const {
    url,
    connect = connectRelay,
    attempts = 6,
    baseMs = 500,
    maxMs = 8000,
    sleep = defaultSleep,
    onReconnect,
  } = opts;

  const backoff = (i: number) => Math.min(maxMs, baseMs * 2 ** i);

  let current = await connect(url);

  return {
    async publish(
      event: SignedNostrEvent,
      timeoutMs?: number,
    ): Promise<PublishResult> {
      let lastError: Error | undefined;
      for (let i = 0; i < attempts; i++) {
        if (i > 0) {
          // Reconnect before retrying the same event. A failed connect here
          // consumes an attempt and backs off the same way as a failed publish.
          const delayMs = backoff(i - 1);
          await sleep(delayMs);
          try {
            current.close();
          } catch {
            // best-effort; the socket is already gone
          }
          try {
            current = await connect(url);
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            continue;
          }
          onReconnect?.({
            attempt: i,
            attempts,
            delayMs,
            error: lastError ?? new Error("transport reject"),
          });
        }
        try {
          // A resolved result (ok true OR false) is the relay's answer: return it.
          return await current.publish(event, timeoutMs);
        } catch (err) {
          // A transport reject: this attempt failed; loop to reconnect + retry.
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
      throw new Error(
        `relay unreachable after ${attempts} attempts: ${lastError?.message ?? "unknown"}`,
      );
    },
    // Thin pass-through to the current connection (ADR 0058 §Q1): a read has no
    // re-send idempotency story, so it is NOT wrapped in reconnect/retry.
    query(filter: RelayFilter, timeoutMs?: number): Promise<SignedNostrEvent[]> {
      return current.query(filter, timeoutMs);
    },
    close() {
      current.close();
    },
  };
}
