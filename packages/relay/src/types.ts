// The shared relay-transport types (Story 59, ADR 0058 §Q1). The union of the
// two diverged worker clients: the seeder's hardened publish + the promoter's
// one-shot REQ read, folded into one RelayConnection. `PublishResult` is the
// single canonical publish result (the seeder's name + shape; a strict superset
// of the promoter's retired `PublishOutcome`).
import type { SignedNostrEvent } from "@unbnd/schemas";

export type PublishResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export type RelayFilter = {
  kinds?: number[];
  authors?: string[];
  "#d"?: string[];
  "#z"?: string[];
  limit?: number;
};

export type RelayConnection = {
  /** Publish EVENT and await the matching OK. Hardened (ADR 0056 §1): a
   *  transport failure REJECTS; a relay NACK / timeout RESOLVES {ok:false}. */
  publish(event: SignedNostrEvent, timeoutMs?: number): Promise<PublishResult>;
  /** One-shot REQ read: subscribe, accumulate EVENT, resolve on EOSE or the
   *  bounded timeout, then CLOSE the subscription. */
  query(filter: RelayFilter, timeoutMs?: number): Promise<SignedNostrEvent[]>;
  close(): void;
};

/** The slice of the `ws` WebSocket API the relay client drives. */
export type WebSocketLike = {
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
};
