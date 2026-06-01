// The ONE reusable, pure kind-0 builder seam (ADR 0027, Decision 1). Signup
// bootstrap, login reconciliation, the Story-22 Substack write — and the
// deferred 27b rename — all funnel through `buildProfileKind0Content`, so the
// privacy whitelist and the merge-preserve semantics live in exactly one place.
// No I/O: pure functions only.
import type { NostrEventTemplate } from "@unbnd/schemas";

/**
 * The ONLY profile fields permitted to enter a published kind-0 from a patch
 * (the privacy whitelist). kind-0 is a public, unencrypted, broadcast event, so
 * `email` / `password` / `userId` / session tokens are structurally unable to
 * enter: only keys in this set are copied off the patch (AC-3).
 */
export const PROFILE_KIND0_FIELDS = [
  "name",
  "display_name",
  "about",
  "picture",
  "nip05",
  "lud16",
  "website",
  "banner",
  "substack",
] as const;

export type ProfilePatch = {
  /** Sets BOTH name and display_name (Open Question 1). */
  readonly displayName?: string;
  readonly substack?: string | "clear";
  // future fields land here, still whitelisted on the way in
};

/** True iff `name` is a non-empty (non-whitespace) string. */
function isNonEmptyName(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Merge-preserve a kind-0 content object. Clones `rawPrev` (or `{}` when null),
 * applies the patch — copying ONLY keys in `PROFILE_KIND0_FIELDS` — and, when
 * `nameFloor` is provided AND the merged content has no non-empty `name`,
 * injects the floor into BOTH `name` and `display_name` (Open Question 1).
 *
 * `rawPrev`'s own unknown keys are preserved untouched (lossless); the patch
 * surface is closed by the whitelist. The floor is a floor, never an override:
 * an existing non-empty name is left intact. The input objects are not mutated.
 */
export function buildProfileKind0Content(
  rawPrev: Record<string, unknown> | null,
  patch: ProfilePatch,
  nameFloor?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(rawPrev ?? {}) };

  // The Substack patch carries a `displayName` alias that maps onto BOTH the
  // canonical kind-0 name fields; everything else copies only if whitelisted.
  const raw = patch as Record<string, unknown>;
  for (const key of PROFILE_KIND0_FIELDS) {
    if (key === "name" || key === "display_name") continue; // handled below
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      const value = raw[key];
      if (key === "substack" && value === "clear") {
        delete result.substack;
      } else {
        result[key] = value;
      }
    }
  }

  // The patch's `displayName` (Open Question 1) sets BOTH name + display_name.
  if (isNonEmptyName(patch.displayName)) {
    result.name = patch.displayName;
    result.display_name = patch.displayName;
  }

  // Name floor: only fill in when the merged content still has no resolvable
  // name. Never clobbers an existing name.
  if (isNonEmptyName(nameFloor) && !isNonEmptyName(result.name)) {
    result.name = nameFloor;
    result.display_name = nameFloor;
  }

  return result;
}

/** True iff `content` has a non-empty string `name`. Drives reconciliation. */
export function hasResolvableName(
  content: Record<string, unknown> | null,
): boolean {
  return content !== null && isNonEmptyName(content.name);
}

/**
 * Build the unsigned kind-0 template from merged content. Flat metadata JSON,
 * empty tags — NOT a DList payload, so no `["json", …]` tag. The single
 * template builder; `substack-template.ts` re-exports it.
 */
export function buildKind0Template(
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
