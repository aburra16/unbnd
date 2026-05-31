// Pure substack merge / validate / build helpers for the kind-0 write path
// (ADR 0022). Mirrors `apps/api/src/ratings/template.ts` in shape: a typed
// error, a light URL check matching the Story-20 read side, a clone-not-mutate
// merge that touches ONLY the `substack` key, and a flat kind-0 template build
// (NOT `toWireTemplate` — kind-0 content is the metadata JSON and tags is []).
import type { NostrEventTemplate } from "@unbnd/schemas";

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
 */
export function mergeSubstack(
  rawContent: Record<string, unknown> | null,
  url: string | "clear",
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(rawContent ?? {}) };
  if (url === "clear") {
    delete result.substack;
  } else {
    result.substack = url;
  }
  return result;
}

/**
 * Build the unsigned kind-0 template from merged content. Flat metadata JSON,
 * empty tags — NOT a DList payload, so no `["json", …]` tag.
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
