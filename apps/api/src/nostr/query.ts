// Generic strfry read: open a WS, send ["REQ", subId, filter], collect
// ["EVENT", subId, ev] frames until ["EOSE", subId] (or timeout). ADR 0005.
import type { Config } from "../config";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type NostrFilter = {
  readonly kinds?: number[];
  readonly authors?: string[];
  readonly limit?: number;
  // Tag filters such as "#a", "#t".
  readonly [tagFilter: `#${string}`]: string[] | undefined;
};

export function queryEvents(
  _config: Config,
  _filter: NostrFilter,
): Promise<SignedNostrEvent[]> {
  throw new Error("queryEvents not implemented");
}
