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

/** Pure: pick the newest kind-0 across the given events and parse its content. */
export function parseKind0(events: SignedNostrEvent[]): ProfileMeta | null {
  const newest = events
    .filter((e) => e.kind === 0)
    .reduce<SignedNostrEvent | null>(
      (best, e) => (best === null || e.created_at > best.created_at ? e : best),
      null,
    );
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
