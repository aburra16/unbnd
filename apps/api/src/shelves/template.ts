// Build the unsigned kind-39999 shelf-membership template, server-side. ADR 0018.
// Mirrors apps/api/src/tags/template.ts.
import {
  asHexPubkey,
  buildBookShelvesHeaderAddress,
  toShelfAssertionEvent,
  toWireTemplate,
  type BookShelfAssertion,
  type NostrEventTemplate,
  type Polarity,
} from "@unbnd/schemas";
import type { Config } from "../config";

export type ShelfInput = {
  readonly ownerPubkey: string;
  readonly bookSlug: string;
  readonly shelfSlug: string;
  readonly shelfName?: string;
  readonly polarity: number;
};

export type ShelfErrorCode =
  | "feature_unavailable"
  | "invalid_polarity"
  | "invalid_shelf";

export class ShelfError extends Error {
  constructor(
    readonly code: ShelfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShelfError";
  }
}

export function buildShelfTemplate(
  config: Config,
  input: ShelfInput,
  createdAt: number,
): NostrEventTemplate {
  if (input.polarity !== 1 && input.polarity !== -1) {
    throw new ShelfError(
      "invalid_polarity",
      "Polarity must be 1 (on shelf) or -1 (removed).",
    );
  }
  if (!input.bookSlug || !input.shelfSlug) {
    throw new ShelfError(
      "invalid_shelf",
      "A book slug and a shelf slug are required.",
    );
  }
  if (!config.librarianPubkey) {
    throw new ShelfError(
      "feature_unavailable",
      "Shelves are not configured (no librarian pubkey).",
    );
  }
  const librarian = asHexPubkey(config.librarianPubkey);
  const assertion: BookShelfAssertion = {
    bookSlug: input.bookSlug,
    bookAddress: { kind: 39999, pubkey: librarian, dTag: input.bookSlug },
    shelfSlug: input.shelfSlug,
    ...(input.shelfName !== undefined && input.shelfName !== ""
      ? { shelfName: input.shelfName }
      : {}),
    polarity: input.polarity as Polarity,
    ownerPubkey: asHexPubkey(input.ownerPubkey),
    parentHeader: buildBookShelvesHeaderAddress(librarian),
  };
  return toWireTemplate(toShelfAssertionEvent(assertion), createdAt);
}
