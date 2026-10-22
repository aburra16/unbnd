// The server-side profile cache (Story 110 / ADR 0098 §4). Profiles change
// rarely and relays are slow and flaky, so the profile route serves what it
// found recently and refreshes in the background. A refresh that finds nothing
// keeps the old profile: a slow relay means a slightly older picture, never a
// missing one.
import type { SignedNostrEvent } from "@unbnd/schemas";
import { parseKind0, type ProfileMeta } from "../nostr/profile";

const FRESH_MS = 10 * 60_000;
const EMPTY_MS = 60_000;
const MAX_ENTRIES = 10_000;

type Entry = { meta: ProfileMeta | null; at: number };

export type ProfileCache = {
  /** The person's profile: cached, refreshed in the background when old, read when unknown. */
  get(pubkeyHex: string): Promise<ProfileMeta | null>;
  /** Record a profile known to be current (one Unbnd just published). */
  set(pubkeyHex: string, meta: ProfileMeta | null): void;
  size(): number;
};

export function createProfileCache(opts: {
  readonly resolve: (pubkeyHex: string) => Promise<ProfileMeta | null>;
  readonly now?: () => number;
  readonly max?: number;
}): ProfileCache {
  const now = opts.now ?? Date.now;
  const max = opts.max ?? MAX_ENTRIES;
  // A Map keeps insertion order; re-inserting on use makes it least-recently-used first.
  const entries = new Map<string, Entry>();
  const reading = new Map<string, Promise<ProfileMeta | null>>();

  const put = (hex: string, entry: Entry) => {
    entries.delete(hex);
    entries.set(hex, entry);
    while (entries.size > max) entries.delete(entries.keys().next().value!);
  };

  // One read per person at a time. A failed read stores nothing; an empty read
  // never replaces a profile we have.
  const read = (hex: string): Promise<ProfileMeta | null> => {
    const inFlight = reading.get(hex);
    if (inFlight) return inFlight;
    const p = opts
      .resolve(hex)
      .then(
        (meta) => {
          const had = entries.get(hex);
          if (meta || !had?.meta) put(hex, { meta, at: now() });
          else put(hex, { meta: had.meta, at: had.at });
          return meta ?? had?.meta ?? null;
        },
        () => entries.get(hex)?.meta ?? null,
      )
      .finally(() => reading.delete(hex));
    reading.set(hex, p);
    return p;
  };

  return {
    async get(hex) {
      const entry = entries.get(hex);
      if (!entry) return read(hex);
      put(hex, entry);
      const age = now() - entry.at;
      if (entry.meta ? age >= FRESH_MS : age >= EMPTY_MS) {
        if (!entry.meta) return read(hex);
        void read(hex);
      }
      return entry.meta;
    },
    set(hex, meta) {
      put(hex, { meta, at: now() });
    },
    size: () => entries.size,
  };
}

type PublishResult = { ok: true; id: string } | { ok: false; reason: string };

/** Wrap a kind-0 publish so a profile Unbnd writes is cached as written (ADR 0098 §4). */
export function cacheOnPublish<R extends PublishResult>(
  publish: (event: SignedNostrEvent) => Promise<R>,
  cache: ProfileCache,
): (event: SignedNostrEvent) => Promise<R> {
  return async (event) => {
    const result = await publish(event);
    if (result.ok && event.kind === 0) cache.set(event.pubkey, parseKind0([event]));
    return result;
  };
}
