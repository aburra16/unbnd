// Unsigned <-> wire (nostr event) bridge. ADR 0001 deferred this to the
// first publish-path story (5a, ADR 0005). The word-wrapper payload is
// serialized into a ["json", ...] tag; the rest of the nostr event
// (created_at, pubkey, id, sig) is added by the signer.
import type { UnsignedDListEvent } from "./envelope";

/** An unsigned nostr event template: ready to sign, no pubkey/id/sig yet. */
export type NostrEventTemplate = {
  readonly kind: number;
  readonly created_at: number;
  readonly content: string;
  readonly tags: string[][];
};

/** A signed nostr event as it travels the wire / arrives from a relay. */
export type SignedNostrEvent = {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: string[][];
  readonly content: string;
  readonly sig: string;
};

/** The loose shape `fromWireEvent` accepts and returns. */
export type AnyUnsignedDListEvent = UnsignedDListEvent<number, string>;

/** A minimal wire-event view: enough to reconstruct the unsigned DList event. */
export type WireEventView = {
  readonly kind: number;
  readonly content: string;
  readonly tags: ReadonlyArray<ReadonlyArray<string>>;
};

/**
 * Serialize an unsigned DList event into a signable nostr template:
 * the named tags, plus a `["json", JSON.stringify(payload)]` tag, plus the
 * caller-supplied `created_at` (passed in so this stays pure/testable).
 */
export function toWireTemplate(
  _unsigned: AnyUnsignedDListEvent,
  _createdAt: number,
): NostrEventTemplate {
  throw new Error("toWireTemplate not implemented");
}

/**
 * Reconstruct an unsigned DList event from a wire event: read the `json`
 * tag back into `payload` and the `z` tag back into `parentHeader`.
 */
export function fromWireEvent(_event: WireEventView): AnyUnsignedDListEvent {
  throw new Error("fromWireEvent not implemented");
}
