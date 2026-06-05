// The shared relay-transport package (Story 59, ADR 0058). One audited union of
// the two diverged worker relay clients: the hardened publish (ADR 0056 §1), the
// self-healing wrapper (ADR 0056 §2), and the one-shot REQ read, on one
// RelayConnection.
export { connectRelay } from "./connect";
export type { ConnectRelayOptions, WebSocketLike } from "./connect";
export { connectResilientRelay } from "./resilient";
export type {
  ConnectResilientRelayOptions,
  ReconnectInfo,
} from "./resilient";
export type { RelayConnection, PublishResult, RelayFilter } from "./types";
