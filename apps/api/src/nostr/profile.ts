// kind-0 profile metadata resolution (ADR 0012). Sovereign users' identity
// (name, picture, nip05) lives in their kind-0 metadata event on the broad
// nostr network — not on dcosl. We fan out a best-effort read across a set of
// public relays and take the newest. Failures degrade to null (callers fall
// back to an initials avatar).
import type { SignedNostrEvent } from "@unbnd/schemas";
import { queryRelayUrl, type NostrFilter } from "./query";

export type ProfileMeta = {
  readonly name?: string;
  readonly displayName?: string;
  readonly picture?: string;
  readonly nip05?: string;
  readonly about?: string;
  // ADR 0020 Decision 2: a dedicated "Writes on Substack" link, light-validated
  // at parse so a malformed value never reaches the wire (AC-8).
  readonly substack?: string;
};

const KIND0_TIMEOUT_MS = 3000;

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

/** Keep a value only if it parses as an http(s) URL via the platform URL. */
function httpUrl(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? s : undefined;
  } catch {
    return undefined;
  }
}

/** Pure: pick the newest kind-0 across the given events (null when none). */
export function pickNewestKind0(
  events: SignedNostrEvent[],
): SignedNostrEvent | null {
  return events
    .filter((e) => e.kind === 0)
    .reduce<SignedNostrEvent | null>(
      (best, e) => (best === null || e.created_at > best.created_at ? e : best),
      null,
    );
}

/** Pure: pick the newest kind-3 across the given events (null when none). */
export function pickNewestKind3(
  events: SignedNostrEvent[],
): SignedNostrEvent | null {
  return events
    .filter((e) => e.kind === 3)
    .reduce<SignedNostrEvent | null>(
      (best, e) => (best === null || e.created_at > best.created_at ? e : best),
      null,
    );
}

/**
 * Parse a kind-0 event's content into the RAW metadata object, untouched —
 * every field, including ones Unbnd has no schema for (lud16, banner, website,
 * custom client fields). Unlike the lossy `parseKind0` (which projects down to
 * `ProfileMeta`), this preserves everything so the safe-merge write path
 * (ADR 0022) does not clobber the user's profile. null on no-event / bad JSON.
 */
export function parseRawKind0Content(
  event: SignedNostrEvent | null,
): Record<string, unknown> | null {
  if (!event) return null;
  try {
    const content = JSON.parse(event.content) as unknown;
    if (typeof content !== "object" || content === null || Array.isArray(content)) {
      return null;
    }
    return content as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Pure: pick the newest kind-0 across the given events and parse its content. */
export function parseKind0(events: SignedNostrEvent[]): ProfileMeta | null {
  const newest = pickNewestKind0(events);
  if (!newest) return null;
  let content: Record<string, unknown>;
  try {
    content = JSON.parse(newest.content) as Record<string, unknown>;
  } catch {
    return null;
  }
  const meta: ProfileMeta = {
    name: str(content.name),
    // NIP-24: display_name (canonical) or the older displayName.
    displayName: str(content.display_name) ?? str(content.displayName),
    picture: str(content.picture),
    nip05: str(content.nip05),
    about: str(content.about),
    substack: httpUrl(content.substack),
  };
  // All-empty content → treat as no metadata.
  return Object.values(meta).some((v) => v !== undefined) ? meta : null;
}

export type RelayQuery = (
  url: string,
  filter: NostrFilter,
) => Promise<SignedNostrEvent[]>;

/**
 * Fan out a kind-0 read across relays in parallel, flatten, take the newest.
 * Best-effort: any relay that throws/times out contributes nothing.
 */
export async function fetchProfileMeta(
  relays: readonly string[],
  pubkeyHex: string,
  queryFn: RelayQuery = (url, filter) =>
    queryRelayUrl(url, filter, KIND0_TIMEOUT_MS),
): Promise<ProfileMeta | null> {
  const filter: NostrFilter = { kinds: [0], authors: [pubkeyHex], limit: 1 };
  const results = await Promise.all(
    relays.map((url) => queryFn(url, filter).catch(() => [])),
  );
  return parseKind0(results.flat());
}

/**
 * Fan out a kind-0 read across relays and return the freshest event's RAW
 * content object + its created_at (ADR 0022). Same best-effort fan-out as
 * `fetchProfileMeta`, but returns the untouched content (all fields) so the
 * safe-merge write can preserve every field the user already has. Does NOT
 * route through `parseKind0`. Returns `{ content: null, createdAt: null }`
 * when no relay has a kind-0.
 */
export async function fetchRawKind0(
  relays: readonly string[],
  pubkeyHex: string,
  queryFn: RelayQuery = (url, filter) =>
    queryRelayUrl(url, filter, KIND0_TIMEOUT_MS),
): Promise<{ content: Record<string, unknown> | null; createdAt: number | null }> {
  const filter: NostrFilter = { kinds: [0], authors: [pubkeyHex], limit: 1 };
  const results = await Promise.all(
    relays.map((url) => queryFn(url, filter).catch(() => [])),
  );
  const newest = pickNewestKind0(results.flat());
  return {
    content: parseRawKind0Content(newest),
    createdAt: newest ? newest.created_at : null,
  };
}

/**
 * Fan out a kind-3 read across relays and return the freshest event's UNTOUCHED
 * `tags` array + `content` string + `created_at` (ADR 0023). The kind-3 twin of
 * `fetchRawKind0` — same best-effort fan-out + 3s timeout + `limit: 1` — but the
 * follow data lives in `tags`, so it returns the raw tags (relay-hint/petname
 * positions and any non-`p` tags verbatim) so the safe-merge write can preserve
 * the whole follow graph. Does NOT parse `content`. Returns
 * `{ tags: null, content: "", createdAt: null }` when no relay has a kind-3.
 */
export async function fetchRawKind3(
  relays: readonly string[],
  pubkeyHex: string,
  queryFn: RelayQuery = (url, filter) =>
    queryRelayUrl(url, filter, KIND0_TIMEOUT_MS),
): Promise<{ tags: string[][] | null; content: string; createdAt: number | null }> {
  const filter: NostrFilter = { kinds: [3], authors: [pubkeyHex], limit: 1 };
  const results = await Promise.all(
    relays.map((url) => queryFn(url, filter).catch(() => [])),
  );
  const newest = pickNewestKind3(results.flat());
  return {
    tags: newest ? newest.tags : null,
    content: newest ? newest.content : "",
    createdAt: newest ? newest.created_at : null,
  };
}
