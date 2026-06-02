// Build the unsigned kind-39999 BookClaim wire template, server-side, with the
// librarian pubkey resolved from config. Story 31 / ADR 0032 §1. Mirrors
// ratings/template.ts. The claim carries no editable metadata — it only links the
// claimant to the canonical book address.
import {
  asHexPubkey,
  buildBookClaimsHeaderAddress,
  toBookClaimEvent,
  toWireTemplate,
  type BookClaim,
  type NostrEventTemplate,
} from "@unbnd/schemas";
import type { Config } from "../config";

export type BuildClaimInput = {
  readonly claimantPubkey: string;
  readonly bookSlug: string;
};

export type ClaimErrorCode = "missing_book" | "feature_unavailable";

export class ClaimError extends Error {
  constructor(
    readonly code: ClaimErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

export function buildClaimTemplate(
  config: Config,
  input: BuildClaimInput,
  createdAt: number,
): NostrEventTemplate {
  if (!input.bookSlug || typeof input.bookSlug !== "string") {
    throw new ClaimError("missing_book", "A book slug is required to claim a book.");
  }
  if (!config.librarianPubkey) {
    throw new ClaimError(
      "feature_unavailable",
      "Claiming is not configured (no librarian pubkey).",
    );
  }

  const librarian = asHexPubkey(config.librarianPubkey);
  const claimantPubkey = asHexPubkey(input.claimantPubkey);

  const claim: BookClaim = {
    bookSlug: input.bookSlug,
    // The house catalog: book records are owned by the librarian identity.
    bookAddress: { kind: 39999, pubkey: librarian, dTag: input.bookSlug },
    claimantPubkey,
    parentHeader: buildBookClaimsHeaderAddress(librarian),
  };

  return toWireTemplate(toBookClaimEvent(claim), createdAt);
}
