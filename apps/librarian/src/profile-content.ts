// Pure kind-0 profile builders for the librarian worker (Story 58 / ADR 0057
// §3). Mirrors apps/api/src/profile/kind0.ts — re-declared worker-side rather
// than imported, to keep the worker off any apps/api coupling (same posture as
// the seeder mirroring its own builders).
import type { NostrEventTemplate } from "@unbnd/schemas";

export type LibrarianProfileFields = {
  /** LIBRARIAN_NAME → both `name` and `display_name` (name-floor invariant). */
  name: string;
  /** LIBRARIAN_ABOUT → `about` (role description). Optional. */
  about?: string;
  /** LIBRARIAN_PICTURE_URL → `picture` (logo/avatar). Optional. */
  picture?: string;
  /** LIBRARIAN_NIP05 → `nip05`. Optional. */
  nip05?: string;
};

/**
 * Build the librarian kind-0 content object from config. `name` and
 * `display_name` are both set from `name` (the name-floor invariant). The
 * optional fields are emitted ONLY when present and non-empty — an absent or
 * empty-string optional is omitted entirely (no empty strings on the wire).
 * Deterministic: the same config yields the same content object.
 */
export function buildLibrarianProfileContent(
  fields: LibrarianProfileFields,
): Record<string, unknown> {
  const content: Record<string, unknown> = {
    name: fields.name,
    display_name: fields.name,
  };
  if (fields.about) content.about = fields.about;
  if (fields.picture) content.picture = fields.picture;
  if (fields.nip05) content.nip05 = fields.nip05;
  return content;
}

/**
 * Build the unsigned kind-0 template: kind 0, empty tags, the content object
 * stringified as JSON. Mirrors the API's buildKind0Template shape.
 */
export function buildLibrarianKind0Template(
  content: Record<string, unknown>,
  createdAt: number,
): NostrEventTemplate {
  return {
    kind: 0,
    created_at: createdAt,
    content: JSON.stringify(content),
    tags: [],
  };
}
