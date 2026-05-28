// Generic strfry publish: open a WS, send ["EVENT", event], resolve on the
// relay's ["OK", id, accepted, msg] frame. Mirrors the handshake in
// origin/concept-graph:lib/publish.js. ADR 0005.
import type { Config } from "../config";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type PublishResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: string };

export function publishEvent(
  _config: Config,
  _event: SignedNostrEvent,
): Promise<PublishResult> {
  throw new Error("publishEvent not implemented");
}
