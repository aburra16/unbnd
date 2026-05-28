// Envelope types and helpers per ADR 0001.
// Type contracts are stable; helper function bodies are stubs to be
// filled in during the Implementation phase.

export type HexPubkey = string & { readonly __brand: "HexPubkey" };
export type EventId = string & { readonly __brand: "EventId" };

/**
 * Validates that `s` is a 64-character lowercase hex string and brands it
 * as a HexPubkey. Throws if the format is wrong.
 */
export function asHexPubkey(_s: string): HexPubkey {
  throw new Error("asHexPubkey not implemented");
}

/**
 * Validates that `s` is a 64-character lowercase hex string and brands it
 * as an EventId. Throws if the format is wrong.
 */
export function asEventId(_s: string): EventId {
  throw new Error("asEventId not implemented");
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

export function formatAddress<K extends number>(_a: DListAddress<K>): string {
  throw new Error("formatAddress not implemented");
}

export function parseAddress(_s: string): DListAddress {
  throw new Error("parseAddress not implemented");
}

export function parseAddressOfKind<K extends number>(
  _s: string,
  _kind: K,
): DListAddress<K> {
  throw new Error("parseAddressOfKind not implemented");
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
