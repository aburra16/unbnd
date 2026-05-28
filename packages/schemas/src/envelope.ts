// Envelope types and helpers per ADR 0001.

export type HexPubkey = string & { readonly __brand: "HexPubkey" };
export type EventId = string & { readonly __brand: "EventId" };

const HEX_64_RE = /^[0-9a-f]{64}$/;

/**
 * Validates that `s` is a 64-character lowercase hex string and brands it
 * as a HexPubkey. Throws if the format is wrong.
 */
export function asHexPubkey(s: string): HexPubkey {
  if (typeof s !== "string" || !HEX_64_RE.test(s)) {
    throw new Error(
      `asHexPubkey: expected a 64-character lowercase hex string, got ${JSON.stringify(s)}`,
    );
  }
  return s as HexPubkey;
}

/**
 * Validates that `s` is a 64-character lowercase hex string and brands it
 * as an EventId. Throws if the format is wrong.
 */
export function asEventId(s: string): EventId {
  if (typeof s !== "string" || !HEX_64_RE.test(s)) {
    throw new Error(
      `asEventId: expected a 64-character lowercase hex string, got ${JSON.stringify(s)}`,
    );
  }
  return s as EventId;
}

/**
 * The stable address of any replaceable DList event:
 * `<kind>:<pubkey>:<d-tag>`. Kind 39998 is the concept header; kind 39999
 * is the element. The type carries the kind as a phantom parameter so
 * downstream code can narrow between headers and items.
 */
export type DListAddress<K extends number = number> = {
  readonly kind: K;
  readonly pubkey: HexPubkey;
  readonly dTag: string;
};

export function formatAddress<K extends number>(a: DListAddress<K>): string {
  return `${a.kind}:${a.pubkey}:${a.dTag}`;
}

export function parseAddress(s: string): DListAddress {
  if (typeof s !== "string") {
    throw new Error(`parseAddress: expected a string, got ${typeof s}`);
  }
  // dTag may contain colons (NIP-01 does not forbid them in d-tag values),
  // so we split on the first two colons only.
  const firstColon = s.indexOf(":");
  if (firstColon < 1) {
    throw new Error(`parseAddress: missing kind separator in ${JSON.stringify(s)}`);
  }
  const secondColon = s.indexOf(":", firstColon + 1);
  if (secondColon < 0) {
    throw new Error(
      `parseAddress: missing pubkey separator in ${JSON.stringify(s)}`,
    );
  }
  const kindStr = s.slice(0, firstColon);
  const pubkeyStr = s.slice(firstColon + 1, secondColon);
  const dTag = s.slice(secondColon + 1);
  if (!/^\d+$/.test(kindStr)) {
    throw new Error(
      `parseAddress: kind must be a non-negative integer, got ${JSON.stringify(kindStr)}`,
    );
  }
  if (dTag.length === 0) {
    throw new Error(
      `parseAddress: d-tag must be non-empty in ${JSON.stringify(s)}`,
    );
  }
  return {
    kind: Number(kindStr),
    pubkey: asHexPubkey(pubkeyStr),
    dTag,
  };
}

export function parseAddressOfKind<K extends number>(
  s: string,
  kind: K,
): DListAddress<K> {
  const parsed = parseAddress(s);
  if (parsed.kind !== kind) {
    throw new Error(
      `parseAddressOfKind: expected kind ${kind}, got ${parsed.kind} in ${JSON.stringify(s)}`,
    );
  }
  return parsed as DListAddress<K>;
}

/**
 * The universal word-wrapper envelope every DList element carries in its
 * `["json", "..."]` tag.
 */
export type WordEnvelope<T extends string> = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", T, ...string[]];
  };
};

/**
 * An unsigned DList event modelling the wire shape strfry will store.
 * Signing (pubkey, id, sig, created_at) is out of scope for ADR 0001.
 *
 * `parentHeader` is denormalized onto the type from the z-tag, so consumers
 * can navigate to the parent concept header without re-parsing the tag.
 *
 * The third type parameter `P` refines the inner payload field shape;
 * defaults to `unknown` for callers that want the loose envelope.
 */
export type UnsignedDListEvent<
  K extends number,
  T extends string,
  P = unknown,
> = {
  readonly kind: K;
  readonly tags: ReadonlyArray<readonly [string, ...string[]]>;
  readonly content: string;
  readonly payload: WordEnvelope<T> & { readonly [Key in T]: P };
  readonly parentHeader: DListAddress<39998>;
};

// Internal helpers used by per-shape modules.

/**
 * The first 8 hex characters of a pubkey, used as the identity-discriminating
 * suffix in d-tag construction across rating, genre-tag, quality-signal, and
 * shelf shapes. Follows the Tapestry feat/pubkey-tagging-target convention.
 */
export function pubkeyPrefix(pk: HexPubkey): string {
  return pk.slice(0, 8);
}

/**
 * Tightening helper for shape modules: takes the unknown payload coming back
 * from a typed `UnsignedDListEvent.payload` and casts to the specific shape.
 * Used internally by `from*Event` implementations; the external API is
 * already typed via the third envelope parameter.
 */
export function payloadAs<P>(value: unknown): P {
  return value as P;
}
