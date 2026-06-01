// Pure substack merge / validate / build helpers for the kind-0 write path
// (ADR 0022). Mirrors `apps/api/src/ratings/template.ts` in shape: a typed
// error, a light URL check matching the Story-20 read side, a clone-not-mutate
// merge that touches ONLY the `substack` key, and a flat kind-0 template build
// (NOT `toWireTemplate` — kind-0 content is the metadata JSON and tags is []).
//
// ADR 0027 (Decision 3): `mergeSubstack` now delegates to the shared
// `buildProfileKind0Content` seam and accepts a `nameFloor` — the DB displayName
// threaded through by the route — so the first-ever Substack write for a
// custodial user (no prior kind-0) carries BOTH the name (from the floor) AND
// the substack. The latent "website-but-no-name" outcome is gone (AC-7).
// `buildKind0Template` is the single template builder, lifted to `kind0.ts`.
import { buildProfileKind0Content, buildKind0Template } from "./kind0";

export { buildKind0Template };

export type SubstackErrorCode = "invalid_url";

export class SubstackError extends Error {
  constructor(
    readonly code: SubstackErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SubstackError";
  }
}

/**
 * Validate the input URL, mirroring the Story-20 read-side `httpUrl` check.
 * Empty / whitespace / absent ⇒ the `"clear"` signal. A well-formed http(s)
 * URL ⇒ the trimmed URL. Anything else (ftp:, javascript:, junk, non-string)
 * THROWS `SubstackError("invalid_url")`.
 */
export function validateSubstackUrl(input: unknown): string | "clear" {
  if (input === undefined || input === null) return "clear";
  if (typeof input !== "string") {
    throw new SubstackError("invalid_url", "Substack must be a URL string.");
  }
  const trimmed = input.trim();
  if (trimmed === "") return "clear";
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new SubstackError("invalid_url", "Substack must be an http(s) URL.");
    }
  } catch (err) {
    if (err instanceof SubstackError) throw err;
    throw new SubstackError("invalid_url", "Substack must be a valid URL.");
  }
  return trimmed;
}

/**
 * Merge `substack` into a CLONE of the raw kind-0 content, touching no other
 * field. `"clear"` deletes the key entirely (never "" or null). null content
 * (custodial with no kind-0 yet) starts from a fresh `{}`. The input object is
 * never mutated.
 *
 * Delegates to the shared `buildProfileKind0Content` seam (ADR 0027). When
 * `nameFloor` is supplied AND the merged content has no resolvable name, the
 * floor fills BOTH `name` and `display_name` — fixing the latent
 * "website-but-no-name" first-write (AC-7). An existing name is never clobbered.
 */
export function mergeSubstack(
  rawContent: Record<string, unknown> | null,
  url: string | "clear",
  nameFloor?: string,
): Record<string, unknown> {
  return buildProfileKind0Content(rawContent, { substack: url }, nameFloor);
}
