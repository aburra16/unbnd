// Unsigned <-> wire (nostr event) bridge. ADR 0001 deferred this to the
// first publish-path story (5a, ADR 0005). The word-wrapper payload is
// serialized into a ["json", ...] tag; the rest of the nostr event
// (created_at, pubkey, id, sig) is added by the signer.
import {
  parseAddressOfKind,
  type DListAddress,
  type UnsignedDListEvent,
} from "./envelope";

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

const JSON_TAG = "json";
const Z_TAG = "z";

/**
 * Serialize an unsigned DList event into a signable nostr template:
 * the named tags, plus a `["json", JSON.stringify(payload)]` tag, plus the
 * caller-supplied `created_at` (passed in so this stays pure/testable).
 */
export function toWireTemplate(
  unsigned: AnyUnsignedDListEvent,
  createdAt: number,
): NostrEventTemplate {
  const tags: string[][] = unsigned.tags.map((t) => [...t]);
  tags.push([JSON_TAG, JSON.stringify(unsigned.payload)]);
  return {
    kind: unsigned.kind,
    created_at: createdAt,
    content: unsigned.content,
    tags,
  };
}

/**
 * Reconstruct an unsigned DList event from a wire event: read the `json`
 * tag back into `payload` and the `z` tag back into `parentHeader`. The
 * `json` tag itself is dropped from the reconstructed `tags` (it is the
 * serialized mirror, not a named tag).
 */
export function fromWireEvent(event: WireEventView): AnyUnsignedDListEvent {
  const jsonTag = event.tags.find((t) => t[0] === JSON_TAG);
  if (!jsonTag || typeof jsonTag[1] !== "string") {
    throw new Error("fromWireEvent: missing json tag");
  }
  const zTag = event.tags.find((t) => t[0] === Z_TAG);
  if (!zTag || typeof zTag[1] !== "string") {
    throw new Error("fromWireEvent: missing z tag (parent header)");
  }

  const payload = JSON.parse(jsonTag[1]) as AnyUnsignedDListEvent["payload"];
  const parentHeader: DListAddress<39998> = parseAddressOfKind(zTag[1], 39998);

  const tags = event.tags
    .filter((t) => t[0] !== JSON_TAG)
    .map((t) => [...t] as [string, ...string[]]);

  return {
    kind: event.kind,
    tags,
    content: event.content,
    payload,
    parentHeader,
  };
}
