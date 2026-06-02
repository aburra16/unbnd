// Build the unsigned kind-39999 AuthorVerifiedAssertion wire template, server-side,
// with the librarian pubkey resolved from config. Story 32 / ADR 0033 §1. Mirrors
// claims/template.ts. The curator is the signer; the author being verified is the
// #p target. The curator gate is enforced by the route, not here.
import {
  asHexPubkey,
  buildBookAuthorVerifiedHeaderAddress,
  toAuthorVerifiedEvent,
  toWireTemplate,
  type AuthorVerifiedAssertion,
  type NostrEventTemplate,
} from "@unbnd/schemas";
import type { Config } from "../config";

export type BuildAuthorVerifiedInput = {
  readonly curatorPubkey: string;
  readonly authorPubkey: string;
  readonly bookSlug: string;
  readonly polarity?: 1 | -1;
};

export type AuthorVerifiedErrorCode =
  | "missing_book"
  | "missing_author"
  | "invalid_polarity"
  | "feature_unavailable";

export class AuthorVerifiedError extends Error {
  constructor(
    readonly code: AuthorVerifiedErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthorVerifiedError";
  }
}

const HEX64 = /^[0-9a-f]{64}$/;

export function buildAuthorVerifiedTemplate(
  config: Config,
  input: BuildAuthorVerifiedInput,
  createdAt: number,
): NostrEventTemplate {
  if (!input.bookSlug || typeof input.bookSlug !== "string") {
    throw new AuthorVerifiedError("missing_book", "A book slug is required.");
  }
  if (
    !input.authorPubkey ||
    typeof input.authorPubkey !== "string" ||
    !HEX64.test(input.authorPubkey)
  ) {
    throw new AuthorVerifiedError(
      "missing_author",
      "A valid author pubkey is required to verify a claim.",
    );
  }
  const polarity = input.polarity ?? 1;
  if (polarity !== 1 && polarity !== -1) {
    throw new AuthorVerifiedError("invalid_polarity", "Polarity must be 1 or -1.");
  }
  if (!config.librarianPubkey) {
    throw new AuthorVerifiedError(
      "feature_unavailable",
      "Verification is not configured (no librarian pubkey).",
    );
  }

  const librarian = asHexPubkey(config.librarianPubkey);
  const assertion: AuthorVerifiedAssertion = {
    bookSlug: input.bookSlug,
    bookAddress: { kind: 39999, pubkey: librarian, dTag: input.bookSlug },
    authorPubkey: asHexPubkey(input.authorPubkey),
    curatorPubkey: asHexPubkey(input.curatorPubkey),
    polarity,
    parentHeader: buildBookAuthorVerifiedHeaderAddress(librarian),
  };

  return toWireTemplate(toAuthorVerifiedEvent(assertion), createdAt);
}
