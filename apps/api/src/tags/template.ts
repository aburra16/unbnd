// Build the unsigned kind-39999 tag-assertion template, server-side. ADR 0009.
import {
  asHexPubkey,
  buildBookTagAssertionsHeaderAddress,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookTagAssertion,
  type NostrEventTemplate,
  type Polarity,
  type TagType,
} from "@unbnd/schemas";
import type { Config } from "../config";

export type TagAssertionInput = {
  readonly asserterPubkey: string;
  readonly bookSlug: string;
  readonly tagSlug: string;
  readonly tagType: TagType;
  readonly polarity: number;
};

export type TagErrorCode = "feature_unavailable" | "invalid_polarity" | "invalid_tag";

export class TagError extends Error {
  constructor(
    readonly code: TagErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TagError";
  }
}

const TYPES: readonly TagType[] = ["genre", "style", "signal"];

export function buildTagAssertionTemplate(
  config: Config,
  input: TagAssertionInput,
  createdAt: number,
): NostrEventTemplate {
  if (input.polarity !== 1 && input.polarity !== -1) {
    throw new TagError("invalid_polarity", "Polarity must be 1 (apply) or -1 (dispute).");
  }
  if (!input.tagSlug || !TYPES.includes(input.tagType)) {
    throw new TagError("invalid_tag", "A tag slug and a valid type are required.");
  }
  if (!config.librarianPubkey) {
    throw new TagError("feature_unavailable", "Tagging is not configured (no librarian pubkey).");
  }
  const librarian = asHexPubkey(config.librarianPubkey);
  const assertion: BookTagAssertion = {
    bookSlug: input.bookSlug,
    bookAddress: { kind: 39999, pubkey: librarian, dTag: input.bookSlug },
    tagSlug: input.tagSlug,
    tagType: input.tagType,
    polarity: input.polarity as Polarity,
    asserterPubkey: asHexPubkey(input.asserterPubkey),
    parentHeader: buildBookTagAssertionsHeaderAddress(librarian),
  };
  return toWireTemplate(toBookTagAssertionEvent(assertion), createdAt);
}
