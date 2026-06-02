// Build the unsigned kind-39999 BookAuthorOverlay wire template, server-side, with
// the librarian pubkey resolved from config. Story 32 / ADR 0033 §4. Mirrors
// claims/template.ts. Carries ONLY blurb / coverUrl / purchaseUrl; coverUrl and
// purchaseUrl are validated as well-formed http(s) (Story 22 parity) — a bad value
// throws AuthorEditsError("invalid_url") so the route 400s with NO publish.
import {
  asHexPubkey,
  buildBookAuthorEditsHeaderAddress,
  toBookAuthorOverlayEvent,
  toWireTemplate,
  type BookAuthorOverlay,
  type NostrEventTemplate,
} from "@unbnd/schemas";
import type { Config } from "../config";

export type BuildAuthorEditsInput = {
  readonly authorPubkey: string;
  readonly bookSlug: string;
  readonly blurb?: string | null;
  readonly coverUrl?: string | null;
  readonly purchaseUrl?: string | null;
};

export type AuthorEditsErrorCode =
  | "missing_book"
  | "invalid_url"
  | "feature_unavailable";

export class AuthorEditsError extends Error {
  constructor(
    readonly code: AuthorEditsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthorEditsError";
  }
}

/** A well-formed http(s) URL (Story 22 parity). */
export function isHttpUrl(v: unknown): v is string {
  if (typeof v !== "string" || v.trim() === "") return false;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function buildAuthorEditsTemplate(
  config: Config,
  input: BuildAuthorEditsInput,
  createdAt: number,
): NostrEventTemplate {
  if (!input.bookSlug || typeof input.bookSlug !== "string") {
    throw new AuthorEditsError("missing_book", "A book slug is required.");
  }
  if (input.coverUrl != null && !isHttpUrl(input.coverUrl)) {
    throw new AuthorEditsError(
      "invalid_url",
      "Enter a web address that starts with http or https.",
    );
  }
  if (input.purchaseUrl != null && !isHttpUrl(input.purchaseUrl)) {
    throw new AuthorEditsError(
      "invalid_url",
      "Enter a web address that starts with http or https.",
    );
  }
  if (!config.librarianPubkey) {
    throw new AuthorEditsError(
      "feature_unavailable",
      "Author editing is not configured (no librarian pubkey).",
    );
  }

  const librarian = asHexPubkey(config.librarianPubkey);
  const overlay: BookAuthorOverlay = {
    bookSlug: input.bookSlug,
    bookAddress: { kind: 39999, pubkey: librarian, dTag: input.bookSlug },
    authorPubkey: asHexPubkey(input.authorPubkey),
    blurb: input.blurb ?? null,
    coverUrl: input.coverUrl ?? null,
    purchaseUrl: input.purchaseUrl ?? null,
    parentHeader: buildBookAuthorEditsHeaderAddress(librarian),
  };

  return toWireTemplate(toBookAuthorOverlayEvent(overlay), createdAt);
}
